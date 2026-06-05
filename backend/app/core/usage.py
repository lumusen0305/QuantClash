"""LLM token-usage and cost tracking.

A LangChain callback handler records input/output tokens per provider/model
into Redis (with an in-memory fallback). Pricing is configurable per model.
"""
from __future__ import annotations

import json
import threading
from datetime import date
from typing import Any, Dict, Optional

from langchain_core.callbacks import BaseCallbackHandler

from app.core.config import settings

# Price per 1,000,000 tokens, USD. (input, output)
PRICING: Dict[str, tuple] = {
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "qwen-plus": (0.40, 1.20),
    "qwen-max": (1.60, 6.40),
    "qwen2.5:14b": (0.0, 0.0),       # local Ollama — free
}
DEFAULT_PRICE = (0.0, 0.0)

# Synchronous redis client (callbacks run in sync context)
try:
    import redis as _redis_sync

    _rc = _redis_sync.from_url(settings.REDIS_URL, decode_responses=True)
    _rc.ping()
except Exception:
    _rc = None

# In-memory fallback
_mem_lock = threading.Lock()
_mem: Dict[str, Dict[str, float]] = {}


def _cost(model: str, in_tok: int, out_tok: int) -> float:
    pin, pout = PRICING.get(model, DEFAULT_PRICE)
    return round(in_tok / 1_000_000 * pin + out_tok / 1_000_000 * pout, 6)


def _bump(bucket: str, requests: int, in_tok: int, out_tok: int, cost: float) -> None:
    if _rc is not None:
        try:
            p = _rc.pipeline()
            p.hincrbyfloat(bucket, "requests", requests)
            p.hincrbyfloat(bucket, "input_tokens", in_tok)
            p.hincrbyfloat(bucket, "output_tokens", out_tok)
            p.hincrbyfloat(bucket, "cost", cost)
            p.execute()
            return
        except Exception:
            pass
    with _mem_lock:
        b = _mem.setdefault(bucket, {"requests": 0, "input_tokens": 0, "output_tokens": 0, "cost": 0.0})
        b["requests"] += requests
        b["input_tokens"] += in_tok
        b["output_tokens"] += out_tok
        b["cost"] += cost


def record_usage(provider: str, model: str, in_tok: int, out_tok: int) -> None:
    cost = _cost(model, in_tok, out_tok)
    today = date.today().isoformat()
    _bump("usage:total", 1, in_tok, out_tok, cost)
    _bump(f"usage:provider:{provider}", 1, in_tok, out_tok, cost)
    _bump(f"usage:model:{model}", 1, in_tok, out_tok, cost)
    _bump(f"usage:daily:{today}", 1, in_tok, out_tok, cost)


class UsageCallbackHandler(BaseCallbackHandler):
    """Attach to a chat model to record token usage on each call."""

    def __init__(self, provider: str, model: str):
        self.provider = provider
        self.model = model

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:  # noqa: ANN401
        in_tok = out_tok = 0
        try:
            for gen_list in getattr(response, "generations", []) or []:
                for gen in gen_list:
                    msg = getattr(gen, "message", None)
                    um = getattr(msg, "usage_metadata", None) if msg else None
                    if um:
                        in_tok += int(um.get("input_tokens", 0) or 0)
                        out_tok += int(um.get("output_tokens", 0) or 0)
            if in_tok == 0 and out_tok == 0:
                tu = (getattr(response, "llm_output", None) or {}).get("token_usage", {})
                in_tok = int(tu.get("prompt_tokens", 0) or 0)
                out_tok = int(tu.get("completion_tokens", 0) or 0)
        except Exception:
            return
        if in_tok or out_tok:
            record_usage(self.provider, self.model, in_tok, out_tok)


def _read_bucket(bucket: str) -> Dict[str, float]:
    if _rc is not None:
        try:
            raw = _rc.hgetall(bucket)
            if raw:
                return {k: float(v) for k, v in raw.items()}
        except Exception:
            pass
    with _mem_lock:
        return dict(_mem.get(bucket, {}))


def usage_summary() -> Dict[str, Any]:
    """Aggregate snapshot for the usage dashboard."""
    total = _read_bucket("usage:total")

    providers, models, daily = [], [], []
    if _rc is not None:
        try:
            for key in _rc.scan_iter("usage:provider:*"):
                providers.append({"name": key.split(":")[-1], **_read_bucket(key)})
            for key in _rc.scan_iter("usage:model:*"):
                models.append({"name": key.split(":")[-1], **_read_bucket(key)})
            for key in _rc.scan_iter("usage:daily:*"):
                daily.append({"date": key.split(":")[-1], **_read_bucket(key)})
        except Exception:
            pass
    else:
        with _mem_lock:
            for k, v in _mem.items():
                if k.startswith("usage:provider:"):
                    providers.append({"name": k.split(":")[-1], **v})
                elif k.startswith("usage:model:"):
                    models.append({"name": k.split(":")[-1], **v})
                elif k.startswith("usage:daily:"):
                    daily.append({"date": k.split(":")[-1], **v})

    daily.sort(key=lambda x: x["date"])
    models.sort(key=lambda x: x.get("cost", 0), reverse=True)
    providers.sort(key=lambda x: x.get("cost", 0), reverse=True)
    return {"total": total, "providers": providers, "models": models, "daily": daily[-30:]}


def reset_usage() -> None:
    if _rc is not None:
        try:
            for pat in ("usage:total", "usage:provider:*", "usage:model:*", "usage:daily:*"):
                for key in (_rc.scan_iter(pat) if "*" in pat else [pat]):
                    _rc.delete(key)
        except Exception:
            pass
    with _mem_lock:
        _mem.clear()

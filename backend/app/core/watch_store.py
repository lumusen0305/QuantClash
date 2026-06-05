"""Server-side watch subscriptions, stored in Redis.

A subscription = what tickers to watch, where to email, and which triggers
are active. Stored in Redis so the Celery Beat poller can run while the
browser is closed. Single-user dev flow: keyed by email.
"""
import json
from typing import Optional

from app.core.config import settings

try:
    import redis.asyncio as aioredis
    _aredis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _aredis = None

# Sync client for use inside Celery tasks that already have their own loop
try:
    import redis as _redis_sync
    _sredis = _redis_sync.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _sredis = None

SUB_KEY = "watch:sub:{email}"
SUB_INDEX = "watch:subs"
TICKER_CAP = 20


def _normalize(sub: dict) -> dict:
    tickers = []
    seen = set()
    for t in (sub.get("tickers") or []):
        t = str(t).strip().upper()
        if t and t not in seen:
            seen.add(t)
            tickers.append(t)
    triggers = sub.get("triggers") or {}
    return {
        "email": str(sub.get("email", "")).strip(),
        "tickers": tickers[:TICKER_CAP],
        "triggers": {
            "news": bool(triggers.get("news", True)),
            "anomaly": bool(triggers.get("anomaly", True)),
        },
        "keywords": [str(k).strip() for k in (sub.get("keywords") or []) if str(k).strip()],
        "language": sub.get("language"),
        "model": sub.get("model"),
        "enabled": bool(sub.get("enabled", True)),
        "updated_at": sub.get("updated_at", ""),
    }


# ── async API (FastAPI endpoints) ──────────────────────────────────────────────

async def save_sub(sub: dict) -> dict:
    norm = _normalize(sub)
    if not norm["email"]:
        raise ValueError("email required")
    if _aredis:
        await _aredis.set(SUB_KEY.format(email=norm["email"]), json.dumps(norm))
        await _aredis.sadd(SUB_INDEX, norm["email"])
    return norm


async def get_sub(email: str) -> Optional[dict]:
    if not _aredis:
        return None
    raw = await _aredis.get(SUB_KEY.format(email=email.strip()))
    return json.loads(raw) if raw else None


async def delete_sub(email: str) -> None:
    if not _aredis:
        return
    await _aredis.delete(SUB_KEY.format(email=email.strip()))
    await _aredis.srem(SUB_INDEX, email.strip())


# ── sync API (Celery task) ─────────────────────────────────────────────────────

def list_subs_sync() -> list[dict]:
    if not _sredis:
        return []
    emails = _sredis.smembers(SUB_INDEX) or set()
    out = []
    for em in emails:
        raw = _sredis.get(SUB_KEY.format(email=em))
        if raw:
            out.append(json.loads(raw))
    return out


def get_sub_sync(email: str) -> Optional[dict]:
    if not _sredis:
        return None
    raw = _sredis.get(SUB_KEY.format(email=email.strip()))
    return json.loads(raw) if raw else None

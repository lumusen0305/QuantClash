"""Shared helpers for calling LLMs and parsing JSON responses."""
import hashlib
import json
from typing import Any

from app.core.config import settings

try:
    import redis.asyncio as _aioredis
    _redis = _aioredis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _redis = None


async def _cache_get(key: str):
    if not _redis:
        return None
    try:
        raw = await _redis.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value: Any, ttl: int):
    if not _redis:
        return
    try:
        await _redis.setex(key, ttl, json.dumps(value, ensure_ascii=False))
    except Exception:
        pass


def parse_llm_json(content: str, fallback: Any = None) -> Any:
    """Extract a JSON object/array from an LLM response, tolerating markdown fences."""
    text = (content or "").strip()
    if not text:
        return fallback if fallback is not None else {}

    # Strip markdown code fences ```json ... ```
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.lstrip().lower().startswith("json"):
                text = text.lstrip()[4:]
    text = text.strip()

    # First try direct parse
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try to locate the first {...} or [...] block
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = text.find(open_ch)
        end = text.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except Exception:
                continue

    return fallback if fallback is not None else {}


async def llm_json(llm, prompt: str, fallback: Any = None) -> Any:
    """Invoke an LLM and parse its response as JSON."""
    response = await llm.ainvoke(prompt)
    content = response.content if hasattr(response, "content") else str(response)
    return parse_llm_json(content, fallback)


async def robust_llm_json(
    prompt: str,
    mode: str = "quick",
    fallback: Any = None,
    tier: str = "premium",
    cache_ttl: int = 1800,
) -> Any:
    """Resilient + cached LLM JSON call: never raises.

    - Caches successful results in Redis keyed by a hash of the prompt, so
      repeated workflow requests (same watchlist/ticker) return instantly
      instead of waiting 3-30s on the LLM. Set cache_ttl=0 to bypass.
    - Routes via the LLM router; on a Gemini 429/RESOURCE_EXHAUSTED marks
      Gemini failed and retries once on the fallback provider (Bailian/Ollama).
    - On total failure returns the fallback (with an `error` field if it's a
      dict) so API endpoints respond 200 instead of a CORS-masked 500.
    """
    from app.agents.llm_router import get_llm, mark_gemini_failed

    cache_key = None
    if cache_ttl > 0:
        digest = hashlib.sha256(f"{mode}|{prompt}".encode("utf-8")).hexdigest()[:32]
        cache_key = f"llmjson:{digest}"
        cached = await _cache_get(cache_key)
        if cached is not None:
            if isinstance(cached, dict):
                return {**cached, "cached": True}
            return cached

    async def _store(result: Any) -> Any:
        # Only cache real results, never error fallbacks
        if cache_key and isinstance(result, dict) and "error" not in result:
            await _cache_set(cache_key, result, cache_ttl)
        return result

    def _is_empty(result: Any) -> bool:
        """True if the parse fell back to the empty/fallback shape (no real content)."""
        if result is None:
            return True
        if isinstance(result, dict):
            # equal to fallback, or every value is empty/falsy
            if fallback is not None and result == fallback:
                return True
            return not any(v for v in result.values())
        if isinstance(result, (list, str)):
            return len(result) == 0
        return False

    try:
        llm = get_llm(tier, mode)
        first = await llm_json(llm, prompt, fallback)
        if not _is_empty(first):
            return await _store(first)
        # Empty result (e.g. Gemini returned nothing / unparseable) → try fallback provider
        mark_gemini_failed()
        llm2 = get_llm(tier, mode)
        second = await llm_json(llm2, prompt, fallback)
        return await _store(second) if not _is_empty(second) else first
    except Exception as e:
        msg = str(e).upper()
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg or "QUOTA" in msg:
            mark_gemini_failed()
        try:
            llm = get_llm(tier, mode)  # Gemini now marked failed → fallback provider
            return await _store(await llm_json(llm, prompt, fallback))
        except Exception as e2:
            result = fallback if fallback is not None else {}
            if isinstance(result, dict):
                return {**result, "error": str(e2)}
            return result

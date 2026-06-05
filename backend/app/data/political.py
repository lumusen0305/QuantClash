"""Political / Trump posts feed for macro analysis.

Primary source: trumpstruth.org RSS (a third-party mirror of Trump's Truth
Social posts as a clean RSS feed — no auth, no Cloudflare, same httpx+RSS
pattern as our Yahoo news). Falls back to financial-news headlines that
mention Trump so the feature still works if the mirror is down.

All fetches are cached in Redis (30 min) to keep it low-frequency and polite.
"""
import json
import xml.etree.ElementTree as ET

import httpx

from app.core.config import settings

try:
    import redis.asyncio as aioredis
    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _redis = None

TRUMP_RSS = "https://trumpstruth.org/feed"
# Yahoo "Trump" news search as a fallback (free, no auth)
TRUMP_NEWS_RSS = "https://news.google.com/rss/search?q=Trump+when:2d&hl=en-US&gl=US&ceid=US:en"
CACHE_TTL = 1800  # 30 min — keep it low-frequency


def _strip_html(text: str) -> str:
    out, depth = [], 0
    for ch in text:
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth = max(0, depth - 1)
        elif depth == 0:
            out.append(ch)
    return "".join(out).strip()


def _parse_rss(xml_text: str, limit: int) -> list[dict]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    posts = []
    for it in items[:limit]:
        title = _strip_html((it.findtext("title") or "").strip())
        desc = _strip_html((it.findtext("description") or "").strip())
        # Trump RSS puts the post body in description; title may be truncated
        body = desc if len(desc) > len(title) else title
        if not body:
            continue
        posts.append({
            "text": body[:600],
            "url": (it.findtext("link") or "").strip(),
            "published_at": (it.findtext("pubDate") or "").strip(),
        })
    return posts


def _fetch_trump_posts(limit: int = 12) -> dict:
    """Try the Truth Social mirror; fall back to Trump news headlines."""
    headers = {"User-Agent": "Mozilla/5.0"}
    # Primary: trumpstruth.org RSS
    try:
        r = httpx.get(TRUMP_RSS, timeout=10, headers=headers, follow_redirects=True)
        if r.status_code == 200:
            posts = _parse_rss(r.text, limit)
            if posts:
                return {"source": "truthsocial", "posts": posts}
    except Exception:
        pass
    # Fallback: Google News "Trump" search
    try:
        r = httpx.get(TRUMP_NEWS_RSS, timeout=10, headers=headers, follow_redirects=True)
        if r.status_code == 200:
            posts = _parse_rss(r.text, limit)
            if posts:
                return {"source": "news", "posts": posts}
    except Exception:
        pass
    return {"source": "none", "posts": []}


async def get_trump_posts(limit: int = 12) -> dict:
    """Cached accessor used by the API and the macro analyst."""
    key = f"political:trump:{limit}"
    if _redis:
        try:
            raw = await _redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    import asyncio

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, lambda: _fetch_trump_posts(limit))
    if _redis and data.get("posts"):
        try:
            await _redis.setex(key, CACHE_TTL, json.dumps(data))
        except Exception:
            pass
    return data


def fetch_trump_block(limit: int = 8) -> str:
    """Sync helper for the macro analyst — returns a prompt-ready text block."""
    data = _fetch_trump_posts(limit)
    posts = data.get("posts", [])
    if not posts:
        return "No recent Trump posts available."
    src = "Truth Social" if data["source"] == "truthsocial" else "news coverage"
    lines = [f"- {p['text']}" for p in posts]
    return f"Recent Trump posts (via {src}, {len(lines)} items):\n" + "\n".join(lines)

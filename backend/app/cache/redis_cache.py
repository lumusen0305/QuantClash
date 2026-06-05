import json
import redis.asyncio as aioredis
from app.core.config import settings

async def get_redis():
    return aioredis.from_url(settings.REDIS_URL)

async def get_cached_analysis(ticker: str, trade_date: str) -> dict | None:
    """Layer 1: Exact match cache."""
    r = await get_redis()
    key = f"analysis:{ticker}:{trade_date}"
    data = await r.get(key)
    if data:
        return json.loads(data)
    return None

async def cache_yfinance_data(ticker: str, data_type: str, data: dict, ttl: int = 900):
    """Layer 3: yfinance data cache (15 min TTL)."""
    r = await get_redis()
    key = f"yfinance:{ticker}:{data_type}"
    await r.setex(key, ttl, json.dumps(data))

async def get_cached_yfinance(ticker: str, data_type: str) -> dict | None:
    r = await get_redis()
    key = f"yfinance:{ticker}:{data_type}"
    data = await r.get(key)
    return json.loads(data) if data else None

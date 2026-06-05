import redis.asyncio as aioredis
from datetime import date
from app.core.config import settings

DAILY_LIMITS = {"free": 1, "basic": 5, "premium": 20}

async def check_and_increment_quota(user_id: str, tier: str) -> bool:
    """
    Check if user has quota remaining. If yes, increment and return True.
    Returns False if quota exceeded.
    """
    r = aioredis.from_url(settings.REDIS_URL)
    key = f"quota:{user_id}:{date.today().isoformat()}"

    limit = DAILY_LIMITS.get(tier, 1)

    current = await r.get(key)
    current_count = int(current) if current else 0

    if current_count >= limit:
        await r.aclose()
        return False

    pipe = r.pipeline()
    await pipe.incr(key)
    await pipe.expire(key, 86400)
    await pipe.execute()
    await r.aclose()
    return True

async def get_quota_status(user_id: str, tier: str) -> dict:
    r = aioredis.from_url(settings.REDIS_URL)
    key = f"quota:{user_id}:{date.today().isoformat()}"
    current = await r.get(key)
    used = int(current) if current else 0
    limit = DAILY_LIMITS.get(tier, 1)
    await r.aclose()
    return {"used": used, "limit": limit, "remaining": max(0, limit - used)}

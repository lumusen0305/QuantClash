"""Watch subscription endpoints — register tickers/email for auto-analysis.

The actual polling runs in app/tasks/watch_task.py (Celery Beat). These
endpoints just manage the server-side subscription and let the user trigger
an immediate check.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.watch_store import save_sub, get_sub, delete_sub
from app.core.mailer import smtp_configured

router = APIRouter()


class WatchTriggers(BaseModel):
    news: bool = True
    anomaly: bool = True


class WatchSubRequest(BaseModel):
    email: str
    tickers: list[str]
    triggers: WatchTriggers = WatchTriggers()
    keywords: list[str] = []
    language: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


@router.post("/subscribe")
async def subscribe(req: WatchSubRequest):
    sub = {
        "email": req.email,
        "tickers": req.tickers,
        "triggers": req.triggers.model_dump(),
        "keywords": req.keywords,
        "language": req.language,
        "model": req.model,
        "enabled": req.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        saved = await save_sub(sub)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "subscription": saved}


@router.get("/subscription")
async def subscription(email: str):
    sub = await get_sub(email)
    return {"subscription": sub}


@router.delete("/subscription")
async def remove(email: str):
    await delete_sub(email)
    return {"ok": True}


class RunNowRequest(BaseModel):
    email: str


@router.post("/run-now")
async def run_now(req: RunNowRequest):
    """Enqueue an immediate watch check for this subscription on the worker."""
    try:
        from app.tasks.watch_task import run_watch_check
        run_watch_check.delay(email=req.email)
        return {"ok": True, "queued": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/send-daily-now")
async def send_daily_now(req: RunNowRequest):
    """Enqueue an immediate DAILY digest (full watchlist, regardless of triggers)."""
    try:
        from app.tasks.watch_task import run_daily_digest
        run_daily_digest.delay(email=req.email)
        return {"ok": True, "queued": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/status")
async def status():
    from app.core.config import settings
    return {
        "smtp_configured": smtp_configured(),
        "daily_enabled": settings.DAILY_DIGEST_ENABLED,
        "daily_hour_utc": settings.DAILY_DIGEST_HOUR_UTC,
    }

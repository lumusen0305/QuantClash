"""Celery Beat poller — auto-analyze watched stocks on news / anomaly.

Every N minutes (beat_schedule in celery_app.py), for each enabled watch
subscription: check each ticker for NEW news and price/volume anomalies; for
triggered tickers, run the full DAG analysis via build_digest and email the
HTML report. Cooldowns + headline dedup keep cost bounded.
"""
import asyncio
import hashlib
import logging

import redis as _redis_sync

from app.tasks.celery_app import celery_app
from app.core.config import settings
from app.core.watch_store import list_subs_sync, get_sub_sync

log = logging.getLogger("watch_task")

# Sync redis for dedup/cooldown bookkeeping (decode for str ops)
_r = _redis_sync.from_url(settings.REDIS_URL, decode_responses=True)

SEEN_KEY = "watch:seen:{t}"
COOLDOWN_KEY = "watch:cooldown:{t}"
SEEN_TTL = 7 * 24 * 3600     # 7 days
COOLDOWN_TTL = 6 * 3600      # 6 hours per ticker
MAX_PER_RUN = 6


def _hash_title(title: str) -> str:
    return hashlib.sha256(title.strip().lower().encode("utf-8")).hexdigest()[:16]


def _in_cooldown(ticker: str) -> bool:
    try:
        return bool(_r.exists(COOLDOWN_KEY.format(t=ticker)))
    except Exception:
        return False


def _set_cooldown(ticker: str) -> None:
    try:
        _r.setex(COOLDOWN_KEY.format(t=ticker), COOLDOWN_TTL, "1")
    except Exception:
        pass


def _news_triggered(ticker: str, keywords: list[str]) -> tuple[bool, str]:
    """Return (fired, reason). First-seen bootstrap never fires."""
    from app.agents.analysts.news_analyst import _fetch_yahoo_rss

    try:
        items = _fetch_yahoo_rss(ticker) or []
    except Exception:
        return False, ""
    titles = [(it.get("title") or "").strip() for it in items if it.get("title")]
    if not titles:
        return False, ""

    key = SEEN_KEY.format(t=ticker)
    first_seen = not _r.exists(key)
    hashes = [_hash_title(t) for t in titles]

    fired = False
    reason = ""
    if not first_seen:
        kw = [k.lower() for k in keywords]
        for title, h in zip(titles, hashes):
            if _r.sismember(key, h):
                continue
            # New headline. Keyword gate (if keywords set).
            if kw and not any(k in title.lower() for k in kw):
                continue
            fired = True
            reason = f"新聞 / News: {title[:120]}"
            break

    # Always record current hashes + refresh TTL
    try:
        if hashes:
            _r.sadd(key, *hashes)
            _r.expire(key, SEEN_TTL)
    except Exception:
        pass

    return fired, reason


def _anomaly_map(tickers: list[str]) -> dict:
    """Run the rule-based scan once, return {ticker: reason}."""
    from app.api.workflows import _scan_universe

    try:
        triggers = _scan_universe(tickers)
    except Exception:
        return {}
    out = {}
    for tr in triggers:
        details = " · ".join(e.get("detail", "") for e in tr.get("events", []))
        out[tr["ticker"]] = f"異常 / Anomaly ({tr.get('priority')}): {details}"
    return out


async def _process_sub(sub: dict) -> dict:
    if not sub.get("enabled", True):
        return {"email": sub.get("email"), "skipped": "disabled"}
    tickers = sub.get("tickers") or []
    if not tickers:
        return {"email": sub.get("email"), "skipped": "no tickers"}

    triggers_cfg = sub.get("triggers") or {}
    keywords = sub.get("keywords") or []
    loop = asyncio.get_event_loop()

    # Anomaly scan once (sync → executor)
    anomalies = {}
    if triggers_cfg.get("anomaly", True):
        anomalies = await loop.run_in_executor(None, lambda: _anomaly_map(tickers))

    triggered: list[tuple[str, str]] = []  # (ticker, reason)
    for t in tickers:
        if _in_cooldown(t):
            continue
        reason = ""
        if triggers_cfg.get("news", True):
            fired, r = await loop.run_in_executor(None, lambda: _news_triggered(t, keywords))
            if fired:
                reason = r
        if not reason and t in anomalies:
            reason = anomalies[t]
        if reason:
            triggered.append((t, reason))

    if not triggered:
        return {"email": sub.get("email"), "triggered": 0}

    triggered = triggered[:MAX_PER_RUN]
    syms = [t for t, _ in triggered]

    # Run analyses + build report
    from app.api.digest import build_digest
    from app.core.mailer import send_html_email, smtp_configured

    digest = await build_digest(syms, sub.get("language"), sub.get("model"))

    if not smtp_configured():
        log.warning("watch: SMTP not configured — skipping email for %s", sub.get("email"))
        return {"email": sub.get("email"), "triggered": len(syms), "emailed": False,
                "reason": "smtp_not_configured"}

    reason_lines = "; ".join(f"{t}: {r}" for t, r in triggered)
    subject = f"📈 QuantClash 自動分析 · {', '.join(syms)}"
    body = digest["html"] + f"<p style='font-size:11px;color:#999'>觸發原因 / Triggers: {reason_lines}</p>"
    send_result = await loop.run_in_executor(
        None,
        lambda: send_html_email(
            to=sub["email"], subject=subject, html=body,
            text_fallback=f"Auto-analysis triggered for {', '.join(syms)}",
        ),
    )
    if send_result.get("ok"):
        for t in syms:
            _set_cooldown(t)
        return {"email": sub.get("email"), "triggered": len(syms), "emailed": True}
    log.error("watch: email send failed: %s", send_result.get("error"))
    return {"email": sub.get("email"), "triggered": len(syms), "emailed": False,
            "error": send_result.get("error")}


async def _check(email: str | None) -> list:
    if email:
        sub = get_sub_sync(email)
        subs = [sub] if sub else []
    else:
        subs = list_subs_sync()
    results = []
    for sub in subs:
        try:
            results.append(await _process_sub(sub))
        except Exception as e:
            log.exception("watch: failed processing %s", sub.get("email"))
            results.append({"email": sub.get("email"), "error": str(e)})
    return results


@celery_app.task(name="app.tasks.watch_task.run_watch_check")
def run_watch_check(email: str | None = None):
    """Beat target + run-now handler. One asyncio loop per invocation."""
    return asyncio.run(_check(email))


# ── Scheduled daily digest (fixed-time, regardless of triggers) ───────────────

async def _process_daily(sub: dict) -> dict:
    """Analyze the FULL watchlist (no trigger filter, no cooldown) and email it."""
    if not sub.get("enabled", True):
        return {"email": sub.get("email"), "skipped": "disabled"}
    tickers = (sub.get("tickers") or [])[:MAX_PER_RUN]
    if not tickers:
        return {"email": sub.get("email"), "skipped": "no tickers"}

    from app.api.digest import build_digest
    from app.core.mailer import send_html_email, smtp_configured

    digest = await build_digest(tickers, sub.get("language"), sub.get("model"))
    if not smtp_configured():
        log.warning("daily: SMTP not configured — skipping email for %s", sub.get("email"))
        return {"email": sub.get("email"), "analyzed": len(tickers), "emailed": False,
                "reason": "smtp_not_configured"}

    loop = asyncio.get_event_loop()
    subject = f"📅 QuantClash 每日報告 · {', '.join(tickers)}"
    send_result = await loop.run_in_executor(
        None,
        lambda: send_html_email(
            to=sub["email"], subject=subject, html=digest["html"],
            text_fallback=f"Daily digest for {', '.join(tickers)}",
        ),
    )
    ok = send_result.get("ok")
    if not ok:
        log.error("daily: email send failed: %s", send_result.get("error"))
    return {"email": sub.get("email"), "analyzed": len(tickers), "emailed": bool(ok),
            **({} if ok else {"error": send_result.get("error")})}


async def _daily(email: str | None) -> list:
    if email:
        sub = get_sub_sync(email)
        subs = [sub] if sub else []
    else:
        subs = list_subs_sync()
    results = []
    for sub in subs:
        try:
            results.append(await _process_daily(sub))
        except Exception as e:
            log.exception("daily: failed processing %s", sub.get("email"))
            results.append({"email": sub.get("email"), "error": str(e)})
    return results


@celery_app.task(name="app.tasks.watch_task.run_daily_digest")
def run_daily_digest(email: str | None = None):
    """Scheduled daily digest: analyze each subscriber's full watchlist and email it,
    regardless of news/anomaly triggers. Also callable on-demand with an email."""
    return asyncio.run(_daily(email))

"""Auto-analysis digest reports.

Flow: take a set of tickers (or scan the watchlist for flagged ones) →
run the full DAG analysis on each → render each into markdown → combine into
one HTML report → optionally email it.

Analyses are slow (~30-50s each via LLM) but cached, so repeats are instant.
Ticker count is capped to keep request time bounded.
"""
import asyncio
import json
from datetime import date
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel

from app.agents.graph import run_analysis
from app.agents.llm_router import set_model_override
from app.api.reports import render_markdown
from app.core.report_html import md_to_html, wrap_email_page, decision_banner
from app.core.mailer import send_html_email, smtp_configured

router = APIRouter()

MAX_TICKERS = 6  # cap to keep digest runtime bounded


SERIALIZE_KEYS = [
    "market_report", "sentiment_report", "news_report", "fundamentals_report",
    "macro_report", "market_research_report", "research_verdict", "trader_plan",
    "risk_verdict", "final_decision",
]


def _serialize_result(result: dict) -> dict:
    out = {}
    for key in SERIALIZE_KEYS:
        val = result.get(key)
        if val is None:
            continue
        if hasattr(val, "model_dump"):
            out[key] = val.model_dump()
        elif isinstance(val, (str, dict, list)):
            out[key] = val
        else:
            out[key] = str(val)
    return out


async def _analyze_one(ticker: str, trade_date: str, language: Optional[str]) -> dict:
    """Run one DAG analysis, return serialized result (never raises)."""
    try:
        result = await run_analysis(ticker, trade_date, user_tier="premium", language=language)
        return _serialize_result(result)
    except Exception as e:
        return {"_error": str(e)}


def _assemble_digest_html(results: list, trade_date: str) -> dict:
    """Build the combined HTML email from already-computed per-ticker results.

    `results` is a list of (ticker, serialized_result) tuples.
    """
    title = f"投資分析摘要 · {trade_date}"
    sections: list[str] = []

    # Summary table of decisions
    sections.append("## 決策總覽 / Decisions")
    sections.append("")
    sections.append("| 標的 | 行動 | 信心 |")
    sections.append("|------|------|------|")
    for sym, res in results:
        fd = res.get("final_decision") or {}
        action = fd.get("action", "—") if isinstance(fd, dict) else "—"
        conf = fd.get("confidence") if isinstance(fd, dict) else None
        conf_s = f"{round(conf * 100)}%" if isinstance(conf, (int, float)) else "—"
        sections.append(f"| {sym} | {action} | {conf_s} |")
    sections.append("")
    sections.append("---")

    summary_html = md_to_html("\n".join(sections))

    parts = [summary_html]
    for sym, res in results:
        parts.append(f'<h2 style="font-size:16px;font-weight:800;margin:28px 0 4px">{sym}</h2>')
        if res.get("_error"):
            parts.append(f'<p style="color:#dc2626">分析失敗 / Analysis failed: {res["_error"]}</p>')
            continue
        fd = res.get("final_decision")
        if isinstance(fd, dict) and fd.get("action"):
            parts.append(decision_banner(fd["action"], fd.get("confidence"), sym))
        md = render_markdown(sym, trade_date, res)
        ml = md.split("\n")
        while ml and (ml[0].startswith("# ") or ml[0].startswith("*") or not ml[0].strip()):
            ml.pop(0)
        parts.append(md_to_html("\n".join(ml)))

    body_html = "\n".join(parts)
    subtitle = f"共 {len(results)} 檔標的 · {', '.join(s for s, _ in results)}"
    html = wrap_email_page(title, body_html, subtitle=subtitle)
    return {
        "title": f"QuantClash {title}", "html": html, "count": len(results),
        "tickers": [s for s, _ in results], "trade_date": trade_date,
        "results": [{"ticker": s, "result": r} for s, r in results],
    }


async def build_digest(tickers: list[str], language: Optional[str], model: Optional[str] = None) -> dict:
    """Run analyses for each ticker and build a combined HTML digest."""
    syms = [t.upper() for t in tickers if t][:MAX_TICKERS]
    trade_date = date.today().isoformat()
    set_model_override(model)
    try:
        # Run all tickers in PARALLEL — each ~4-5 min sequentially, so this turns
        # N×5min into ~5min. Results re-ordered to match the requested order.
        analyzed = await asyncio.gather(
            *[_analyze_one(sym, trade_date, language) for sym in syms]
        )
        results = list(zip(syms, analyzed))
    finally:
        set_model_override(None)

    return _assemble_digest_html(results, trade_date)


class DigestRequest(BaseModel):
    tickers: list[str]
    language: Optional[str] = None
    model: Optional[str] = None
    email: Optional[str] = None  # if set, also send the report


@router.post("/preview", response_class=HTMLResponse)
async def digest_preview(req: DigestRequest):
    """Run analyses and return the combined HTML report (no email)."""
    if not req.tickers:
        return HTMLResponse("<p>No tickers provided.</p>", status_code=400)
    digest = await build_digest(req.tickers, req.language, req.model)
    return HTMLResponse(digest["html"])


@router.post("/send")
async def digest_send(req: DigestRequest):
    """Run analyses, build the report, and email it. Returns status JSON."""
    if not req.tickers:
        return {"ok": False, "error": "No tickers provided"}
    if not req.email:
        return {"ok": False, "error": "No email address provided"}
    if not smtp_configured():
        return {"ok": False, "error": "SMTP not configured on the server (set SMTP_USER / SMTP_PASSWORD in .env)"}

    digest = await build_digest(req.tickers, req.language, req.model)
    loop = asyncio.get_event_loop()
    send_result = await loop.run_in_executor(
        None,
        lambda: send_html_email(
            to=req.email,
            subject=digest["title"],
            html=digest["html"],
            text_fallback=f"QuantClash digest for {', '.join(digest['tickers'])}",
        ),
    )
    return {**send_result, "count": digest["count"], "tickers": digest["tickers"]}


@router.post("/run")
async def digest_run(req: DigestRequest):
    """Run full DAG analysis on each ticker, optionally email, and RETURN the
    structured per-ticker results (so the client can save them to DAG history).

    Returns JSON: { trade_date, tickers, results:[{ticker, result}], emailed, email_error? }
    """
    if not req.tickers:
        return {"ok": False, "error": "No tickers provided", "results": []}

    digest = await build_digest(req.tickers, req.language, req.model)

    emailed = False
    email_error = None
    if req.email:
        if smtp_configured():
            loop = asyncio.get_event_loop()
            send_result = await loop.run_in_executor(
                None,
                lambda: send_html_email(
                    to=req.email,
                    subject=digest["title"],
                    html=digest["html"],
                    text_fallback=f"QuantClash digest for {', '.join(digest['tickers'])}",
                ),
            )
            emailed = bool(send_result.get("ok"))
            if not emailed:
                email_error = send_result.get("error")
        else:
            email_error = "SMTP not configured on the server"

    return {
        "ok": True,
        "trade_date": digest["trade_date"],
        "tickers": digest["tickers"],
        "results": digest["results"],
        "emailed": emailed,
        "email_error": email_error,
    }


@router.post("/stream")
async def digest_stream(req: DigestRequest):
    """SSE: run full DAG analysis ticker-by-ticker, emitting live progress.

    Events (each as `data: {json}\\n\\n`):
      {type:"start", total, tickers}
      {type:"progress", index, total, ticker, status:"analyzing"}
      {type:"result", index, total, ticker, result}    # one per finished ticker
      {type:"emailing"} / {type:"emailed", ok, error?}  # if email requested
      {type:"done", trade_date, count}
      {type:"error", error}
    """
    syms = [t.upper() for t in (req.tickers or []) if t][:MAX_TICKERS]

    def _sse(payload: dict) -> str:
        return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"

    async def gen():
        if not syms:
            yield _sse({"type": "error", "error": "No tickers provided"})
            return
        trade_date = date.today().isoformat()
        set_model_override(req.model)
        results_map: dict[str, dict] = {}
        try:
            yield _sse({"type": "start", "total": len(syms), "tickers": syms})
            # Run ALL tickers in parallel — each is ~4-5 min sequentially, so
            # parallelism turns 6×5min into ~5min. Emit each result as it lands.
            async def _run(sym: str) -> tuple[str, dict]:
                return sym, await _analyze_one(sym, trade_date, req.language)

            tasks = [asyncio.create_task(_run(s)) for s in syms]
            # tell the client everything is in-flight
            for i, sym in enumerate(syms):
                yield _sse({"type": "progress", "index": i, "total": len(syms),
                            "ticker": sym, "status": "analyzing"})
            done_count = 0
            for coro in asyncio.as_completed(tasks):
                sym, res = await coro
                results_map[sym] = res
                fd = res.get("final_decision") or {}
                action = fd.get("action") if isinstance(fd, dict) else None
                yield _sse({"type": "result", "index": done_count, "total": len(syms),
                            "ticker": sym, "action": action, "result": res})
                done_count += 1
        except Exception as exc:
            set_model_override(None)
            yield _sse({"type": "error", "error": str(exc)})
            return
        finally:
            set_model_override(None)

        # Preserve the user's requested ticker order for the report
        results = [(s, results_map[s]) for s in syms if s in results_map]

        # Build report + optional email after all tickers done
        digest = _assemble_digest_html(results, trade_date)
        if req.email:
            yield _sse({"type": "emailing"})
            if smtp_configured():
                loop = asyncio.get_event_loop()
                send_result = await loop.run_in_executor(
                    None,
                    lambda: send_html_email(
                        to=req.email, subject=digest["title"], html=digest["html"],
                        text_fallback=f"QuantClash digest for {', '.join(digest['tickers'])}",
                    ),
                )
                yield _sse({"type": "emailed", "ok": bool(send_result.get("ok")),
                            "error": send_result.get("error")})
            else:
                yield _sse({"type": "emailed", "ok": False, "error": "SMTP not configured"})

        yield _sse({"type": "done", "trade_date": trade_date, "count": len(results)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def digest_status():
    """Whether email sending is available (SMTP configured)."""
    return {"smtp_configured": smtp_configured()}

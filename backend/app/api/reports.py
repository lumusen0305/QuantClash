"""Report export — render an analysis result into downloadable Markdown / HTML / email."""
import asyncio
from typing import Any, Dict, Optional

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, HTMLResponse
from pydantic import BaseModel

from app.core.report_html import (
    md_to_html, wrap_email_page, decision_banner, theme_for,
    BORDER, INK, MUTED, GREEN, RED, AMBER, ACCENT,
)
from app.core.mailer import send_html_email, smtp_configured

router = APIRouter()


class ExportRequest(BaseModel):
    ticker: str
    trade_date: Optional[str] = None
    result: Dict[str, Any]  # the analysis result_json (node -> report)


class EmailReportRequest(ExportRequest):
    email: str


SECTION_TITLES = {
    "market_report": "技術面分析 / Technical",
    "sentiment_report": "情緒面分析 / Sentiment",
    "news_report": "新聞分析 / News",
    "fundamentals_report": "基本面分析 / Fundamentals",
    "macro_report": "總體環境 / Macro",
    "market_research_report": "市場調查 / Market Research",
    "research_verdict": "研究結論 / Research Verdict",
    "trader_plan": "交易計畫 / Trade Plan",
    "risk_verdict": "風險評估 / Risk Verdict",
    "final_decision": "最終決策 / Final Decision",
}

SIGNAL_EMOJI = {"bullish": "🟢", "bearish": "🔴", "neutral": "⚪"}


def _fmt_report(r: Dict[str, Any]) -> str:
    """Format an AnalystReport-shaped dict."""
    out = []
    sig = r.get("signal")
    if sig:
        conf = r.get("confidence")
        conf_s = f" · 信心 {round(float(conf) * 100)}%" if conf is not None else ""
        out.append(f"**訊號:** {SIGNAL_EMOJI.get(sig, '')} {sig}{conf_s}")
    if r.get("summary"):
        out.append(f"\n{r['summary']}")
    if r.get("key_points"):
        out.append("\n**重點:**")
        out += [f"- {p}" for p in r["key_points"]]
    if r.get("risks"):
        out.append("\n**風險:**")
        out += [f"- {p}" for p in r["risks"]]
    return "\n".join(out)


def _fmt_final_decision_html(fd: Dict[str, Any], theme: str) -> str:
    """Render the final_decision block as clean labeled HTML (injected directly, not via md).

    Skips raw keys (action, confidence, analyst) — those belong in the banner, not the body.
    Renders: target/stop as a stat row, horizon as a chip, reasoning as a paragraph,
    risk_warnings as a bullet list.
    """
    parts: list[str] = []

    # ── Entry / Target / Stop stat row ──────────────────────────────────────
    entry  = fd.get("entry_price")
    target = fd.get("target_price")
    stop   = fd.get("stop_loss")
    if entry is not None or target is not None or stop is not None:
        stats: list[str] = []
        if entry is not None:
            try:
                ev = f"${float(entry):.2f}"
            except (TypeError, ValueError):
                ev = str(entry)
            stats.append(
                f'<td style="padding:12px 20px;text-align:center;border-right:1px solid {BORDER}">'
                f'  <div style="font-size:11px;font-weight:700;letter-spacing:.4px;'
                f'              text-transform:uppercase;color:{MUTED};margin-bottom:4px">進場 Entry</div>'
                f'  <div style="font-size:22px;font-weight:800;color:{ACCENT};'
                f'              font-variant-numeric:tabular-nums">{ev}</div>'
                f'</td>'
            )
        if target is not None:
            try:
                tv = f"${float(target):.2f}"
            except (TypeError, ValueError):
                tv = str(target)
            stats.append(
                f'<td style="padding:12px 20px;text-align:center;border-right:1px solid {BORDER}">'
                f'  <div style="font-size:11px;font-weight:700;letter-spacing:.4px;'
                f'              text-transform:uppercase;color:{MUTED};margin-bottom:4px">目標價 Target</div>'
                f'  <div style="font-size:22px;font-weight:800;color:{GREEN};'
                f'              font-variant-numeric:tabular-nums">{tv}</div>'
                f'</td>'
            )
        if stop is not None:
            try:
                sv = f"${float(stop):.2f}"
            except (TypeError, ValueError):
                sv = str(stop)
            stats.append(
                f'<td style="padding:12px 20px;text-align:center">'
                f'  <div style="font-size:11px;font-weight:700;letter-spacing:.4px;'
                f'              text-transform:uppercase;color:{MUTED};margin-bottom:4px">停損 Stop</div>'
                f'  <div style="font-size:22px;font-weight:800;color:{RED};'
                f'              font-variant-numeric:tabular-nums">{sv}</div>'
                f'</td>'
            )
        parts.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" '
            f'style="border:1px solid {BORDER};border-radius:10px;overflow:hidden;'
            f'margin:10px 0 16px;background:#f8fafc">'
            f'<tr>{"".join(stats)}</tr>'
            f'</table>'
        )

    # ── Time horizon chip ────────────────────────────────────────────────────
    horizon = fd.get("time_horizon")
    if horizon:
        parts.append(
            f'<div style="margin:0 0 14px">'
            f'  <span style="display:inline-block;padding:4px 14px;border-radius:999px;'
            f'               font-size:12px;font-weight:700;letter-spacing:.3px;'
            f'               background:{theme};color:#fff">時間框架 {horizon}</span>'
            f'</div>'
        )

    # ── Reasoning paragraph ──────────────────────────────────────────────────
    reasoning = fd.get("reasoning") or fd.get("rationale") or fd.get("summary")
    if reasoning:
        safe = str(reasoning).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        parts.append(
            f'<p style="margin:0 0 14px;line-height:1.75;color:{INK};font-size:14px">'
            f'{safe}</p>'
        )

    # ── Risk warnings bullet list ────────────────────────────────────────────
    risks = fd.get("risk_warnings") or fd.get("risks") or []
    if isinstance(risks, str):
        risks = [risks]
    if risks:
        items = "".join(
            f'<li style="margin:4px 0;line-height:1.6;color:{INK}">'
            f'{str(r).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")}'
            f'</li>'
            for r in risks
        )
        parts.append(
            f'<p style="font-size:12px;font-weight:700;letter-spacing:.3px;'
            f'text-transform:uppercase;color:{MUTED};margin:14px 0 6px">風險 Risks</p>'
            f'<ul style="padding-left:20px;margin:0 0 12px">{items}</ul>'
        )

    return "\n".join(parts)


def _fmt_generic(v: Any) -> str:
    if isinstance(v, dict):
        lines = []
        for k, val in v.items():
            if val is None or val == "" or val == []:
                continue
            if isinstance(val, list):
                lines.append(f"**{k}:**")
                lines += [f"- {x}" for x in val]
            else:
                lines.append(f"**{k}:** {val}")
        return "\n".join(lines)
    if isinstance(v, list):
        return "\n".join(f"- {x}" for x in v)
    return str(v)


# Keys to skip in final_decision when falling back to _fmt_generic
_FINAL_DECISION_SKIP = {"action", "confidence", "analyst", "analyst_type"}


def render_markdown(ticker: str, trade_date: Optional[str], result: Dict[str, Any]) -> str:
    md = [f"# {ticker} 投資分析報告", ""]
    if trade_date:
        md.append(f"*分析日期: {trade_date}*")
        md.append("")

    order = list(SECTION_TITLES.keys())
    for key in order:
        if key not in result or result[key] is None:
            continue
        val = result[key]
        title = SECTION_TITLES.get(key, key)
        md.append(f"## {title}")
        md.append("")
        if isinstance(val, dict) and ("signal" in val or "summary" in val) and "analyst" in val:
            md.append(_fmt_report(val))
        elif key == "final_decision" and isinstance(val, dict):
            # Render a cleaner subset — skip raw technical keys
            filtered = {k: v for k, v in val.items() if k not in _FINAL_DECISION_SKIP}
            md.append(_fmt_generic(filtered))
        else:
            md.append(_fmt_generic(val))
        md.append("")

    md.append("---")
    md.append("*Generated by QuantClash — 投資研究工作流自動化工具*")
    return "\n".join(md)


def _render_email_body(
    ticker: str,
    trade_date: Optional[str],
    result: Dict[str, Any],
    theme: str,
    action: Optional[str],
    fd: Optional[Dict[str, Any]],
) -> str:
    """Build the email body HTML, with the final_decision block rendered natively (not via md)."""
    md = render_markdown(ticker, trade_date, result)

    # Strip the leading title / date lines (shown in the email header instead)
    body_lines = md.split("\n")
    while body_lines and (
        body_lines[0].startswith("# ")
        or body_lines[0].startswith("*")
        or not body_lines[0].strip()
    ):
        body_lines.pop(0)

    # If final_decision exists, excise its section from the markdown and inject
    # our custom-rendered HTML block in its place.
    final_md_block = ""
    final_html_block = ""
    if fd and isinstance(fd, dict):
        # Locate the "## 最終決策" section in the rejoined body and cut it out
        rejoined = "\n".join(body_lines)
        # We'll split on the heading and replace with our rendered version
        fd_heading = "## 最終決策 / Final Decision"
        if fd_heading in rejoined:
            before, _, after = rejoined.partition(fd_heading)
            # after starts with the section content until the next ## or end
            # Find the next ## heading
            next_section_match = re.search(r"\n## ", after)
            if next_section_match:
                fd_content = after[:next_section_match.start()]
                rest = after[next_section_match.start():]
            else:
                fd_content = after
                rest = ""
            # Render before part (everything up to final_decision)
            before_html = md_to_html(before, theme=theme)
            fd_html = (
                f'<h2 style="font-size:15px;font-weight:700;color:{theme};'
                f'margin:26px 0 6px;padding-bottom:5px;border-bottom:2px solid {BORDER}">'
                f'最終決策 / Final Decision</h2>\n'
                + _fmt_final_decision_html(fd, theme)
            )
            rest_html = md_to_html(rest, theme=theme) if rest.strip() else ""
            body_html = before_html + fd_html + rest_html
        else:
            body_html = md_to_html(rejoined, theme=theme)
    else:
        body_html = md_to_html("\n".join(body_lines), theme=theme)

    # Verdict banner at very top
    if action and fd:
        body_html = decision_banner(action, fd.get("confidence"), ticker) + body_html

    return body_html


import re  # ensure re available at module level (already imported in report_html)


@router.post("/markdown", response_class=PlainTextResponse)
async def export_markdown(req: ExportRequest):
    md = render_markdown(req.ticker.upper(), req.trade_date, req.result)
    fname = f"{req.ticker.upper()}_{req.trade_date or 'report'}.md"
    return PlainTextResponse(
        md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/html", response_class=HTMLResponse)
async def export_html(req: ExportRequest):
    """Render markdown to a minimal printable HTML page (browser can print to PDF)."""
    md = render_markdown(req.ticker.upper(), req.trade_date, req.result)
    import html as _html

    lines = md.split("\n")
    body = []
    in_list = False
    for ln in lines:
        esc = _html.escape(ln)
        if ln.startswith("# "):
            if in_list:
                body.append("</ul>"); in_list = False
            body.append(f"<h1>{esc[2:]}</h1>")
        elif ln.startswith("## "):
            if in_list:
                body.append("</ul>"); in_list = False
            body.append(f"<h2>{esc[3:]}</h2>")
        elif ln.startswith("- "):
            if not in_list:
                body.append("<ul>"); in_list = True
            body.append(f"<li>{esc[2:]}</li>")
        elif ln.strip() == "---":
            if in_list:
                body.append("</ul>"); in_list = False
            body.append("<hr/>")
        else:
            if in_list:
                body.append("</ul>"); in_list = False
            body.append(f"<p>{esc}</p>" if ln.strip() else "")
    if in_list:
        body.append("</ul>")
    rendered = "\n".join(body)
    import re as _re
    rendered = _re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", rendered)

    page = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<title>{_html.escape(req.ticker.upper())} 投資分析報告</title>
<style>body{{font-family:-apple-system,'Segoe UI',sans-serif;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.6;color:#1a1a1a}}
h1{{font-size:28px;border-bottom:2px solid #00a870;padding-bottom:8px}}h2{{font-size:20px;margin-top:28px;color:#00a870}}
ul{{padding-left:22px}}hr{{border:none;border-top:1px solid #ddd;margin:32px 0}}@media print{{body{{margin:0}}}}</style>
</head><body>{rendered}</body></html>"""
    return HTMLResponse(page)


@router.get("/email-status")
async def email_status():
    return {"smtp_configured": smtp_configured()}


@router.post("/email")
async def email_report(req: EmailReportRequest):
    """Email an EXISTING analysis result (no re-run) as a polished HTML report."""
    if not req.email:
        return {"ok": False, "error": "No email address provided"}
    if not smtp_configured():
        return {"ok": False, "error": "SMTP not configured on the server"}

    ticker = req.ticker.upper()
    fd = req.result.get("final_decision")
    action = fd.get("action") if isinstance(fd, dict) else None
    theme = theme_for(action) if action else None

    body_html = _render_email_body(
        ticker, req.trade_date, req.result,
        theme=theme or "#00a870",
        action=action,
        fd=fd if isinstance(fd, dict) else None,
    )

    title = f"{ticker} 投資分析報告"
    subtitle = req.trade_date or ""
    html = (wrap_email_page(title, body_html, subtitle=subtitle, theme=theme)
            if theme else wrap_email_page(title, body_html, subtitle=subtitle))

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: send_html_email(
            to=req.email,
            subject=f"📊 QuantClash · {title}",
            html=html,
            text_fallback=f"QuantClash analysis report for {ticker}",
        ),
    )
    return result

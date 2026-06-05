"""Reusable markdown→HTML rendering for emailed/exported reports.

Email-client-safe (inline styles, table-based layout, no external CSS/JS).
Polished "financial brief" aesthetic: branded header, card-like sections,
colored decision pills, zebra tables.
"""
import html as _html
import re

# ── palette ──────────────────────────────────────────────────────────────────
ACCENT = "#00a870"
INK = "#1a2230"
MUTED = "#6b7280"
BORDER = "#e6e9ef"
BG = "#eef1f6"
GREEN = "#16a34a"
RED = "#dc2626"
AMBER = "#d97706"


def _decision_color(text: str) -> str:
    t = str(text).upper()
    if "BUY" in t or "買" in t or "BULLISH" in t:
        return GREEN
    if "SELL" in t or "賣" in t or "BEARISH" in t:
        return RED
    if "HOLD" in t or "持有" in t or "NEUTRAL" in t:
        return AMBER
    return ACCENT


_ACTION_LABEL = {"BUY": "買進 BUY", "SELL": "賣出 SELL", "HOLD": "持有 HOLD"}
_ACTION_ICON  = {"BUY": "▲", "SELL": "▼", "HOLD": "●"}

# Darker shade per theme color, for the header gradient
_GRADIENT_DARK = {GREEN: "#0f7a37", RED: "#a01b1b", AMBER: "#a35e05", ACCENT: "#0a7d57"}

# Light tint backgrounds for the decision card
_ACTION_BG = {
    GREEN: "#f0fdf4",
    RED:   "#fff1f2",
    AMBER: "#fffbeb",
    ACCENT:"#f0fdf9",
}


def theme_for(action) -> str:
    """Theme color for a whole report, derived from the decision action."""
    return _decision_color(action)


def _grad_dark(color: str) -> str:
    return _GRADIENT_DARK.get(color, "#0a7d57")


def decision_banner(action: str, confidence=None, ticker: str = "") -> str:
    """A polished verdict card for the top of a report (buy=green/sell=red/hold=amber).

    Signature kept back-compatible (action, confidence, ticker).
    """
    color = _decision_color(action)
    label = _ACTION_LABEL.get(str(action).upper(), str(action))
    icon  = _ACTION_ICON.get(str(action).upper(), "●")
    bg    = _ACTION_BG.get(color, "#f0fdf9")
    dark  = _grad_dark(color)

    # Confidence bar (0-100%)
    pct = 0
    conf_html = ""
    if isinstance(confidence, (int, float)):
        pct = round(confidence * 100) if confidence <= 1 else round(confidence)
        bar_fill = f'<div style="height:6px;border-radius:999px;background:{color};width:{pct}%"></div>'
        conf_html = (
            f'<div style="margin-top:10px">'
            f'  <div style="display:flex;justify-content:space-between;'
            f'       font-size:11px;font-weight:600;color:{MUTED};margin-bottom:4px">'
            f'    <span>信心度 Confidence</span><span>{pct}%</span>'
            f'  </div>'
            f'  <div style="height:6px;border-radius:999px;background:{BORDER}">'
            f'    {bar_fill}'
            f'  </div>'
            f'</div>'
        )

    ticker_html = ""
    if ticker:
        ticker_html = (
            f'<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;'
            f'color:{color};text-transform:uppercase;margin-bottom:6px">'
            f'{_html.escape(ticker)}</div>'
        )

    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:4px 0 22px">'
        f'<tr><td style="background:{bg};border:2px solid {color};border-radius:14px;'
        f'padding:18px 22px;box-shadow:0 2px 12px rgba(0,0,0,.07)">'
        f'{ticker_html}'
        f'<div style="display:flex;align-items:center;gap:10px">'
        f'  <span style="font-size:28px;color:{color};line-height:1">{icon}</span>'
        f'  <span style="font-size:24px;font-weight:900;color:{color};'
        f'               letter-spacing:.5px;line-height:1">{label}</span>'
        f'</div>'
        f'{conf_html}'
        f'</td></tr></table>'
    )


def _inline(text: str) -> str:
    esc = _html.escape(text)
    esc = re.sub(r"\*\*(.+?)\*\*", r'<strong style="color:%s">\1</strong>' % INK, esc)
    esc = re.sub(r"\*(.+?)\*", r"<em>\1</em>", esc)

    # Highlight BUY/SELL/HOLD verdict words inline
    def _pill(m):
        word = m.group(0)
        return (f'<span style="display:inline-block;padding:1px 8px;border-radius:999px;'
                f'font-weight:700;font-size:12px;color:#fff;background:{_decision_color(word)}">'
                f'{word}</span>')
    esc = re.sub(r"\b(BUY|SELL|HOLD)\b", _pill, esc)

    # Colour signal words: bullish=green / bearish=red / neutral=grey
    def _signal_pill(m):
        word = m.group(0)
        c = GREEN if word.lower() == "bullish" else (RED if word.lower() == "bearish" else MUTED)
        return (f'<span style="display:inline-block;padding:1px 8px;border-radius:999px;'
                f'font-weight:700;font-size:12px;color:#fff;background:{c}">'
                f'{word}</span>')
    esc = re.sub(r"\b(bullish|bearish|neutral)\b", _signal_pill, esc, flags=re.IGNORECASE)

    return esc


def md_to_html(md: str, theme: str = ACCENT) -> str:
    """Email-safe markdown → HTML (headings, bold, bullets, tables, hr).

    `theme` colors the section headings and table headers so the whole report
    reflects the decision (buy=green / sell=red / hold=amber).
    """
    lines = md.split("\n")
    out: list[str] = []
    in_list = False
    i = 0

    def close_list():
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    while i < len(lines):
        ln = lines[i]
        stripped = ln.strip()

        # Table block: consecutive lines starting with |
        if stripped.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            close_list()
            rows = [r for r in block if not re.match(r"^\s*\|[\s:|-]+\|\s*$", r)]
            if rows:
                out.append(
                    '<table role="presentation" cellpadding="0" cellspacing="0" '
                    'style="border-collapse:collapse;width:100%;margin:14px 0;font-size:13px;'
                    f'border:1px solid {BORDER};border-radius:8px;overflow:hidden">'
                )
                for ri, row in enumerate(rows):
                    cells = [c.strip() for c in row.strip().strip("|").split("|")]
                    tag = "th" if ri == 0 else "td"
                    if ri == 0:
                        style = (f"padding:9px 12px;text-align:left;font-weight:700;"
                                 f"font-size:11px;letter-spacing:.4px;text-transform:uppercase;"
                                 f"color:#fff;background:{theme}")
                    else:
                        zebra = "#ffffff" if ri % 2 else "#f7f9fc"
                        style = (f"padding:9px 12px;text-align:left;color:{INK};"
                                 f"background:{zebra};border-top:1px solid {BORDER}")
                    cellhtml = "".join(
                        f'<{tag} style="{style}">{_inline(c)}</{tag}>' for c in cells
                    )
                    out.append(f"<tr>{cellhtml}</tr>")
                out.append("</table>")
            continue

        if ln.startswith("# "):
            close_list()
            out.append(
                f'<h1 style="font-size:19px;font-weight:800;color:{INK};margin:6px 0 2px">'
                f'{_inline(ln[2:])}</h1>'
            )
        elif ln.startswith("## "):
            close_list()
            out.append(
                f'<h2 style="font-size:15px;font-weight:700;color:{theme};'
                f'margin:26px 0 6px;padding-bottom:5px;border-bottom:2px solid {BORDER}">'
                f'{_inline(ln[3:])}</h2>'
            )
        elif ln.startswith("### "):
            close_list()
            out.append(
                f'<h3 style="font-size:13px;font-weight:700;color:{INK};margin:16px 0 4px">'
                f'{_inline(ln[4:])}</h3>'
            )
        elif ln.startswith("- "):
            if not in_list:
                out.append('<ul style="padding-left:20px;margin:8px 0;color:%s">' % INK)
                in_list = True
            out.append(f'<li style="margin:3px 0;line-height:1.6">{_inline(ln[2:])}</li>')
        elif stripped == "---":
            close_list()
            out.append(f'<hr style="border:none;border-top:1px solid {BORDER};margin:26px 0"/>')
        else:
            close_list()
            out.append(
                f'<p style="margin:7px 0;line-height:1.7;color:{INK};font-size:14px">{_inline(ln)}</p>'
                if stripped else ""
            )
        i += 1

    close_list()
    return "\n".join(out)


def wrap_email_page(title: str, body_html: str, subtitle: str = "", theme: str = ACCENT) -> str:
    """Wrap rendered body in a polished, email-client-friendly HTML page.

    `theme` tints the header gradient + footer brand so the whole email reflects
    the decision (buy=green / sell=red / hold=amber).
    """
    grad = f"linear-gradient(135deg,{theme},{_grad_dark(theme)})"
    sub = (f'<div style="font-size:13px;color:rgba(255,255,255,.85);margin-top:4px">'
           f'{_html.escape(subtitle)}</div>') if subtitle else ""
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_html.escape(title)}</title></head>
<body style="margin:0;padding:0;background:{BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG};padding:24px 0">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0"
 style="width:640px;max-width:96%;background:#fff;border-radius:16px;overflow:hidden;
 box-shadow:0 4px 24px rgba(20,30,50,.08);font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif">

  <!-- Header band -->
  <tr><td style="background:{grad};padding:24px 28px">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,.8);text-transform:uppercase">QUANTCLASH</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-top:4px;line-height:1.25">{_html.escape(title)}</div>
    {sub}
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:24px 28px 8px">
    {body_html}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:18px 28px 26px;border-top:1px solid {BORDER}">
    <div style="font-size:11px;color:{MUTED};line-height:1.6">
      此報告由 <strong style="color:{INK}">QuantClash</strong> 自動產生 — 投資研究工作流自動化工具。<br>
      內容僅供研究參考，非投資建議。
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>"""

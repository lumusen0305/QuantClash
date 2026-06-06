"""Pricing tools + deterministic technical baseline for the final decision.

Two layers (hybrid design):
  1. `compute_levels(ticker)` — a DETERMINISTIC snapshot (current price, ATR,
     support/resistance, moving averages, RSI). Always injected into the prompt
     so the LLM can never invent a price scale (e.g. pre-split NVDA ~$900).
  2. `PRICING_TOOLS` — LangChain tools the decision agent MAY call on its own to
     gather extra evidence (fundamentals, longer history, news) before fixing
     entry / target / stop. The agent decides which (if any) to use.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf
from langchain_core.tools import tool

from app.agents.analysts.news_analyst import _fetch_yahoo_rss


def _history(ticker: str, period: str = "6mo") -> pd.DataFrame:
    return yf.Ticker(ticker).history(period=period)


def _rsi(closes: pd.Series, period: int = 14) -> float:
    delta = closes.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    val = rsi.iloc[-1]
    return round(float(val), 1) if pd.notna(val) else 50.0


def _atr(hist: pd.DataFrame, period: int = 14) -> float:
    high, low, close = hist["High"], hist["Low"], hist["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    val = tr.rolling(period).mean().iloc[-1]
    return round(float(val), 2) if pd.notna(val) else 0.0


def _adx(hist: pd.DataFrame, period: int = 14) -> float | None:
    """Average Directional Index — trend strength (0-100, >25 = trending)."""
    try:
        high, low, close = hist["High"], hist["Low"], hist["Close"]
        up = high.diff()
        down = -low.diff()
        plus_dm = ((up > down) & (up > 0)) * up
        minus_dm = ((down > up) & (down > 0)) * down
        prev_close = close.shift(1)
        tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        atr = tr.rolling(period).mean()
        plus_di = 100 * (plus_dm.rolling(period).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(period).mean() / atr)
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
        val = dx.rolling(period).mean().iloc[-1]
        return round(float(val), 1) if pd.notna(val) else None
    except Exception:
        return None


def _obv_trend(hist: pd.DataFrame) -> str | None:
    """On-Balance Volume trend over the last 20 bars: rising / falling / flat."""
    try:
        close, vol = hist["Close"], hist["Volume"]
        direction = np.sign(close.diff()).fillna(0)
        obv = (direction * vol).cumsum()
        recent = obv.tail(20)
        if len(recent) < 5:
            return None
        slope = float(recent.iloc[-1] - recent.iloc[0])
        scale = float(vol.tail(20).mean()) or 1.0
        norm = slope / scale
        return "rising" if norm > 1 else "falling" if norm < -1 else "flat"
    except Exception:
        return None


def _cvar(closes: pd.Series, q: float = 0.05) -> float | None:
    """Conditional Value-at-Risk / expected shortfall (FinCon arXiv 2407.06567
    within-episode risk control): the average DAILY return in the worst q% of
    days — a downside TAIL-risk measure that ATR (symmetric vol) misses.
    Returned as a fraction (e.g. -0.045 = on the worst 5% of days, ~-4.5%)."""
    try:
        rets = closes.pct_change().dropna()
        if len(rets) < 20:
            return None
        cutoff = rets.quantile(q)
        tail = rets[rets <= cutoff]
        if len(tail) == 0:
            return None
        return round(float(tail.mean()), 4)
    except Exception:
        return None


def _days_to_earnings(ticker: str):
    """Calendar days until the next earnings date (event risk). Earnings are a
    major scheduled catalyst — being long/short INTO a print is elevated risk,
    so the agent should size down or wait. Returns int days, or None."""
    try:
        import datetime as _dt
        cal = yf.Ticker(ticker).calendar
        dates = None
        if isinstance(cal, dict):
            dates = cal.get("Earnings Date")
        if not dates:
            return None
        if not isinstance(dates, (list, tuple)):
            dates = [dates]
        today = _dt.date.today()
        future = []
        for d in dates:
            dd = d.date() if hasattr(d, "date") else d
            if isinstance(dd, _dt.date):
                delta = (dd - today).days
                if delta >= 0:
                    future.append(delta)
        return min(future) if future else None
    except Exception:
        return None


def compute_levels(ticker: str) -> dict | None:
    """Deterministic price/technical snapshot. Returns None if no data."""
    try:
        hist = _history(ticker, "6mo")
        if hist is None or hist.empty:
            return None
        close = hist["Close"]
        price = float(close.iloc[-1])
        recent20 = hist.tail(20)
        recent60 = hist.tail(60)

        def _ma(n: int) -> float | None:
            if len(close) >= n:
                return round(float(close.rolling(n).mean().iloc[-1]), 2)
            return None

        return {
            "ticker": ticker,
            "current_price": round(price, 2),
            "atr14": _atr(hist),
            "rsi14": _rsi(close),
            "support_20d": round(float(recent20["Low"].min()), 2),
            "resistance_20d": round(float(recent20["High"].max()), 2),
            "low_60d": round(float(recent60["Low"].min()), 2),
            "high_60d": round(float(recent60["High"].max()), 2),
            "ma20": _ma(20),
            "ma50": _ma(50),
            "ma200": _ma(200),
            "adx14": _adx(hist),
            "obv_trend": _obv_trend(hist),
            "cvar5": _cvar(close),
            "days_to_earnings": _days_to_earnings(ticker),
        }
    except Exception:
        return None


# Style-based risk parameters (TradingGroup-style, ATR as the volatility proxy).
# stop/target are ATR multiples; size is the fraction of capital to deploy.
RISK_STYLES = {
    "conservative": {"stop": 1.0, "target": 1.5, "size": 0.50},
    "balanced":     {"stop": 1.5, "target": 3.0, "size": 1.00},
    "aggressive":   {"stop": 2.0, "target": 4.0, "size": 1.00},
}


def style_levels(levels: dict, action: str, style: str = "balanced") -> dict | None:
    """Suggested entry/target/stop for an action under a risk style, sized off
    ATR. Returns None for HOLD or when data is missing."""
    action = (action or "").upper()
    if action not in ("BUY", "SELL"):
        return None
    p = levels.get("current_price")
    atr = levels.get("atr14")
    if not p or not atr:
        return None
    s = RISK_STYLES.get(style, RISK_STYLES["balanced"])
    if action == "BUY":
        return {
            "style": style, "entry": round(p, 2),
            "target": round(p + s["target"] * atr, 2),
            "stop": round(p - s["stop"] * atr, 2),
            "size_pct": int(s["size"] * 100),
        }
    return {  # SELL / short
        "style": style, "entry": round(p, 2),
        "target": round(p - s["target"] * atr, 2),
        "stop": round(p + s["stop"] * atr, 2),
        "size_pct": int(s["size"] * 100),
    }


def style_levels_text(levels: dict, style: str = "balanced") -> str:
    """Render the style-based suggested levels for BOTH directions, as guidance
    the decision agent can anchor to."""
    buy = style_levels(levels, "BUY", style)
    sell = style_levels(levels, "SELL", style)
    if not buy:
        return ""
    return (
        f"RISK-STYLE GUIDANCE ({style}, ATR-sized):\n"
        f"- if BUY: entry ${buy['entry']}, target ${buy['target']}, stop ${buy['stop']}, size {buy['size_pct']}%\n"
        f"- if SELL: entry ${sell['entry']}, target ${sell['target']}, stop ${sell['stop']}, size {sell['size_pct']}%\n"
        "Use these as the default; adjust only with a stated reason.\n"
    )


def levels_text(levels: dict) -> str:
    """Render the deterministic snapshot for the prompt."""
    return (
        f"DETERMINISTIC PRICE SNAPSHOT for {levels['ticker']} (real data, ground truth):\n"
        f"- current_price: ${levels['current_price']}\n"
        f"- ATR(14): {levels['atr14']}  (use for stop distance, e.g. 1.5-2x ATR)\n"
        f"- RSI(14): {levels['rsi14']}\n"
        f"- 20d support / resistance: ${levels['support_20d']} / ${levels['resistance_20d']}\n"
        f"- 60d low / high: ${levels['low_60d']} / ${levels['high_60d']}\n"
        f"- MA20 / MA50 / MA200: {levels['ma20']} / {levels['ma50']} / {levels['ma200']}\n"
        f"- ADX(14): {levels.get('adx14')} (>25 = strong trend) · OBV trend: {levels.get('obv_trend')}\n"
        + (f"- CVaR(5%): {levels['cvar5']:.1%} daily tail-loss — if severe (worse than "
           "-4%), treat downside as high: tighten stops / size down / prefer HOLD.\n"
           if levels.get("cvar5") is not None else "")
        + (f"- EARNINGS in {levels['days_to_earnings']} days — event risk: entering "
           "right before a print is a gamble on the report; size down or wait until after.\n"
           if isinstance(levels.get("days_to_earnings"), int) and levels["days_to_earnings"] <= 10 else "")
    )


# ─── Tools the agent may call on its own ────────────────────────────────────

@tool
def get_technical_levels(ticker: str) -> str:
    """Get the current price, ATR, RSI, 20d/60d support & resistance, and moving
    averages (MA20/50/200) for a stock ticker. Use this to ground entry, target
    and stop-loss prices in real, recent market data."""
    lv = compute_levels(ticker.upper())
    if not lv:
        return f"No price data available for {ticker}."
    return levels_text(lv)


@tool
def get_fundamentals_snapshot(ticker: str) -> str:
    """Get a valuation snapshot for a ticker: trailing/forward P/E, market cap,
    profit margin, revenue growth, and 52-week range. Use to judge whether the
    current price is rich or cheap before setting a target."""
    try:
        info = yf.Ticker(ticker.upper()).info
    except Exception as e:
        return f"Fundamentals unavailable for {ticker}: {e}"

    def g(k):
        v = info.get(k)
        return v if v is not None else "n/a"

    return (
        f"Fundamentals for {ticker.upper()}:\n"
        f"- trailing P/E: {g('trailingPE')}, forward P/E: {g('forwardPE')}\n"
        f"- market cap: {g('marketCap')}\n"
        f"- profit margin: {g('profitMargins')}, revenue growth: {g('revenueGrowth')}\n"
        f"- 52w low / high: {g('fiftyTwoWeekLow')} / {g('fiftyTwoWeekHigh')}\n"
        f"- analyst target mean: {g('targetMeanPrice')} (low {g('targetLowPrice')}, high {g('targetHighPrice')})"
    )


@tool
def get_price_history(ticker: str, period: str = "3mo") -> str:
    """Get a compact OHLC trend summary over a period (e.g. '1mo','3mo','6mo',
    '1y'). Use to understand the recent trend before deciding an entry zone."""
    try:
        hist = _history(ticker.upper(), period)
        if hist is None or hist.empty:
            return f"No history for {ticker} over {period}."
        close = hist["Close"]
        start, end = float(close.iloc[0]), float(close.iloc[-1])
        chg = (end - start) / start * 100 if start else 0.0
        return (
            f"{ticker.upper()} over {period}: start ${start:.2f} -> end ${end:.2f} "
            f"({chg:+.1f}%), period high ${float(hist['High'].max()):.2f}, "
            f"low ${float(hist['Low'].min()):.2f}."
        )
    except Exception as e:
        return f"History unavailable for {ticker}: {e}"


# Headline catalyst lexicon for a deterministic news read (FinRL-DeepSeek
# arXiv 2502.07393: derive a numeric news risk/sentiment score, not just text).
_NEWS_NEG = (
    "lawsuit", "sue", "investigation", "probe", "sec ", "doj", "fraud", "scandal",
    "downgrade", "cut", "miss", "misses", "warning", "warn", "recall", "bankruptcy",
    "default", "layoff", "layoffs", "halt", "delist", "subpoena", "fine", "plunge",
    "slump", "crash", "weak", "loss", "shortfall", "guidance cut", "delay",
    "tumble", "sink", "drop", "selloff", "sell-off", "bearish", "underperform",
    "antitrust", "breach", "hack", "data breach", "resign", "step down", "short seller",
    "dilution", "going concern", "impairment", "writedown", "write-down", "slash",
)
_NEWS_POS = (
    "beat", "beats", "upgrade", "raises", "raised", "record", "surge", "soar",
    "approval", "approved", "partnership", "deal", "buyback", "dividend", "wins",
    "win", "launch", "expansion", "strong", "outperform", "breakthrough", "rally",
    "jump", "soars", "tops", "exceeds", "bullish", "accelerate", "milestone",
    "contract", "guidance raise", "price target raised", "acquisition", "all-time high",
    "robust", "momentum", "profit", "margin expansion", "double", "boost",
)


def _news_sentiment(items: list) -> dict:
    """Deterministic headline sentiment + risk catalysts. Returns
    {score:-1..1, pos, neg, risk_flags:[...], n}. Pure — testable offline."""
    pos = neg = 0
    flags: list[str] = []
    for it in items:
        title = (it.get("title") or "").lower()
        for kw in _NEWS_POS:
            if kw in title:
                pos += 1
                break
        hit_neg = next((kw for kw in _NEWS_NEG if kw in title), None)
        if hit_neg:
            neg += 1
            flags.append(hit_neg.strip())
    total = pos + neg
    score = round((pos - neg) / total, 2) if total else 0.0
    # Dissemination breadth (FinGPT 2412.10823): widely-covered news moves prices
    # more; a signal from 1-2 headlines is noisy, not actionable.
    n = len(items)
    breadth = "high" if n >= 8 else "normal" if n >= 4 else "low"
    return {"score": score, "pos": pos, "neg": neg,
            "risk_flags": sorted(set(flags)), "n": n, "breadth": breadth}


@tool
def get_recent_news(ticker: str) -> str:
    """Get recent news headlines for a ticker PLUS a deterministic sentiment
    score (-1..1) and any risk catalysts (lawsuit, downgrade, SEC, miss, etc.),
    so news becomes a quantified signal, not just text."""
    try:
        items = _fetch_yahoo_rss(ticker.upper()) or []
        if not items:
            return f"No recent news for {ticker}."
        lines = [f"- {it.get('title')} ({it.get('publisher','?')})" for it in items[:6]]
        sent = _news_sentiment(items)
        summary = (
            f"NEWS SENTIMENT: {sent['score']:+.2f} (-1..1) from {sent['n']} headlines "
            f"({sent['pos']} positive / {sent['neg']} negative), breadth={sent['breadth']}."
        )
        if sent["breadth"] == "low":
            summary += " (LOW breadth — few headlines; treat sentiment as weak/noisy.)"
        if sent["risk_flags"]:
            summary += " ⚠ RISK CATALYSTS: " + ", ".join(sent["risk_flags"]) + "."
        return f"Recent news for {ticker.upper()}:\n" + "\n".join(lines) + "\n" + summary
    except Exception as e:
        return f"News unavailable for {ticker}: {e}"


@tool
def get_peer_news(tickers: str) -> str:
    """Check recent NEWS SENTIMENT of a stock's PEERS / supply-chain names
    (pass a comma-separated list, e.g. 'AMD,TSM,AVGO' for NVDA). Cross-company
    news propagates — a supplier's or peer's bad news is an early signal for the
    stock before its own price reacts (semantic contagion, arXiv 2606.05733)."""
    syms = [s.strip().upper() for s in tickers.replace(" ", ",").split(",") if s.strip()][:6]
    if not syms:
        return "No peer tickers provided."
    lines = []
    scores = []
    for s in syms:
        try:
            items = _fetch_yahoo_rss(s) or []
            if not items:
                continue
            sent = _news_sentiment(items)
            scores.append(sent["score"])
            flag = (" ⚠" + ",".join(sent["risk_flags"])) if sent["risk_flags"] else ""
            lines.append(f"{s}: sentiment {sent['score']:+.2f} ({sent['n']} hl){flag}")
        except Exception:
            continue
    if not scores:
        return f"No peer news available for {syms}."
    avg = sum(scores) / len(scores)
    tilt = "peers POSITIVE" if avg > 0.15 else "peers NEGATIVE (contagion risk)" if avg < -0.15 else "peers mixed"
    return (f"Peer news (contagion check) — avg {avg:+.2f}, {tilt}:\n- " + "\n- ".join(lines))


@tool
def get_relative_strength(ticker: str) -> str:
    """Get the stock's relative strength vs the S&P 500 (SPY) over 1m/3m — is it
    LEADING or LAGGING the market? Relative strength is a classic factor: leaders
    tend to keep leading. Distinct from absolute momentum."""
    try:
        def _ret(sym, days):
            h = yf.Ticker(sym).history(period="6mo")
            if h is None or h.empty or len(h) <= days:
                return None
            c = h["Close"]
            return float(c.iloc[-1] / c.iloc[-days] - 1)
        out = []
        for label, days in (("1m", 21), ("3m", 63)):
            tr, sr = _ret(ticker.upper(), days), _ret("SPY", days)
            if tr is None or sr is None:
                continue
            rs = tr - sr
            out.append(f"{label}: stock {tr:+.1%} vs SPY {sr:+.1%} → RS {rs:+.1%} "
                       f"({'leading' if rs > 0 else 'lagging'})")
        if not out:
            return f"Relative strength unavailable for {ticker}."
        return f"Relative strength for {ticker.upper()} vs SPY:\n- " + "\n- ".join(out)
    except Exception as e:
        return f"Relative strength unavailable for {ticker}: {e}"


@tool
def get_insider_activity(ticker: str) -> str:
    """Get recent insider (executive/director) buy vs sell activity. Net insider
    BUYING is a documented bullish signal (insiders know their company); heavy
    selling can be a caution flag."""
    try:
        df = yf.Ticker(ticker.upper()).insider_transactions
        if df is None or len(df) == 0:
            return f"No insider transaction data for {ticker}."
        buys = sells = 0
        for _, row in df.head(25).iterrows():
            blob = " ".join(str(row.get(c, "")) for c in df.columns).lower()
            if "buy" in blob or "purchase" in blob:
                buys += 1
            elif "sale" in blob or "sell" in blob:
                sells += 1
        if buys == 0 and sells == 0:
            return f"Insider data present for {ticker} but no clear buy/sell labels."
        tilt = "net BUYING (bullish)" if buys > sells else "net SELLING (caution)" if sells > buys else "balanced"
        return (f"Insider activity for {ticker.upper()} (recent {buys+sells} transactions): "
                f"{buys} buys vs {sells} sells — {tilt}.")
    except Exception as e:
        return f"Insider data unavailable for {ticker}: {e}"


PRICING_TOOLS = [
    get_technical_levels,
    get_fundamentals_snapshot,
    get_price_history,
    get_insider_activity,
    get_relative_strength,
    get_peer_news,
    get_recent_news,
]

_TOOL_MAP = {t.name: t for t in PRICING_TOOLS}


# Anti-tool-hallucination guard rail. From "The Reasoning Trap" (arXiv 2510.22977):
# stronger reasoning models tend to FABRICATE non-existent tools / fake tool
# outputs and fail to abstain when the right tool is missing. The cheap,
# effective mitigation is an explicit "only use provided tools; admit inability
# rather than fabricate" instruction, plus runtime rejection of invented calls.
_TOOL_GUARD = (
    "TOOL DISCIPLINE (read carefully):\n"
    f"- You may ONLY call these exact tools: {', '.join(_TOOL_MAP)}.\n"
    "- NEVER invent a tool that is not in that list, and NEVER fabricate or guess "
    "a tool's output. Only use values that a tool actually returned.\n"
    "- Every tool takes a single 'ticker' string argument.\n"
    "- If the available tools cannot ground a number, say so plainly — set that "
    "value to null in the final decision rather than making one up. Honesty about "
    "missing data is REQUIRED; a fabricated price is a serious error.\n"
)


def _valid_args(args: dict) -> tuple[bool, str]:
    """Validate a pricing-tool call's args (all tools need a non-empty ticker)."""
    if not isinstance(args, dict):
        return False, "arguments must be an object"
    tk = args.get("ticker")
    if not isinstance(tk, str) or not tk.strip():
        return False, "missing/empty required 'ticker' argument"
    return True, ""


def run_tool_research(llm, system_prompt: str, max_rounds: int = 3) -> str:
    """Bounded tool-calling loop: the agent decides which PRICING_TOOLS to call.

    Hardened against tool hallucination (arXiv 2510.22977): invented tool names
    and malformed calls are rejected with a correction instead of being silently
    accepted, and a warning is surfaced so the final decision can abstain.

    Returns the gathered observations as text (to feed the final decision).
    `llm` must support .bind_tools(). Synchronous — call via run_in_executor.
    """
    from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage

    bound = llm.bind_tools(PRICING_TOOLS)
    messages = [
        SystemMessage(content=system_prompt + "\n\n" + _TOOL_GUARD),
        HumanMessage(content=(
            "Call whichever of the PROVIDED tools you need to ground the entry / "
            "target / stop prices in real data, then stop calling tools. Don't "
            "call a tool twice with the same arguments. Do not call any tool that "
            "is not in the provided list."
        )),
    ]
    notes: list[str] = []
    hallucinated = 0
    for _ in range(max_rounds):
        ai = bound.invoke(messages)
        messages.append(ai)
        tool_calls = getattr(ai, "tool_calls", None) or []
        if not tool_calls:
            break
        for tc in tool_calls:
            name = tc.get("name")
            args = tc.get("args", {}) or {}
            tool = _TOOL_MAP.get(name)
            if tool is None:
                # Hallucinated / non-existent tool — reject + correct, don't accept.
                hallucinated += 1
                result = (
                    f"ERROR: '{name}' is not a real tool and was NOT executed. "
                    f"Only these tools exist: {', '.join(_TOOL_MAP)}. "
                    "Do not fabricate its output; either call a valid tool or stop."
                )
            else:
                ok, why = _valid_args(args)
                if not ok:
                    result = f"ERROR: invalid call to {name} — {why}. Retry with a valid ticker."
                else:
                    try:
                        result = tool.invoke(args)
                    except Exception as e:
                        result = f"(tool {name} failed: {e})"
            notes.append(f"[{name}({args})]\n{result}")
            messages.append(ToolMessage(content=str(result), tool_call_id=tc.get("id", name)))
    if hallucinated:
        notes.append(
            f"⚠ GROUNDING WARNING: the agent attempted {hallucinated} invented "
            "tool call(s). Treat tool-derived numbers with extra caution and "
            "prefer null over any value you cannot trace to a real tool result."
        )
    return "\n\n".join(notes) if notes else "(agent called no tools)"

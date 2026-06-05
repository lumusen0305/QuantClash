"""Investment workflow automation endpoints.

Implements the product-vision features: turning a watchlist into a daily
action queue, triaging assets, classifying them, running typed AI reviews,
analyzing portfolio exposure, and generating weekly reports.

All endpoints are stateless and LLM-driven; persistence lives client-side
(localStorage), matching the rest of the app's dev architecture.
"""
import asyncio
from typing import List, Optional, Dict, Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.llm_router import get_llm, get_language_instruction
from app.core.llm_json import llm_json, robust_llm_json

router = APIRouter()


# ----------------------------- shared models -----------------------------

class AssetProfile(BaseModel):
    ticker: str
    role: Optional[str] = None          # e.g. "Core Growth", "Core ETF"
    theme: Optional[str] = None         # e.g. "AI Infrastructure"
    risk: Optional[str] = None          # Low / Medium / High
    review_frequency: Optional[str] = None  # Daily / Weekly / Monthly
    thesis: Optional[str] = None        # the current investment thesis
    thesis_status: Optional[str] = None # Valid / Drifting / Broken


class WatchItem(BaseModel):
    ticker: str
    profile: Optional[AssetProfile] = None
    change_pct: Optional[float] = None  # recent % move (client-supplied to save API calls)
    note: Optional[str] = None


class Position(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    current_price: Optional[float] = None


# ----------------------------- price helper ------------------------------

async def _recent_change(ticker: str) -> Optional[float]:
    """Best-effort recent 5-day % change for a ticker, via yfinance."""
    try:
        import yfinance as yf

        def _calc():
            hist = yf.Ticker(ticker).history(period="5d")
            if hist.empty or len(hist) < 2:
                return None
            first = float(hist["Close"].iloc[0])
            last = float(hist["Close"].iloc[-1])
            return round((last - first) / first * 100, 2) if first else None

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _calc)
    except Exception:
        return None


# ============================ 1. ACTION QUEUE ============================

class ActionQueueRequest(BaseModel):
    watchlist: List[WatchItem]
    positions: List[Position] = []
    language: Optional[str] = None


@router.post("/action-queue")
async def action_queue(req: ActionQueueRequest):
    """Daily Investment Action Queue (Vision #1).

    Returns 3-5 prioritized things the user should actually handle today,
    each with a trigger reason and a suggested review type.
    """
    lang = get_language_instruction(req.language)

    # Enrich with recent change where client didn't supply it (cap to keep it fast)
    items = req.watchlist[:30]
    missing = [it for it in items if it.change_pct is None][:12]
    if missing:
        changes = await asyncio.gather(*[_recent_change(it.ticker) for it in missing])
        for it, ch in zip(missing, changes):
            it.change_pct = ch

    held = {p.ticker.upper() for p in req.positions}
    lines = []
    for it in items:
        prof = it.profile
        role = prof.role if prof else None
        thesis_status = prof.thesis_status if prof else None
        lines.append(
            f"- {it.ticker.upper()}: 5d move {it.change_pct if it.change_pct is not None else 'n/a'}%"
            f"{', HELD' if it.ticker.upper() in held else ''}"
            f"{f', role={role}' if role else ''}"
            f"{f', thesis={thesis_status}' if thesis_status else ''}"
            f"{f', note={it.note}' if it.note else ''}"
        )
    watch_block = "\n".join(lines) if lines else "(empty watchlist)"

    prompt = f"""{lang}You are an investment operations assistant. Do NOT give buy/sell advice.
Your job is to decide which watchlist items actually deserve the user's attention TODAY,
and which can be ignored. Be selective — most days only 2-5 items need action.

Watchlist (held = currently in portfolio):
{watch_block}

For each item that needs attention, assign a priority and the single most relevant review type.
Review types: thesis_drift, news_impact, earnings_preview, post_earnings, risk_review, exposure_review, sector_rotation.

Respond ONLY in JSON:
{{
  "high": [{{"ticker": "NVDA", "reason": "why it needs attention today", "review_type": "post_earnings"}}],
  "medium": [{{"ticker": "AMD", "reason": "...", "review_type": "news_impact"}}],
  "no_action": ["AAPL", "..."],
  "summary": "one-line summary of today's focus"
}}"""

    data = await robust_llm_json(prompt, fallback={"high": [], "medium": [], "no_action": [], "summary": ""})
    return data


# ============================ 2. TRIAGE =================================

class TriageRequest(BaseModel):
    watchlist: List[WatchItem]
    language: Optional[str] = None


TRIAGE_LEVELS = [
    "Need Review", "Watch Closely", "Light Scan Only",
    "No Action", "Thesis Changed", "Risk Increased",
]


@router.post("/triage")
async def triage(req: TriageRequest):
    """Watchlist Triage (Vision #2) — auto-grade each watchlist item."""
    lang = get_language_instruction(req.language)

    items = req.watchlist[:40]
    missing = [it for it in items if it.change_pct is None][:15]
    if missing:
        changes = await asyncio.gather(*[_recent_change(it.ticker) for it in missing])
        for it, ch in zip(missing, changes):
            it.change_pct = ch

    lines = []
    for it in items:
        prof = it.profile
        lines.append(
            f"- {it.ticker.upper()}: 5d move {it.change_pct if it.change_pct is not None else 'n/a'}%"
            f"{f', role={prof.role}' if prof and prof.role else ''}"
            f"{f', risk={prof.risk}' if prof and prof.risk else ''}"
            f"{f', thesis_status={prof.thesis_status}' if prof and prof.thesis_status else ''}"
        )
    block = "\n".join(lines) if lines else "(empty)"

    prompt = f"""{lang}You triage a stock watchlist. For each ticker assign exactly one level from:
{', '.join(TRIAGE_LEVELS)}.

Watchlist:
{block}

Respond ONLY in JSON:
{{"items": [{{"ticker": "NVDA", "level": "Need Review", "reason": "short reason"}}]}}"""

    data = await robust_llm_json(prompt, fallback={"items": []})
    return data


# ============================ 3. CLASSIFY ===============================

class ClassifyRequest(BaseModel):
    ticker: str
    portfolio_context: Optional[str] = None
    language: Optional[str] = None


@router.post("/classify")
async def classify(req: ClassifyRequest):
    """Asset classification (Vision #3) — suggest an asset profile for a ticker."""
    lang = get_language_instruction(req.language)
    ticker = req.ticker.upper()

    # Pull a little context
    info_block = ""
    try:
        import yfinance as yf

        def _info():
            info = yf.Ticker(ticker).info
            return {
                "name": info.get("shortName") or info.get("longName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "beta": info.get("beta"),
                "marketCap": info.get("marketCap"),
            }

        loop = asyncio.get_event_loop()
        meta = await loop.run_in_executor(None, _info)
        info_block = "\n".join(f"{k}: {v}" for k, v in meta.items() if v is not None)
    except Exception:
        pass

    prompt = f"""{lang}Classify the asset {ticker} for a personal investment asset graph.
{f'Reference data:\n{info_block}' if info_block else ''}
{f'Portfolio context: {req.portfolio_context}' if req.portfolio_context else ''}

Respond ONLY in JSON:
{{
  "ticker": "{ticker}",
  "role": "Core Growth | Core ETF | Satellite | Hedge | Supply Chain Exposure | Speculative",
  "theme": "main theme, e.g. AI Infrastructure / Semiconductor",
  "risk": "Low | Medium | Medium-High | High",
  "review_frequency": "Daily | Weekly | Monthly",
  "thesis": "one-sentence investment thesis",
  "thesis_status": "Valid"
}}"""

    data = await robust_llm_json(prompt, fallback={"ticker": ticker})
    return data


# ============================ 5. EXPOSURE ===============================

class ExposureRequest(BaseModel):
    positions: List[Position]
    cash: float = 0.0
    profiles: List[AssetProfile] = []
    language: Optional[str] = None


@router.post("/exposure")
async def exposure(req: ExposureRequest):
    """Exposure & Allocation Review (Vision #5)."""
    lang = get_language_instruction(req.language)

    total = req.cash
    rows = []
    for p in req.positions:
        price = p.current_price or p.avg_cost
        val = price * p.shares
        total += val
        rows.append({"ticker": p.ticker.upper(), "value": val})
    for r in rows:
        r["weight"] = round(r["value"] / total * 100, 2) if total > 0 else 0
    cash_w = round(req.cash / total * 100, 2) if total > 0 else 0

    prof_map = {p.ticker.upper(): p for p in req.profiles}
    lines = []
    for r in rows:
        prof = prof_map.get(r["ticker"])
        lines.append(
            f"- {r['ticker']}: {r['weight']}%"
            f"{f' (theme={prof.theme}, risk={prof.risk})' if prof else ''}"
        )
    block = "\n".join(lines) if lines else "(no positions)"

    prompt = f"""{lang}You review portfolio EXPOSURE and ALLOCATION. Do NOT give buy/sell advice.
Surface structural risks: theme/sector concentration, single-name concentration,
ETF vs single-stock overlap, low defensive allocation, rising theme risk.

Portfolio (total ${total:,.0f}, cash {cash_w}%):
{block}

Respond ONLY in JSON:
{{
  "concentration": [{{"type": "theme|single_name|overlap|defensive", "detail": "...", "severity": "low|medium|high"}}],
  "theme_breakdown": [{{"theme": "AI/Semiconductor", "weight_pct": 45.0}}],
  "summary": "overall exposure assessment",
  "watch_items": ["what to keep an eye on"]
}}"""

    data = await robust_llm_json(prompt, fallback={"concentration": [], "theme_breakdown": [], "summary": "", "watch_items": []})
    return {"total_value": total, "cash_weight": cash_w, "holdings": rows, "review": data}


# ============================ 6. TYPED REVIEW ===========================

REVIEW_TYPES = {
    "thesis_drift": "Thesis Drift Review — has the original investment thesis changed?",
    "news_impact": "News Impact Review — how do recent headlines affect the thesis?",
    "earnings_preview": "Earnings Preview — what to watch in the upcoming report.",
    "post_earnings": "Post-Earnings Review — did results confirm or break the thesis?",
    "risk_review": "Risk Review — what risks have increased recently?",
    "sector_rotation": "Sector Rotation Review — is capital rotating into/out of this sector?",
    "exposure_review": "Exposure Review — this name's role in the overall portfolio.",
}


class ReviewRequest(BaseModel):
    ticker: str
    review_type: str = "thesis_drift"
    thesis: Optional[str] = None
    profile: Optional[AssetProfile] = None
    language: Optional[str] = None


@router.get("/review-types")
async def review_types():
    return {"types": [{"key": k, "label": v} for k, v in REVIEW_TYPES.items()]}


@router.post("/review")
async def review(req: ReviewRequest):
    """AI Workflow Review (Vision #6) — a typed review with a fixed output format."""
    lang = get_language_instruction(req.language)
    ticker = req.ticker.upper()
    rtype = req.review_type if req.review_type in REVIEW_TYPES else "thesis_drift"
    rdesc = REVIEW_TYPES[rtype]

    # Pull recent headlines + change for grounding
    change = await _recent_change(ticker)
    news_block = ""
    try:
        import httpx, xml.etree.ElementTree as ET

        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
        root = ET.fromstring(r.text)
        ch = root.find("channel")
        items = ch.findall("item")[:6] if ch is not None else []
        heads = [(i.findtext("title") or "").strip() for i in items]
        news_block = "\n".join(f"- {h}" for h in heads if h)
    except Exception:
        pass

    prompt = f"""{lang}Run a "{rdesc}" for {ticker}.
{f'Current thesis: {req.thesis}' if req.thesis else ''}
{f'5-day move: {change}%' if change is not None else ''}
{f'Recent headlines:\n{news_block}' if news_block else ''}

Use EXACTLY this output structure. Respond ONLY in JSON:
{{
  "ticker": "{ticker}",
  "review_type": "{rtype}",
  "conclusion": "1-line conclusion",
  "why_triggered": "why this review was run",
  "bull_case": "...",
  "bear_case": "...",
  "risk_review": "...",
  "what_would_change_our_mind": "...",
  "next_review_trigger": "what event should trigger the next review"
}}"""

    data = await robust_llm_json(
        prompt,
        mode="deep",
        fallback={"ticker": ticker, "review_type": rtype, "conclusion": ""},
    )
    # Guard: empty/parse-failed payload → return a usable message instead of blanks
    if not isinstance(data, dict) or not (data.get("conclusion") or "").strip():
        data = {
            "ticker": ticker,
            "review_type": rtype,
            "conclusion": "AI 暫時無法產生此次複查（模型額度或回應格式問題），請稍後重試。"
                          " / AI review temporarily unavailable — please retry.",
            "why_triggered": rdesc,
            "bull_case": "",
            "bear_case": "",
            "risk_review": "",
            "what_would_change_our_mind": "",
            "next_review_trigger": "",
            "degraded": True,
        }
    return data


# ============================ 9. WEEKLY REPORT ==========================

class WeeklyReportRequest(BaseModel):
    watchlist: List[WatchItem]
    recent_actions: List[Dict[str, Any]] = []  # past action-queue items / journal entries
    language: Optional[str] = None


@router.post("/weekly-report")
async def weekly_report(req: WeeklyReportRequest):
    """Weekly Watchlist Report (Vision #9)."""
    lang = get_language_instruction(req.language)

    items = req.watchlist[:40]
    wl = "\n".join(
        f"- {it.ticker.upper()}: 5d {it.change_pct if it.change_pct is not None else 'n/a'}%"
        f"{f', thesis_status={it.profile.thesis_status}' if it.profile and it.profile.thesis_status else ''}"
        for it in items
    ) or "(empty)"
    actions = "\n".join(f"- {a}" for a in req.recent_actions[:30]) or "(none recorded)"

    prompt = f"""{lang}Produce a WEEKLY watchlist research report. Do NOT give buy/sell advice.
Frame it as a research/monitoring memo suitable as a newsletter draft.

Watchlist:
{wl}

Actions taken / reviews run this week:
{actions}

Respond ONLY in JSON:
{{
  "high_priority": [{{"ticker": "NVDA", "note": "..."}}],
  "thesis_changed": [{{"ticker": "...", "note": "..."}}],
  "no_action": ["AAPL", "..."],
  "exposure_changes": "summary of exposure shifts",
  "key_events": ["event 1", "event 2"],
  "next_week_watch": ["what to track next week"],
  "markdown": "a clean markdown version of the full report"
}}"""

    data = await robust_llm_json(prompt, fallback={"high_priority": [], "thesis_changed": [], "no_action": [], "key_events": [], "next_week_watch": [], "markdown": ""})
    return data


# ============================ 4. EVENT SCAN ENGINE ======================

class ScanRequest(BaseModel):
    tickers: List[str]


def _scan_universe(tickers: List[str]) -> List[dict]:
    """Rule-based, no-LLM event detection across a list of tickers.

    Detects price breakouts, big moves, volume spikes and 6mo high/low
    proximity from a single batched download, then maps each to the most
    relevant review type and a priority. This is the 'engine' that decides
    which names deserve attention today.
    """
    import yfinance as yf

    syms = [t.upper() for t in tickers if t]
    if not syms:
        return []
    data = yf.download(" ".join(syms), period="6mo", group_by="ticker", progress=False, threads=True)
    out = []
    for sym in syms:
        try:
            df = data[sym].dropna() if len(syms) > 1 else data.dropna()
            if len(df) < 20:
                continue
            closes = df["Close"]
            vols = df["Volume"]
            last = float(closes.iloc[-1])
            chg_5d = (last - float(closes.iloc[-6])) / float(closes.iloc[-6]) * 100 if len(closes) > 6 else 0.0
            hi = float(closes.max())
            lo = float(closes.min())
            from_high = (last - hi) / hi * 100 if hi else 0.0
            from_low = (last - lo) / lo * 100 if lo else 0.0
            last_vol = float(vols.iloc[-1])
            avg_vol = float(vols.iloc[-20:].mean()) or 1.0
            rel_vol = last_vol / avg_vol

            events = []
            if chg_5d >= 7:
                events.append({"type": "big_move_up", "detail": f"5d +{chg_5d:.1f}%"})
            elif chg_5d <= -7:
                events.append({"type": "big_move_down", "detail": f"5d {chg_5d:.1f}%"})
            if from_high >= -3:
                events.append({"type": "near_high", "detail": f"{from_high:.1f}% from 6mo high"})
            if from_low <= 3:
                events.append({"type": "near_low", "detail": f"+{from_low:.1f}% off 6mo low"})
            if rel_vol >= 2:
                events.append({"type": "volume_spike", "detail": f"{rel_vol:.1f}x avg volume"})

            if not events:
                continue

            # Map events -> recommended review + priority
            etypes = {e["type"] for e in events}
            if "big_move_down" in etypes:
                review, priority = "risk_review", "high"
            elif "big_move_up" in etypes and "volume_spike" in etypes:
                review, priority = "news_impact", "high"
            elif "big_move_up" in etypes:
                review, priority = "news_impact", "medium"
            elif "near_high" in etypes:
                review, priority = "thesis_drift", "medium"
            elif "near_low" in etypes:
                review, priority = "risk_review", "medium"
            else:
                review, priority = "news_impact", "medium"

            out.append({
                "ticker": sym,
                "events": events,
                "recommended_review": review,
                "priority": priority,
                "chg_5d": round(chg_5d, 2),
                "rel_volume": round(rel_vol, 2),
            })
        except Exception:
            continue
    # high priority first
    out.sort(key=lambda x: 0 if x["priority"] == "high" else 1)
    return out


@router.post("/scan")
async def scan(req: ScanRequest):
    """Event-detection engine (Vision #4) — rule-based triggers, no LLM."""
    loop = asyncio.get_event_loop()
    triggers = await loop.run_in_executor(None, lambda: _scan_universe(req.tickers[:60]))
    return {"scanned": len(req.tickers[:60]), "triggered": len(triggers), "triggers": triggers}


# ============================ BUY RECOMMENDATIONS =======================

class BuyRecRequest(BaseModel):
    universe: Optional[List[str]] = None   # default: discovery WATCHLIST
    max_candidates: int = 10
    max_analyze: int = 6                    # how many candidates to deep-analyze (slow)
    language: Optional[str] = None
    model: Optional[str] = None


@router.post("/buy-recommendations")
async def buy_recommendations(req: BuyRecRequest):
    """Recommend stocks to BUY — backed by the FULL DAG analysis (not just momentum).

    Pipeline:
      1. Rule-based scan surfaces momentum/breakout candidates (fast, no LLM).
      2. Run the FULL multi-agent DAG analysis on the top candidates.
      3. Recommend ONLY the names whose DAG final_decision is BUY.

    This guarantees consistency: a "recommended BUY" here will also read BUY if
    the user re-runs it in the DAG editor — no more momentum-vs-fundamentals
    contradiction. Slow (~30-50s per analyzed candidate) but cached.
    """
    from datetime import date
    from app.api.discovery import WATCHLIST, _fetch_movers
    from app.api.digest import _analyze_one
    from app.agents.llm_router import set_model_override

    set_model_override(req.model)
    loop = asyncio.get_event_loop()
    universe = [t.upper() for t in (req.universe or WATCHLIST)][:60]

    # Stage 1: rule-based bullish candidates + today's gainers
    try:
        triggers, movers = await asyncio.gather(
            loop.run_in_executor(None, lambda: _scan_universe(universe)),
            loop.run_in_executor(None, _fetch_movers),
        )
    except Exception as exc:
        set_model_override(None)
        return {"error": str(exc), "recommendations": [], "scanned": len(universe)}

    bullish = [
        tr for tr in triggers
        if any(e["type"] in ("big_move_up", "near_high", "volume_spike") for e in tr.get("events", []))
    ]
    gainers = sorted(movers, key=lambda x: x.get("change_pct", 0), reverse=True)

    # Ordered, deduped candidate ticker list (bullish triggers first)
    candidates: list[str] = []
    seen: set[str] = set()
    for tr in bullish:
        if tr["ticker"] not in seen:
            seen.add(tr["ticker"]); candidates.append(tr["ticker"])
    for g in gainers:
        if g["ticker"] not in seen:
            seen.add(g["ticker"]); candidates.append(g["ticker"])

    if not candidates:
        set_model_override(None)
        return {"recommendations": [], "scanned": len(universe), "analyzed": 0,
                "summary": "目前無明顯買進候選 / No clear buy candidates right now."}

    # Stage 2: deep DAG analysis on the top candidates (cap to bound runtime)
    to_analyze = candidates[: max(1, req.max_analyze)]
    trade_date = date.today().isoformat()
    analyzed = await asyncio.gather(
        *[_analyze_one(t, trade_date, req.language) for t in to_analyze]
    )
    set_model_override(None)

    # Stage 3: keep only DAG-confirmed BUYs
    recs = []
    rejected = []
    for ticker, res in zip(to_analyze, analyzed):
        if not isinstance(res, dict) or res.get("_error"):
            continue
        fd = res.get("final_decision") or {}
        action = str(fd.get("action", "")).upper()
        conf = fd.get("confidence")
        if action == "BUY":
            recs.append({
                "ticker": ticker,
                "conviction": "high" if isinstance(conf, (int, float)) and conf >= 0.65 else "medium",
                "confidence": conf,
                "thesis": (fd.get("reasoning") or "").split("\n")[0][:240],
                "entry_price": fd.get("entry_price"),
                "target_price": fd.get("target_price"),
                "stop_loss": fd.get("stop_loss"),
                "time_horizon": fd.get("time_horizon"),
            })
        else:
            rejected.append({"ticker": ticker, "action": action or "—"})

    recs.sort(key=lambda r: (r.get("confidence") or 0), reverse=True)

    if recs:
        summary = f"分析 {len(to_analyze)} 檔動能候選，{len(recs)} 檔經完整 DAG 分析判定為買進。"
    else:
        rej = "、".join(f"{r['ticker']}({r['action']})" for r in rejected[:6])
        summary = (f"分析 {len(to_analyze)} 檔動能候選，但完整 DAG 分析後沒有一檔達到「買進」"
                   f"——技術面強不代表基本面/風險面支持。{('被判非買進: ' + rej) if rej else ''}")

    return {
        "scanned": len(universe),
        "candidates_found": len(candidates),
        "analyzed": len(to_analyze),
        "summary": summary,
        "recommendations": recs[: req.max_candidates],
        "rejected": rejected,
    }


class PortfolioBuildRequest(BaseModel):
    tickers: List[str]                       # candidates to analyze + allocate
    risk_style: str = "balanced"             # conservative | balanced | aggressive
    max_analyze: int = 6
    max_positions: int = 10
    language: Optional[str] = None
    model: Optional[str] = None


@router.post("/portfolio")
async def build_portfolio_endpoint(req: PortfolioBuildRequest):
    """Construct an allocated portfolio from a candidate list (AlphaAgents).

    Runs the full DAG per ticker, then conviction-weights the BUYs and applies
    the risk-style profile (cash buffer + concentration cap + high-vol trim for
    conservative). Returns {positions:[{ticker, weight_pct, confidence}], cash_pct, ...}.
    Slow (~full DAG per ticker, run in parallel) but the analyses are reused.
    """
    from datetime import date
    from app.api.digest import _analyze_one
    from app.agents.llm_router import set_model_override
    from app.agents.pricing_tools import compute_levels
    from app.data.portfolio_builder import build_portfolio

    syms = [t.upper() for t in (req.tickers or []) if t][: max(1, req.max_analyze)]
    if not syms:
        return {"positions": [], "cash_pct": 100.0, "note": "No tickers provided."}

    set_model_override(req.model)
    loop = asyncio.get_event_loop()
    trade_date = date.today().isoformat()
    try:
        analyzed = await asyncio.gather(
            *[_analyze_one(t, trade_date, req.language) for t in syms]
        )
    finally:
        set_model_override(None)

    decisions = []
    for ticker, res in zip(syms, analyzed):
        if not isinstance(res, dict) or res.get("_error"):
            continue
        fd = res.get("final_decision") or {}
        lv = await loop.run_in_executor(None, lambda t=ticker: compute_levels(t))
        # volatility proxy = ATR / price (so conservative high-vol trim works)
        vol = None
        if lv and lv.get("atr14") and lv.get("current_price"):
            vol = lv["atr14"] / lv["current_price"]
        decisions.append({
            "ticker": ticker,
            "action": str(fd.get("action", "")).upper(),
            "confidence": fd.get("confidence"),
            "volatility": vol,
        })

    portfolio = build_portfolio(decisions, req.risk_style, req.max_positions)
    portfolio["analyzed"] = len(decisions)
    portfolio["decisions"] = decisions
    return portfolio

import asyncio
import json
from typing import Optional

import yfinance as yf
from fastapi import APIRouter
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app.agents.llm_router import (
    get_language_instruction,
    get_llm,
    mark_gemini_failed,
    set_model_override,
)
from app.api.discovery import WATCHLIST, _fetch_movers, _fetch_sector_data
from app.core.llm_json import robust_llm_json

router = APIRouter()


# ─── Request / Response models ─────────────────────────────────────────────────

class PositionInput(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


class AdviseRequest(BaseModel):
    positions: list[PositionInput]
    language: Optional[str] = None
    model: Optional[str] = None


class ActionItem(BaseModel):
    ticker: str
    action: str  # "TRIM" | "HOLD" | "ADD"
    pct: Optional[float] = None
    reason: str


class SuggestionItem(BaseModel):
    ticker: str
    reason: str


class AdviseResponse(BaseModel):
    summary: str
    actions: list[ActionItem]
    suggestions: list[SuggestionItem]
    error: Optional[str] = None


# ─── Pydantic model for structured LLM output ─────────────────────────────────

class LLMAdvice(BaseModel):
    summary: str
    actions: list[ActionItem]
    suggestions: list[SuggestionItem]


# ─── Market data helpers ───────────────────────────────────────────────────────

def _fetch_position_data(positions: list[PositionInput]) -> list[dict]:
    """Fetch current price and 1-month momentum for each position."""
    tickers_str = " ".join(p.ticker for p in positions)
    tickers_obj = yf.Tickers(tickers_str)
    results = []
    for pos in positions:
        try:
            hist = tickers_obj.tickers[pos.ticker].history(period="1mo")
            if len(hist) < 2:
                current_price = pos.avg_cost
                momentum_pct = 0.0
            else:
                current_price = float(hist["Close"].iloc[-1])
                start_price = float(hist["Close"].iloc[0])
                momentum_pct = ((current_price - start_price) / start_price) * 100 if start_price else 0.0
            pl_pct = ((current_price - pos.avg_cost) / pos.avg_cost) * 100 if pos.avg_cost else 0.0
            market_value = pos.shares * current_price
            results.append({
                "ticker": pos.ticker,
                "shares": pos.shares,
                "avg_cost": pos.avg_cost,
                "current_price": round(current_price, 2),
                "pl_pct": round(pl_pct, 2),
                "momentum_1mo_pct": round(momentum_pct, 2),
                "market_value": round(market_value, 2),
            })
        except Exception:
            market_value = pos.shares * pos.avg_cost
            results.append({
                "ticker": pos.ticker,
                "shares": pos.shares,
                "avg_cost": pos.avg_cost,
                "current_price": pos.avg_cost,
                "pl_pct": 0.0,
                "momentum_1mo_pct": 0.0,
                "market_value": round(market_value, 2),
            })
    return results


def _get_top_gainers(exclude_tickers: set[str], limit: int = 5) -> list[dict]:
    """Get top gainers from the watchlist, excluding already-held positions."""
    try:
        movers = _fetch_movers()
        gainers = sorted(movers, key=lambda x: x["change_pct"], reverse=True)
        return [g for g in gainers if g["ticker"] not in exclude_tickers][:limit]
    except Exception:
        return []


# ─── LLM advice ───────────────────────────────────────────────────────────────

def _build_prompt(
    enriched: list[dict],
    total_value: float,
    candidates: list[dict],
    language: Optional[str],
) -> str:
    lang_prefix = get_language_instruction(language)

    positions_txt = "\n".join(
        f"  - {p['ticker']}: {p['shares']} shares @ avg cost ${p['avg_cost']:.2f}, "
        f"current ${p['current_price']:.2f}, P&L {p['pl_pct']:+.2f}%, "
        f"1mo momentum {p['momentum_1mo_pct']:+.2f}%, "
        f"weight {(p['market_value'] / total_value * 100) if total_value else 0:.1f}%"
        for p in enriched
    )

    candidates_txt = "\n".join(
        f"  - {c['ticker']}: price ${c['price']:.2f}, daily change {c['change_pct']:+.2f}%"
        for c in candidates
    ) if candidates else "  (none available)"

    prompt = f"""{lang_prefix}You are a professional portfolio advisor. Analyze the following portfolio and provide rebalancing advice.

Portfolio (total value: ${total_value:.2f}):
{positions_txt}

Hot alternative stocks (top gainers today, not in portfolio):
{candidates_txt}

Provide actionable rebalancing advice in strict JSON. The JSON must have exactly this shape:
{{
  "summary": "<2-3 sentence overall portfolio assessment>",
  "actions": [
    {{
      "ticker": "<TICKER>",
      "action": "<TRIM|HOLD|ADD>",
      "pct": <trim percentage as number, or null if HOLD/ADD>,
      "reason": "<one sentence reason>"
    }}
  ],
  "suggestions": [
    {{
      "ticker": "<TICKER>",
      "reason": "<one sentence why this stock is worth considering>"
    }}
  ]
}}

Rules:
- TRIM: overweight position (>25% weight) or weak/negative 1mo momentum with poor P&L. Include suggested trim % (10-50).
- HOLD: balanced weight and decent momentum.
- ADD: underweight position with strong momentum or high conviction.
- suggestions: pick 2-3 from the hot alternatives that complement the portfolio.
- Output ONLY the JSON object, no markdown fences, no commentary.
"""
    return prompt


def _parse_llm_json(text: str) -> dict:
    """Extract and parse JSON from LLM response text."""
    text = text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


# ─── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/advise", response_model=AdviseResponse)
async def advise_portfolio(req: AdviseRequest):
    if not req.positions:
        return AdviseResponse(
            summary="No positions provided.",
            actions=[],
            suggestions=[],
            error="positions list is empty",
        )

    # Apply model override if specified
    set_model_override(req.model)

    loop = asyncio.get_event_loop()

    # Fetch position data and top gainers concurrently
    held_tickers = {p.ticker.upper() for p in req.positions}

    enriched_future = loop.run_in_executor(None, _fetch_position_data, req.positions)
    gainers_future = loop.run_in_executor(None, _get_top_gainers, held_tickers, 5)

    try:
        enriched, candidates = await asyncio.gather(enriched_future, gainers_future)
    except Exception as exc:
        set_model_override(None)
        return AdviseResponse(
            summary="Failed to fetch market data.",
            actions=[],
            suggestions=[],
            error=str(exc),
        )

    total_value = sum(p["market_value"] for p in enriched)

    prompt = _build_prompt(enriched, total_value, candidates, req.language)

    try:
        llm = get_llm("premium", mode="quick")
        response = await loop.run_in_executor(
            None,
            lambda: llm.invoke([HumanMessage(content=prompt)]),
        )
        raw = response.content if hasattr(response, "content") else str(response)
        data = _parse_llm_json(raw)

        actions = [
            ActionItem(
                ticker=a.get("ticker", ""),
                action=a.get("action", "HOLD"),
                pct=a.get("pct"),
                reason=a.get("reason", ""),
            )
            for a in data.get("actions", [])
        ]
        suggestions = [
            SuggestionItem(
                ticker=s.get("ticker", ""),
                reason=s.get("reason", ""),
            )
            for s in data.get("suggestions", [])
        ]

        set_model_override(None)
        return AdviseResponse(
            summary=data.get("summary", ""),
            actions=actions,
            suggestions=suggestions,
        )

    except Exception as exc:
        # Check if it's a Gemini quota error
        err_str = str(exc).upper()
        if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
            mark_gemini_failed()

        set_model_override(None)
        # Return graceful fallback: one HOLD per position, no suggestions
        fallback_actions = [
            ActionItem(
                ticker=p["ticker"],
                action="HOLD",
                pct=None,
                reason="Unable to generate AI advice at this time.",
            )
            for p in enriched
        ]
        return AdviseResponse(
            summary="AI advice temporarily unavailable. Showing neutral HOLD recommendations.",
            actions=fallback_actions,
            suggestions=[],
            error=str(exc),
        )


# ─── Rebalance: market survey + rotation plan ──────────────────────────────────

class RebalanceRequest(BaseModel):
    positions: list[PositionInput]
    cash: float = 0.0
    language: Optional[str] = None
    model: Optional[str] = None


@router.post("/rebalance")
async def rebalance_portfolio(req: RebalanceRequest):
    """Survey the market (hot sectors + candidate stocks) then produce a
    rotation/transfer plan: what to trim from current holdings and which
    sectors/tickers are worth rotating INTO. Cached + resilient (never 500).
    """
    set_model_override(req.model)
    loop = asyncio.get_event_loop()
    held = {p.ticker.upper() for p in req.positions}

    try:
        enriched, sectors, movers = await asyncio.gather(
            loop.run_in_executor(None, _fetch_position_data, req.positions),
            loop.run_in_executor(None, _fetch_sector_data),
            loop.run_in_executor(None, _fetch_movers),
        )
    except Exception as exc:
        set_model_override(None)
        return {"error": str(exc), "survey": {"hot_sectors": [], "candidates": []}, "rotation": [], "summary": ""}

    total_value = sum(p["market_value"] for p in enriched) + req.cash

    # Market survey: hottest sectors + top candidate stocks not already held
    hot_sectors = sorted(sectors, key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
    candidates = [m for m in sorted(movers, key=lambda x: x["change_pct"], reverse=True)
                  if m["ticker"] not in held][:8]

    pos_txt = "\n".join(
        f"  - {p['ticker']}: weight {(p['market_value']/total_value*100) if total_value else 0:.1f}%, "
        f"P&L {p['pl_pct']:+.1f}%, 1mo momentum {p['momentum_1mo_pct']:+.1f}%"
        for p in enriched
    ) or "  (no positions)"
    sectors_txt = "\n".join(f"  - {s['sector']} ({s['ticker']}): {s['change_pct']:+.2f}%" for s in hot_sectors) or "  (n/a)"
    cand_txt = "\n".join(f"  - {c['ticker']}: {c['change_pct']:+.2f}% @ ${c['price']:.2f}" for c in candidates) or "  (n/a)"

    lang = get_language_instruction(req.language)
    prompt = f"""{lang}You are a portfolio rotation strategist. Do NOT give buy/sell orders — give a
structured rotation REVIEW: which holdings look like rotation candidates (trim),
which market sectors are hot, and which names are worth rotating INTO.

Current portfolio (total ${total_value:,.0f}, cash ${req.cash:,.0f}):
{pos_txt}

Hottest sectors today:
{sectors_txt}

Candidate stocks (today's movers, not currently held):
{cand_txt}

Respond ONLY in JSON:
{{
  "summary": "2-3 sentence rotation assessment",
  "hot_sectors": [{{"sector": "Technology", "change_pct": 1.2, "why": "short reason it's worth attention"}}],
  "rotation": [
    {{"from": "TICKER to trim or null", "trim_pct": 25, "to": "TICKER/sector to rotate into", "reason": "why", "conviction": "high|medium|low"}}
  ],
  "candidates": [{{"ticker": "TICKER", "reason": "why this is worth entering"}}]
}}"""

    data = await robust_llm_json(prompt, mode="quick", fallback={
        "summary": "", "hot_sectors": [], "rotation": [], "candidates": [],
    })
    set_model_override(None)

    return {
        "total_value": round(total_value, 2),
        "survey": {
            "hot_sectors": hot_sectors,
            "candidates": candidates,
        },
        "plan": data,
    }

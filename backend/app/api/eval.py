"""Evaluation endpoints — record decisions under a config label and score them
against realized forward returns, so pipeline changes can be A/B compared.

  POST /eval/baseline   — run the deterministic tech baseline as-of a date
  POST /eval/agent-run  — run the FULL DAG today and record its decisions (slow)
  GET  /eval/score      — metrics for one label
  GET  /eval/compare    — A/B two labels
  GET  /eval/labels     — list recorded labels
"""
import asyncio
import sqlite3
from datetime import date
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.eval import harness
from app.eval.baselines import run_baseline_eval

router = APIRouter()


class BaselineRequest(BaseModel):
    tickers: List[str]
    as_of_date: Optional[str] = None  # default: today
    label: str = "tech_baseline"
    strategy: str = "tech_baseline"   # tech_baseline | mean_reversion


@router.post("/baseline")
async def eval_baseline(req: BaselineRequest):
    as_of = req.as_of_date or date.today().isoformat()
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: run_baseline_eval(req.tickers, as_of, req.label, req.strategy)
    )


class FactorCohortRequest(BaseModel):
    tickers: Optional[List[str]] = None  # defaults to universe
    as_of_date: Optional[str] = None
    label: str = "factor_cohort"
    top_n: int = 5


@router.post("/factor-cohort")
async def eval_factor_cohort(req: FactorCohortRequest):
    """Record the factor screener's top-N picks as a forward-test cohort."""
    from app.eval.baselines import run_factor_cohort
    from app.api.discovery import WATCHLIST
    as_of = req.as_of_date or date.today().isoformat()
    universe = req.tickers or WATCHLIST
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, lambda: run_factor_cohort(universe, as_of, req.label, req.top_n)
    )


class AgentRunRequest(BaseModel):
    tickers: List[str]
    label: str = "agent"
    as_of_date: Optional[str] = None  # decisions are stamped with this (default today)
    risk_style: Optional[str] = None
    model: Optional[str] = None
    language: Optional[str] = None


@router.post("/agent-run")
async def eval_agent_run(req: AgentRunRequest):
    """Run the full DAG on each ticker and record its final decision under
    `label` so it can be scored later vs realized forward returns. Slow."""
    from app.api.digest import _analyze_one
    from app.agents.llm_router import set_model_override

    as_of = req.as_of_date or date.today().isoformat()
    syms = [t.upper() for t in (req.tickers or []) if t][:6]
    if not syms:
        return {"label": req.label, "recorded": 0, "note": "no tickers"}

    set_model_override(req.model)
    try:
        analyzed = await asyncio.gather(
            *[_analyze_one(t, as_of, req.language) for t in syms]
        )
    finally:
        set_model_override(None)

    recorded = []
    for ticker, res in zip(syms, analyzed):
        if not isinstance(res, dict) or res.get("_error"):
            continue
        fd = res.get("final_decision") or {}
        action = str(fd.get("action", "")).upper()
        if not action:
            continue
        harness.record_decision(
            req.label, ticker, as_of, action, fd.get("confidence"),
            fd.get("entry_price"),
        )
        recorded.append({"ticker": ticker, "action": action,
                         "confidence": fd.get("confidence")})
    return {"label": req.label, "as_of_date": as_of, "recorded": len(recorded),
            "decisions": recorded}


@router.get("/score")
async def eval_score(label: str):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: harness.score(label))


@router.get("/compare")
async def eval_compare(a: str, b: str):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: harness.compare(a, b))


@router.get("/aggregate")
async def eval_aggregate(labels: str):
    """Rolling-window robustness across comma-separated labels (e.g.
    ?labels=bl_2026-03-08,bl_2026-04-08,bl_2026-05-08)."""
    labs = [x.strip() for x in labels.split(",") if x.strip()]
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: harness.aggregate(labs))


@router.get("/labels")
async def eval_labels():
    harness._init_db()
    with sqlite3.connect(harness._DB) as c:
        rows = c.execute(
            "SELECT label, COUNT(*) FROM eval_decisions GROUP BY label"
        ).fetchall()
    return {"labels": [{"label": l, "count": n} for l, n in rows]}

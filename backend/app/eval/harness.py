"""Decision evaluation harness.

Goal: objectively compare configurations/versions of the analysis pipeline by
recording each decision stamped with an "as-of" date, then scoring it against
the REAL forward price move that happened after that date. This lets us answer
"did integrating paper X actually improve decisions?" instead of guessing.

Workflow:
  1. record_decision(label, ticker, as_of_date, action, confidence, ref_price)
     — store a decision under a config `label` (e.g. "baseline", "consensus_v2").
  2. score(label) — for every recorded decision compute the realized forward
     return from its as-of price to the latest close, and aggregate metrics
     (hit-rate, avg forward return on BUYs, confidence calibration, an
     equal-risk strategy return). Compare two labels with compare(a, b).

Forward returns use yfinance OHLCV (price history IS available historically),
so a decision made as-of a PAST date can be scored immediately; a decision made
today accumulates a real track record over the following days.
"""
from __future__ import annotations

import os
import json
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

_DB = os.path.expanduser("~/.stockapp/eval.db")


def _init_db():
    Path(_DB).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB) as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS eval_decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                ticker TEXT NOT NULL,
                as_of_date TEXT NOT NULL,
                action TEXT NOT NULL,
                confidence REAL,
                ref_price REAL,
                created_at TEXT NOT NULL,
                UNIQUE(label, ticker, as_of_date)
            )
        """)
        c.commit()


def _closes(ticker: str, period: str = "1y") -> pd.Series | None:
    try:
        hist = yf.Ticker(ticker).history(period=period)
        if hist is None or hist.empty:
            return None
        s = hist["Close"].copy()
        # normalize index to date-only strings for easy as-of lookup
        s.index = [str(d.date()) for d in s.index]
        return s
    except Exception:
        return None


def price_asof(ticker: str, date_str: str, closes: pd.Series | None = None) -> float | None:
    """Close on or just before `date_str` (the price the decision was made at)."""
    s = closes if closes is not None else _closes(ticker)
    if s is None or len(s) == 0:
        return None
    prior = [v for d, v in s.items() if d <= date_str]
    if prior:
        return round(float(prior[-1]), 2)
    return None


def forward_return(ticker: str, as_of_date: str, closes: pd.Series | None = None) -> float | None:
    """Realized return from the as-of price to the latest available close."""
    s = closes if closes is not None else _closes(ticker)
    if s is None or len(s) == 0:
        return None
    base = price_asof(ticker, as_of_date, s)
    if not base:
        return None
    latest = float(s.iloc[-1])
    return (latest - base) / base


def record_decision(label: str, ticker: str, as_of_date: str, action: str,
                    confidence: float | None, ref_price: float | None = None) -> None:
    """Persist one decision under a config label (upsert on label+ticker+date)."""
    _init_db()
    if ref_price is None:
        ref_price = price_asof(ticker.upper(), as_of_date)
    with sqlite3.connect(_DB) as c:
        c.execute(
            "INSERT OR REPLACE INTO eval_decisions "
            "(label, ticker, as_of_date, action, confidence, ref_price, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (label, ticker.upper(), as_of_date, (action or "").upper(),
             confidence, ref_price, datetime.utcnow().isoformat()),
        )
        c.commit()


def _regime(from_date: str, benchmark: str = "SPY") -> dict:
    """Classify the market regime over [from_date, today] via a benchmark, so
    results are read in context (addresses regime-shift blindness, arXiv
    2603.27539 §4.5). A +8% bull window makes 'always buy' look good — this
    surfaces that instead of hiding it."""
    fr = forward_return(benchmark, from_date)
    if fr is None:
        return {"benchmark": benchmark, "benchmark_return": None, "regime": "unknown"}
    regime = "bull" if fr > 0.05 else "bear" if fr < -0.05 else "sideways"
    return {"benchmark": benchmark, "benchmark_return": round(fr, 4), "regime": regime}


def score(label: str, cost_bps: float = 10.0) -> dict:
    """Aggregate metrics for all decisions under `label`, scored vs realized
    forward returns to the latest close.

    Returns are reported NET of transaction costs (round-trip = 2*cost_bps;
    default 10bps each way), because gross returns can reverse sign once costs
    are included (arXiv 2603.27539 §4.4 — FinMem's +23% -> -22%). Also tags the
    market regime over the evaluation window vs a benchmark (§4.5)."""
    _init_db()
    with sqlite3.connect(_DB) as c:
        rows = c.execute(
            "SELECT ticker, as_of_date, action, confidence, ref_price "
            "FROM eval_decisions WHERE label=?", (label,)
        ).fetchall()
    if not rows:
        return {"label": label, "n": 0, "note": "no decisions recorded"}

    cache: dict[str, pd.Series | None] = {}
    directional = 0
    wins = 0
    conf_sum = 0.0
    conf_n = 0
    gross_returns: list[float] = []
    net_returns: list[float] = []
    fwd_buys: list[float] = []
    bh_by_ticker: dict[str, float] = {}  # buy-and-hold: one fwd return per ticker
    scored_rows = []
    earliest = min((as_of for _, as_of, *_ in rows), default=None)
    round_trip = 2 * (cost_bps / 10000.0)  # both legs
    for ticker, as_of, action, conf, ref in rows:
        s = cache.setdefault(ticker, _closes(ticker))
        fr = forward_return(ticker, as_of, s)
        if fr is None:
            continue
        bh_by_ticker.setdefault(ticker, fr)  # earliest decision's hold return
        item = {"ticker": ticker, "as_of": as_of, "action": action,
                "confidence": conf, "fwd_return": round(fr, 4)}
        if action in ("BUY", "SELL"):
            directional += 1
            favour = fr if action == "BUY" else -fr
            net = favour - round_trip  # net of round-trip transaction cost
            if favour > 0:
                wins += 1
            gross_returns.append(favour)
            net_returns.append(net)
            if action == "BUY":
                fwd_buys.append(fr)
            if isinstance(conf, (int, float)):
                conf_sum += conf
                conf_n += 1
            item["correct"] = favour > 0
            item["net_return"] = round(net, 4)
        scored_rows.append(item)

    hit_rate = (wins / directional) if directional else None
    avg_conf = (conf_sum / conf_n) if conf_n else None
    strat_net = (sum(net_returns) / len(net_returns)) if net_returns else None
    # Dispersion across positions — a single-window mean can be a fluke driven by
    # one name; std + return/risk make robustness visible (Reliable-Eval §4.6 #3).
    strat_std = None
    return_over_risk = None
    if len(net_returns) >= 2:
        import statistics as _st
        strat_std = _st.pstdev(net_returns)
        if strat_std > 0:
            return_over_risk = strat_net / strat_std
    # Buy-and-hold baseline of the analyzed names (equal weight) — the bar from
    # StockBench (arXiv 2510.02209): most LLM agents fail to beat it.
    buy_hold = (sum(bh_by_ticker.values()) / len(bh_by_ticker)) if bh_by_ticker else None
    excess = (strat_net - buy_hold) if (strat_net is not None and buy_hold is not None) else None
    return {
        "label": label,
        "n": len(rows),
        "directional": directional,
        "hit_rate": round(hit_rate, 3) if hit_rate is not None else None,
        "avg_confidence": round(avg_conf, 3) if avg_conf is not None else None,
        "calibration_gap": round(abs(avg_conf - hit_rate), 3)
                            if (avg_conf is not None and hit_rate is not None) else None,
        "avg_fwd_return_buys": round(sum(fwd_buys) / len(fwd_buys), 4) if fwd_buys else None,
        "strategy_return": round(strat_net, 4) if strat_net is not None else None,
        "strategy_return_std": round(strat_std, 4) if strat_std is not None else None,
        "return_over_risk": round(return_over_risk, 3) if return_over_risk is not None else None,
        "strategy_return_gross": round(sum(gross_returns) / len(gross_returns), 4) if gross_returns else None,
        "buy_hold_return": round(buy_hold, 4) if buy_hold is not None else None,
        "excess_vs_buyhold": round(excess, 4) if excess is not None else None,
        "beats_buy_hold": (excess > 0) if excess is not None else None,
        "cost_bps_per_leg": cost_bps,
        "window": _regime(earliest) if earliest else None,
        "decisions": scored_rows,
    }


def compare(label_a: str, label_b: str) -> dict:
    """A/B two configs on the same metrics. `better` keys say which label wins."""
    a, b = score(label_a), score(label_b)

    def _better(key, higher=True):
        va, vb = a.get(key), b.get(key)
        if va is None or vb is None:
            return None
        if va == vb:
            return "tie"
        return (label_a if (va > vb) == higher else label_b)

    return {
        "a": a, "b": b,
        "better": {
            "hit_rate": _better("hit_rate", higher=True),
            "strategy_return": _better("strategy_return", higher=True),
            "excess_vs_buyhold": _better("excess_vs_buyhold", higher=True),
            "avg_fwd_return_buys": _better("avg_fwd_return_buys", higher=True),
            "calibration_gap": _better("calibration_gap", higher=False),  # lower is better
        },
    }

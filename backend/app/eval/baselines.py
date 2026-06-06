"""Deterministic, reproducible decision baselines for the eval harness.

These run AS-OF any historical date using only price history available up to
that date (no look-ahead), so they can be scored immediately against realized
forward returns. They serve two purposes:
  1. validate the harness end-to-end with real data right now, and
  2. act as a baseline that the LLM agent must beat.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf


def _hist_asof(ticker: str, as_of_date: str) -> pd.DataFrame | None:
    try:
        hist = yf.Ticker(ticker).history(period="1y")
        if hist is None or hist.empty:
            return None
        hist = hist.copy()
        hist.index = [str(d.date()) for d in hist.index]
        # strict as-of cut: drop anything after the decision date (no look-ahead)
        hist = hist[[d <= as_of_date for d in hist.index]]
        return hist if len(hist) >= 30 else None
    except Exception:
        return None


def _rsi(closes: pd.Series, period: int = 14) -> float:
    delta = closes.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    val = (100 - 100 / (1 + rs)).iloc[-1]
    return float(val) if pd.notna(val) else 50.0


def tech_baseline(ticker: str, as_of_date: str) -> dict | None:
    """Trend + momentum baseline as-of a date: BUY in uptrend & not overbought,
    SELL in downtrend & not oversold, else HOLD. Confidence scales with how far
    price sits from the 50-day MA."""
    hist = _hist_asof(ticker, as_of_date)
    if hist is None:
        return None
    close = hist["Close"]
    price = float(close.iloc[-1])
    ma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else float(close.mean())
    rsi = _rsi(close)
    dist = abs(price - ma50) / ma50 if ma50 else 0.0
    conf = round(min(0.9, 0.5 + dist * 3), 2)  # 0.5..0.9
    if price > ma50 and rsi < 70:
        action = "BUY"
    elif price < ma50 and rsi > 30:
        action = "SELL"
    else:
        action = "HOLD"
        conf = 0.4
    return {"ticker": ticker.upper(), "action": action, "confidence": conf,
            "ref_price": round(price, 2), "rsi": round(rsi, 1)}


def mean_reversion_baseline(ticker: str, as_of_date: str) -> dict | None:
    """Mean-reversion baseline as-of a date: BUY oversold (RSI<30), SELL
    overbought (RSI>70), else HOLD. Philosophically opposite to tech_baseline
    (trend-following) — a useful second benchmark for the agent."""
    hist = _hist_asof(ticker, as_of_date)
    if hist is None:
        return None
    close = hist["Close"]
    price = float(close.iloc[-1])
    rsi = _rsi(close)
    if rsi < 30:
        action, conf = "BUY", round(min(0.9, 0.5 + (30 - rsi) / 100), 2)
    elif rsi > 70:
        action, conf = "SELL", round(min(0.9, 0.5 + (rsi - 70) / 100), 2)
    else:
        action, conf = "HOLD", 0.4
    return {"ticker": ticker.upper(), "action": action, "confidence": conf,
            "ref_price": round(price, 2), "rsi": round(rsi, 1)}


_STRATEGIES = {"tech_baseline": tech_baseline, "mean_reversion": mean_reversion_baseline}


def run_factor_cohort(tickers: list, as_of_date: str, label: str = "factor_cohort",
                      top_n: int = 5) -> dict:
    """Record the multi-factor screener's top-N picks as a BUY cohort for
    forward-testing — validates whether the composite factor actually works.
    Cross-sectional (ranks the universe), so it's recorded as one cohort.
    NOTE: fundamental factors use current data, so only forward-test (today→
    future), not historical as-of, is leakage-free."""
    from app.data.factors import screen as factor_screen
    from app.eval.harness import record_decision
    ranked = factor_screen([t.upper() for t in tickers if t][:60])
    picks = ranked[:top_n]
    for p in picks:
        # composite (0-1) as confidence; price as ref
        record_decision(label, p["ticker"], as_of_date, "BUY",
                        round(float(p["composite"]), 2), p.get("price"))
    return {"label": label, "as_of_date": as_of_date, "recorded": len(picks),
            "picks": [{"ticker": p["ticker"], "composite": p["composite"]} for p in picks]}


def run_baseline_eval(tickers: list, as_of_date: str, label: str = "tech_baseline",
                      strategy: str = "tech_baseline") -> dict:
    """Generate + record baseline decisions as-of a date under `label`.
    `strategy` selects which deterministic rule to use."""
    from app.eval.harness import record_decision
    fn = _STRATEGIES.get(strategy, tech_baseline)
    recorded = []
    for t in tickers:
        d = fn(t, as_of_date)
        if not d:
            continue
        record_decision(label, d["ticker"], as_of_date, d["action"],
                        d["confidence"], d["ref_price"])
        recorded.append(d)
    return {"label": label, "as_of_date": as_of_date, "strategy": strategy,
            "recorded": len(recorded), "decisions": recorded}

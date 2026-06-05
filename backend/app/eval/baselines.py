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


def run_baseline_eval(tickers: list, as_of_date: str, label: str = "tech_baseline") -> dict:
    """Generate + record baseline decisions as-of a date under `label`."""
    from app.eval.harness import record_decision
    recorded = []
    for t in tickers:
        d = tech_baseline(t, as_of_date)
        if not d:
            continue
        record_decision(label, d["ticker"], as_of_date, d["action"],
                        d["confidence"], d["ref_price"])
        recorded.append(d)
    return {"label": label, "as_of_date": as_of_date, "recorded": len(recorded), "decisions": recorded}

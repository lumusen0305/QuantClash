"""Pairs-trading / statistical-arbitrage screener.

A distinct strategy absent from the rest of QuantClash: find highly-correlated
pairs whose price spread has temporarily diverged (high |z-score|) — a
mean-reversion entry (long the laggard, short the leader, betting on convergence).
Pure data layer; no LLM.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yfinance as yf


def _returns(tickers: list, period: str = "6mo") -> pd.DataFrame:
    series = {}
    for t in tickers:
        try:
            h = yf.Ticker(t).history(period=period)
            if h is not None and not h.empty:
                series[t] = h["Close"].pct_change().dropna().reset_index(drop=True)
        except Exception:
            pass
    return pd.DataFrame(series).dropna()


def _closes(tickers: list, period: str = "6mo") -> pd.DataFrame:
    series = {}
    for t in tickers:
        try:
            h = yf.Ticker(t).history(period=period)
            if h is not None and not h.empty:
                series[t] = h["Close"].reset_index(drop=True)
        except Exception:
            pass
    return pd.DataFrame(series).dropna()


def find_pairs(tickers: list, min_corr: float = 0.7, z_threshold: float = 2.0,
               top: int = 10) -> dict:
    """Find correlated pairs with a stretched current spread (|z| high).

    Returns ranked candidates: each with correlation, current spread z-score, and
    a suggested mean-reversion trade (long underperformer / short outperformer).
    """
    syms = [t.upper() for t in tickers if t][:40]
    rets = _returns(syms)
    closes = _closes(syms)
    if rets.shape[1] < 2 or closes.shape[1] < 2:
        return {"pairs": [], "note": "not enough data for pairs"}

    corr = rets.corr()
    cols = list(closes.columns)
    out = []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            a, b = cols[i], cols[j]
            if a not in corr.index or b not in corr.columns:
                continue
            c = float(corr.loc[a, b])
            if c < min_corr:
                continue
            # log price spread, z-scored over the window
            spread = np.log(closes[a]) - np.log(closes[b])
            mu, sd = float(spread.mean()), float(spread.std())
            if sd <= 0:
                continue
            z = (float(spread.iloc[-1]) - mu) / sd
            if abs(z) < z_threshold:
                continue
            # z>0 → A rich vs B → short A / long B (expect convergence)
            short, long_ = (a, b) if z > 0 else (b, a)
            out.append({
                "pair": f"{a}/{b}", "correlation": round(c, 3),
                "spread_z": round(z, 2),
                "trade": f"long {long_} / short {short}",
                "long": long_, "short": short,
            })
    out.sort(key=lambda x: abs(x["spread_z"]), reverse=True)
    return {"pairs": out[:top], "scanned": len(cols),
            "note": f"{len(out)} stretched correlated pairs (|z|>={z_threshold})."}

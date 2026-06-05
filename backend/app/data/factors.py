"""Multi-factor stock screener — Value / Momentum / Quality / Low-Volatility.

Computes raw factor values per ticker from yfinance, then rank-normalizes each
factor across the candidate set to [0,1] (so factors are comparable), and
combines into a weighted composite score for ranking. Pure data layer — no LLM.
"""
from __future__ import annotations

import numpy as np
import yfinance as yf


# Composite weights (sum ~1.0). Tunable.
FACTOR_WEIGHTS = {
    "value": 0.30,
    "momentum": 0.30,
    "quality": 0.25,
    "low_vol": 0.15,
}


def _raw_factors(ticker: str) -> dict | None:
    """Raw (un-normalized) factor inputs for one ticker. Higher-is-better is
    handled later in normalization."""
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
        hist = tk.history(period="6mo")
        if hist is None or hist.empty:
            return None
        close = hist["Close"]
        price = float(close.iloc[-1])

        # Momentum: 6-month total return
        mom = (price - float(close.iloc[0])) / float(close.iloc[0]) if len(close) > 1 else 0.0
        # Volatility: stdev of daily returns (annualized-ish); lower is better
        rets = close.pct_change().dropna()
        vol = float(rets.std()) if len(rets) else 0.0

        pe = info.get("trailingPE")
        pb = info.get("priceToBook")
        roe = info.get("returnOnEquity")
        margin = info.get("profitMargins")
        d2e = info.get("debtToEquity")

        return {
            "ticker": ticker,
            "price": round(price, 2),
            # value: invert PE/PB (cheaper = higher score) — store raw, invert in norm
            "pe": float(pe) if isinstance(pe, (int, float)) and pe > 0 else None,
            "pb": float(pb) if isinstance(pb, (int, float)) and pb > 0 else None,
            "momentum": mom,
            "roe": float(roe) if isinstance(roe, (int, float)) else None,
            "margin": float(margin) if isinstance(margin, (int, float)) else None,
            "debt_to_equity": float(d2e) if isinstance(d2e, (int, float)) else None,
            "volatility": vol,
        }
    except Exception:
        return None


def _rank_norm(values: list[float | None], higher_better: bool = True) -> list[float]:
    """Rank-normalize a column to [0,1]; None → 0.5 (neutral). Robust to outliers."""
    idx = [i for i, v in enumerate(values) if isinstance(v, (int, float))]
    out = [0.5] * len(values)
    if len(idx) <= 1:
        return out
    present = sorted(idx, key=lambda i: values[i])
    n = len(present) - 1
    for rank, i in enumerate(present):
        score = rank / n  # 0..1 ascending
        out[i] = score if higher_better else (1.0 - score)
    return out


def screen(tickers: list[str], weights: dict | None = None) -> list[dict]:
    """Score and rank tickers by a multi-factor composite. Returns a list of
    dicts sorted best-first, each with per-factor sub-scores and composite."""
    w = weights or FACTOR_WEIGHTS
    raw = [r for r in (_raw_factors(t.upper()) for t in tickers if t) if r]
    if not raw:
        return []

    # Value = blend of cheap PE + cheap PB (lower raw → higher score)
    pe_s = _rank_norm([r["pe"] for r in raw], higher_better=False)
    pb_s = _rank_norm([r["pb"] for r in raw], higher_better=False)
    mom_s = _rank_norm([r["momentum"] for r in raw], higher_better=True)
    roe_s = _rank_norm([r["roe"] for r in raw], higher_better=True)
    margin_s = _rank_norm([r["margin"] for r in raw], higher_better=True)
    d2e_s = _rank_norm([r["debt_to_equity"] for r in raw], higher_better=False)
    vol_s = _rank_norm([r["volatility"] for r in raw], higher_better=False)

    results = []
    for i, r in enumerate(raw):
        value = round((pe_s[i] + pb_s[i]) / 2, 3)
        momentum = round(mom_s[i], 3)
        quality = round((roe_s[i] + margin_s[i] + d2e_s[i]) / 3, 3)
        low_vol = round(vol_s[i], 3)
        composite = (
            w["value"] * value
            + w["momentum"] * momentum
            + w["quality"] * quality
            + w["low_vol"] * low_vol
        )
        results.append({
            "ticker": r["ticker"],
            "price": r["price"],
            "composite": round(composite, 3),
            "factors": {
                "value": value, "momentum": momentum,
                "quality": quality, "low_vol": low_vol,
            },
            "raw": {
                "pe": r["pe"], "pb": r["pb"],
                "momentum_6m": round(r["momentum"], 3),
                "roe": r["roe"], "margin": r["margin"],
                "debt_to_equity": r["debt_to_equity"],
                "volatility": round(r["volatility"], 4),
            },
        })
    results.sort(key=lambda x: x["composite"], reverse=True)
    for rank, r in enumerate(results, 1):
        r["rank"] = rank
    return results

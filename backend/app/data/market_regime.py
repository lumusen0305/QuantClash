"""Top-down market regime gate (HedgeAgents/FinCon regime adaptation).

Most of QuantClash's risk logic is per-ticker (ATR, CVaR). This adds a MARKET-
WIDE posture from SPY trend + realized volatility, so the portfolio can hold more
cash when the broad market is risk-off (a regime the bottom-up signals miss).
"""
from __future__ import annotations

import numpy as np
import yfinance as yf


def market_regime(benchmark: str = "SPY") -> dict:
    """Classify the broad market as risk_on / neutral / risk_off and return a
    `scalar` to scale total portfolio exposure (risk_off → deploy less)."""
    try:
        hist = yf.Ticker(benchmark).history(period="1y")
        if hist is None or hist.empty or len(hist) < 60:
            return {"regime": "unknown", "scalar": 1.0, "benchmark": benchmark}
        close = hist["Close"]
        price = float(close.iloc[-1])
        ma50 = float(close.rolling(50).mean().iloc[-1])
        ma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else ma50
        rets = close.pct_change().dropna()
        vol20 = float(rets.tail(20).std()) if len(rets) >= 20 else 0.0

        above_50 = price > ma50
        golden = ma50 >= ma200          # uptrend structure
        calm = vol20 < 0.015            # ~<1.5% daily vol = calm

        if above_50 and golden and calm:
            regime, scalar = "risk_on", 1.0
        elif (not above_50 and not golden) or vol20 > 0.025:
            regime, scalar = "risk_off", 0.4
        else:
            regime, scalar = "neutral", 0.7
        return {
            "regime": regime,
            "scalar": scalar,
            "benchmark": benchmark,
            "price_vs_ma50": round((price / ma50 - 1) * 100, 2),
            "ma50_vs_ma200": round((ma50 / ma200 - 1) * 100, 2),
            "vol20": round(vol20, 4),
        }
    except Exception:
        return {"regime": "unknown", "scalar": 1.0, "benchmark": benchmark}

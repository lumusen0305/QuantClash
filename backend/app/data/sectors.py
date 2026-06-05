"""Sector-rotation screener.

Ranks the 11 SPDR sector ETFs by recent momentum to show which sectors are
leading vs lagging — a top-down rotation view (risk-on sectors leading vs
defensive leadership) absent elsewhere in the system. Pure data layer.
"""
from __future__ import annotations

import yfinance as yf

SECTOR_ETFS = {
    "XLK": "Technology", "XLF": "Financials", "XLE": "Energy",
    "XLV": "Health Care", "XLY": "Consumer Discretionary", "XLP": "Consumer Staples",
    "XLI": "Industrials", "XLB": "Materials", "XLU": "Utilities",
    "XLRE": "Real Estate", "XLC": "Communication Services",
}
_DEFENSIVE = {"XLP", "XLU", "XLV", "XLRE"}


def _ret(closes, days: int) -> float | None:
    if closes is None or len(closes) <= days:
        return None
    return float(closes.iloc[-1] / closes.iloc[-days] - 1)


def sector_rotation() -> dict:
    """Rank sectors by blended 1m/3m momentum; flag risk-on vs defensive tilt."""
    rows = []
    for etf, name in SECTOR_ETFS.items():
        try:
            h = yf.Ticker(etf).history(period="6mo")
            if h is None or h.empty:
                continue
            c = h["Close"]
            m1, m3 = _ret(c, 21), _ret(c, 63)
            if m1 is None and m3 is None:
                continue
            score = (m1 or 0) * 0.5 + (m3 or 0) * 0.5
            rows.append({"etf": etf, "sector": name,
                         "mom_1m": round((m1 or 0) * 100, 2),
                         "mom_3m": round((m3 or 0) * 100, 2),
                         "score": round(score * 100, 2),
                         "defensive": etf in _DEFENSIVE})
        except Exception:
            pass
    if not rows:
        return {"sectors": [], "note": "no sector data"}
    rows.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    # Leadership read: are defensives or cyclicals leading the top half?
    top_half = rows[: max(1, len(rows) // 2)]
    defensive_lead = sum(1 for r in top_half if r["defensive"]) > len(top_half) / 2
    tilt = "DEFENSIVE leadership (risk-off rotation)" if defensive_lead else "CYCLICAL leadership (risk-on rotation)"
    return {"sectors": rows, "leaders": [r["sector"] for r in rows[:3]],
            "laggards": [r["sector"] for r in rows[-3:]], "tilt": tilt}

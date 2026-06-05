"""Portfolio construction from per-stock agent decisions (AlphaAgents, arXiv
2508.11152).

Turns a set of single-stock BUY/SELL/HOLD decisions into an allocated portfolio:
- selects the BUYs,
- weights them by CONVICTION (confidence) — AlphaAgents' stated next step,
- applies the RISK-STYLE profile (conservative holds more cash, caps single-name
  concentration, and drops the highest-volatility names; aggressive concentrates
  in the top convictions),
- normalizes to the invested fraction with a cash buffer.

Pure function — no LLM, no network. Decisions are produced upstream by the DAG.
"""
from __future__ import annotations

from statistics import median

# Per-style: invested = fraction of capital deployed (rest = cash buffer);
# cap = max weight for a single position; drop_high_vol = trim riskiest names.
STYLE_ALLOC = {
    "conservative": {"invested": 0.60, "cap": 0.20, "drop_high_vol": True},
    "balanced":     {"invested": 0.90, "cap": 0.30, "drop_high_vol": False},
    "aggressive":   {"invested": 1.00, "cap": 0.50, "drop_high_vol": False},
}


def _apply_cap(weights: dict, cap: float, budget: float) -> dict:
    """Cap each position at `cap` of the TOTAL portfolio (not of the invested
    budget), then redistribute the excess to uncapped names. Loops a few times
    for convergence; if every name is capped the remainder stays in cash."""
    w = dict(weights)
    limit = cap
    for _ in range(5):
        over = {t: v for t, v in w.items() if v > limit + 1e-9}
        if not over:
            break
        excess = sum(v - limit for v in over.values())
        for t in over:
            w[t] = limit
        room = {t: v for t, v in w.items() if v < limit - 1e-9}
        room_total = sum(room.values()) or 1.0
        for t in room:
            w[t] += excess * (w[t] / room_total)
    return w


def build_portfolio(decisions: list, risk_style: str = "balanced",
                    max_positions: int = 10) -> dict:
    """Construct an allocated portfolio from per-stock decisions.

    `decisions`: list of dicts with at least {ticker, action, confidence};
    optional `volatility` enables conservative high-vol trimming.
    Returns {positions:[{ticker, weight, confidence}], cash, risk_style, note}.
    """
    style = STYLE_ALLOC.get(risk_style, STYLE_ALLOC["balanced"])
    buys = [
        d for d in decisions
        if (d.get("action") or "").upper() == "BUY"
        and isinstance(d.get("confidence"), (int, float)) and d["confidence"] > 0
    ]
    if not buys:
        return {"positions": [], "cash": 1.0, "risk_style": risk_style,
                "note": "No BUY signals — staying in cash."}

    # Conservative: drop the highest-volatility half (keep at least 1).
    if style["drop_high_vol"]:
        vols = [d["volatility"] for d in buys if isinstance(d.get("volatility"), (int, float))]
        if len(vols) >= 2:
            med = median(vols)
            filtered = [d for d in buys
                        if not isinstance(d.get("volatility"), (int, float)) or d["volatility"] <= med]
            buys = filtered or buys

    # Rank by conviction, cap count.
    buys = sorted(buys, key=lambda d: d["confidence"], reverse=True)[:max_positions]

    # Conviction-proportional weights scaled to the invested fraction.
    invested = style["invested"]
    raw = {d["ticker"]: float(d["confidence"]) for d in buys}
    total = sum(raw.values()) or 1.0
    weights = {t: invested * v / total for t, v in raw.items()}
    weights = _apply_cap(weights, style["cap"], invested)

    conf_by = {d["ticker"]: round(float(d["confidence"]), 2) for d in buys}
    positions = [
        {"ticker": t, "weight": round(w, 4), "weight_pct": round(w * 100, 1),
         "confidence": conf_by[t]}
        for t, w in sorted(weights.items(), key=lambda kv: kv[1], reverse=True)
    ]
    cash = round(max(0.0, 1.0 - sum(weights.values())), 4)
    return {
        "positions": positions,
        "cash": cash,
        "cash_pct": round(cash * 100, 1),
        "risk_style": risk_style,
        "note": f"{len(positions)} positions, conviction-weighted, {risk_style} profile.",
    }

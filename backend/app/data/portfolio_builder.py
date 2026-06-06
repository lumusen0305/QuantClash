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
                    max_positions: int = 10, weighting: str = "conviction",
                    market_scalar: float = 1.0) -> dict:
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

    # Base weights: conviction (confidence), optionally risk-parity adjusted so
    # higher-volatility names get smaller weight (raw = confidence / volatility).
    # market_scalar scales total exposure down in a risk-off broad market.
    invested = style["invested"] * max(0.0, min(1.0, market_scalar))
    if weighting == "risk_parity":
        raw = {}
        for d in buys:
            vol = d.get("volatility")
            v = abs(float(vol)) if isinstance(vol, (int, float)) and vol else 0.02
            raw[d["ticker"]] = float(d["confidence"]) / max(v, 0.005)
    elif weighting == "kelly":
        # Half-Kelly fraction f = W - (1-W)/R, where W = win prob (confidence)
        # and R = reward/risk ratio (from target/stop if provided, else 2.0).
        # Half-Kelly (×0.5) is standard to reduce Kelly's known over-betting.
        raw = {}
        for d in buys:
            w = float(d["confidence"])
            r = float(d.get("reward_risk") or 2.0)
            r = max(r, 0.25)
            f = w - (1.0 - w) / r
            raw[d["ticker"]] = max(0.0, f) * 0.5
        if sum(raw.values()) <= 0:  # all Kelly fractions <=0 → no edge → cash
            return {"positions": [], "cash": 1.0, "risk_style": risk_style,
                    "weighting": weighting,
                    "note": "Kelly fraction <= 0 for all names (no positive edge) — cash."}
    else:
        raw = {d["ticker"]: float(d["confidence"]) for d in buys}

    # Correlation-aware diversification: dampen names that are highly correlated
    # with the rest of the book (avg pairwise correlation), so the portfolio
    # isn't secretly one big bet on the same factor (HedgeAgents-style hedging).
    corr_by = {d["ticker"]: d.get("avg_corr") for d in buys}
    if any(isinstance(c, (int, float)) for c in corr_by.values()):
        for t in list(raw):
            c = corr_by.get(t)
            if isinstance(c, (int, float)):
                raw[t] *= 1.0 / (1.0 + max(0.0, c))  # corr 0 → ×1, corr 1 → ×0.5
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
    # Risk transparency: effective # of positions (inverse Herfindahl on the
    # invested book → concentration) and a rough invested-vol estimate.
    inv = sum(weights.values())
    eff_positions = None
    if inv > 0:
        shares = [w / inv for w in weights.values()]
        hhi = sum(s * s for s in shares)
        eff_positions = round(1.0 / hhi, 2) if hhi > 0 else None
    vol_by = {d["ticker"]: d.get("volatility") for d in buys}
    est_vol = None
    contribs = [weights[t] * vol_by[t] for t in weights
                if isinstance(vol_by.get(t), (int, float))]
    if contribs:
        est_vol = round(sum(contribs), 4)  # weighted daily vol (corr-agnostic upper bound)
    return {
        "positions": positions,
        "cash": cash,
        "cash_pct": round(cash * 100, 1),
        "risk_style": risk_style,
        "weighting": weighting,
        "effective_positions": eff_positions,
        "est_daily_vol": est_vol,
        "note": f"{len(positions)} positions, {weighting}-weighted, {risk_style} profile."
                + (f" ~{eff_positions} effective (concentration)." if eff_positions else ""),
    }

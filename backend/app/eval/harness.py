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

# Contamination-control cutoff (Reliable-Eval, arXiv 2603.27539 §3.1 standard #1):
# if a backtest window starts BEFORE an LLM's training cutoff, an LLM-based cohort
# scored over it risks data leakage / look-ahead (the model may have memorized the
# outcome). Deterministic baselines are immune (price-only as-of), so this is a
# soft, informational flag — the caller interprets it per cohort kind. Override via
# env so it tracks the model actually in use.
_LLM_TRAINING_CUTOFF = os.environ.get("LLM_TRAINING_CUTOFF", "2025-12-01")


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


_COST_CACHE: dict[str, float] = {}


def _cost_bps_for(ticker: str) -> float:
    """Per-leg transaction cost (bps) by asset class — spreads vary hugely
    (Reliable-Eval arXiv 2603.27539 §6.2.2: large-cap ~1-2bps, small-cap
    10-50, crypto 20-100). Estimated from market cap; cached."""
    t = ticker.upper()
    if t in _COST_CACHE:
        return _COST_CACHE[t]
    bps = 10.0
    try:
        if t.endswith("-USD"):
            bps = 30.0  # crypto
        else:
            mc = (yf.Ticker(t).info or {}).get("marketCap")
            if isinstance(mc, (int, float)) and mc > 0:
                bps = 2.0 if mc > 1e10 else 5.0 if mc > 2e9 else 15.0
    except Exception:
        bps = 10.0
    _COST_CACHE[t] = bps
    return bps


def predates_llm_cutoff(from_date: str, cutoff: str = _LLM_TRAINING_CUTOFF) -> bool:
    """True if a window starting `from_date` predates the LLM training cutoff —
    i.e. scoring an LLM-based cohort over it risks data leakage (Reliable-Eval
    standard #1). Pure date comparison; deterministic baselines can ignore it."""
    try:
        return str(from_date)[:10] < str(cutoff)[:10]
    except Exception:
        return False


def _regime(from_date: str, benchmark: str = "SPY") -> dict:
    """Classify the market regime over [from_date, today] via a benchmark, so
    results are read in context (addresses regime-shift blindness, arXiv
    2603.27539 §4.5). A +8% bull window makes 'always buy' look good — this
    surfaces that instead of hiding it."""
    leak = predates_llm_cutoff(from_date)  # look-ahead risk for LLM cohorts
    fr = forward_return(benchmark, from_date)
    if fr is None:
        return {"benchmark": benchmark, "benchmark_return": None, "regime": "unknown",
                "predates_llm_cutoff": leak}
    regime = "bull" if fr > 0.05 else "bear" if fr < -0.05 else "sideways"
    return {"benchmark": benchmark, "benchmark_return": round(fr, 4), "regime": regime,
            "predates_llm_cutoff": leak}


def score(label: str, cost_bps: float | None = None) -> dict:
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
    holds = 0
    wins = 0
    conf_sum = 0.0
    conf_n = 0
    gross_returns: list[float] = []
    net_returns: list[float] = []
    fwd_buys: list[float] = []
    bh_by_ticker: dict[str, float] = {}  # buy-and-hold: one fwd return per ticker
    scored_rows = []
    earliest = min((as_of for _, as_of, *_ in rows), default=None)
    cost_legs = []  # track per-leg bps actually applied (for reporting)
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
            # per-leg cost: explicit override, else auto by asset class
            leg = cost_bps if isinstance(cost_bps, (int, float)) else _cost_bps_for(ticker)
            cost_legs.append(leg)
            net = favour - 2 * (leg / 10000.0)  # net of round-trip transaction cost
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
        elif action == "HOLD":
            holds += 1
        scored_rows.append(item)

    hit_rate = (wins / directional) if directional else None
    avg_conf = (conf_sum / conf_n) if conf_n else None
    strat_net = (sum(net_returns) / len(net_returns)) if net_returns else None
    # Profit factor = gross wins / gross losses (>1 = profitable); measures
    # win/loss MAGNITUDE, distinct from hit-rate (frequency).
    gross_win = sum(r for r in net_returns if r > 0)
    gross_loss = abs(sum(r for r in net_returns if r < 0))
    profit_factor = round(gross_win / gross_loss, 2) if gross_loss > 0 else None  # None = no losses (JSON-safe)
    # Dispersion across positions — a single-window mean can be a fluke driven by
    # one name; std + return/risk make robustness visible (Reliable-Eval §4.6 #3).
    strat_std = None
    return_over_risk = None
    sortino = None  # downside-only risk-adjusted (StockBench 2510.02209 key metric)
    if len(net_returns) >= 2:
        import statistics as _st
        strat_std = _st.pstdev(net_returns)
        if strat_std > 0:
            return_over_risk = strat_net / strat_std
        downside = [r for r in net_returns if r < 0]
        if len(downside) >= 1:
            dstd = _st.pstdev(downside) if len(downside) >= 2 else abs(downside[0])
            if dstd and dstd > 0:
                sortino = strat_net / dstd
    # Buy-and-hold baseline of the analyzed names (equal weight) — the bar from
    # StockBench (arXiv 2510.02209): most LLM agents fail to beat it.
    buy_hold = (sum(bh_by_ticker.values()) / len(bh_by_ticker)) if bh_by_ticker else None
    excess = (strat_net - buy_hold) if (strat_net is not None and buy_hold is not None) else None
    # Is the mean decision return distinguishable from zero, or just noise?
    t_stat = _t_stat(net_returns)
    return {
        "label": label,
        "n": len(rows),
        "directional": directional,
        "holds": holds,
        "hold_rate": round(holds / len(rows), 3) if rows else None,
        "note": ("all/mostly HOLD — no directional bets to score; in a flat/uncertain "
                 "regime this avoids losses but forgoes gains (compare vs buy_hold)."
                 if directional == 0 else None),
        "hit_rate": round(hit_rate, 3) if hit_rate is not None else None,
        "avg_confidence": round(avg_conf, 3) if avg_conf is not None else None,
        "calibration_gap": round(abs(avg_conf - hit_rate), 3)
                            if (avg_conf is not None and hit_rate is not None) else None,
        "avg_fwd_return_buys": round(sum(fwd_buys) / len(fwd_buys), 4) if fwd_buys else None,
        "strategy_return": round(strat_net, 4) if strat_net is not None else None,
        "strategy_return_std": round(strat_std, 4) if strat_std is not None else None,
        "return_over_risk": round(return_over_risk, 3) if return_over_risk is not None else None,
        "sortino": round(sortino, 3) if sortino is not None else None,
        "return_t_stat": round(t_stat, 2) if t_stat is not None else None,
        # approx: |t|>2 with >=10 directional decisions ~ mean return != 0 at ~5%
        "return_significant": (t_stat is not None and abs(t_stat) > 2.0 and directional >= 10),
        "profit_factor": profit_factor,
        "strategy_return_gross": round(sum(gross_returns) / len(gross_returns), 4) if gross_returns else None,
        "buy_hold_return": round(buy_hold, 4) if buy_hold is not None else None,
        "excess_vs_buyhold": round(excess, 4) if excess is not None else None,
        "beats_buy_hold": (excess > 0) if excess is not None else None,
        "cost_bps_per_leg": (round(sum(cost_legs) / len(cost_legs), 1) if cost_legs else cost_bps),
        "cost_model": ("flat" if isinstance(cost_bps, (int, float)) else "auto-by-asset-class"),
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


def _t_stat(returns: list) -> float | None:
    """One-sample t-statistic of per-decision returns vs a zero-return null:
    mean / (sample_std / sqrt(n)). |t| >~ 2 (with enough decisions) suggests the
    mean return is distinguishable from zero rather than noise — guards against
    reading a lucky positive mean as skill (Reliable-Eval small-sample concern).
    Uses sample std (ddof=1). Returns None if n < 2 or std == 0."""
    import statistics as _st
    n = len(returns)
    if n < 2:
        return None
    sd = _st.stdev(returns)  # sample std (ddof=1)
    if sd <= 0:
        return None
    return (sum(returns) / n) / (sd / (n ** 0.5))


def _two_sided_p_from_t(t: float | None) -> float | None:
    """Approximate two-sided p-value for a t-statistic via the normal tail
    (t -> z for large df): p = erfc(|t| / sqrt(2)). Good enough to flag
    significance; conservative-ish for small samples. Returns None if t is None."""
    import math
    if t is None:
        return None
    return math.erfc(abs(t) / math.sqrt(2.0))


def _binomial_sf(k: int, n: int, p: float = 0.5) -> float | None:
    """Exact one-sided binomial survival P(X >= k) for X~Binom(n, p). Used to test
    whether a strategy beats buy-and-hold more often than a coin flip would. Pure
    (math.comb), no scipy. Returns None if n == 0."""
    import math
    if n <= 0:
        return None
    k = max(0, min(k, n))
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k, n + 1))


def aggregate(labels: list) -> dict:
    """Rolling-window robustness (Reliable-Eval arXiv 2603.27539 §4.6 #3):
    aggregate the same strategy scored across multiple non-overlapping window
    labels into mean ± std of the key metrics, plus how many windows beat
    buy-and-hold. A strategy that only wins in one window is not robust."""
    import statistics as _st
    scored = [score(l) for l in labels]
    usable = [s for s in scored if s.get("directional")]
    if not usable:
        return {"labels": labels, "windows": len(scored), "note": "no directional decisions in any window"}

    def _ms(key):
        vals = [s[key] for s in usable if isinstance(s.get(key), (int, float))]
        if not vals:
            return {"mean": None, "std": None, "n": 0}
        return {"mean": round(sum(vals) / len(vals), 4),
                "std": round(_st.pstdev(vals), 4) if len(vals) > 1 else 0.0,
                "n": len(vals)}

    beats = sum(1 for s in usable if s.get("beats_buy_hold") is True)
    n = len(usable)
    p = _binomial_sf(beats, n)  # P(>= beats wins | coin-flip null)
    return {
        "labels": labels,
        "windows": n,
        "hit_rate": _ms("hit_rate"),
        "strategy_return": _ms("strategy_return"),
        "excess_vs_buyhold": _ms("excess_vs_buyhold"),
        "calibration_gap": _ms("calibration_gap"),
        "beats_buy_hold_windows": f"{beats}/{n}",
        "robust": beats == n and n >= 2,  # beat BH in EVERY window
        # Exact one-sided binomial test vs a 50/50 coin flip: is beating BH this
        # often distinguishable from luck? (Reliable-Eval: point estimates at small
        # n are noise.) Needs >=5 windows to possibly reach p<0.05.
        "binomial_p_vs_coinflip": round(p, 4) if p is not None else None,
        "significant_vs_coinflip": (p is not None and p < 0.05 and n >= 5),
    }


def leaderboard(metric: str = "excess_vs_buyhold") -> dict:
    """Score every recorded label and rank them by `metric` (default: excess
    return vs buy-and-hold) — a one-shot view of which strategy is winning.
    Labels with no directional decisions yet are listed separately."""
    import sqlite3
    _init_db()
    with sqlite3.connect(_DB) as c:
        labels = [r[0] for r in c.execute("SELECT DISTINCT label FROM eval_decisions").fetchall()]
    scored, pending = [], []
    for lab in labels:
        s = score(lab)
        if s.get(metric) is None:
            pending.append({"label": lab, "n": s.get("n"), "holds": s.get("holds"),
                            "note": s.get("note")})
            continue
        p = _two_sided_p_from_t(s.get("return_t_stat"))
        scored.append({
            "label": lab, "directional": s.get("directional"),
            "hit_rate": s.get("hit_rate"), "strategy_return": s.get("strategy_return"),
            "excess_vs_buyhold": s.get("excess_vs_buyhold"),
            "beats_buy_hold": s.get("beats_buy_hold"), "sortino": s.get("sortino"),
            "return_t_stat": s.get("return_t_stat"),
            "return_p_approx": round(p, 4) if p is not None else None,
            "regime": (s.get("window") or {}).get("regime"),
        })
    scored.sort(key=lambda x: (x.get(metric) is not None, x.get(metric)), reverse=True)
    for i, r in enumerate(scored, 1):
        r["rank"] = i
    # Multiple-testing / selection-bias guard (López de Prado, backtest overfitting):
    # ranking N strategies and crowning the best inflates its apparent significance.
    # The winner's p-value must be Bonferroni-adjusted by the number of trials.
    trials = len(scored)
    selection_bias = None
    if scored:
        top = scored[0]
        tp = top.get("return_p_approx")
        selection_bias = {
            "trials": trials,
            "winner": top["label"],
            "winner_p_approx": tp,
            "winner_p_bonferroni": round(min(1.0, tp * trials), 4) if tp is not None else None,
            "note": (f"winner chosen from {trials} trials; its return p-value is "
                     f"Bonferroni-adjusted by x{trials}. A small raw p can still be "
                     f"insignificant after adjustment (selection bias)."),
        }
    return {"metric": metric, "ranked": scored, "pending": pending,
            "selection_bias": selection_bias}

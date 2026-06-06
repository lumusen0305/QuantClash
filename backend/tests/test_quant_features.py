"""Dependency-free regression tests for the research-driven pure logic.

No pytest needed — run:  .venv/bin/python -m tests.test_quant_features
Covers the deterministic functions added this cycle so behavior can't silently
regress. Network-dependent helpers (price fetches) are intentionally excluded.
"""
import sys

_passed = 0
_failed = 0


def check(name, cond):
    global _passed, _failed
    if cond:
        _passed += 1
    else:
        _failed += 1
        print(f"  FAIL: {name}")


def test_selective_consensus():
    from app.agents.managers.portfolio_manager import _selective_consensus as C
    alln = C([("a", "neutral", .5), ("b", "neutral", .4)])
    check("all-neutral lean", "NEUTRAL" in alln["lean"])
    # symmetric confidences → exact 50/50 split → agreement 0.5 → divergent
    conflict = C([("a", "bullish", .7), ("b", "bullish", .6), ("c", "bearish", .7), ("d", "bearish", .6)])
    check("2v2 divergent", conflict["divergent"] is True)
    strong = C([("a", "bullish", .8), ("b", "bullish", .7), ("c", "bullish", .6)])
    check("strong-bull agreement>0.9", strong["agreement"] >= 0.9 and not strong["divergent"])


def test_portfolio_builder():
    from app.data.portfolio_builder import build_portfolio
    decs = [{"ticker": "A", "action": "BUY", "confidence": 0.8, "volatility": 0.02, "reward_risk": 3, "avg_corr": 0.8},
            {"ticker": "B", "action": "BUY", "confidence": 0.6, "volatility": 0.05, "reward_risk": 2, "avg_corr": 0.1},
            {"ticker": "C", "action": "SELL", "confidence": 0.9}]
    for w in ("conviction", "risk_parity", "kelly"):
        for ms in (1.0, 0.4):
            p = build_portfolio(decs, "balanced", weighting=w, market_scalar=ms)
            sw = sum(x["weight"] for x in p["positions"])
            check(f"{w} ms={ms} conserves", abs(sw + p["cash"] - 1) < 0.01)
            check(f"{w} ms={ms} cap<=0.30", all(x["weight"] <= 0.3001 for x in p["positions"]))
    check("no-buy -> cash", build_portfolio([{"ticker": "X", "action": "HOLD", "confidence": .5}])["cash"] == 1.0)
    check("kelly no-edge -> cash", build_portfolio([{"ticker": "X", "action": "BUY", "confidence": .4, "reward_risk": 1}], weighting="kelly")["cash"] == 1.0)


def test_news_sentiment():
    from app.agents.pricing_tools import _news_sentiment
    neg = _news_sentiment([{"title": "SEC investigation, fraud"}, {"title": "analyst downgrade, miss"}])
    check("neg score<0", neg["score"] < 0)
    check("neg flags", "investigation" in neg["risk_flags"] or "downgrade" in neg["risk_flags"])
    check("breadth low for 2", _news_sentiment([{"title": "x"}, {"title": "y"}])["breadth"] == "low")
    check("breadth high for 10", _news_sentiment([{"title": "x"}] * 10)["breadth"] == "high")


def test_score_decision_alpha():
    from app.agents.memory import AnalysisMemory as M
    o = M._score_decision({"action": "BUY", "entry_price": 100}, 103, 0.10)  # +3% vs SPY +10%
    check("BUY correct (abs)", o["correct"] is True)
    check("BUY underperforms (alpha<0)", o["alpha"] < 0 and o["beat_market"] is False)
    o2 = M._score_decision({"action": "SELL", "entry_price": 100}, 92, 0.05)  # short, ticker -8%, SPY +5%
    check("SELL beats market", o2["beat_market"] is True)
    check("HOLD unscored", M._score_decision({"action": "HOLD"}, 100, 0.0) is None)


def test_reflect_critique():
    from app.agents.memory import AnalysisMemory as M
    check("overconfident flagged", "OVERCONFIDENT" in M._reflect_critique(4, 1, 0.25, 0.80, 0))
    check("stopped-out flagged", "stopped out" in M._reflect_critique(4, 1, 0.25, 0.30, 3))
    check("single -> no critique", M._reflect_critique(1, 1, 1.0, 0.6, 0) == "")


def test_style_levels():
    from app.agents.pricing_tools import style_levels
    lv = {"current_price": 100.0, "atr14": 5.0}
    buy = style_levels(lv, "BUY", "balanced")
    check("BUY target above", buy["target"] > 100 and buy["stop"] < 100)
    sell = style_levels(lv, "SELL", "balanced")
    check("SELL target below", sell["target"] < 100 and sell["stop"] > 100)
    check("HOLD -> None", style_levels(lv, "HOLD", "balanced") is None)


def test_no_oversuppression():
    # Guard against a "negative optimization": the consensus layer must NOT block
    # a confident BUY when analysts strongly align (else the agent always-HOLDs).
    from app.agents.managers.portfolio_manager import _selective_consensus as C
    strong = C([("Technical", "bullish", .85), ("Fundamentals", "bullish", .8),
                ("News", "bullish", .75), ("Macro", "bullish", .7),
                ("MarketResearch", "bullish", .8), ("Sentiment", "neutral", .4)])
    check("strong panel not divergent", strong["divergent"] is False)
    check("strong panel high agreement", strong["agreement"] >= 0.7)
    check("strong panel bullish lean", "BULLISH" in strong["lean"])


def test_verifier_gate():
    from app.agents.managers.portfolio_manager import _verify_decision
    from app.agents.schemas import FinalDecision
    lv = {"current_price": 224.0}
    bad = _verify_decision(FinalDecision(action="BUY", confidence=0.8, reasoning="x",
            entry_price=224, target_price=900, stop_loss=240, time_horizon="1M"), lv)
    check("verifier nulls absurd target", bad.target_price is None)
    check("verifier nulls inverted stop", bad.stop_loss is None)
    check("verifier penalizes confidence", bad.confidence < 0.8)
    good = _verify_decision(FinalDecision(action="BUY", confidence=0.7, reasoning="x",
            entry_price=224, target_price=250, stop_loss=212, time_horizon="1M"), lv)
    check("verifier leaves clean decision", good.target_price == 250 and good.confidence == 0.7)


def test_correlation_dampening():
    from app.data.portfolio_builder import build_portfolio
    # same confidence; A,B highly correlated, C uncorrelated → C should get more
    decs = [{"ticker": "A", "action": "BUY", "confidence": 0.7, "avg_corr": 0.9},
            {"ticker": "B", "action": "BUY", "confidence": 0.7, "avg_corr": 0.9},
            {"ticker": "C", "action": "BUY", "confidence": 0.7, "avg_corr": 0.1}]
    p = build_portfolio(decs, "aggressive", weighting="conviction")
    wts = {x["ticker"]: x["weight"] for x in p["positions"]}
    check("uncorrelated name weighted higher", wts["C"] > wts["A"])


def test_apply_cap():
    from app.data.portfolio_builder import _apply_cap
    # two names want 0.45 each (sum 0.9), cap 0.30 of total → both capped, excess to cash
    w = _apply_cap({"A": 0.45, "B": 0.45}, 0.30, 0.9)
    check("apply_cap caps each <=0.30", all(v <= 0.3001 for v in w.values()))
    # one over, one with room → excess redistributes, total preserved
    w2 = _apply_cap({"A": 0.5, "B": 0.1}, 0.30, 0.6)
    check("apply_cap redistributes (total~0.6)", abs(sum(w2.values()) - 0.6) < 0.01)
    check("apply_cap A capped", w2["A"] <= 0.3001)


def test_cvar():
    import pandas as pd
    from app.agents.pricing_tools import _cvar
    # mostly flat with a few sharp down days → CVaR(5%) should be clearly negative
    prices = [100, 101, 100, 102, 95, 103, 104, 90, 105, 106, 107, 108,
              109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120]
    cv = _cvar(pd.Series([float(p) for p in prices]))
    check("cvar negative", cv is not None and cv < 0)


def test_contamination_flag():
    # Reliable-Eval #1: windows before the LLM training cutoff are leakage risk for
    # LLM cohorts; deterministic baselines are immune (caller interprets the flag).
    from app.eval.harness import predates_llm_cutoff as P
    check("pre-cutoff flagged", P("2024-01-01", cutoff="2025-12-01") is True)
    check("post-cutoff clean", P("2026-06-01", cutoff="2025-12-01") is False)
    check("boundary is exclusive", P("2025-12-01", cutoff="2025-12-01") is False)
    check("bad date safe", P("not-a-date", cutoff="2025-12-01") is False)


def test_binomial_sf():
    # Exact one-sided binomial test used to flag luck vs skill in aggregate().
    from app.eval.harness import _binomial_sf as B
    check("0 of 0 -> None", B(0, 0) is None)
    check("all wins small p", B(5, 5) is not None and B(5, 5) < 0.04)  # 0.5^5 = 0.03125
    check("half wins ~ high p", B(3, 6) > 0.5)
    check("monotonic: more wins => smaller p", B(5, 6) < B(3, 6))
    check("clamps k>n", abs(B(9, 5) - B(5, 5)) < 1e-9)


def test_t_stat():
    # One-sample t-stat on decision returns vs zero (skill-vs-noise guard).
    from app.eval.harness import _t_stat as T
    check("n<2 -> None", T([0.05]) is None)
    check("zero variance -> None", T([0.02, 0.02, 0.02]) is None)
    consistent = T([0.03, 0.04, 0.035, 0.038, 0.032])  # tight, all positive
    noisy = T([0.03, -0.20, 0.25, -0.18, 0.04])         # same-ish mean, huge spread
    check("consistent positive -> large t", consistent is not None and consistent > 3)
    check("noisy -> small |t|", noisy is not None and abs(noisy) < abs(consistent))
    check("sign follows mean", T([-0.03, -0.04, -0.035, -0.038]) < 0)


def test_two_sided_p_and_bonferroni():
    # Approx two-sided p from t-stat + the multiple-testing logic the leaderboard uses.
    from app.eval.harness import _two_sided_p_from_t as P
    check("None t -> None p", P(None) is None)
    check("t~0 -> p~1", P(0.0) > 0.99)
    check("t=2 -> p~0.045", 0.03 < P(2.0) < 0.06)
    check("symmetric in sign", abs(P(2.5) - P(-2.5)) < 1e-9)
    check("larger |t| -> smaller p", P(3.0) < P(1.0))
    # Bonferroni inflation: a raw-significant winner can become insignificant
    raw = P(2.2)
    check("raw significant", raw < 0.05)
    check("bonferroni x20 kills it", min(1.0, raw * 20) > 0.05)


def test_forward_return_horizon():
    # Fixed-horizon measurement -> non-overlapping rolling windows.
    import pandas as pd
    from app.eval.harness import forward_return as F
    s = pd.Series([100.0, 110.0, 120.0, 130.0],
                  index=["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"])
    check("to-latest return (+30%)", abs(F("X", "2026-01-15", s) - 0.30) < 1e-9)
    check("fixed horizon (+10%)", abs(F("X", "2026-01-15", s, to_date="2026-02-01") - 0.10) < 1e-9)
    check("horizon uses close on/before", abs(F("X", "2026-01-15", s, to_date="2026-03-20") - 0.20) < 1e-9)
    check("horizon at base -> ~0", abs(F("X", "2026-01-15", s, to_date="2026-01-10")) < 1e-9)


def test_faithfulness():
    from app.agents.managers.portfolio_manager import _reasoning_faithfulness as Fa
    # stark clash: BUY but rationale is all bearish
    clash = Fa("BUY", "Clear downtrend, breakdown below support, bearish momentum.")
    check("stark BUY/bearish flagged", clash["consistent"] is False and clash["checked"])
    # aligned: BUY with bullish rationale
    ok = Fa("BUY", "Strong breakout, bullish uptrend, accumulate on dips.")
    check("aligned BUY not flagged", ok["consistent"] is True)
    # mild/mixed must NOT flag (avoid false positives -> no over-suppression)
    mixed = Fa("BUY", "Some downside risk but bullish breakout and uptrend confirmed.")
    check("mixed not flagged", mixed["consistent"] is True)
    check("HOLD not checked", Fa("HOLD", "bearish bearish")["checked"] is False)


def test_faithfulness_non_mutating():
    # No-negative-optimization guard: the faithfulness flag must NEVER change a
    # clean, consistent decision's action or confidence — flag only.
    from app.agents.managers.portfolio_manager import _verify_decision
    from app.agents.schemas import FinalDecision
    lv = {"current_price": 100.0}
    d = FinalDecision(action="BUY", confidence=0.8, reasoning="bullish breakout uptrend",
                      entry_price=100, target_price=110, stop_loss=92, time_horizon="1M")
    out = _verify_decision(d, lv)
    check("consistent decision unchanged conf", out.confidence == 0.8)
    check("consistent decision unchanged action", out.action == "BUY")
    check("consistent decision keeps prices", out.target_price == 110 and out.stop_loss == 92)
    # stark clash: flag appended to reasoning, but action+confidence untouched
    d2 = FinalDecision(action="BUY", confidence=0.7,
                       reasoning="downtrend breakdown bearish overbought 下跌 跌破",
                       entry_price=100, target_price=110, stop_loss=92, time_horizon="1M")
    out2 = _verify_decision(d2, lv)
    check("clash flag appended", "faithfulness" in out2.reasoning)
    check("clash does NOT penalize confidence", out2.confidence == 0.7)
    check("clash does NOT change action", out2.action == "BUY")


def test_brier_score():
    from app.eval.harness import _brier_score as B
    check("empty -> None", B([]) is None)
    check("perfect -> 0", B([(1.0, 1.0), (0.0, 0.0)]) == 0.0)
    check("worst -> 1", B([(1.0, 0.0), (0.0, 1.0)]) == 1.0)
    check("no-skill 0.5 -> 0.25", abs(B([(0.5, 1.0), (0.5, 0.0)]) - 0.25) < 1e-9)
    # confident-correct beats confident-wrong
    good = B([(0.9, 1.0), (0.8, 1.0)])
    bad = B([(0.9, 0.0), (0.8, 0.0)])
    check("confident-correct lower brier", good < bad)


def test_tally_wins():
    from app.eval.harness import _tally_wins as T
    better = {"m1": "A", "m2": "A", "m3": "B", "m4": "tie", "m5": None}
    wa, wb, overall = T(better, "A", "B")
    check("counts A wins", wa == 2)
    check("counts B wins", wb == 1)
    check("ignores tie/None", overall == "A")
    wa2, wb2, ov2 = T({"m1": "A", "m2": "B"}, "A", "B")
    check("even -> tie", ov2 == "tie")


def test_verdict():
    from app.eval.harness import _verdict as V
    edge = V("5/5", True, True, 0.02)
    check("edge headline", edge.startswith("EDGE") and "beats" in edge)
    none = V("1/4", False, False, -0.01)
    check("no-edge headline", none.startswith("NO edge") and "trails" in none)
    weak = V("3/4", False, False, 0.005)
    check("weak edge headline", weak.startswith("possible weak edge"))
    check("handles None excess", V("0/2", False, False, None).startswith("NO edge"))


def test_metric_direction():
    from app.eval.harness import _metric_higher_is_better as H
    check("returns higher better", H("excess_vs_buyhold") and H("strategy_return") and H("sortino"))
    check("p-value lower better", H("return_p_approx") is False)
    check("calibration lower better", H("calibration_gap") is False and H("brier_score") is False)
    check("volatility lower better", H("strategy_return_std") is False)
    check("unknown defaults higher", H("hit_rate") and H("some_new_metric"))


def test_action_stability():
    from app.eval.harness import _action_stability as S
    check("too few -> None", S(["BUY"])["flip_rate"] is None)
    check("perfectly stable -> 0", S(["BUY", "BUY", "BUY"])["flip_rate"] == 0.0)
    check("always flips -> 1", S(["BUY", "SELL", "BUY", "SELL"])["flip_rate"] == 1.0)
    check("HOLD is neutral", S(["BUY", "HOLD", "BUY"])["flip_rate"] == 0.0)
    check("one flip of two transitions", S(["BUY", "BUY", "SELL"])["flip_rate"] == 0.5)
    check("counts directional only", S(["HOLD", "BUY", "SELL"])["n_directional"] == 2)


def test_confidence_discrimination():
    from app.eval.harness import _confidence_discrimination as D
    check("too few -> None", D([(0.9, 1.0), (0.5, 0.0)])["discrimination"] is None)
    # high-conf calls win, low-conf calls lose -> strong positive discrimination
    informative = D([(0.9, 1.0), (0.8, 1.0), (0.4, 0.0), (0.3, 0.0)])
    check("informative conf -> positive", informative["discrimination"] > 0.5)
    # confidence unrelated to outcome -> ~0 discrimination
    noise = D([(0.9, 1.0), (0.8, 0.0), (0.4, 1.0), (0.3, 0.0)])
    check("noise conf -> ~0", abs(noise["discrimination"]) < 0.6)
    # inverted: confident calls lose -> negative discrimination
    inverted = D([(0.9, 0.0), (0.8, 0.0), (0.4, 1.0), (0.3, 1.0)])
    check("inverted conf -> negative", inverted["discrimination"] < 0)
    check("all-equal conf -> None", D([(0.5, 1.0), (0.5, 0.0), (0.5, 1.0), (0.5, 0.0)])["discrimination"] is None)


def main():
    for fn in [test_selective_consensus, test_portfolio_builder, test_news_sentiment,
               test_score_decision_alpha, test_reflect_critique, test_style_levels,
               test_verifier_gate, test_correlation_dampening, test_apply_cap, test_cvar,
               test_no_oversuppression, test_contamination_flag, test_binomial_sf,
               test_t_stat, test_two_sided_p_and_bonferroni, test_forward_return_horizon,
               test_faithfulness, test_faithfulness_non_mutating, test_brier_score,
               test_tally_wins, test_verdict, test_metric_direction, test_action_stability,
               test_confidence_discrimination]:
        try:
            fn()
        except Exception as e:
            global _failed
            _failed += 1
            print(f"  ERROR in {fn.__name__}: {e}")
    print(f"\n{_passed} passed, {_failed} failed")
    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    main()

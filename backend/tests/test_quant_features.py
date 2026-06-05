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


def main():
    for fn in [test_selective_consensus, test_portfolio_builder, test_news_sentiment,
               test_score_decision_alpha, test_reflect_critique, test_style_levels]:
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

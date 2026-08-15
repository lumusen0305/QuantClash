"""AlphaForgeBench-style Strategy Lab (arXiv 2602.18481).

Reframes the LLM as a quantitative RESEARCHER that writes an executable,
rule-based strategy rather than emitting discrete trades — which decouples
reasoning from execution and makes the result reproducible and verifiable. The
generated strategy is plain `ctx`-API Python run in the existing sandbox
(leakage-free, no live trading), then validated by the deterministic backtest
engine BOTH in-sample and out-of-sample: an LLM-proposed edge is only trusted if
it generalizes to the held-out period (guards against data-snooping, per the
harness's FINSABER/Reliable-Eval discipline). Buy-and-hold over the same windows
is the bar (StockBench).
"""
from __future__ import annotations

import re

from app.backtest.engine import BacktestConfig, run_backtest

_API_DOC = """You write a trading strategy as Python code using a `ctx` object.
Your code runs ONCE PER BAR (the most-recent bar is last in each array). Available:
  ctx.closes / opens / highs / lows / volumes  -> numpy arrays up to the current bar
  ctx.current_price, ctx.position (shares held), ctx.cash, ctx.equity
  ctx.sma(n), ctx.ema(n), ctx.rsi(n=14), ctx.macd() -> {macd,signal,histogram},
  ctx.bollinger(n=20, std=2.0) -> {upper,middle,lower}
  ctx.buy(size_pct=1.0, reason=""), ctx.sell(size_pct=1.0, reason="")
Allowed builtins only: abs round min max len range int float bool str list dict
tuple isinstance math. NO imports, NO I/O.
CRITICAL CONSTRAINTS:
- Your code runs at MODULE level (NOT inside a function). Do NOT use `return` —
  use plain if/elif/else statements to decide whether to buy/sell this bar.
- There is NO persistent state between bars: `ctx` is recreated every bar, so you
  CANNOT store variables on it or rely on globals. Recompute everything from the
  arrays (ctx.closes etc.) each call. Your only memory is ctx.position (>0 = long).
- Indicators return NaN on early bars — guard with self-equality, e.g.
  `s = ctx.sma(50)` then `if s == s and ctx.current_price > s: ctx.buy(1.0)`."""

# Equal-weight buy-and-hold expressed in the same engine, so the comparison is
# apples-to-apples (same commission/slippage).
_BUY_HOLD = "if ctx.position == 0:\n    ctx.buy(1.0, 'buy-hold')\n"


def extract_code(text: str) -> str:
    """Pull Python code out of an LLM reply — strip ``` fences / surrounding prose.
    Pure, so it's unit-testable without an LLM."""
    if not text:
        return ""
    m = re.search(r"```(?:python)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
    code = m.group(1) if m else text
    return code.strip()


def _run_window(ticker: str, start: str, end: str, code: str) -> dict:
    """Backtest `code` and buy-and-hold over one window; report excess + risk."""
    try:
        cfg = BacktestConfig(ticker=ticker, start_date=start, end_date=end)
        r = run_backtest(cfg, code)
        bh = run_backtest(cfg, _BUY_HOLD)
        return {
            "strategy_return_pct": r.total_return_pct,
            "buy_hold_return_pct": bh.total_return_pct,
            "excess_pct": round(r.total_return_pct - bh.total_return_pct, 4),
            "max_drawdown_pct": r.max_drawdown_pct,
            "sharpe": r.sharpe_ratio,
            "trades": len(r.signals),
            "beats_buy_hold": r.total_return_pct > bh.total_return_pct,
        }
    except Exception as e:  # bad LLM code, no data, etc.
        return {"error": str(e)}


def propose_and_validate(ticker: str, model: str | None = None,
                         train: tuple[str, str] = ("2023-01-01", "2024-01-01"),
                         test: tuple[str, str] = ("2024-01-01", "2025-06-01")) -> dict:
    """LLM proposes a rule strategy; validate it in-sample (train) AND out-of-sample
    (test). Only 'generalizes' if it beats buy-and-hold in BOTH — otherwise it's
    flagged overfit / no-edge and not trusted (no-negative-optimization)."""
    from app.agents.llm_router import get_llm, set_model_override
    prompt = (
        f"You are a disciplined quantitative researcher. {_API_DOC}\n\n"
        f"Design ONE coherent rule-based strategy for {ticker} that aims to beat "
        f"buy-and-hold with controlled drawdown. Prefer a simple, robust rule over "
        f"an over-tuned one. Output ONLY the Python code — no prose, no markdown."
    )
    def _ask(p: str) -> str:
        set_model_override(model)
        try:
            raw = get_llm("premium", "deep").invoke(p)
            return getattr(raw, "content", None) or str(raw)
        finally:
            set_model_override(None)

    try:
        code = extract_code(_ask(prompt))
    except Exception as e:
        return {"ticker": ticker, "error": f"LLM call failed: {e}"}
    if not code:
        return {"ticker": ticker, "error": "LLM produced no usable code"}

    # Self-repair: if the strategy errors on the train window, feed the error back
    # once and let the LLM fix it (agentic repair) before the real evaluation.
    repaired = False
    probe = _run_window(ticker, train[0], train[1], code)
    if probe.get("error"):
        try:
            fix_prompt = (
                f"{_API_DOC}\n\nThis strategy code FAILED with: {probe['error']}\n\n"
                f"```python\n{code}\n```\n\nFix it (respect the CRITICAL CONSTRAINTS — "
                f"no `return`, no cross-bar state). Output ONLY the corrected Python code."
            )
            fixed = extract_code(_ask(fix_prompt))
            if fixed:
                code = fixed
                repaired = True
        except Exception:
            pass

    in_sample = _run_window(ticker, train[0], train[1], code)
    out_sample = _run_window(ticker, test[0], test[1], code)

    if in_sample.get("error") or out_sample.get("error"):
        verdict = "strategy errored on data — discarded"
        generalizes = False
    elif in_sample.get("beats_buy_hold") and out_sample.get("beats_buy_hold"):
        verdict = (f"GENERALIZES — beats buy-hold in-sample AND out-of-sample "
                   f"(OOS excess {out_sample.get('excess_pct')}%)")
        generalizes = True
    elif in_sample.get("beats_buy_hold") and not out_sample.get("beats_buy_hold"):
        verdict = "OVERFIT — beats buy-hold in-sample but FAILS out-of-sample; not trusted"
        generalizes = False
    else:
        verdict = "NO edge — does not beat buy-hold"
        generalizes = False

    return {
        "ticker": ticker, "model": model, "self_repaired": repaired,
        "train_window": list(train), "test_window": list(test),
        "strategy_code": code,
        "in_sample": in_sample, "out_of_sample": out_sample,
        "generalizes": generalizes, "verdict": verdict,
    }

# Research-Driven Features

QuantClash integrates techniques from recent LLM-finance papers. Each was read,
adapted, implemented, and verified. This maps paper → module → how to verify.

## Decision quality

| Technique | Paper | Where |
|---|---|---|
| Hybrid pricing: deterministic ATR/levels baseline + agentic tool-calling | — | `agents/pricing_tools.py`, `agents/managers/portfolio_manager.py` |
| Anti-tool-hallucination guard (reject invented tools, validate args, abstain) | The Reasoning Trap (2510.22977) | `pricing_tools.run_tool_research` (`_TOOL_GUARD`) |
| Selective consensus + confidence cap (weight analyst signals by own confidence; final confidence ≤ cross-agent agreement) | TrustTrade (2603.22567) | `portfolio_manager._selective_consensus` |
| Structured THESIS / EVIDENCE / RISK reasoning | Trading-R1 (2509.11420) | `portfolio_manager` prompt |
| Verifier-gated execution (nullify prices that contradict action / are absurd vs live price) | Reliable-Eval (2603.27539) §3.2.4 | `portfolio_manager._verify_decision` |

## Memory / reflection

| Technique | Paper | Where |
|---|---|---|
| Realized-return reflection (✓/✗, hit-rate) | FinMem/FinAgent (survey 2408.06361) | `agents/memory.py::get_context` |
| Verbal-feedback critique (overconfident / stopped-out / solid lessons) | Adaptive Multi-Agent (2510.08068) | `memory._reflect_critique` |
| Regime-shift circuit breaker (down-weight past calls when vol elevated) | exp-following (2505.16067) | `memory._regime_shift_warning` |
| Alpha-vs-SPY scoring (judge past calls on alpha, not absolute) | TradingAgents v0.2.5 | `memory._score_decision` |

## Risk & portfolio

| Technique | Paper | Where |
|---|---|---|
| Style-based risk (conservative/balanced/aggressive ATR sizing) | TradingGroup (2508.17565) | `pricing_tools.style_levels` |
| CVaR(5%) tail-risk | FinCon (2407.06567) | `pricing_tools._cvar` |
| News sentiment score + risk catalysts | FinRL-DeepSeek (2502.07393) | `pricing_tools._news_sentiment` |
| Earnings-proximity event risk | — | `pricing_tools._days_to_earnings` |
| Multi-factor screener (Value/Momentum/Quality/Low-Vol) | factor investing | `data/factors.py`, `POST /screener/factors` |
| Portfolio builder: conviction / risk-parity / half-Kelly weighting, correlation-aware diversification | AlphaAgents (2508.11152) | `data/portfolio_builder.py`, `POST /workflows/portfolio` |
| Top-down market regime gate (SPY trend+vol → exposure scalar) | HedgeAgents / FinCon | `data/market_regime.py` |

## Screeners & strategies (Discovery tabs)

| Capability | Where |
|---|---|
| Multi-factor rank (Value/Momentum/Quality/Low-Vol/52w-high) | `data/factors.py`, `POST /screener/factors`, Discovery "Factor Rank" |
| Sector rotation (11 SPDR ETFs by momentum, risk-on/off tilt) | `data/sectors.py`, `GET /screener/sectors`, Discovery "Sectors" |
| Pairs trading / stat-arb (correlated pairs, spread z-score) | `data/pairs.py`, `POST /screener/pairs`, Discovery "Pairs" |

## Analyst-layer signal integration

The deterministic signals feed the consensus-driving analysts, not just the pricing agent:
- `market_analyst`: + ADX, OBV trend, CVaR(5%)
- `news_analyst`: + QUANT READ (sentiment score, breadth, risk catalysts)
- `fundamentals_analyst`: + forward P/E, revenue growth, PEG, analyst-target consensus

## Tests

`backend/tests/test_quant_features.py` — dependency-free, 40 assertions
(`python -m tests.test_quant_features`). Covers consensus, portfolio builder,
news sentiment, alpha scoring, critique, style levels, verifier gate,
correlation dampening, cap redistribution, CVaR.

## Evaluation harness (`app/eval/`, `/eval/*`)

Scores any config by realized **forward returns**, addressing the 5 evaluation
failures from Reliable-Eval (2603.27539):

- **net-of-cost** returns (`cost_bps`) — §4.4
- **regime/benchmark** tagging (SPY) — §4.5
- **buy-and-hold bar** (`excess_vs_buyhold`, `beats_buy_hold`) — StockBench (2510.02209)
- **dispersion** (`strategy_return_std`, `return_over_risk`)
- **rolling-window robustness** (`aggregate(labels)`, `/eval/aggregate`) — §4.6 #3
- alpha + hold-rate + A/B `compare`

### Usage
```bash
# deterministic baseline as-of a date (scoreable immediately)
POST /eval/baseline {"tickers":[...], "as_of_date":"2026-03-08", "label":"bl"}
# real agent decisions (full DAG; accrues a track record over days)
POST /eval/agent-run {"tickers":[...], "label":"agent"}
GET  /eval/score?label=agent
GET  /eval/compare?a=agent&b=bl
GET  /eval/aggregate?labels=bl_w1,bl_w2,bl_w3   # robustness across windows
```

Baseline validation (2026-06-06): naive trend-following is **robustly weak** —
beats buy-and-hold 0/3 windows, mean excess −12%. That is the bar the LLM agent
must clear; its forward-test (`agent_2026-06-06`) is accruing.

## Local GPU
`qwen3:8b` via Ollama (Trading-R1's Qwen3 family) is selectable in the model
picker; `OLLAMA_MODEL` in config. See `llm_router.py`.

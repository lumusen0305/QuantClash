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

- **net-of-cost** returns, **asset-class-aware** per-leg cost (`_cost_bps_for`) — §4.4 / §6.2.2
- **regime/benchmark** tagging (SPY) — §4.5
- **buy-and-hold bar** (`excess_vs_buyhold`, `beats_buy_hold`) — StockBench (2510.02209)
- **dispersion** (`strategy_return_std`, `return_over_risk`), **Sortino**
- **rolling-window robustness** (`aggregate(labels)`, `/eval/aggregate`) — §4.6 #3
- **leaderboard** (`/eval/leaderboard`) — rank all cohorts; alpha + hold-rate + A/B `compare`
- cohorts: deterministic baselines (tech / mean-reversion / momentum), full-DAG `agent-run`, and `factor-cohort` (factor screener's top-N); UI in the Workspace **Strategy Eval** panel (single / compare / 🏆 leaderboard)

### Statistical rigor (added to fight luck/overfitting, all `tests/test_quant_features.py`-guarded)
- **contamination control** (`predates_llm_cutoff`, `LLM_TRAINING_CUTOFF`) — flag windows before the LLM training cutoff as look-ahead risk for LLM cohorts — Reliable-Eval #1
- **FINSABER rolling backtest** (`rolling_backtest`, `/eval/rolling-backtest`) — auto-generates many step-date cohorts over a long horizon — arXiv 2505.07078
- **non-overlapping fixed-horizon windows** (`forward_return(to_date=)`, `score(to_date=)`, `non_overlapping=True`) — windows measured to-latest-close overlap → autocorrelated → invalid significance; fixed horizons make them independent (purged-CV / embargo) — purged cross-validation
- **window-level binomial test** (`_binomial_sf`, `binomial_p_vs_coinflip`) — is beating buy-hold across windows distinguishable from a coin flip?
- **decision-level t-statistic** (`_t_stat`, `return_t_stat`) — is the mean per-decision return distinguishable from zero?
- **selection-bias guard** (`leaderboard.selection_bias`) — winner's p-value Bonferroni-adjusted by #trials — López de Prado backtest overfitting
- **Brier score** (`_brier_score`, proper calibration scoring rule; 0.25 = no-skill) — sharper than `calibration_gap` — TrustTrade/Reliable-Eval
- **direction-aware ranking** (`_metric_higher_is_better`) — leaderboard ranks lower-is-better metrics (p-value, calibration, vol) correctly
- **plain-language verdict** (`_verdict`) — one line combining economic edge + statistical strength
- **A/B win tally** (`compare.overall`, `_tally_wins`) — headline winner across the full scorecard (returns, risk-adjusted, calibration)

### Decision faithfulness (`portfolio_manager._reasoning_faithfulness`)
Flags (non-mutating; never blocks/penalizes) a stark reasoning↔action contradiction — e.g. action BUY but the rationale leans bearish — TradeTrap (2512.02261).

## Pricing-agent tools (`pricing_tools.PRICING_TOOLS`, bound to the decision agent)

`get_full_snapshot` (one-shot: levels+CVaR+ADX+earnings + RS + news + insider),
`get_technical_levels`, `get_fundamentals_snapshot` (incl. PEG, analyst target,
**short interest**), `get_price_history`, `get_relative_strength` (vs SPY),
`get_peer_news` (cross-company contagion, arXiv 2606.05733), `get_insider_activity`,
`get_recent_news` (sentiment + breadth + risk catalysts). Guarded against tool
hallucination (`_TOOL_GUARD`, arXiv 2510.22977).

### Usage
```bash
# deterministic baseline as-of a date (scoreable immediately)
POST /eval/baseline {"tickers":[...], "as_of_date":"2026-03-08", "label":"bl"}
# real agent decisions (full DAG; accrues a track record over days)
POST /eval/agent-run {"tickers":[...], "label":"agent"}
GET  /eval/score?label=agent
GET  /eval/compare?a=agent&b=bl
GET  /eval/aggregate?labels=bl_w1,bl_w2,bl_w3   # robustness across windows
# FINSABER rolling backtest (auto multi-window; non-overlapping = valid significance)
POST /eval/rolling-backtest {"start_date":"2025-06-01","end_date":"2025-11-01","strategy":"tech_baseline","step_days":30}
```

Baseline validation (verified on real Jun–Dec 2025 data, **non-overlapping**
windows, 5 mega-caps, 30d step). All three deterministic baselines, head-to-head:

| strategy | verdict | excess/window | windows won | max DD | flip rate | binomial p |
|---|---|---|---|---|---|---|
| tech_baseline | NO edge | −1.2% | 2/5 | −6.9% | 0.25 | 0.81 |
| mean_reversion | NO edge | −9.7% | 1/5 | **−30.8%** | 0.00 | 0.97 |
| momentum | possible weak edge | +0.9% | 3/4 | −0.9% | 0.00 | 0.31 |

Findings: (1) `max_drawdown` clearly discriminates risk that return alone hides —
mean_reversion's −30.8% DD vs momentum's −0.9%. (2) momentum *looks* like it beats
buy-hold, but the harness **correctly flags it not significant** (p=0.31, only 4
windows) — so it is NOT promoted to default (no-negative-optimization: an
unverified edge is not an edge). Buy-and-hold remains the bar the LLM agent must
clear; the agent forward-test (`agent_2026-06-06`) is still accruing (currently
all-HOLD, so `compare` returns *incomparable* until it makes directional calls).

## Local GPU
`qwen3:8b` via Ollama (Trading-R1's Qwen3 family) is selectable in the model
picker; `OLLAMA_MODEL` in config. See `llm_router.py`.

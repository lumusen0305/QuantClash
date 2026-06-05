import asyncio
from app.agents.schemas import AnalysisState, FinalDecision, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed
from app.agents.memory import AnalysisMemory
from app.agents.pricing_tools import compute_levels, levels_text, style_levels_text, run_tool_research


def _selective_consensus(signals: list) -> dict:
    """TrustTrade-style selective consensus (arXiv 2603.22567).

    Replaces 'uniform trust' (all analyst signals weighted equally) with
    confidence-weighted cross-agent agreement: each signal's weight = the
    analyst's own confidence, and the dominant direction's share of total
    weight = the consensus strength. That agreement then CAPS the final
    decision confidence — directly fixing over-confident 'all-neutral → BUY
    at 80%' outputs. `signals`: list of (label, signal, confidence 0-1).
    """
    if not signals:
        return {"direction": "unknown", "agreement": 0.0, "divergent": True,
                "n": 0, "lines": [], "lean": "unknown", "dir_w": {}}
    dir_w = {"bullish": 0.0, "bearish": 0.0, "neutral": 0.0}
    lines = []
    for label, sig, conf in signals:
        w = max(0.15, float(conf or 0.0))  # floor so a 0-conf signal isn't fully muted
        if sig in dir_w:
            dir_w[sig] += w
        lines.append(f"- {label}: {sig} (confidence {conf:.0%}, weight {w:.2f})")
    total = sum(dir_w.values()) or 1.0
    direction = max(dir_w, key=dir_w.get)
    agreement = dir_w[direction] / total
    divergent = agreement <= 0.5  # a 50/50 (or worse) split is conflicted
    if direction == "bullish" and not divergent:
        lean = "整體偏多 net BULLISH"
    elif direction == "bearish" and not divergent:
        lean = "整體偏空 net BEARISH"
    else:
        lean = "整體中性/分歧 net NEUTRAL/MIXED"
    return {"direction": direction, "agreement": round(agreement, 2),
            "divergent": divergent, "n": len(signals), "lines": lines,
            "lean": lean, "dir_w": {k: round(v, 2) for k, v in dir_w.items()}}


async def portfolio_manager_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    trader_plan = state.get("trader_plan", "No trading plan available.")
    risk_debate = state.get("risk_debate", [])
    research_verdict = state.get("research_verdict", "")

    # Collect the ORIGINAL analyst signals so the final decision is anchored to
    # the raw evidence, not just the (bull-leaning) downstream verdict.
    _analyst_keys = [
        ("market_report", "技術面 Technical"),
        ("sentiment_report", "情緒面 Sentiment"),
        ("news_report", "新聞 News"),
        ("fundamentals_report", "基本面 Fundamentals"),
        ("macro_report", "總體 Macro"),
        ("market_research_report", "市場調查 Market Research"),
    ]
    _sig_list = []
    for key, label in _analyst_keys:
        rep = state.get(key)
        sig = getattr(rep, "signal", None) if rep else None
        if sig:
            conf = getattr(rep, "confidence", 0.0) or 0.0
            _sig_list.append((label, sig, conf))
    consensus = _selective_consensus(_sig_list)
    signals_block = "\n".join(consensus["lines"]) if consensus["lines"] else "(no analyst signals)"
    net_lean = consensus["lean"]
    _div_note = (
        "⚠ DIVERGENT — analysts conflict; discount the panel, prefer HOLD, keep confidence LOW."
        if consensus["divergent"]
        else "panel is reasonably aligned."
    )
    consensus_block = (
        "SELECTIVE CONSENSUS (confidence-weighted cross-agent agreement, not uniform trust):\n"
        f"- dominant direction: {consensus['direction']} | agreement: {consensus['agreement']:.0%} "
        f"| weighted votes {consensus['dir_w']}\n"
        f"- {_div_note}\n"
        f"- HARD RULE: your final `confidence` MUST NOT exceed the agreement "
        f"({consensus['agreement']:.2f}). Treating noisy/divergent signals as equally "
        "reliable is a known failure mode — discount weakly-grounded or conflicting ones.\n"
    )

    # ── Hybrid pricing: deterministic baseline + agentic tool-calling ────────
    # 1) DETERMINISTIC snapshot (real price/ATR/levels) so the LLM can never
    #    invent a price scale (e.g. pre-split NVDA ~$900 vs real ~$200).
    loop = asyncio.get_event_loop()
    risk_style = state.get("risk_style") or "balanced"
    levels = await loop.run_in_executor(None, lambda: compute_levels(ticker))
    if levels:
        price_block = (
            levels_text(levels) +
            style_levels_text(levels, risk_style) +
            "All of entry_price / target_price / stop_loss MUST be grounded in the "
            "numbers above (and any tool results). NEVER use a price from memory or "
            "training data (may be stale or pre-split). For BUY: entry near/below "
            "current price, target above, stop below. For SELL: mirror it. Size the "
            "stop with ATR (≈1.5-2x). Sanity-check every number against current_price.\n\n"
        )
    else:
        price_block = (
            "PRICE DATA: unavailable — if you cannot ground entry/target/stop in a "
            "real recent price, set them to null rather than guessing.\n\n"
        )

    if callback:
        await callback(AnalysisProgress(
            stage="portfolio_manager",
            message="Portfolio manager researching prices...",
            progress_pct=85.0,
        ))

    # 2) AGENTIC step: let the model decide which tools to call for more evidence
    #    (fundamentals, longer history, news) before fixing the prices. Bounded
    #    to keep latency in check. Falls back gracefully if tool-calling fails.
    research_notes = "(no extra research)"
    try:
        research_sys = (
            f"You are pricing the final trade for {ticker} on {trade_date}.\n\n"
            f"{price_block}"
            f"ANALYST NET LEAN: {net_lean}\n\n"
            "Decide what additional data you need and call the available tools to "
            "get it, so entry_price / target_price / stop_loss are well grounded."
        )
        research_llm = get_llm(user_tier, "deep")
        research_notes = await loop.run_in_executor(
            None, lambda: run_tool_research(research_llm, research_sys, max_rounds=3)
        )
    except Exception as e:
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
            mark_gemini_failed()
            try:
                research_llm = get_llm(user_tier, "deep")
                research_notes = await loop.run_in_executor(
                    None, lambda: run_tool_research(research_llm, research_sys, max_rounds=3)
                )
            except Exception as e2:
                research_notes = f"(tool research unavailable: {e2})"
        else:
            research_notes = f"(tool research unavailable: {e})"

    try:
        # Load memory context
        memory = AnalysisMemory()
        memory_context = memory.get_context(ticker)

        # Summarize risk debate
        risk_perspectives = []
        for msg in risk_debate:
            risk_perspectives.append(f"[{msg.role.upper()} RISK]\n{msg.content}")
        risk_text = "\n\n".join(risk_perspectives) if risk_perspectives else "No risk debate available."

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are the Portfolio Manager making the final investment decision for {ticker} on {trade_date}.\n\n"
            f"{price_block}"
            f"AGENT PRICE RESEARCH (tools you called for grounding):\n{research_notes}\n\n"
            f"MEMORY CONTEXT (past analyses):\n{memory_context}\n\n"
            f"ANALYST SIGNAL PANEL (the raw evidence — weigh this heavily):\n{signals_block}\n"
            f"NET ANALYST LEAN: {net_lean}\n\n"
            f"{consensus_block}\n"
            f"RESEARCH VERDICT:\n{research_verdict}\n\n"
            f"TRADER'S PLAN:\n{trader_plan}\n\n"
            f"RISK DEBATE:\n{risk_text}\n\n"
            "Make the final investment decision. CRITICAL RULES:\n"
            "1. Your action MUST be consistent with the net analyst lean UNLESS you give an "
            "explicit, compelling reason to override it. Do NOT issue BUY when the panel is net "
            "bearish or neutral just because a 'buy the dip' / oversold-bounce argument sounds "
            "persuasive — an oversold reading is NOT by itself a BUY.\n"
            "2. If the panel is net NEUTRAL/MIXED, prefer HOLD unless there is a clear, "
            "evidence-backed directional edge.\n"
            "3. If you contradict the net lean, the reasoning MUST start by naming which specific "
            "signals you are overriding and why.\n"
            "Consider the risk debate to calibrate position and risk parameters.\n\n"
            "Produce a structured final decision with:\n"
            "- action: BUY, SELL, or HOLD\n"
            "- confidence: 0.0 to 1.0 — MUST NOT exceed the SELECTIVE CONSENSUS agreement "
            "above, and lower it further when acting against the net lean\n"
            "- reasoning: a STRUCTURED, evidence-based investment thesis with three "
            "clearly labeled parts (for interpretability): "
            "(1) THESIS — the core strategic view in 1-2 sentences; "
            "(2) EVIDENCE — the specific analyst signals / price levels / fundamentals "
            "that support it (cite the actual numbers, no vague claims); "
            "(3) RISK & DECISION — volatility-adjusted rationale for the action and the "
            "entry/target/stop, consistent with the signal panel and ATR.\n"
            "- entry_price: the suggested buy/entry price (REQUIRED for BUY/SELL; "
            "null only for HOLD). Must be grounded in current_price/levels above. "
            "If the AGENT PRICE RESEARCH shows a GROUNDING WARNING or you cannot "
            "trace a price to real data, set it to null rather than fabricating.\n"
            "- target_price: price target (or null if HOLD)\n"
            "- stop_loss: stop loss level (or null if HOLD)\n"
            "- time_horizon: '1W', '1M', or '3M'"
        )

        llm = get_llm(user_tier, "deep")
        structured_llm = llm.with_structured_output(FinalDecision)

        try:
            decision = await loop.run_in_executor(
                None,
                lambda: structured_llm.invoke(prompt),
            )
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                mark_gemini_failed()
                llm = get_llm(user_tier, "deep")
                structured_llm = llm.with_structured_output(FinalDecision)
                decision = await loop.run_in_executor(
                    None,
                    lambda: structured_llm.invoke(prompt),
                )
            else:
                raise

        # Store in memory
        try:
            memory.store(ticker, trade_date, decision.model_dump())
        except Exception:
            pass

    except Exception as e:
        decision = FinalDecision(
            action="HOLD",
            confidence=0.1,
            reasoning=f"Portfolio manager failed to produce decision: {e}",
            target_price=None,
            stop_loss=None,
            time_horizon="1M",
        )

    if callback:
        await callback(AnalysisProgress(
            stage="portfolio_manager",
            message="Final decision complete.",
            progress_pct=95.0,
        ))

    return {"final_decision": decision}

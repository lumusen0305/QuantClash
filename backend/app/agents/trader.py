import asyncio
from app.agents.schemas import AnalysisState, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction


async def trader_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    research_verdict = state.get("research_verdict", "No verdict available.")

    if callback:
        await callback(AnalysisProgress(
            stage="trader",
            message="Trader generating initial trading plan...",
            progress_pct=60.0,
        ))

    try:
        # Include market report for price context if available
        price_context = ""
        market_report = state.get("market_report")
        if market_report:
            price_context = f"\nMarket Signal: {market_report.signal} (confidence {market_report.confidence:.0%})\n"

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are an experienced equity trader. Based on the research verdict below, "
            f"develop a concrete trading plan for {ticker} as of {trade_date}.\n"
            f"{price_context}\n"
            f"RESEARCH VERDICT:\n{research_verdict}\n\n"
            "Your trading plan must include:\n"
            "1. Proposed action (BUY / SELL / HOLD) with justification\n"
            "2. Suggested position sizing rationale (e.g., full/half/quarter position)\n"
            "3. Suggested entry strategy (e.g., market order, limit at specific level)\n"
            "4. Target price and stop-loss levels with reasoning\n"
            "5. Time horizon (1W, 1M, or 3M)\n"
            "6. Key events or catalysts to monitor\n\n"
            "Be specific and actionable. This plan will be reviewed by the risk management team."
        )

        loop = asyncio.get_event_loop()
        llm = get_llm(user_tier, "deep")
        response = await loop.run_in_executor(
            None,
            lambda: llm.invoke(prompt),
        )

        plan = response.content if hasattr(response, "content") else str(response)

    except Exception as e:
        plan = f"Trader failed to generate plan: {e}"

    if callback:
        await callback(AnalysisProgress(
            stage="trader",
            message="Trading plan generated.",
            progress_pct=65.0,
        ))

    return {"trader_plan": plan}

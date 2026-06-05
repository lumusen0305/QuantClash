import asyncio
from app.agents.schemas import AnalysisState, DebateMessage, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def neutral_risk_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    trader_plan = state.get("trader_plan", "No trading plan available.")

    if callback:
        await callback(AnalysisProgress(
            stage="neutral_risk",
            message="Neutral risk debator analyzing plan...",
            progress_pct=70.0,
        ))

    try:
        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a neutral risk arbitrator reviewing a trading plan for {ticker}.\n\n"
            f"TRADER'S PLAN:\n{trader_plan}\n\n"
            "From a balanced risk/reward perspective:\n"
            "1. Evaluate whether the risk/reward ratio is attractive\n"
            "2. Assess if position sizing is appropriate for the conviction level\n"
            "3. Identify the most critical risk factors to monitor\n"
            "4. Suggest a balanced approach between aggressive and conservative views\n"
            "5. Provide a probability-weighted outcome assessment\n\n"
            "Be objective and data-driven. Your goal is optimal risk-adjusted returns."
        )

        loop = asyncio.get_event_loop()
        llm = get_llm(user_tier, "deep")
        try:
            response = await loop.run_in_executor(
                None,
                lambda: llm.invoke(prompt),
            )
        except Exception as llm_err:
            if "RESOURCE_EXHAUSTED" in str(llm_err) or "429" in str(llm_err):
                mark_gemini_failed()
                llm = get_llm(user_tier, "deep")
                response = await loop.run_in_executor(
                    None,
                    lambda: llm.invoke(prompt),
                )
            else:
                raise

        content = response.content if hasattr(response, "content") else str(response)
        msg = DebateMessage(role="neutral", content=content, round=1)

    except Exception as e:
        msg = DebateMessage(
            role="neutral",
            content=f"Neutral risk debator failed: {e}",
            round=1,
        )

    existing = list(state.get("risk_debate", []))
    existing.append(msg)

    if callback:
        await callback(AnalysisProgress(
            stage="neutral_risk",
            message="Neutral risk perspective complete.",
            progress_pct=75.0,
        ))

    return {"risk_debate": existing}

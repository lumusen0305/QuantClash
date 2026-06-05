import asyncio
from app.agents.schemas import AnalysisState, DebateMessage, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def conservative_risk_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    trader_plan = state.get("trader_plan", "No trading plan available.")

    if callback:
        await callback(AnalysisProgress(
            stage="conservative_risk",
            message="Conservative risk debator analyzing plan...",
            progress_pct=70.0,
        ))

    try:
        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a conservative risk manager reviewing a trading plan for {ticker}.\n\n"
            f"TRADER'S PLAN:\n{trader_plan}\n\n"
            "From a conservative risk management perspective:\n"
            "1. Identify all downside risks and tail risks not adequately addressed\n"
            "2. Challenge position sizing — argue for smaller, more measured positions\n"
            "3. Evaluate whether stop-losses are tight enough to protect capital\n"
            "4. Assess liquidity risk and market impact\n"
            "5. Recommend risk mitigation strategies (hedges, staged entry, etc.)\n\n"
            "Be thorough and specific. Your goal is capital preservation above all else."
        )

        loop = asyncio.get_event_loop()
        llm = get_llm(user_tier, "deep")
        try:
            response = await loop.run_in_executor(
                None,
                lambda: llm.invoke(prompt),
            )
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                mark_gemini_failed()
                llm = get_llm(user_tier, "deep")
                response = await loop.run_in_executor(
                    None,
                    lambda: llm.invoke(prompt),
                )
            else:
                raise

        content = response.content if hasattr(response, "content") else str(response)
        msg = DebateMessage(role="conservative", content=content, round=1)

    except Exception as e:
        msg = DebateMessage(
            role="conservative",
            content=f"Conservative risk debator failed: {e}",
            round=1,
        )

    existing = list(state.get("risk_debate", []))
    existing.append(msg)

    if callback:
        await callback(AnalysisProgress(
            stage="conservative_risk",
            message="Conservative risk perspective complete.",
            progress_pct=75.0,
        ))

    return {"risk_debate": existing}

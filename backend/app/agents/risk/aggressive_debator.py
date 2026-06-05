import asyncio
from app.agents.schemas import AnalysisState, DebateMessage, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def aggressive_risk_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    trader_plan = state.get("trader_plan", "No trading plan available.")

    if callback:
        await callback(AnalysisProgress(
            stage="aggressive_risk",
            message="Aggressive risk debator analyzing plan...",
            progress_pct=70.0,
        ))

    try:
        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are an aggressive risk advocate reviewing a trading plan for {ticker}.\n\n"
            f"TRADER'S PLAN:\n{trader_plan}\n\n"
            "From an aggressive risk-taking perspective:\n"
            "1. Argue for maximizing position size and upside capture\n"
            "2. Challenge overly conservative stop-losses as leaving money on the table\n"
            "3. Identify opportunities the trader may be underweighting\n"
            "4. Suggest ways to increase leverage or concentration if warranted\n"
            "5. Critique any excessive risk aversion in the plan\n\n"
            "Be direct and specific. Your goal is to ensure we don't miss asymmetric upside."
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
        msg = DebateMessage(role="aggressive", content=content, round=1)

    except Exception as e:
        msg = DebateMessage(
            role="aggressive",
            content=f"Aggressive risk debator failed: {e}",
            round=1,
        )

    existing = list(state.get("risk_debate", []))
    existing.append(msg)

    if callback:
        await callback(AnalysisProgress(
            stage="aggressive_risk",
            message="Aggressive risk perspective complete.",
            progress_pct=75.0,
        ))

    return {"risk_debate": existing}

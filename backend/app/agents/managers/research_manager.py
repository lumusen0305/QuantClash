import asyncio
from app.agents.schemas import AnalysisState, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def research_manager_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    bull_arguments = state.get("bull_arguments", [])
    bear_arguments = state.get("bear_arguments", [])

    if callback:
        await callback(AnalysisProgress(
            stage="research_manager",
            message="Research manager synthesizing debate...",
            progress_pct=50.0,
        ))

    try:
        all_rounds = set()
        for m in bull_arguments:
            all_rounds.add(m.round)
        for m in bear_arguments:
            all_rounds.add(m.round)

        debate_text = []
        for r in sorted(all_rounds):
            bull_msgs = [m for m in bull_arguments if m.round == r]
            bear_msgs = [m for m in bear_arguments if m.round == r]
            if bull_msgs:
                debate_text.append(f"--- ROUND {r} BULL ---\n{bull_msgs[0].content}")
            if bear_msgs:
                debate_text.append(f"--- ROUND {r} BEAR ---\n{bear_msgs[0].content}")

        if not debate_text:
            debate_text = ["No debate arguments available."]

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are the Research Manager overseeing an investment debate for {ticker}.\n\n"
            f"Review the following bull vs bear debate and render a final research verdict.\n\n"
            + "\n\n".join(debate_text)
            + "\n\nProvide a clear, balanced verdict that:\n"
            "1. Weighs the strongest points from each side\n"
            "2. Identifies which arguments are most compelling\n"
            "3. States a clear directional bias (bullish/bearish/neutral) with reasoning\n"
            "4. Highlights the top 2-3 key factors that should drive the trading decision\n\n"
            "Be concise and actionable."
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

        verdict = response.content if hasattr(response, "content") else str(response)

    except Exception as e:
        verdict = f"Research manager failed to produce verdict: {e}"

    if callback:
        await callback(AnalysisProgress(
            stage="research_manager",
            message="Research verdict complete.",
            progress_pct=55.0,
        ))

    return {"research_verdict": verdict}

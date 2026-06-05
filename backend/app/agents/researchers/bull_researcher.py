import asyncio
from app.agents.schemas import AnalysisState, DebateMessage, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def bull_researcher_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    bear_arguments = state.get("bear_arguments", [])

    if callback:
        await callback(AnalysisProgress(
            stage="bull_researcher",
            message="Building bull case...",
            progress_pct=30.0,
        ))

    try:
        # Collect all analyst reports
        reports = []
        for key in ("market_report", "sentiment_report", "news_report", "fundamentals_report"):
            r = state.get(key)
            if r:
                reports.append(
                    f"[{r.analyst_type.upper()} ANALYST] Signal: {r.signal} | Confidence: {r.confidence:.0%}\n"
                    f"Summary: {r.summary}\n"
                    f"Evidence: {'; '.join(r.key_evidence)}\n"
                    f"Risks: {'; '.join(r.key_risks)}"
                )

        reports_text = "\n\n".join(reports) if reports else "No analyst reports available."

        bear_counter = ""
        if bear_arguments:
            last_bear = bear_arguments[-1]
            bear_counter = f"\n\nBear argument to respond to (Round {last_bear.round}):\n{last_bear.content}"

        current_round = (len(bear_arguments) // 1) + 1

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a bull-case researcher for {ticker}. "
            f"Build the strongest possible bullish investment argument based on these analyst reports.\n\n"
            f"{reports_text}"
            f"{bear_counter}\n\n"
            f"Provide a concise, well-structured bullish argument. "
            f"If responding to bear points, address them directly. "
            f"Focus on upside catalysts, valuation support, and positive momentum."
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

        msg = DebateMessage(role="bull", content=content, round=current_round)

    except Exception as e:
        msg = DebateMessage(
            role="bull",
            content=f"Bull researcher failed: {e}",
            round=1,
        )

    existing = list(state.get("bull_arguments", []))
    existing.append(msg)

    if callback:
        await callback(AnalysisProgress(
            stage="bull_researcher",
            message="Bull case complete.",
            progress_pct=40.0,
        ))

    return {"bull_arguments": existing}

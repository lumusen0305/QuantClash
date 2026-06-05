import asyncio
from app.agents.schemas import AnalysisState, DebateMessage, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def bear_researcher_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")
    bull_arguments = state.get("bull_arguments", [])

    if callback:
        await callback(AnalysisProgress(
            stage="bear_researcher",
            message="Building bear case...",
            progress_pct=30.0,
        ))

    try:
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

        bull_counter = ""
        if bull_arguments:
            last_bull = bull_arguments[-1]
            bull_counter = f"\n\nBull argument to respond to (Round {last_bull.round}):\n{last_bull.content}"

        current_round = (len(bull_arguments) // 1) + 1

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a bear-case researcher for {ticker}. "
            f"Build the strongest possible bearish investment argument based on these analyst reports.\n\n"
            f"{reports_text}"
            f"{bull_counter}\n\n"
            f"Provide a concise, well-structured bearish argument. "
            f"If responding to bull points, address them directly. "
            f"Focus on downside risks, overvaluation concerns, and negative catalysts."
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

        msg = DebateMessage(role="bear", content=content, round=current_round)

    except Exception as e:
        msg = DebateMessage(
            role="bear",
            content=f"Bear researcher failed: {e}",
            round=1,
        )

    existing = list(state.get("bear_arguments", []))
    existing.append(msg)

    if callback:
        await callback(AnalysisProgress(
            stage="bear_researcher",
            message="Bear case complete.",
            progress_pct=40.0,
        ))

    return {"bear_arguments": existing}

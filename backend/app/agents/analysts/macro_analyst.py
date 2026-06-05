import asyncio
import yfinance as yf

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


# Macro indices to track broad market conditions
MACRO_TICKERS = {
    "^GSPC": "S&P 500",
    "^VIX": "VIX (Fear Index)",
    "^DXY": "US Dollar Index",
    "^TNX": "US 10Y Treasury Yield",
    "GC=F": "Gold Futures",
    "CL=F": "Crude Oil Futures",
}


def _fetch_macro_data() -> str:
    """Fetch current macro indicator data."""
    lines = []
    for symbol, name in MACRO_TICKERS.items():
        try:
            tk = yf.Ticker(symbol)
            hist = tk.history(period="5d")
            if hist.empty:
                lines.append(f"- {name} ({symbol}): No data")
                continue
            current = float(hist["Close"].iloc[-1])
            prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else current
            change_pct = ((current - prev) / prev) * 100 if prev != 0 else 0
            direction = "+" if change_pct >= 0 else ""
            lines.append(f"- {name} ({symbol}): {current:.2f} ({direction}{change_pct:.2f}%)")
        except Exception:
            lines.append(f"- {name} ({symbol}): Fetch failed")
    return "\n".join(lines)


def _fetch_macro_news() -> str:
    """Fetch broad market/geopolitical news via yfinance."""
    try:
        # Use S&P 500 ETF for broad market news
        spy = yf.Ticker("SPY")
        news_items = spy.news or []

        # Also try world ETFs for geopolitical coverage
        for etf in ["EFA", "VWO"]:
            try:
                extra = yf.Ticker(etf).news or []
                news_items.extend(extra)
            except Exception:
                pass

        # Deduplicate by title
        seen = set()
        unique = []
        for item in news_items:
            title = item.get("title", "")
            if title and title not in seen:
                seen.add(title)
                unique.append(item)

        if not unique:
            return "No macro news available."

        headlines = []
        for item in unique[:15]:
            title = item.get("title", "")
            publisher = item.get("publisher", "")
            headlines.append(f"- [{publisher}] {title}")
        return f"Recent macro/geopolitical news ({len(headlines)} items):\n" + "\n".join(headlines)
    except Exception as e:
        return f"Macro news fetch failed: {e}"


async def macro_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="macro_analyst",
            message="Fetching macro indicators and geopolitical news...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()

        # Fetch macro data, news, and Trump posts in parallel
        from app.data.political import fetch_trump_block

        macro_data_future = loop.run_in_executor(None, _fetch_macro_data)
        macro_news_future = loop.run_in_executor(None, _fetch_macro_news)
        trump_future = loop.run_in_executor(None, lambda: fetch_trump_block(8))
        macro_data, macro_news, trump_block = await asyncio.gather(
            macro_data_future, macro_news_future, trump_future
        )

        context = (
            f"Target Stock: {ticker} | Date: {trade_date}\n\n"
            f"=== MACRO INDICATORS ===\n{macro_data}\n\n"
            f"=== GEOPOLITICAL & MACRO NEWS ===\n{macro_news}\n\n"
            f"=== TRUMP / POLITICAL POSTS ===\n{trump_block}"
        )

        if callback:
            await callback(AnalysisProgress(
                stage="macro_analyst",
                message="Running LLM macro analysis...",
                progress_pct=10.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a macro/geopolitical analyst. Analyze the broader market environment "
            f"and its impact on {ticker}.\n\n"
            f"{context}\n\n"
            f"Consider:\n"
            f"1. Overall market trend (S&P 500 direction, VIX level)\n"
            f"2. Interest rate environment (Treasury yields) and Fed policy implications\n"
            f"3. USD strength and its sector impact\n"
            f"4. Commodity trends (oil, gold) as risk/inflation signals\n"
            f"5. Geopolitical risks (wars, trade tensions, sanctions) from the news\n"
            f"6. Trump/political posts — assess any policy signals (tariffs, Fed pressure, "
            f"trade, specific company/sector mentions) and their market impact\n"
            f"7. How these macro factors specifically affect {ticker}\n\n"
            f"Determine if the macro environment is bullish, bearish, or neutral for {ticker}. "
            f"Provide key evidence and key risks."
        )

        try:
            report = await loop.run_in_executor(
                None,
                lambda: structured_llm.invoke(prompt),
            )
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                mark_gemini_failed()
                llm = get_llm(user_tier, "quick")
                structured_llm = llm.with_structured_output(AnalystReport)
                report = await loop.run_in_executor(
                    None,
                    lambda: structured_llm.invoke(prompt),
                )
            else:
                raise

        report = AnalystReport(
            analyst_type="macro",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="macro",
            summary=f"Macro analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="macro_analyst",
            message="Macro analysis complete.",
            progress_pct=20.0,
        ))

    return {"macro_report": report}

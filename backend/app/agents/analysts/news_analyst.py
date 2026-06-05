import asyncio
import xml.etree.ElementTree as ET

import httpx

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


def _fetch_yahoo_rss(ticker: str) -> list[dict]:
    """Fetch news via Yahoo Finance RSS (reliable, no auth)."""
    try:
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        r = httpx.get(url, timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        root = ET.fromstring(r.text)
        channel = root.find("channel")
        items = channel.findall("item") if channel is not None else []
        return [
            {
                "title": (item.findtext("title") or "").strip(),
                "publisher": (item.findtext("source") or "Yahoo Finance").strip(),
            }
            for item in items[:10]
            if (item.findtext("title") or "").strip()
        ]
    except Exception:
        return []


async def news_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="news_analyst",
            message=f"Fetching recent news for {ticker}...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()
        news_items = await loop.run_in_executor(None, lambda: _fetch_yahoo_rss(ticker))

        if not news_items:
            news_summary = f"No recent news found for {ticker}."
        else:
            headlines = [f"- [{item['publisher']}] {item['title']}" for item in news_items]
            # Deterministic sentiment/breadth/risk-catalyst read to anchor the LLM
            # (FinRL-DeepSeek 2502.07393 + FinGPT 2412.10823).
            try:
                from app.agents.pricing_tools import _news_sentiment
                s = _news_sentiment(news_items)
                quant = (f"\nQUANT READ: sentiment {s['score']:+.2f} (-1..1), breadth={s['breadth']}"
                         + (f", risk catalysts: {', '.join(s['risk_flags'])}" if s['risk_flags'] else "")
                         + (". (low breadth — few headlines, treat as weak)" if s['breadth'] == 'low' else "."))
            except Exception:
                quant = ""
            news_summary = (
                f"Ticker: {ticker} | Date: {trade_date}\n"
                f"Recent news headlines ({len(headlines)} items):\n"
                + "\n".join(headlines) + quant
            )

        if callback:
            await callback(AnalysisProgress(
                stage="news_analyst",
                message="Running LLM news analysis...",
                progress_pct=15.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a financial news analyst. Analyze the following recent news and produce a structured report.\n\n"
            f"{news_summary}\n\n"
            f"Identify market-moving events, determine if the news signal is bullish, bearish, or neutral, "
            f"and provide key evidence and risks."
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
            analyst_type="news",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="news",
            summary=f"News analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="news_analyst",
            message="News analysis complete.",
            progress_pct=20.0,
        ))

    return {"news_report": report}

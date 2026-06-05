import asyncio
import xml.etree.ElementTree as ET

import httpx
import yfinance as yf

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


def _fetch_yahoo_rss(ticker: str) -> list[dict]:
    """Fetch news headlines via Yahoo Finance RSS (reliable, no auth)."""
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


def _fetch_price_momentum(ticker: str) -> tuple[float, float, float]:
    """Return (pct_change_5d, current_price, avg_volume_ratio) using yfinance.

    pct_change_5d: % change from 5 trading days ago to today.
    avg_volume_ratio: last day volume / 5-day average volume (>1 = elevated volume).
    """
    try:
        hist = yf.Ticker(ticker).history(period="10d")
        if hist.empty or len(hist) < 2:
            return 0.0, 0.0, 1.0
        closes = hist["Close"]
        volumes = hist["Volume"]
        current_price = float(closes.iloc[-1])
        start_price = float(closes.iloc[max(0, len(closes) - 6)])
        pct_change = (current_price - start_price) / start_price * 100.0
        avg_vol = float(volumes.iloc[-6:-1].mean()) if len(volumes) >= 6 else float(volumes.mean())
        last_vol = float(volumes.iloc[-1])
        vol_ratio = last_vol / avg_vol if avg_vol > 0 else 1.0
        return round(pct_change, 2), round(current_price, 2), round(vol_ratio, 2)
    except Exception:
        return 0.0, 0.0, 1.0


async def sentiment_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="sentiment_analyst",
            message=f"Fetching news and price momentum for {ticker}...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()

        # Fetch news headlines and price momentum concurrently
        news_items, (pct_change_5d, current_price, vol_ratio) = await asyncio.gather(
            loop.run_in_executor(None, lambda: _fetch_yahoo_rss(ticker)),
            loop.run_in_executor(None, lambda: _fetch_price_momentum(ticker)),
        )

        # Build headlines block
        if news_items:
            headlines_block = "\n".join(
                f"- [{item['publisher']}] {item['title']}" for item in news_items
            )
        else:
            headlines_block = "No recent news headlines found."

        # Momentum description
        momentum_direction = "up" if pct_change_5d > 0 else "down"
        volume_note = (
            "elevated volume" if vol_ratio > 1.2
            else "below-average volume" if vol_ratio < 0.8
            else "normal volume"
        )

        sentiment_summary = (
            f"Ticker: {ticker} | Date: {trade_date}\n"
            f"Current Price: {current_price:.2f}\n"
            f"5-Day Price Momentum: {pct_change_5d:+.2f}% ({momentum_direction})\n"
            f"Volume vs 5-Day Avg: {vol_ratio:.2f}x ({volume_note})\n"
            f"Recent News Headlines ({len(news_items)} items):\n"
            f"{headlines_block}"
        )

        if callback:
            await callback(AnalysisProgress(
                stage="sentiment_analyst",
                message="Running LLM sentiment analysis...",
                progress_pct=15.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        custom_prompt = (state.get("custom_prompts") or {}).get("sentiment_analyst", "")
        prompt = lang_prefix + (
            f"You are a market sentiment analysis expert. Analyze the following data combining "
            f"recent news headlines and price momentum signals.\n\n"
            f"{sentiment_summary}\n\n"
            f"Based on the price momentum ({pct_change_5d:+.2f}% over 5 days with {volume_note}), "
            f"the tone of the recent headlines, and overall market context, determine if the sentiment "
            f"signal is bullish, bearish, or neutral. Provide key evidence and identify key risks."
        )
        if custom_prompt:
            prompt += f"\n\nAdditional instructions: {custom_prompt}"

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
            analyst_type="sentiment",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="sentiment",
            summary=f"Sentiment analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="sentiment_analyst",
            message="Sentiment analysis complete.",
            progress_pct=20.0,
        ))

    return {"sentiment_report": report}

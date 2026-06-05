import asyncio
from typing import Any
import numpy as np
import pandas as pd
import yfinance as yf

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


def _compute_rsi(closes: pd.Series, period: int = 14) -> float:
    delta = closes.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1]) if not rsi.empty else 50.0


def _compute_macd(closes: pd.Series):
    ema12 = closes.ewm(span=12, adjust=False).mean()
    ema26 = closes.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return float(macd.iloc[-1]), float(signal.iloc[-1])


def _compute_bollinger(closes: pd.Series, period: int = 20):
    sma = closes.rolling(period).mean()
    std = closes.rolling(period).std()
    upper = sma + 2 * std
    lower = sma - 2 * std
    price = closes.iloc[-1]
    return float(upper.iloc[-1]), float(sma.iloc[-1]), float(lower.iloc[-1]), float(price)


async def market_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="market_analyst",
            message=f"Fetching OHLCV data for {ticker}...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()
        hist = await loop.run_in_executor(
            None,
            lambda: yf.Ticker(ticker).history(period="6mo"),
        )

        if hist.empty:
            raise ValueError(f"No price data for {ticker}")

        closes = hist["Close"]
        rsi = _compute_rsi(closes)
        macd_val, macd_signal = _compute_macd(closes)
        bb_upper, bb_mid, bb_lower, price = _compute_bollinger(closes)

        technicals_summary = (
            f"Ticker: {ticker} | Date: {trade_date}\n"
            f"Current Price: {price:.2f}\n"
            f"RSI(14): {rsi:.1f}\n"
            f"MACD: {macd_val:.4f}, Signal: {macd_signal:.4f}\n"
            f"Bollinger Bands: Upper={bb_upper:.2f}, Mid={bb_mid:.2f}, Lower={bb_lower:.2f}\n"
            f"Price vs BB: {'above upper' if price > bb_upper else 'below lower' if price < bb_lower else 'within bands'}"
        )

        if callback:
            await callback(AnalysisProgress(
                stage="market_analyst",
                message="Running LLM analysis on technical indicators...",
                progress_pct=10.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        custom_prompt = (state.get("custom_prompts") or {}).get("market_analyst", "")
        prompt = lang_prefix + (
            f"You are a technical analysis expert. Analyze the following market data and produce a structured report.\n\n"
            f"{technicals_summary}\n\n"
            f"Based on RSI, MACD, and Bollinger Bands, determine if the signal is bullish, bearish, or neutral. "
            f"Provide key evidence from the indicators and identify key risks."
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

        # Ensure analyst_type is set correctly
        report = AnalystReport(
            analyst_type="market",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="market",
            summary=f"Market analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="market_analyst",
            message="Market analysis complete.",
            progress_pct=20.0,
        ))

    return {"market_report": report}

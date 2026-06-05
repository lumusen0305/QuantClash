import asyncio
import yfinance as yf

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


async def fundamentals_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="fundamentals_analyst",
            message=f"Fetching fundamentals for {ticker}...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()

        def _fetch():
            t = yf.Ticker(ticker)
            info = t.info
            try:
                financials = t.financials
            except Exception:
                financials = None
            try:
                balance_sheet = t.balance_sheet
            except Exception:
                balance_sheet = None
            return info, financials, balance_sheet

        info, financials, balance_sheet = await loop.run_in_executor(None, _fetch)

        pe = info.get("trailingPE", "N/A")
        eps = info.get("trailingEps", "N/A")
        revenue = info.get("totalRevenue", "N/A")
        profit_margin = info.get("profitMargins", "N/A")
        gross_margin = info.get("grossMargins", "N/A")
        debt_to_equity = info.get("debtToEquity", "N/A")
        market_cap = info.get("marketCap", "N/A")
        beta = info.get("beta", "N/A")
        sector = info.get("sector", "N/A")
        industry = info.get("industry", "N/A")
        fwd_pe = info.get("forwardPE", "N/A")
        rev_growth = info.get("revenueGrowth", "N/A")
        peg = info.get("trailingPegRatio") or info.get("pegRatio") or "N/A"  # growth-adjusted P/E
        # Sell-side analyst consensus target vs price — a documented signal
        cur = info.get("currentPrice") or info.get("regularMarketPrice")
        tgt_mean = info.get("targetMeanPrice")
        upside = None
        if isinstance(cur, (int, float)) and isinstance(tgt_mean, (int, float)) and cur > 0:
            upside = (tgt_mean - cur) / cur

        fundamentals_summary = (
            f"Ticker: {ticker} | Date: {trade_date}\n"
            f"Sector: {sector} | Industry: {industry}\n"
            f"Market Cap: {market_cap}\n"
            f"Beta: {beta}\n"
            f"P/E Ratio (trailing): {pe} | Forward P/E: {fwd_pe} | PEG: {peg}\n"
            f"EPS (trailing): {eps}\n"
            f"Total Revenue: {revenue} | Revenue growth: {rev_growth}\n"
            f"Profit Margin: {profit_margin}\n"
            f"Gross Margin: {gross_margin}\n"
            f"Debt/Equity: {debt_to_equity}\n"
            + (f"Analyst consensus target: {tgt_mean} ({upside:+.1%} vs price) — sell-side view\n"
               if upside is not None else "")
        )

        if financials is not None and not financials.empty:
            try:
                latest_col = financials.columns[0]
                total_revenue_row = financials.loc["Total Revenue", latest_col] if "Total Revenue" in financials.index else "N/A"
                fundamentals_summary += f"Latest Annual Revenue: {total_revenue_row}\n"
            except Exception:
                pass

        if callback:
            await callback(AnalysisProgress(
                stage="fundamentals_analyst",
                message="Running LLM fundamentals analysis...",
                progress_pct=15.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a fundamental analysis expert. Analyze the following company fundamentals and produce a structured report.\n\n"
            f"{fundamentals_summary}\n\n"
            f"Based on P/E ratio, EPS, revenue, and margins, determine if the fundamental signal is bullish, bearish, or neutral. "
            f"Provide key evidence and identify key risks."
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
            analyst_type="fundamentals",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="fundamentals",
            summary=f"Fundamentals analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="fundamentals_analyst",
            message="Fundamentals analysis complete.",
            progress_pct=20.0,
        ))

    return {"fundamentals_report": report}

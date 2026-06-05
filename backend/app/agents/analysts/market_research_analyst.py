import asyncio
import yfinance as yf

from app.agents.schemas import AnalysisState, AnalystReport, AnalysisProgress
from app.agents.llm_router import get_llm, get_language_instruction, mark_gemini_failed


# Watchlist for hot stock scanning (top large/mid caps + high-momentum names)
SCAN_WATCHLIST = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "JNJ", "WMT", "PG", "MA", "HD", "XOM", "CVX",
    "ABBV", "KO", "PEP", "MRK", "COST", "AVGO", "LLY", "TMO", "MCD",
    "CSCO", "ACN", "ABT", "DHR", "NKE", "TXN", "ORCL", "AMD", "INTC",
    "CRM", "NFLX", "DIS", "PYPL", "ADBE", "QCOM", "IBM", "GS", "BA",
    "CAT", "GE", "RTX", "XYZ", "PLTR", "COIN", "RIVN", "SOFI",
]

# Sector ETFs for heat map
SECTOR_ETFS = {
    "XLK": "Technology",
    "XLV": "Healthcare",
    "XLF": "Financials",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLE": "Energy",
    "XLI": "Industrials",
    "XLB": "Materials",
    "XLU": "Utilities",
    "XLRE": "Real Estate",
    "XLC": "Communication",
}


def _fetch_hot_stocks() -> tuple[list[dict], list[dict]]:
    """Fetch movers data and return (top_gainers, most_active) — each top 10."""
    tickers = yf.Tickers(" ".join(SCAN_WATCHLIST))
    results = []
    for symbol in SCAN_WATCHLIST:
        try:
            hist = tickers.tickers[symbol].history(period="2d")
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                curr = float(hist["Close"].iloc[-1])
                change_pct = ((curr - prev) / prev) * 100 if prev != 0 else 0.0
                volume = int(hist["Volume"].iloc[-1])
                results.append({
                    "ticker": symbol,
                    "price": round(curr, 2),
                    "change_pct": round(change_pct, 2),
                    "volume": volume,
                })
        except Exception:
            pass

    top_gainers = sorted(results, key=lambda x: x["change_pct"], reverse=True)[:10]
    most_active = sorted(results, key=lambda x: x["volume"], reverse=True)[:10]
    return top_gainers, most_active


def _fetch_sector_performance() -> list[dict]:
    """Fetch daily performance for major sector ETFs."""
    symbols = list(SECTOR_ETFS.keys())
    tickers = yf.Tickers(" ".join(symbols))
    results = []
    for symbol in symbols:
        try:
            hist = tickers.tickers[symbol].history(period="2d")
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                curr = float(hist["Close"].iloc[-1])
                change_pct = ((curr - prev) / prev) * 100 if prev != 0 else 0.0
                results.append({
                    "ticker": symbol,
                    "sector": SECTOR_ETFS[symbol],
                    "price": round(curr, 2),
                    "change_pct": round(change_pct, 2),
                })
        except Exception:
            pass
    # Sort hottest sectors first
    return sorted(results, key=lambda x: x["change_pct"], reverse=True)


def _fetch_ticker_sector(ticker: str) -> str:
    """Attempt to get the sector for a given ticker."""
    try:
        info = yf.Ticker(ticker).info
        sector = info.get("sector", "")
        industry = info.get("industry", "")
        if sector:
            return f"{sector}" + (f" / {industry}" if industry else "")
    except Exception:
        pass
    return "Unknown"


async def market_research_analyst_node(state: AnalysisState) -> dict:
    ticker = state["ticker"]
    trade_date = state["trade_date"]
    user_tier = state["user_tier"]
    callback = state.get("progress_callback")

    if callback:
        await callback(AnalysisProgress(
            stage="market_research_analyst",
            message="Scanning hot stocks, sector heat, and market trends...",
            progress_pct=5.0,
        ))

    try:
        loop = asyncio.get_event_loop()

        # Fetch hot stocks, sector data, and ticker sector info in parallel
        hot_stocks_future = loop.run_in_executor(None, _fetch_hot_stocks)
        sector_future = loop.run_in_executor(None, _fetch_sector_performance)
        ticker_sector_future = loop.run_in_executor(None, _fetch_ticker_sector, ticker)

        (top_gainers, most_active), sector_data, ticker_sector = await asyncio.gather(
            hot_stocks_future, sector_future, ticker_sector_future
        )

        # Format hot stocks section
        gainers_lines = [
            f"  {i+1}. {s['ticker']}: {s['change_pct']:+.2f}% @ ${s['price']}"
            for i, s in enumerate(top_gainers)
        ]
        active_lines = [
            f"  {i+1}. {s['ticker']}: vol {s['volume']:,} ({s['change_pct']:+.2f}%)"
            for i, s in enumerate(most_active)
        ]

        # Format sector heat
        sector_lines = [
            f"  {s['sector']} ({s['ticker']}): {s['change_pct']:+.2f}%"
            for s in sector_data
        ]

        # Find whether target ticker is in hot lists
        hot_tickers = {s["ticker"] for s in top_gainers} | {s["ticker"] for s in most_active}
        ticker_in_hot = ticker.upper() in hot_tickers
        ticker_hot_status = (
            f"{ticker} IS among today's hot/active stocks." if ticker_in_hot
            else f"{ticker} is NOT currently in the top-gainers or most-active list."
        )

        # Find matching sector performance for target ticker
        ticker_sector_perf = "N/A"
        for s in sector_data:
            if ticker_sector and s["sector"].lower() in ticker_sector.lower():
                ticker_sector_perf = f"{s['sector']} ETF ({s['ticker']}): {s['change_pct']:+.2f}%"
                break

        context = (
            f"Target Stock: {ticker} | Sector: {ticker_sector} | Date: {trade_date}\n\n"
            f"=== TODAY'S TOP GAINERS (by % change) ===\n" + "\n".join(gainers_lines) + "\n\n"
            f"=== MOST ACTIVE STOCKS (by volume) ===\n" + "\n".join(active_lines) + "\n\n"
            f"=== SECTOR HEAT (sorted hottest first) ===\n" + "\n".join(sector_lines) + "\n\n"
            f"=== TARGET TICKER MARKET STATUS ===\n"
            f"  Ticker sector: {ticker_sector}\n"
            f"  Sector ETF performance: {ticker_sector_perf}\n"
            f"  {ticker_hot_status}"
        )

        if callback:
            await callback(AnalysisProgress(
                stage="market_research_analyst",
                message="Running LLM market research analysis...",
                progress_pct=10.0,
            ))

        llm = get_llm(user_tier, "quick")
        structured_llm = llm.with_structured_output(AnalystReport)

        lang_prefix = get_language_instruction(state.get("language"))
        prompt = lang_prefix + (
            f"You are a market research analyst specializing in market hotness and sector rotation. "
            f"Analyze the current market environment and assess whether {ticker} is in-favor or out-of-favor.\n\n"
            f"{context}\n\n"
            f"Consider:\n"
            f"1. Which sectors are hot today and whether {ticker}'s sector is leading or lagging\n"
            f"2. Whether {ticker} is among the top gainers or most active stocks\n"
            f"3. Capital rotation patterns — where money is flowing today\n"
            f"4. Hot alternative stocks in similar or adjacent sectors that traders might prefer over {ticker}\n"
            f"5. Overall market breadth signals from the gainer/active lists\n"
            f"6. Whether the current market hotness profile favors a trade in {ticker}\n\n"
            f"In key_evidence, list hot alternative stocks that are outperforming {ticker} today "
            f"(with tickers and % changes). "
            f"Signal should be bullish if {ticker} is in-favor, bearish if money is rotating away, neutral if mixed. "
            f"Provide confidence based on strength of sector and stock momentum signals."
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
            analyst_type="market_research",
            summary=report.summary,
            signal=report.signal,
            confidence=report.confidence,
            key_evidence=report.key_evidence,
            key_risks=report.key_risks,
        )

    except Exception as e:
        report = AnalystReport(
            analyst_type="market_research",
            summary=f"Market research analysis failed: {e}",
            signal="neutral",
            confidence=0.1,
            key_evidence=[],
            key_risks=[str(e)],
        )

    if callback:
        await callback(AnalysisProgress(
            stage="market_research_analyst",
            message="Market research analysis complete.",
            progress_pct=20.0,
        ))

    return {"market_research_report": report}

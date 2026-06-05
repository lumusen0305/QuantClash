import yfinance as yf
from datetime import datetime, timedelta

def get_ohlcv(ticker: str, period: str = "3mo") -> dict:
    """Get OHLCV data for technical analysis."""
    stock = yf.Ticker(ticker)
    hist = stock.history(period=period)
    return {
        "ticker": ticker,
        "data": hist.reset_index().to_dict(orient="records"),
    }

def get_stock_info(ticker: str) -> dict:
    """Get stock fundamentals."""
    stock = yf.Ticker(ticker)
    return stock.info

def get_financials(ticker: str) -> dict:
    stock = yf.Ticker(ticker)
    return {
        "income": stock.financials.to_dict() if not stock.financials.empty else {},
        "balance": stock.balance_sheet.to_dict() if not stock.balance_sheet.empty else {},
        "cashflow": stock.cashflow.to_dict() if not stock.cashflow.empty else {},
    }

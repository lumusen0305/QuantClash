import asyncio
import json
import yfinance as yf
import redis.asyncio as aioredis
from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

WATCHLIST = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "JNJ", "WMT", "PG", "MA", "HD", "XOM", "CVX",
    "ABBV", "KO", "PEP", "MRK", "COST", "AVGO", "LLY", "TMO", "MCD",
    "CSCO", "ACN", "ABT", "DHR", "NKE", "TXN", "ORCL", "AMD", "INTC",
    "CRM", "NFLX", "DIS", "PYPL", "ADBE", "QCOM", "IBM", "GS", "BA",
    "CAT", "GE", "RTX", "XYZ", "PLTR", "COIN", "RIVN", "SOFI",
]

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

TRENDING_TICKERS = [
    "NVDA", "TSLA", "AMD", "AAPL", "MSFT", "META", "GOOGL", "AMZN",
    "PLTR", "COIN", "RIVN", "SOFI", "XYZ", "NFLX", "DIS",
]

CACHE_TTL = 300  # 5 minutes


async def _get_redis():
    return aioredis.from_url(settings.REDIS_URL)


async def _cache_get(key: str):
    r = await _get_redis()
    data = await r.get(key)
    return json.loads(data) if data else None


async def _cache_set(key: str, value, ttl: int = CACHE_TTL):
    r = await _get_redis()
    await r.setex(key, ttl, json.dumps(value))


def _fetch_movers():
    tickers = yf.Tickers(" ".join(WATCHLIST))
    results = []
    for symbol in WATCHLIST:
        try:
            hist = tickers.tickers[symbol].history(period="2d")
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                curr = float(hist["Close"].iloc[-1])
                change = curr - prev
                change_pct = (change / prev) * 100
                results.append({
                    "ticker": symbol,
                    "price": round(curr, 2),
                    "change": round(change, 2),
                    "change_pct": round(change_pct, 2),
                    "volume": int(hist["Volume"].iloc[-1]),
                })
        except Exception:
            pass
    return results


def _fetch_sector_data():
    symbols = list(SECTOR_ETFS.keys())
    tickers = yf.Tickers(" ".join(symbols))
    results = []
    for symbol in symbols:
        try:
            hist = tickers.tickers[symbol].history(period="2d")
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                curr = float(hist["Close"].iloc[-1])
                change_pct = ((curr - prev) / prev) * 100
                results.append({
                    "ticker": symbol,
                    "sector": SECTOR_ETFS[symbol],
                    "price": round(curr, 2),
                    "change_pct": round(change_pct, 2),
                })
        except Exception:
            pass
    return results


def _fetch_trending_data():
    tickers = yf.Tickers(" ".join(TRENDING_TICKERS))
    results = []
    for symbol in TRENDING_TICKERS:
        try:
            hist = tickers.tickers[symbol].history(period="2d")
            if len(hist) >= 2:
                prev = float(hist["Close"].iloc[-2])
                curr = float(hist["Close"].iloc[-1])
                change_pct = ((curr - prev) / prev) * 100
                results.append({
                    "ticker": symbol,
                    "price": round(curr, 2),
                    "change_pct": round(change_pct, 2),
                })
            elif len(hist) == 1:
                curr = float(hist["Close"].iloc[-1])
                results.append({
                    "ticker": symbol,
                    "price": round(curr, 2),
                    "change_pct": 0.0,
                })
        except Exception:
            pass
    return results


@router.get("/movers")
async def market_movers():
    """Return top gainers, losers, and most active stocks from the watchlist."""
    cache_key = "discovery:movers"
    cached = await _cache_get(cache_key)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _fetch_movers)
    except Exception:
        data = []

    gainers = sorted(data, key=lambda x: x["change_pct"], reverse=True)[:10]
    losers = sorted(data, key=lambda x: x["change_pct"])[:10]
    most_active = sorted(data, key=lambda x: x["volume"], reverse=True)[:10]

    result = {"gainers": gainers, "losers": losers, "most_active": most_active}
    try:
        await _cache_set(cache_key, result)
    except Exception:
        pass
    return result


@router.get("/sectors")
async def sector_performance():
    """Return daily performance for major sector ETFs."""
    cache_key = "discovery:sectors"
    cached = await _cache_get(cache_key)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _fetch_sector_data)
    except Exception:
        data = []

    result = {"sectors": data}
    try:
        await _cache_set(cache_key, result)
    except Exception:
        pass
    return result


@router.get("/trending")
async def trending_stocks():
    """Return a curated list of popular/high-activity stocks with daily change."""
    cache_key = "discovery:trending"
    cached = await _cache_get(cache_key)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _fetch_trending_data)
    except Exception:
        data = []

    result = {"trending": data}
    try:
        await _cache_set(cache_key, result)
    except Exception:
        pass
    return result

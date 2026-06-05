from fastapi import APIRouter, HTTPException
import asyncio
import json
import httpx
import xml.etree.ElementTree as ET
import yfinance as yf
from app.core.config import settings

try:
    import redis.asyncio as aioredis
    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _redis = None

router = APIRouter()

TD_BASE = "https://api.twelvedata.com"

# period -> yfinance (period, interval)
YF_PERIOD_MAP = {
    "1d": ("1d", "5m"),
    "1w": ("5d", "1h"),
    "1m": ("1mo", "1d"),
    "3m": ("3mo", "1d"),
    "1y": ("1y", "1d"),
}


async def _cache_get(key: str):
    if not _redis:
        return None
    try:
        raw = await _redis.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def _cache_set(key: str, value, ttl: int):
    if not _redis:
        return
    try:
        await _redis.setex(key, ttl, json.dumps(value))
    except Exception:
        pass


async def _td(path: str, params: dict) -> dict:
    params["apikey"] = settings.TWELVE_DATA_API_KEY
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{TD_BASE}{path}", params=params)
        r.raise_for_status()
        data = r.json()
    if isinstance(data, dict) and data.get("status") == "error":
        raise ValueError(data.get("message", "Twelve Data error"))
    return data


def _yf_search(q: str) -> list[dict]:
    """Search tickers via yfinance, deduped. Falls back to validating the raw
    query as a direct ticker so an exact symbol always resolves."""
    results: list[dict] = []
    seen: set[str] = set()
    try:
        s = yf.Search(q, max_results=10)
        for item in (s.quotes or []):
            sym = (item.get("symbol") or "").upper()
            if not sym or sym in seen:
                continue
            seen.add(sym)
            results.append({
                "symbol": sym,
                "description": item.get("shortname") or item.get("longname") or "",
                "type": item.get("quoteType", ""),
                "exchange": item.get("exchange", ""),
            })
    except Exception:
        pass

    # Fallback: treat the query itself as a ticker if nothing matched
    if not results:
        sym = q.strip().upper()
        if sym and " " not in sym and len(sym) <= 6:
            try:
                hist = yf.Ticker(sym).history(period="1d")
                if not hist.empty:
                    results.append({"symbol": sym, "description": sym, "type": "EQUITY", "exchange": ""})
            except Exception:
                pass
    return results[:8]


@router.get("/search")
async def search_stocks(q: str):
    q = (q or "").strip()
    if not q:
        return {"results": []}
    cache_key = f"search:{q.lower()}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return {"results": cached}
    try:
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, lambda: _yf_search(q))
        await _cache_set(cache_key, results, 600)  # 10min cache
        return {"results": results}
    except Exception:
        return {"results": []}


def _yf_quote(ticker: str) -> dict:
    tk = yf.Ticker(ticker)
    hist = tk.history(period="2d")
    if hist.empty:
        raise ValueError(f"No data for {ticker}")
    curr = float(hist["Close"].iloc[-1])
    prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else float(hist["Open"].iloc[-1])
    change = curr - prev
    change_pct = (change / prev * 100) if prev else 0.0
    name = ticker
    try:
        name = tk.info.get("shortName") or tk.info.get("longName") or ticker
    except Exception:
        pass
    return {
        "ticker": ticker,
        "price": round(curr, 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "high": round(float(hist["High"].iloc[-1]), 2),
        "low": round(float(hist["Low"].iloc[-1]), 2),
        "open": round(float(hist["Open"].iloc[-1]), 2),
        "prev_close": round(prev, 2),
        "name": name,
    }


async def _finnhub_quote(sym: str) -> dict:
    """Fallback quote via Finnhub (used when yfinance fails)."""
    if not settings.FINNHUB_API_KEY:
        raise ValueError("No Finnhub key for fallback")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": sym, "token": settings.FINNHUB_API_KEY},
        )
        r.raise_for_status()
        d = r.json()
    curr = d.get("c")
    prev = d.get("pc")
    if not curr:
        raise ValueError(f"No Finnhub data for {sym}")
    change = (curr - prev) if prev else 0.0
    change_pct = (change / prev * 100) if prev else 0.0
    return {
        "ticker": sym,
        "price": round(float(curr), 2),
        "change": round(float(change), 2),
        "change_pct": round(float(change_pct), 2),
        "high": round(float(d.get("h") or curr), 2),
        "low": round(float(d.get("l") or curr), 2),
        "open": round(float(d.get("o") or curr), 2),
        "prev_close": round(float(prev or curr), 2),
        "name": sym,
        "source": "finnhub",
    }


@router.get("/{ticker}/quote")
async def stock_quote(ticker: str):
    sym = ticker.upper()
    cache_key = f"quote:{sym}"
    cached = await _cache_get(cache_key)
    if cached:
        return cached
    # Primary: yfinance
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: _yf_quote(sym))
        await _cache_set(cache_key, result, 60)  # 60s cache
        return result
    except Exception:
        pass
    # Fallback: Finnhub
    try:
        result = await _finnhub_quote(sym)
        await _cache_set(cache_key, result, 60)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"All quote sources failed for {sym}: {e}")


@router.get("/{ticker}/news")
async def stock_news(ticker: str):
    """Get news via Yahoo Finance RSS (free, no auth required)."""
    try:
        rss_url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker.upper()}&region=US&lang=en-US"
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(rss_url)
        # Parse RSS XML
        root = ET.fromstring(r.text)
        channel = root.find("channel")
        items = channel.findall("item") if channel is not None else []
        news = [
            {
                "title": (item.findtext("title") or "").strip(),
                "source": (item.findtext("source") or "Yahoo Finance").strip(),
                "url": (item.findtext("link") or "").strip(),
                "summary": (item.findtext("description") or "").strip(),
                "published_at": (item.findtext("pubDate") or "").strip(),
            }
            for item in items[:10]
        ]
        return {"ticker": ticker.upper(), "news": news}
    except Exception:
        return {"ticker": ticker.upper(), "news": []}


def _yf_ohlcv(ticker: str, period: str) -> list[dict]:
    yf_period, interval = YF_PERIOD_MAP.get(period, ("3mo", "1d"))
    hist = yf.Ticker(ticker).history(period=yf_period, interval=interval)
    if hist.empty:
        raise ValueError(f"No data for {ticker}")
    intraday = interval.endswith("m") or interval.endswith("h")
    records = []
    for idx, row in hist.iterrows():
        date_str = idx.strftime("%Y-%m-%d %H:%M:%S") if intraday else idx.strftime("%Y-%m-%d")
        records.append({
            "date": date_str,
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })
    return records


def _stooq_ohlcv(ticker: str, period: str) -> list[dict]:
    """Fallback daily OHLCV via Stooq (free CSV). Daily bars only."""
    import csv
    import io
    import urllib.request

    sym = ticker.lower()
    if "." not in sym:
        sym = f"{sym}.us"
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    with urllib.request.urlopen(url, timeout=10) as resp:
        text = resp.read().decode("utf-8")
    reader = list(csv.DictReader(io.StringIO(text)))
    if not reader or "Close" not in (reader[0] if reader else {}):
        raise ValueError(f"No Stooq data for {ticker}")
    # Trim to the requested window
    days = {"1d": 2, "1w": 7, "1m": 31, "3m": 95, "1y": 370}.get(period, 95)
    rows = reader[-days:]
    out = []
    for row in rows:
        try:
            out.append({
                "date": row["Date"],
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(float(row.get("Volume") or 0)),
            })
        except (ValueError, KeyError):
            continue
    if not out:
        raise ValueError(f"No usable Stooq rows for {ticker}")
    return out


@router.get("/{ticker}/ohlcv")
async def stock_ohlcv(ticker: str, period: str = "3m"):
    sym = ticker.upper()
    cache_key = f"ohlcv:{sym}:{period}"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return {"ticker": sym, "data": cached}
    loop = asyncio.get_event_loop()
    # Primary: yfinance
    try:
        records = await loop.run_in_executor(None, lambda: _yf_ohlcv(sym, period))
        await _cache_set(cache_key, records, 300)  # 5min cache
        return {"ticker": sym, "data": records}
    except Exception:
        pass
    # Fallback: Stooq (daily only)
    try:
        records = await loop.run_in_executor(None, lambda: _stooq_ohlcv(sym, period))
        await _cache_set(cache_key, records, 300)
        return {"ticker": sym, "data": records}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"All OHLCV sources failed for {sym}: {e}")

"""Stock screener — filter a universe by technical/price metrics.

Uses a single batched yfinance download (no per-ticker .info calls) to stay
fast and avoid rate limits. Results cached in Redis for 5 minutes.
"""
import asyncio
import json
from typing import Optional, List

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.api.discovery import WATCHLIST as UNIVERSE

try:
    import redis.asyncio as aioredis
    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception:
    _redis = None

router = APIRouter()


def _compute_metrics() -> List[dict]:
    import yfinance as yf

    tickers = " ".join(UNIVERSE)
    data = yf.download(tickers, period="6mo", group_by="ticker", progress=False, threads=True)
    rows = []
    for sym in UNIVERSE:
        try:
            df = data[sym].dropna()
            if len(df) < 30:
                continue
            closes = df["Close"]
            last = float(closes.iloc[-1])

            def chg(n):
                if len(closes) <= n:
                    return None
                base = float(closes.iloc[-1 - n])
                return round((last - base) / base * 100, 2) if base else None

            hi = float(closes.max())
            lo = float(closes.min())
            sma20 = float(closes.iloc[-20:].mean())
            sma50 = float(closes.iloc[-50:].mean()) if len(closes) >= 50 else sma20
            vol = int(df["Volume"].iloc[-1])
            avg_vol = float(df["Volume"].iloc[-20:].mean())

            rows.append({
                "ticker": sym,
                "price": round(last, 2),
                "chg_1d": chg(1),
                "chg_1w": chg(5),
                "chg_1m": chg(21),
                "chg_3m": chg(63),
                "from_high_pct": round((last - hi) / hi * 100, 2) if hi else None,
                "from_low_pct": round((last - lo) / lo * 100, 2) if lo else None,
                "above_sma20": last > sma20,
                "above_sma50": last > sma50,
                "rel_volume": round(vol / avg_vol, 2) if avg_vol else None,
            })
        except Exception:
            continue
    return rows


async def _metrics_cached() -> List[dict]:
    key = "screener:metrics"
    if _redis:
        try:
            raw = await _redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    loop = asyncio.get_event_loop()
    rows = await loop.run_in_executor(None, _compute_metrics)
    if _redis:
        try:
            await _redis.setex(key, 300, json.dumps(rows))
        except Exception:
            pass
    return rows


class ScreenFilters(BaseModel):
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_chg_1d: Optional[float] = None
    min_chg_1w: Optional[float] = None
    min_chg_1m: Optional[float] = None
    above_sma20: Optional[bool] = None
    above_sma50: Optional[bool] = None
    min_rel_volume: Optional[float] = None
    near_high: Optional[bool] = None      # within 5% of 6mo high
    sort_by: str = "chg_1m"
    desc: bool = True
    limit: int = 30


@router.post("/screen")
async def screen(f: ScreenFilters):
    rows = await _metrics_cached()
    out = []
    for r in rows:
        if f.min_price is not None and (r["price"] is None or r["price"] < f.min_price):
            continue
        if f.max_price is not None and (r["price"] is None or r["price"] > f.max_price):
            continue
        if f.min_chg_1d is not None and (r["chg_1d"] is None or r["chg_1d"] < f.min_chg_1d):
            continue
        if f.min_chg_1w is not None and (r["chg_1w"] is None or r["chg_1w"] < f.min_chg_1w):
            continue
        if f.min_chg_1m is not None and (r["chg_1m"] is None or r["chg_1m"] < f.min_chg_1m):
            continue
        if f.above_sma20 is not None and r["above_sma20"] != f.above_sma20:
            continue
        if f.above_sma50 is not None and r["above_sma50"] != f.above_sma50:
            continue
        if f.min_rel_volume is not None and (r["rel_volume"] is None or r["rel_volume"] < f.min_rel_volume):
            continue
        if f.near_high and (r["from_high_pct"] is None or r["from_high_pct"] < -5):
            continue
        out.append(r)

    key = f.sort_by if f.sort_by in (rows[0].keys() if rows else []) else "chg_1m"
    out.sort(key=lambda x: (x.get(key) is None, x.get(key) or 0), reverse=f.desc)
    return {"count": len(out), "results": out[: f.limit]}


@router.get("/fields")
async def fields():
    return {
        "sortable": ["chg_1d", "chg_1w", "chg_1m", "chg_3m", "price", "rel_volume", "from_high_pct"],
        "universe_size": len(UNIVERSE),
    }


# ─── Multi-factor composite screener (Value / Momentum / Quality / Low-Vol) ──

class FactorScreenRequest(BaseModel):
    tickers: Optional[List[str]] = None   # defaults to the universe watchlist
    weights: Optional[dict] = None        # override FACTOR_WEIGHTS
    limit: int = 20                       # top-N to return


@router.post("/factors")
async def factor_screen(req: FactorScreenRequest):
    """Rank stocks by a weighted Value+Momentum+Quality+Low-Vol composite.

    Returns {ranked:[{rank, ticker, composite, factors, raw}], weights}.
    """
    from app.data.factors import screen as factor_screen_fn, FACTOR_WEIGHTS

    universe = [t.upper() for t in (req.tickers or UNIVERSE) if t][:60]
    cache_key = None
    if _redis and not req.tickers and not req.weights:
        cache_key = "screener:factors:default"
        try:
            cached = await _redis.get(cache_key)
            if cached:
                data = json.loads(cached)
                return {"ranked": data[: req.limit], "weights": FACTOR_WEIGHTS, "cached": True}
        except Exception:
            pass

    loop = asyncio.get_event_loop()
    ranked = await loop.run_in_executor(
        None, lambda: factor_screen_fn(universe, req.weights)
    )
    if cache_key and ranked:
        try:
            await _redis.set(cache_key, json.dumps(ranked), ex=1800)  # 30 min
        except Exception:
            pass
    return {
        "ranked": ranked[: req.limit],
        "weights": req.weights or FACTOR_WEIGHTS,
        "count": len(ranked),
    }

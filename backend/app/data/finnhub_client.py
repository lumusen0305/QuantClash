import finnhub
import asyncio
import json
import websockets
import redis.asyncio as aioredis
from app.core.config import settings

client = finnhub.Client(api_key=settings.FINNHUB_API_KEY)

def search_symbols(query: str) -> list[dict]:
    """Search for stock symbols."""
    result = client.symbol_lookup(query)
    return result.get("result", [])[:10]

def get_quote(ticker: str) -> dict:
    """Get real-time quote."""
    return client.quote(ticker)

def get_company_news(ticker: str, from_date: str, to_date: str) -> list[dict]:
    """Get company news."""
    return client.company_news(ticker, _from=from_date, to=to_date)[:20]

async def start_quote_streamer(symbols: list[str], redis_url: str):
    """
    Connect to Finnhub WebSocket and publish quotes to Redis.
    Each message published to Redis channel: "quote:{symbol}"
    """
    redis = aioredis.from_url(redis_url)

    async with websockets.connect(
        f"wss://ws.finnhub.io?token={settings.FINNHUB_API_KEY}"
    ) as ws:
        # Subscribe to symbols
        for symbol in symbols:
            await ws.send(json.dumps({"type": "subscribe", "symbol": symbol}))

        async for msg in ws:
            data = json.loads(msg)
            if data.get("type") == "trade" and data.get("data"):
                for trade in data["data"]:
                    symbol = trade.get("s")
                    if symbol:
                        await redis.publish(
                            f"quote:{symbol}",
                            json.dumps({
                                "symbol": symbol,
                                "price": trade.get("p"),
                                "volume": trade.get("v"),
                                "timestamp": trade.get("t"),
                                "type": "quote"
                            })
                        )

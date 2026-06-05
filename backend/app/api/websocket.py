from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import redis.asyncio as aioredis
from app.core.config import settings

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # user_id -> list of WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = {}
        # user_id -> list of subscribed channels
        self.subscriptions: dict[str, set[str]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    async def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            dead = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                self.active_connections[user_id].remove(ws)

manager = ConnectionManager()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(websocket, user_id)
    redis = aioredis.from_url(settings.REDIS_URL)
    pubsub = redis.pubsub()

    # Subscribe to analysis progress channel for this user
    await pubsub.subscribe(f"analysis:{user_id}:*")

    try:
        # Background task: forward Redis messages to WebSocket
        async def redis_listener():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        data = json.loads(message["data"])
                        await manager.send_to_user(user_id, data)
                    except Exception:
                        pass

        listener_task = asyncio.create_task(redis_listener())

        # Handle incoming WebSocket messages (subscribe/unsubscribe to quote channels)
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                if msg.get("action") == "subscribe_quote":
                    ticker = msg.get("ticker", "").upper()
                    await pubsub.subscribe(f"quote:{ticker}")
                elif msg.get("action") == "unsubscribe_quote":
                    ticker = msg.get("ticker", "").upper()
                    await pubsub.unsubscribe(f"quote:{ticker}")
                elif msg.get("action") == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({"type": "heartbeat"})

    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        await pubsub.unsubscribe()
        await redis.aclose()
        await manager.disconnect(websocket, user_id)

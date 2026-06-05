"""LLM usage & cost dashboard endpoints."""
from fastapi import APIRouter

from app.core.usage import usage_summary, reset_usage, PRICING

router = APIRouter()


@router.get("/summary")
async def summary():
    return usage_summary()


@router.get("/pricing")
async def pricing():
    return {"pricing": {m: {"input_per_1m": p[0], "output_per_1m": p[1]} for m, p in PRICING.items()}}


@router.post("/reset")
async def reset():
    reset_usage()
    return {"status": "ok"}

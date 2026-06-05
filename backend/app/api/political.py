"""Political feed endpoints — Trump / Truth Social posts for the macro view."""
from fastapi import APIRouter

from app.data.political import get_trump_posts

router = APIRouter()


@router.get("/trump")
async def trump_posts(limit: int = 12):
    """Latest Trump posts (Truth Social mirror, falls back to news). Cached 30min."""
    data = await get_trump_posts(limit)
    return data

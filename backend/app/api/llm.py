import httpx
from fastapi import APIRouter

from app.core.config import settings
from app.agents.llm_router import is_gemini_available

router = APIRouter()


@router.get("/models")
async def list_models():
    """List available LLM models and their current status."""
    models = []

    # Check Gemini
    if settings.GOOGLE_API_KEY:
        models.append({
            "id": "gemini",
            "name": "Google Gemini",
            "status": "available" if is_gemini_available() else "cooldown",
        })

    # Check Bailian (Alibaba DashScope) — standard + pro tiers
    if settings.ALI_API_KEY:
        models.append({
            "id": "bailian",
            "name": f"阿里百煉 {settings.DASHSCOPE_MODEL}",
            "tier": "standard",
            "status": "available",
        })
        models.append({
            "id": "bailian-pro",
            "name": f"阿里百煉 Pro · {settings.DASHSCOPE_MODEL_PRO}",
            "tier": "pro",
            "status": "available",
        })

    # Check Ollama
    try:
        resp = httpx.get(f"{settings.OLLAMA_URL}/api/tags", timeout=3)
        if resp.status_code == 200:
            for m in resp.json().get("models", []):
                models.append({
                    "id": f"ollama:{m['name']}",
                    "name": f"Ollama {m['name']}",
                    "status": "available",
                })
    except Exception:
        pass

    return {"models": models}

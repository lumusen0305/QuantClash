import time

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from app.core.config import settings

LANGUAGE_INSTRUCTIONS = {
    "zh-TW": "You MUST respond entirely in Traditional Chinese (繁體中文). All summaries, evidence, risks, reasoning, and content fields must be written in Traditional Chinese.",
    "zh-CN": "You MUST respond entirely in Simplified Chinese (简体中文). All summaries, evidence, risks, reasoning, and content fields must be written in Simplified Chinese.",
    "ja": "You MUST respond entirely in Japanese (日本語).",
    "ko": "You MUST respond entirely in Korean (한국어).",
}

# Track Gemini failures with timestamp for cooldown reset
_gemini_failed_at: float | None = None
GEMINI_COOLDOWN = 300  # 5 minutes

# Thread-level model override set before graph execution
_current_model_override: str | None = None


def is_gemini_available() -> bool:
    """Return True if Gemini is available (no recent failure or cooldown expired)."""
    global _gemini_failed_at
    if _gemini_failed_at is None:
        return True
    if time.time() - _gemini_failed_at > GEMINI_COOLDOWN:
        _gemini_failed_at = None  # Reset after cooldown
        return True
    return False


def set_model_override(model: str | None) -> None:
    """Set a module-level model override for the current graph execution."""
    global _current_model_override
    _current_model_override = model


def _callbacks(provider: str, model: str):
    """Build a usage-tracking callback list (best-effort; never fails routing)."""
    try:
        from app.core.usage import UsageCallbackHandler

        return [UsageCallbackHandler(provider, model)]
    except Exception:
        return []


def get_llm(tier: str, mode: str = "deep"):
    """Route to appropriate LLM. Tries Gemini first, falls back to Bailian then Ollama."""
    global _gemini_failed_at

    # Handle explicit model override
    if _current_model_override:
        if _current_model_override == "ollama" or _current_model_override.startswith("ollama:"):
            model_name = (
                _current_model_override.split(":", 1)[1]
                if ":" in _current_model_override
                else settings.OLLAMA_MODEL
            )
            return ChatOllama(
                model=model_name,
                base_url=settings.OLLAMA_URL,
                temperature=0.1,
                callbacks=_callbacks("ollama", model_name),
            )
        elif _current_model_override in ("bailian", "bailian-pro"):
            if not settings.ALI_API_KEY:
                raise ValueError("ALI_API_KEY is not configured")
            model_name = (
                settings.DASHSCOPE_MODEL_PRO
                if _current_model_override == "bailian-pro"
                else settings.DASHSCOPE_MODEL
            )
            return ChatOpenAI(
                model=model_name,
                api_key=settings.ALI_API_KEY,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
                temperature=0.1,
                callbacks=_callbacks("bailian", model_name),
            )
        elif _current_model_override == "gemini":
            if not settings.GOOGLE_API_KEY:
                raise ValueError("GOOGLE_API_KEY is not configured")
            model_name = "gemini-2.0-flash" if mode == "quick" else "gemini-2.5-flash"
            return ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0.1,
                callbacks=_callbacks("gemini", model_name),
            )

    # Default behavior: Gemini with Bailian/Ollama fallback
    if is_gemini_available() and settings.GOOGLE_API_KEY:
        try:
            model_name = "gemini-2.0-flash" if mode == "quick" else "gemini-2.5-flash"
            return ChatGoogleGenerativeAI(
                model=model_name,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0.1,
                callbacks=_callbacks("gemini", model_name),
            )
        except Exception:
            _gemini_failed_at = time.time()

    # Fallback to Alibaba Bailian (qwen-plus via OpenAI-compatible API)
    if settings.ALI_API_KEY:
        return ChatOpenAI(
            model=settings.DASHSCOPE_MODEL,
            api_key=settings.ALI_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            temperature=0.1,
            callbacks=_callbacks("bailian", settings.DASHSCOPE_MODEL),
        )

    # Last resort: Ollama (local GPU)
    return ChatOllama(
        model=settings.OLLAMA_MODEL,
        base_url=settings.OLLAMA_URL,
        temperature=0.1,
        callbacks=_callbacks("ollama", settings.OLLAMA_MODEL),
    )


def mark_gemini_failed():
    """Called by agent nodes when Gemini returns RESOURCE_EXHAUSTED."""
    global _gemini_failed_at
    _gemini_failed_at = time.time()


def get_language_instruction(language: str | None) -> str:
    """Return a prompt prefix instructing the LLM to respond in a specific language."""
    if not language or language == "en":
        return ""
    instruction = LANGUAGE_INSTRUCTIONS.get(language, f"You MUST respond entirely in the language with code '{language}'.")
    return instruction + "\n\n"

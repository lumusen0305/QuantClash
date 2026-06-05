from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/stockapp"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    SECRET_KEY: str = "changeme"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Finnhub
    FINNHUB_API_KEY: str = ""

    # Twelve Data
    TWELVE_DATA_API_KEY: str = ""

    # LLM
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen3:8b"  # local GPU model (Trading-R1's Qwen3 family, reasoning)
    ALI_API_KEY: str = ""
    DASHSCOPE_MODEL: str = "qwen-plus"          # standard tier
    DASHSCOPE_MODEL_PRO: str = "qwen-max"       # pro tier (stronger, pricier)

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Email (SMTP) — for digest reports
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""          # full email address
    SMTP_PASSWORD: str = ""      # app password (Gmail: an app-specific password)
    SMTP_FROM: str = ""          # defaults to SMTP_USER if empty
    SMTP_USE_TLS: bool = True

    # Daily scheduled digest — fixed-time report regardless of triggers
    DAILY_DIGEST_ENABLED: bool = True
    DAILY_DIGEST_HOUR_UTC: int = 13   # 13:00 UTC ≈ 09:00 US-Eastern / 21:00 Taiwan

    class Config:
        env_file = ".env"


settings = Settings()

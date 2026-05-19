from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres.dojoqmvckspijyhffrbn:M.aqibali0520@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
    REDIS_URL: str = "redis://localhost:6379/0"
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_COLLECTION: str = "regulations"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "tradeguard-docs"
    GEMINI_API_KEY: str
    FEATHERLESS_API_KEY: str
    FEATHERLESS_BASE_URL: str = "https://api.featherless.ai/v1"
    SPEECHMATICS_API_KEY: str
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    # Phase 1: External data integrations
    GTA_API_KEY: str = ""
    GTA_BASE_URL: str = "https://api.globaltradealert.org/v1"
    WTO_API_KEY: str = ""
    WTO_BASE_URL: str = "https://api.wto.org/timeseries/v1"
    OS_API_KEY: str = ""
    OS_BASE_URL: str = "https://api.opensanctions.org"
    # Model selection
    GEMINI_PRIMARY_MODEL: str = "gemini-2.0-flash-lite"     # free-tier Gemini
    FEATHERLESS_FALLBACK_MODEL: str = "Qwen/Qwen2.5-72B-Instruct"  # fallback when Gemini fails
    FEATHERLESS_HS_MODEL: str = "meta-llama/Meta-Llama-3.1-8B-Instruct"  # HS code classifier
    # Notifications
    SLACK_WEBHOOK_URL: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "tradeguard@example.com"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
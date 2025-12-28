"""
Document Pipeline Configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "docupload"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_STREAM: str = "ocr_stream"

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

    # File Storage
    FILE_BASE_PATH: str = "/data/files"

    # External APIs
    OPENAI_API_KEY: str = ""
    UPSTAGE_API_KEY: str = ""

    # Slack
    SLACK_WEBHOOK_URL: str = ""

    # Google Sheets
    GOOGLE_SHEETS_ID: str = ""

    # Internal API
    AIMS_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"
    AIMS_API_URL: str = "http://localhost:3010"
    WEBHOOK_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8100


@lru_cache()
def get_settings() -> Settings:
    return Settings()

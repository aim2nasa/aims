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
    ANTHROPIC_API_KEY: str = ""

    # Slack
    SLACK_WEBHOOK_URL: str = ""

    # Google Sheets
    GOOGLE_SHEETS_ID: str = ""

    # Internal API
    AIMS_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"
    AIMS_API_URL: str = "http://localhost:3010"
    WEBHOOK_API_KEY: str = "aims_n8n_webhook_secure_key_2025_v1_a7f3e9d2c1b8"
    INTERNAL_API_KEY: str = "aims-internal-token-logging-key-2024"  # 크레딧 체크 API용

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8100

    # Upload Queue Settings
    UPLOAD_QUEUE_COLLECTION: str = "upload_queue"
    UPLOAD_QUEUE_MAX_CONCURRENT: int = 3
    UPLOAD_QUEUE_MAX_RETRIES: int = 3
    UPLOAD_QUEUE_RETRY_BASE_DELAY: float = 1.0  # 초 단위 (1→2→4 지수 백오프)
    UPLOAD_QUEUE_POLL_INTERVAL: float = 1.0  # 큐 폴링 간격 (초)
    UPLOAD_QUEUE_TEMP_PATH: str = "/data/files/users/temp"  # 임시 파일 저장 경로
    UPLOAD_QUEUE_STALE_TIMEOUT_MINUTES: int = 30  # 타임아웃된 작업 복구
    UPLOAD_QUEUE_ENABLED: bool = True  # 큐잉 활성화 여부 (롤백용)


@lru_cache()
def get_settings() -> Settings:
    return Settings()

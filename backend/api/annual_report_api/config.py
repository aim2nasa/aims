"""
Annual Report API 설정 파일
환경 변수 및 전역 설정 관리
"""
import os
from typing import Optional
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

class Settings:
    """API 설정"""

    # MongoDB 설정
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://tars:27017/")
    DB_NAME: str = os.getenv("DB_NAME", "docupload")
    CUSTOMERS_COLLECTION: str = "customers"
    FILES_COLLECTION: str = "files"

    # OpenAI API 설정
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1")

    # API 설정
    API_TITLE: str = "Annual Report API"
    API_VERSION: str = "1.0.0"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = int(os.getenv("API_PORT", "8081"))

    # CORS 설정
    CORS_ORIGINS: list = [
        "http://localhost:3005",  # Frontend dev server
        "http://localhost:5176",  # Vite dev server
        "http://localhost:5177",  # Vite dev server (alternative port)
        "http://tars.giize.com:3005",
        "*"  # 개발용 - 프로덕션에서는 제거
    ]

    # 파일 경로 설정
    UPLOAD_DIR: str = "/data"  # tars 서버의 업로드 디렉토리

    # 파싱 설정
    PARSING_TIMEOUT: int = 120  # 파싱 타임아웃 (초)
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 최대 파일 크기 (10MB)

# 싱글톤 인스턴스
settings = Settings()

"""
Annual Report API 설정 파일
환경 변수 및 전역 설정 관리
"""
import os
import time
import requests
from typing import Optional
from dotenv import load_dotenv
from version import APP_VERSION, VERSION_INFO

# .env 파일 로드
load_dotenv()

# AI 모델/파서 설정 캐싱
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
_ai_settings_cache = {"model": None, "parser": None, "timestamp": 0}
_AI_SETTINGS_CACHE_TTL = 60  # 1분

def _fetch_ai_settings() -> dict:
    """
    aims_api에서 AI 설정 조회 (내부용)

    Returns:
        {"model": str, "parser": str}
    """
    now = time.time()

    # 캐시 유효성 검사
    if _ai_settings_cache["model"] and (now - _ai_settings_cache["timestamp"]) < _AI_SETTINGS_CACHE_TTL:
        return {
            "model": _ai_settings_cache["model"],
            "parser": _ai_settings_cache["parser"]
        }

    # API에서 조회
    try:
        response = requests.get(f"{AIMS_API_URL}/api/settings/ai-models", timeout=5)
        if response.status_code == 200:
            data = response.json()
            ar_settings = data.get("data", {}).get("annualReport", {})
            model = ar_settings.get("model", "gpt-4.1")
            parser = ar_settings.get("parser", "openai")

            _ai_settings_cache["model"] = model
            _ai_settings_cache["parser"] = parser
            _ai_settings_cache["timestamp"] = now

            return {"model": model, "parser": parser}
    except Exception as e:
        print(f"[AnnualReport] AI 설정 조회 실패: {e}")

    # 실패 시 캐시 또는 기본값
    return {
        "model": _ai_settings_cache.get("model") or "gpt-4.1",
        "parser": _ai_settings_cache.get("parser") or "openai"
    }


def get_annual_report_model() -> str:
    """
    aims_api에서 연보 파싱 모델 설정 조회 (1분 캐싱)

    Returns:
        모델명 (예: "gpt-4.1")
    """
    return _fetch_ai_settings()["model"]


def get_annual_report_parser() -> str:
    """
    aims_api에서 연보 파서 타입 조회 (1분 캐싱)

    Returns:
        파서 타입: "openai" | "pdfplumber" | "upstage"
        기본값: "openai"
    """
    return _fetch_ai_settings()["parser"]

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
    API_VERSION: str = APP_VERSION
    API_VERSION_INFO: dict = VERSION_INFO
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

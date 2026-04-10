"""
Annual Report API 설정 파일
환경 변수 및 전역 설정 관리
"""
import logging
import os
import time
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from version import APP_VERSION, VERSION_INFO

# 🔑 SSoT: .env.shared가 공유 API 키의 Single Source of Truth
# 우선순위: 기존 프로세스 환경변수 > .env.shared > .env (개별 override 금지)
# - PM2 런타임은 ecosystem.config.cjs에서 env 주입
# - pytest/로컬 실행 시에는 여기서 .env.shared를 직접 로드
# - override=False: 이미 설정된 환경변수(PM2 주입값)는 유지
# - 보안: 로드 실패해도 키 값 자체는 로그에 찍지 않음 (dotenv 내부 구현상 안전)
_bootstrap_logger = logging.getLogger(__name__)
try:
    _project_root = Path(__file__).resolve().parents[3]  # aims/
    _env_shared = _project_root / ".env.shared"
    if _env_shared.exists():
        load_dotenv(dotenv_path=_env_shared, override=False)
        _bootstrap_logger.info(f"🔐 .env.shared 로드 완료: {_env_shared}")
    else:
        _bootstrap_logger.info(
            f"ℹ️ .env.shared 없음 (PM2/로컬 env에 의존): {_env_shared}"
        )
except Exception as _env_err:
    # 로드 실패해도 PM2 주입/.env로 기동 가능해야 하므로 크래시 금지
    _bootstrap_logger.warning(
        f"⚠️ .env.shared 로드 실패, 계속 진행: "
        f"{type(_env_err).__name__}: {_env_err}"
    )

# .env 파일 로드 (로컬/개발 전용 보충, .env.shared에 없는 값만 채움)
try:
    load_dotenv(override=False)
except Exception as _env_err:
    _bootstrap_logger.warning(
        f"⚠️ .env 로드 실패, 계속 진행: "
        f"{type(_env_err).__name__}: {_env_err}"
    )

logger = logging.getLogger(__name__)

# AI 모델/파서 설정 캐싱 (Internal API 경유)
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
_ai_settings_cache = {"model": None, "parser": None, "timestamp": 0}
_AI_SETTINGS_CACHE_TTL = 60  # 1분

def _internal_headers():
    """Internal API 요청 헤더"""
    return {"x-api-key": INTERNAL_API_KEY, "Content-Type": "application/json"}

def _fetch_ai_settings() -> dict:
    """
    aims_api Internal API에서 AI 설정 조회 (내부용)

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

    # Internal API에서 조회
    try:
        response = requests.get(
            f"{AIMS_API_URL}/api/internal/settings/ai-models",
            headers=_internal_headers(),
            timeout=5
        )
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
        logger.warning(f"[AnnualReport] AI 설정 조회 실패: {e}")

    # 실패 시 캐시 또는 기본값
    return {
        "model": _ai_settings_cache.get("model") or "gpt-4.1",
        "parser": _ai_settings_cache.get("parser") or "openai"
    }


def get_annual_report_model() -> str:
    """
    aims_api Internal API에서 연보 파싱 모델 설정 조회 (1분 캐싱)

    Returns:
        모델명 (예: "gpt-4.1")
    """
    return _fetch_ai_settings()["model"]


def get_annual_report_parser() -> str:
    """
    aims_api Internal API에서 연보 파서 타입 조회 (1분 캐싱)

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

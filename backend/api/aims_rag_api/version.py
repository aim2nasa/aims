"""
AIMS RAG API 버전 정보
VERSION 파일에서 버전을 읽고, 빌드 시 주입된 git hash를 사용합니다.
@since 2025-12-20
"""

import os
from pathlib import Path

# VERSION 파일에서 버전 읽기
def get_version() -> str:
    try:
        version_path = Path(__file__).parent / "VERSION"
        return version_path.read_text().strip()
    except Exception:
        return "0.0.0"


# 환경변수에서 빌드 정보 읽기 (Docker build-arg로 주입)
GIT_HASH = os.getenv("GIT_HASH", "dev")
BUILD_TIME = os.getenv("BUILD_TIME", "unknown")

APP_VERSION = get_version()
FULL_VERSION = f"v{APP_VERSION} ({GIT_HASH})"

VERSION_INFO = {
    "version": APP_VERSION,
    "gitHash": GIT_HASH,
    "buildTime": BUILD_TIME,
    "fullVersion": FULL_VERSION,
}


def log_version_info():
    """콘솔에 버전 정보 출력"""
    print("=" * 40)
    print(f"  AIMS RAG API {FULL_VERSION}")
    print(f"  Build: {BUILD_TIME}")
    print("=" * 40)

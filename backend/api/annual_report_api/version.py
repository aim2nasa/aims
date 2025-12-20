"""
Annual Report API 버전 정보
VERSION 파일에서 버전을 읽고, 배포 시 생성되는 _build_info.json에서 빌드 정보를 읽습니다.
@since 2025-12-20
"""

import os
import json
from pathlib import Path

# VERSION 파일에서 버전 읽기
def get_version() -> str:
    try:
        version_path = Path(__file__).parent / "VERSION"
        return version_path.read_text().strip()
    except Exception:
        return "0.0.0"


# _build_info.json에서 빌드 정보 읽기 (배포 스크립트가 생성)
def get_build_info() -> dict:
    try:
        build_info_path = Path(__file__).parent / "_build_info.json"
        if build_info_path.exists():
            return json.loads(build_info_path.read_text())
    except Exception:
        pass
    return {"gitHash": "dev", "buildTime": "unknown"}


_build_info = get_build_info()

GIT_HASH = _build_info.get("gitHash", "dev")
BUILD_TIME = _build_info.get("buildTime", "unknown")

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
    print(f"  Annual Report API {FULL_VERSION}")
    print(f"  Build: {BUILD_TIME}")
    print("=" * 40)

# -*- coding: utf-8 -*-
"""자동 업데이트 체커 — Phase 2

서버에서 최신 버전 확인 → 인스톨러 다운로드 → updater.bat으로 자기 교체

흐름:
  1. GET /api/ac/latest-version → 최신 버전 정보
  2. 현재 VERSION과 비교
  3. 업데이트 필요 시 인스톨러 다운로드 → temp/에 저장
  4. updater.bat을 detached 프로세스로 실행 → AC 종료
  5. updater.bat: 2초 대기 → /VERYSILENT 인스톨러 → AC 재실행
"""
import json
import os
import subprocess
import sys
from urllib.request import Request, urlopen, urlretrieve
from urllib.error import URLError, HTTPError

from path_helper import get_app_dir, get_version_file

# AIMS API 서버 (Tailscale VPN)
AIMS_API_BASE = "http://100.110.215.65:3010"
VERSION_ENDPOINT = f"{AIMS_API_BASE}/api/ac/latest-version"


def _parse_version(ver_str: str) -> tuple:
    """버전 문자열을 비교 가능한 tuple로 변환.

    "0.1.10" → (0, 1, 10)
    """
    try:
        return tuple(int(x) for x in ver_str.strip().split("."))
    except (ValueError, AttributeError):
        return (0, 0, 0)


def _get_current_version() -> str:
    """VERSION 파일에서 현재 버전 읽기"""
    try:
        with open(get_version_file(), encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"


def check_for_update() -> dict | None:
    """서버에서 최신 버전 확인.

    Returns:
        업데이트 필요: {"latest": "x.y.z", "installerUrl": "...", "releaseNotes": "..."}
        최신이거나 오류: None
    """
    req = Request(VERSION_ENDPOINT, method="GET")
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (HTTPError, URLError, Exception):
        return None

    if not data.get("success"):
        return None

    server_ver = data.get("latest", "0.0.0")
    current_ver = _get_current_version()

    if _parse_version(server_ver) > _parse_version(current_ver):
        return {
            "latest": server_ver,
            "current": current_ver,
            "installerUrl": data.get("installerUrl", ""),
            "releaseNotes": data.get("releaseNotes", ""),
        }

    return None


def download_installer(url: str) -> str:
    """인스톨러를 temp/ 폴더에 다운로드.

    Args:
        url: 인스톨러 다운로드 URL

    Returns:
        저장된 파일 경로

    Raises:
        Exception: 다운로드 실패
    """
    temp_dir = os.path.join(get_app_dir(), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    dest = os.path.join(temp_dir, "AIMS_AutoClicker_Setup.exe")

    # 상대 경로인 경우 절대 URL로 변환
    if url.startswith("/"):
        url = f"{AIMS_API_BASE}{url}"
    urlretrieve(url, dest)
    return dest


def trigger_update():
    """updater.bat을 detached 프로세스로 실행 후 AC 종료.

    updater.bat은 AC 종료 대기 → 사일런트 인스톨러 → AC 재실행을 수행.
    """
    updater = os.path.join(get_app_dir(), "updater.bat")
    if not os.path.isfile(updater):
        raise FileNotFoundError(f"updater.bat not found: {updater}")

    # CREATE_NEW_PROCESS_GROUP: 부모 프로세스 종료 후에도 계속 실행
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    DETACHED_PROCESS = 0x00000008

    subprocess.Popen(
        [updater],
        creationflags=CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS,
        close_fds=True,
        cwd=get_app_dir(),
    )
    sys.exit(0)

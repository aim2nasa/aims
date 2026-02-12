# -*- coding: utf-8 -*-
"""자동 업데이트 체커 — Phase 2

서버에서 최신 버전 확인 → 프로그레스 바 표시하며 인스톨러 다운로드 → updater.bat으로 자기 교체

흐름:
  1. GET /api/ac/latest-version → 최신 버전 정보
  2. 현재 VERSION과 비교
  3. 업데이트 필요 시 프로그레스 바 다이얼로그와 함께 인스톨러 다운로드
  4. updater.bat을 detached 프로세스로 실행 → AC 종료
  5. updater.bat: 2초 대기 → /VERYSILENT 인스톨러 → AC 재실행
"""
import json
import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk
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


def download_installer(url: str, progress_callback=None) -> str:
    """인스톨러를 temp/ 폴더에 다운로드.

    Args:
        url: 인스톨러 다운로드 URL
        progress_callback: (downloaded_bytes, total_bytes) 콜백 (선택)

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

    def _reporthook(block_num, block_size, total_size):
        if progress_callback and total_size > 0:
            downloaded = block_num * block_size
            progress_callback(min(downloaded, total_size), total_size)

    urlretrieve(url, dest, reporthook=_reporthook)
    return dest


def download_with_progress(url: str, version: str) -> str:
    """프로그레스 바 다이얼로그를 표시하며 인스톨러 다운로드.

    Args:
        url: 인스톨러 다운로드 URL
        version: 다운로드 중인 버전 문자열

    Returns:
        저장된 파일 경로

    Raises:
        Exception: 다운로드 실패
    """
    root = tk.Tk()
    root.title("AutoClicker 업데이트")
    root.resizable(False, False)
    root.attributes("-topmost", True)

    # 화면 중앙 배치
    w, h = 360, 120
    sx = root.winfo_screenwidth() // 2 - w // 2
    sy = root.winfo_screenheight() // 2 - h // 2
    root.geometry(f"{w}x{h}+{sx}+{sy}")

    label = tk.Label(root, text=f"v{version} 다운로드 중...", font=("맑은 고딕", 10))
    label.pack(pady=(15, 5))

    progress = ttk.Progressbar(root, length=300, mode="determinate")
    progress.pack(pady=5)

    pct_label = tk.Label(root, text="0%", font=("맑은 고딕", 9))
    pct_label.pack()

    result = {"path": None, "error": None}

    def _on_progress(downloaded, total):
        pct = int(downloaded / total * 100)
        try:
            root.after_idle(lambda: _update_ui(pct, downloaded, total))
        except Exception:
            pass

    def _update_ui(pct, downloaded, total):
        try:
            progress["value"] = pct
            mb_down = downloaded / (1024 * 1024)
            mb_total = total / (1024 * 1024)
            pct_label.config(text=f"{pct}%  ({mb_down:.0f}/{mb_total:.0f} MB)")
            root.update_idletasks()
        except Exception:
            pass

    def _download_thread():
        try:
            path = download_installer(url, progress_callback=_on_progress)
            result["path"] = path
        except Exception as e:
            result["error"] = str(e)
        finally:
            try:
                root.after(0, root.destroy)
            except Exception:
                pass

    thread = threading.Thread(target=_download_thread, daemon=True)
    thread.start()
    root.mainloop()
    thread.join(timeout=5)

    if result["error"]:
        raise RuntimeError(f"다운로드 실패: {result['error']}")
    if not result["path"]:
        raise RuntimeError("다운로드가 완료되지 않았습니다.")
    return result["path"]


def trigger_update():
    """updater.bat을 동적 생성 + detached 프로세스로 실행 후 AC 종료.

    bat 파일을 동적으로 생성하여 인코딩 문제 방지 (UTF-8 bat → CP949 cmd.exe 깨짐).
    """
    app_dir = get_app_dir()
    updater = os.path.join(app_dir, "_do_update.bat")

    # ASCII-only bat 파일 동적 생성 (인코딩 무관)
    bat_content = f"""@echo off
set "LOGFILE={app_dir}\\updater.log"
echo [%date% %time%] Updater started > "%LOGFILE%"
echo [%date% %time%] Waiting 3 sec... >> "%LOGFILE%"
timeout /t 3 /nobreak >nul

set "INSTALLER={app_dir}\\temp\\AIMS_AutoClicker_Setup.exe"
echo [%date% %time%] INSTALLER=%INSTALLER% >> "%LOGFILE%"

if not exist "%INSTALLER%" (
    echo [%date% %time%] ERROR: installer not found >> "%LOGFILE%"
    goto :done
)

echo [%date% %time%] Installing... >> "%LOGFILE%"
"%INSTALLER%" /VERYSILENT /SUPPRESSMSGBOXES /DIR="{app_dir}" /LOG="{app_dir}\\install.log"
echo [%date% %time%] Exit code: %errorlevel% >> "%LOGFILE%"

if errorlevel 1 (
    echo [%date% %time%] Install FAILED >> "%LOGFILE%"
    goto :done
)

echo [%date% %time%] Cleanup >> "%LOGFILE%"
del "%INSTALLER%" >nul 2>&1
rmdir "{app_dir}\\temp" >nul 2>&1

:done
echo [%date% %time%] Done >> "%LOGFILE%"
echo [%date% %time%] Restarting AutoClicker... >> "%LOGFILE%"
start "" "{app_dir}\\AutoClicker.exe"
del "%~f0" >nul 2>&1
"""

    with open(updater, "w", encoding="ascii", errors="replace") as f:
        f.write(bat_content)

    CREATE_NEW_PROCESS_GROUP = 0x00000200
    DETACHED_PROCESS = 0x00000008

    subprocess.Popen(
        [updater],
        creationflags=CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS,
        close_fds=True,
        cwd=app_dir,
    )
    sys.exit(0)

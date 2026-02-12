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

    # 브라우저가 있는 모니터(주 모니터) 중앙에 배치
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


def _generate_splash_files(app_dir: str) -> tuple[str, str]:
    """설치 중 표시할 PowerShell WinForms 스플래시 + VBS 런처 생성.

    VBS 런처로 PowerShell을 실행하면 창이 전혀 보이지 않음.
    (bat에서 직접 powershell 실행 시 창이 순간 깜빡이는 문제 해결)

    sentinel 파일(_splash_done)이 생성되면 자동으로 닫힘.
    한글을 Unicode char 코드로 인코딩하여 ASCII bat 호환.
    Returns: (ps1_path, vbs_path)
    """
    # "업데이트 중..." / "잠시만 기다려주세요" 를 [char] 코드로 표현
    ps_script = '''Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$f = New-Object Windows.Forms.Form
$f.Text = "AIMS AutoClicker"
$f.FormBorderStyle = "None"
$f.Size = New-Object Drawing.Size(340, 100)
$f.StartPosition = "Manual"
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$cx = $screen.X + [int](($screen.Width - 340) / 2)
$cy = $screen.Y + [int](($screen.Height - 100) / 2)
$f.Location = New-Object Drawing.Point($cx, $cy)
$f.TopMost = $true
$f.ShowInTaskbar = $false
$f.BackColor = [Drawing.Color]::FromArgb(245, 245, 247)
$l = New-Object Windows.Forms.Label
$l.Text = [char]0xC5C5 + [char]0xB370 + [char]0xC774 + [char]0xD2B8 + " " + [char]0xC911 + "..."
$l.Font = New-Object Drawing.Font("Malgun Gothic", 14)
$l.AutoSize = $true
$l.Location = New-Object Drawing.Point(100, 25)
$f.Controls.Add($l)
$l2 = New-Object Windows.Forms.Label
$l2.Text = [char]0xC7A0 + [char]0xC2DC + [char]0xB9CC + " " + [char]0xAE30 + [char]0xB2E4 + [char]0xB824 + [char]0xC8FC + [char]0xC138 + [char]0xC694
$l2.Font = New-Object Drawing.Font("Malgun Gothic", 9)
$l2.ForeColor = [Drawing.Color]::FromArgb(136, 136, 136)
$l2.AutoSize = $true
$l2.Location = New-Object Drawing.Point(95, 55)
$f.Controls.Add($l2)
$sentinel = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "_splash_done"
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
    if (Test-Path $sentinel) {
        Remove-Item $sentinel -Force -ErrorAction SilentlyContinue
        $f.Close()
    }
})
$timer.Start()
[Windows.Forms.Application]::Run($f)
'''
    ps1_path = os.path.join(app_dir, "_update_splash.ps1")
    with open(ps1_path, "w", encoding="ascii", errors="replace") as f:
        f.write(ps_script)

    # VBS 래퍼: PowerShell을 완전히 숨겨서 실행 (창 깜빡임 제거)
    # wscript Run 2번째 인자 0 = 완전히 숨김
    vbs_script = (
        'CreateObject("WScript.Shell").Run '
        f'"powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{ps1_path}""", 0, False'
    )
    vbs_path = os.path.join(app_dir, "_launch_splash.vbs")
    with open(vbs_path, "w", encoding="ascii", errors="replace") as f:
        f.write(vbs_script)

    return ps1_path, vbs_path


def trigger_update():
    """updater.bat을 동적 생성 + detached 프로세스로 실행 후 AC 종료.

    bat 파일을 동적으로 생성하여 인코딩 문제 방지 (UTF-8 bat → CP949 cmd.exe 깨짐).
    PowerShell WinForms 스플래시를 설치 완료까지 지속 표시.
    """
    app_dir = get_app_dir()
    updater = os.path.join(app_dir, "_do_update.bat")

    # PowerShell 스플래시 + VBS 런처 생성 (창 깜빡임 제거)
    splash_ps1, splash_vbs = _generate_splash_files(app_dir)

    bat_content = f"""@echo off
set "LOGFILE={app_dir}\\updater.log"
echo [%date% %time%] Updater started > "%LOGFILE%"

echo [%date% %time%] Starting splash >> "%LOGFILE%"
wscript "{splash_vbs}"

echo [%date% %time%] Waiting 2 sec >> "%LOGFILE%"
timeout /t 2 /nobreak >nul

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
echo [%date% %time%] Closing splash >> "%LOGFILE%"
echo done > "{app_dir}\\_splash_done"
timeout /t 1 /nobreak >nul

echo [%date% %time%] Restarting AutoClicker... >> "%LOGFILE%"
start "" "{app_dir}\\AutoClicker.exe"
echo [%date% %time%] Done >> "%LOGFILE%"
del "{splash_ps1}" >nul 2>&1
del "{splash_vbs}" >nul 2>&1
del "%~f0" >nul 2>&1
"""

    with open(updater, "w", encoding="ascii", errors="replace") as f:
        f.write(bat_content)

    CREATE_NEW_PROCESS_GROUP = 0x00000200
    CREATE_NO_WINDOW = 0x08000000

    subprocess.Popen(
        [updater],
        creationflags=CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
        close_fds=True,
        cwd=app_dir,
    )
    sys.exit(0)

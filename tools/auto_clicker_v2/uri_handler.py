# -*- coding: utf-8 -*-
"""URI Scheme 핸들러 — aims-ac:// URI 파싱 및 토큰 검증 + 자동 업데이트

Phase 1: AIMS 웹 → aims-ac://start?token=NONCE → AC 실행
Phase 2: 토큰 검증 후 버전 체크 → 업데이트 필요 시 사일런트 자기 교체

흐름:
  1. Windows가 aims-ac:// URI로 AutoClicker.exe 실행
  2. parse_uri()로 URI 파싱 → token 추출
  3. verify_token()으로 서버에 토큰 검증
  4. check_for_update()로 버전 체크 → 업데이트 시 다운로드 + updater.bat
  5. 성공 시 GUI 시작 (cli_args 구성 → AutoClickerApp)
"""
import json
import sys
import types
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# AIMS API 서버 (Tailscale VPN)
AIMS_API_BASE = "http://100.110.215.65:3010"
VERIFY_ENDPOINT = f"{AIMS_API_BASE}/api/ac/verify-token"


def parse_uri(uri: str) -> dict:
    """aims-ac://start?token=xxx&chosung=ㄱ → dict 파싱

    Returns:
        {"action": "start", "token": "xxx", "chosung": "ㄱ", ...}
        파싱 실패 시 빈 dict
    """
    try:
        parsed = urlparse(uri)
        if parsed.scheme != "aims-ac":
            return {}
        result = {"action": parsed.netloc or parsed.hostname or ""}
        params = parse_qs(parsed.query, keep_blank_values=False)
        for key, values in params.items():
            result[key] = values[0] if len(values) == 1 else values
        return result
    except Exception:
        return {}


def verify_token(token: str) -> dict:
    """서버에 1회용 nonce 토큰 검증 요청

    Args:
        token: UUID nonce 문자열

    Returns:
        성공: {"success": True, "user": {"id": "...", "name": "...", "role": "..."}}
        실패: {"success": False, "message": "..."}
    """
    payload = json.dumps({"token": token}).encode("utf-8")
    req = Request(
        VERIFY_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            return body
        except Exception:
            return {"success": False, "message": f"HTTP {e.code}: {e.reason}"}
    except URLError as e:
        return {"success": False, "message": f"서버 연결 실패: {e.reason}"}
    except Exception as e:
        return {"success": False, "message": f"요청 오류: {e}"}


def _show_error(title: str, message: str):
    """tkinter messagebox로 오류 표시 (GUI 시작 전)"""
    import tkinter as tk
    root = tk.Tk()
    root.withdraw()
    from tkinter import messagebox
    messagebox.showerror(title, message, parent=root)
    root.destroy()


def _show_info(title: str, message: str):
    """tkinter messagebox로 정보 표시"""
    import tkinter as tk
    root = tk.Tk()
    root.withdraw()
    from tkinter import messagebox
    messagebox.showinfo(title, message, parent=root)
    root.destroy()


def handle_uri_launch(uri: str) -> int:
    """URI Scheme 실행 진입점

    Args:
        uri: "aims-ac://start?token=NONCE&chosung=ㄱ"

    Returns:
        0: 정상 종료, 1: 오류
    """
    # 1. URI 파싱
    params = parse_uri(uri)
    if not params:
        _show_error("AutoClicker", f"잘못된 URI 형식입니다.\n{uri}")
        return 1

    token = params.get("token", "")
    if not token:
        _show_error("AutoClicker", "토큰이 없습니다.\nAIMS 웹에서 다시 시도하세요.")
        return 1

    # 2. 토큰 검증
    result = verify_token(token)
    if not result.get("success"):
        msg = result.get("message", "알 수 없는 오류")
        _show_error("AutoClicker 인증 실패", f"{msg}\n\nAIMS 웹에서 다시 시도하세요.")
        return 1

    user = result.get("user", {})

    # 3. 버전 체크 (Phase 2 자동 업데이트)
    try:
        from update_checker import check_for_update, download_with_progress, trigger_update, save_restart_auth

        update_info = check_for_update()
        if update_info:
            # 업데이트 전 인증 세션 저장 (재시작 시 복원용)
            save_restart_auth(user, params)
            download_with_progress(
                update_info["installerUrl"],
                update_info["latest"],
            )
            trigger_update()
            return 0  # updater.bat이 --post-update와 함께 AC 재실행
    except SystemExit:
        raise  # trigger_update()의 sys.exit(0) 전파
    except Exception as e:
        _show_error("업데이트 실패", f"업데이트 중 오류가 발생했습니다.\n{e}\n\n기존 버전으로 계속합니다.")

    # 4. CLI args 구성 (gui_main.AutoClickerApp이 이해하는 형태)
    cli_args = types.SimpleNamespace(
        chosung=params.get("chosung", ""),
        start_from="",
        only="",
        auto_start=str(params.get("auto_start", "false")).lower() == "true",
        monitor=0,
    )

    # 5. GUI 시작
    from gui_main import AutoClickerApp
    app = AutoClickerApp(cli_args=cli_args, authenticated=True)
    app.set_user_name(user.get('name', ''))
    app.mainloop()
    return 0

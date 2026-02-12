# hotkey.py - Ctrl+Alt+F11/F12 글로벌 핫키로 화면 캡처
# Windows RegisterHotKey API 사용 (관리자 권한 불필요, 훅 안정성 보장)
import ctypes
import ctypes.wintypes
import subprocess
import sys
import os
import threading

CAPTURE_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capture.py")
PYTHON = sys.executable
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hotkey.log")

# Windows API 상수
MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312
VK_F11 = 0x7A
VK_F12 = 0x7B

# 핫키 ID
HOTKEY_MON1 = 1
HOTKEY_MON2 = 2

user32 = ctypes.windll.user32


def log_msg(msg):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except:
        pass


def on_capture(monitor):
    """별도 스레드에서 캡처 실행 (메시지 루프 블로킹 방지)"""
    log_msg(f"Hotkey pressed: monitor {monitor}")
    try:
        result = subprocess.run(
            [PYTHON, CAPTURE_SCRIPT, "--monitor", str(monitor)],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        log_msg(f"  stdout: {result.stdout.strip()}")
        if result.stderr:
            log_msg(f"  stderr: {result.stderr.strip()[:200]}")
    except Exception as e:
        log_msg(f"  ERROR: {e}")


def main():
    # 핫키 등록: Ctrl+Alt+F11 (모니터1), Ctrl+Alt+F12 (모니터2)
    mods = MOD_CONTROL | MOD_ALT | MOD_NOREPEAT

    if not user32.RegisterHotKey(None, HOTKEY_MON1, mods, VK_F11):
        log_msg("ERROR: Failed to register Ctrl+Alt+F11 (error %d)" % ctypes.GetLastError())
        sys.exit(1)
    if not user32.RegisterHotKey(None, HOTKEY_MON2, mods, VK_F12):
        log_msg("ERROR: Failed to register Ctrl+Alt+F12 (error %d)" % ctypes.GetLastError())
        sys.exit(1)

    log_msg("Capture hotkeys registered: Ctrl+Alt+F11 (mon1), Ctrl+Alt+F12 (mon2)")

    # Windows 메시지 루프
    msg = ctypes.wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        if msg.message == WM_HOTKEY:
            hotkey_id = msg.wParam
            if hotkey_id == HOTKEY_MON1:
                threading.Thread(target=on_capture, args=(1,), daemon=True).start()
            elif hotkey_id == HOTKEY_MON2:
                threading.Thread(target=on_capture, args=(2,), daemon=True).start()

    # 정리
    user32.UnregisterHotKey(None, HOTKEY_MON1)
    user32.UnregisterHotKey(None, HOTKEY_MON2)


if __name__ == "__main__":
    main()

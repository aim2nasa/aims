#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PoC: 마우스 독점 모드 (Low-level Mouse Hook)

검증 항목:
1. WH_MOUSE_LL Hook으로 외부 마우스 입력(클릭, 이동, 휠) 차단 가능한지
2. 키보드는 자유로운지 (Ctrl+Alt+P로 해제 가능한지)
3. 프로그래밍 입력(ctypes SendInput)은 Hook을 우회하는지

사용법:
  python poc_mouse_lock.py

실행하면 5초 후 마우스 잠금 시작.
Ctrl+Alt+P로 해제. 10초 후 자동 해제 (안전장치).
"""

import ctypes
import ctypes.wintypes
import threading
import time
import sys
import atexit

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# --- Win32 함수 시그니처 명시 (64비트 lParam 오버플로우 방지) ---
user32.CallNextHookEx.restype = ctypes.wintypes.LPARAM
user32.CallNextHookEx.argtypes = [
    ctypes.wintypes.HHOOK,
    ctypes.c_int,
    ctypes.wintypes.WPARAM,
    ctypes.wintypes.LPARAM,
]
user32.SetWindowsHookExW.restype = ctypes.wintypes.HHOOK
user32.SetWindowsHookExW.argtypes = [
    ctypes.c_int,
    ctypes.c_void_p,  # HOOKPROC (함수 포인터)
    ctypes.wintypes.HINSTANCE,
    ctypes.wintypes.DWORD,
]
user32.UnhookWindowsHookEx.argtypes = [ctypes.wintypes.HHOOK]
user32.UnhookWindowsHookEx.restype = ctypes.wintypes.BOOL
user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
user32.GetAsyncKeyState.restype = ctypes.c_short

# --- Constants ---
WH_MOUSE_LL = 14
WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_SYSKEYDOWN = 0x0104
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_P = 0x50

# Hook 상태
_mouse_hook = None
_keyboard_hook = None
_mouse_locked = False
_lock = threading.Lock()

# Callback 타입 (LRESULT CALLBACK(int, WPARAM, LPARAM))
HOOKPROC = ctypes.CFUNCTYPE(
    ctypes.wintypes.LPARAM,  # LRESULT 반환
    ctypes.c_int,
    ctypes.wintypes.WPARAM,
    ctypes.wintypes.LPARAM,
)


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode", ctypes.wintypes.DWORD),
        ("scanCode", ctypes.wintypes.DWORD),
        ("flags", ctypes.wintypes.DWORD),
        ("time", ctypes.wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class MSLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("pt", ctypes.wintypes.POINT),
        ("mouseData", ctypes.wintypes.DWORD),
        ("flags", ctypes.wintypes.DWORD),
        ("time", ctypes.wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


def _mouse_hook_proc(nCode, wParam, lParam):
    """마우스 Hook 콜백 - 물리 입력만 차단"""
    if nCode >= 0 and _mouse_locked:
        # LLMHF_INJECTED (bit 0) = 프로그래밍 입력
        info = ctypes.cast(lParam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
        is_injected = bool(info.flags & 0x01)
        if not is_injected:
            # 물리 입력 → 차단 (1 반환 = 이벤트 소비)
            return 1
    return user32.CallNextHookEx(_mouse_hook, nCode, wParam, lParam)


def _keyboard_hook_proc(nCode, wParam, lParam):
    """키보드 Hook 콜백 - Ctrl+Alt+P 감지"""
    global _mouse_locked
    if nCode >= 0 and wParam in (WM_KEYDOWN, WM_SYSKEYDOWN):
        info = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
        if info.vkCode == VK_P:
            ctrl = user32.GetAsyncKeyState(VK_CONTROL) & 0x8000
            alt = user32.GetAsyncKeyState(VK_MENU) & 0x8000
            if ctrl and alt:
                with _lock:
                    _mouse_locked = not _mouse_locked
                    state = "잠금" if _mouse_locked else "해제"
                    print("[PoC] Ctrl+Alt+P 감지 → 마우스 %s" % state)
    return user32.CallNextHookEx(_keyboard_hook, nCode, wParam, lParam)


# C 함수 포인터 유지 (GC 방지)
_mouse_hook_ptr = HOOKPROC(_mouse_hook_proc)
_keyboard_hook_ptr = HOOKPROC(_keyboard_hook_proc)


def _hook_thread_func():
    """Hook 메시지 펌프 (별도 스레드)"""
    global _mouse_hook, _keyboard_hook

    _mouse_hook = user32.SetWindowsHookExW(
        WH_MOUSE_LL, ctypes.cast(_mouse_hook_ptr, ctypes.c_void_p), None, 0
    )
    _keyboard_hook = user32.SetWindowsHookExW(
        WH_KEYBOARD_LL, ctypes.cast(_keyboard_hook_ptr, ctypes.c_void_p), None, 0
    )

    if not _mouse_hook or not _keyboard_hook:
        print("[PoC] Hook 설치 실패!")
        return

    print("[PoC] Hook 설치 완료 (mouse=%s, keyboard=%s)" % (_mouse_hook, _keyboard_hook))

    # 메시지 펌프 (Hook이 동작하려면 필수)
    msg = ctypes.wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def _cleanup():
    """atexit: Hook 해제 (안전장치)"""
    global _mouse_hook, _keyboard_hook, _mouse_locked
    _mouse_locked = False
    if _mouse_hook:
        user32.UnhookWindowsHookEx(_mouse_hook)
        _mouse_hook = None
    if _keyboard_hook:
        user32.UnhookWindowsHookEx(_keyboard_hook)
        _keyboard_hook = None
    print("[PoC] Hook 해제 완료")


atexit.register(_cleanup)


def main():
    global _mouse_locked

    print("=" * 50)
    print("PoC: 마우스 독점 모드")
    print("=" * 50)
    print("")
    print("5초 후 마우스 잠금 시작")
    print("Ctrl+Alt+P: 잠금/해제 토글")
    print("10초 후 자동 해제 (안전장치)")
    print("")

    # Hook 스레드 시작
    t = threading.Thread(target=_hook_thread_func, daemon=True)
    t.start()
    time.sleep(1)  # Hook 설치 대기

    # 5초 카운트다운
    for i in range(5, 0, -1):
        print("  %d초 후 잠금..." % i)
        time.sleep(1)

    # 마우스 잠금
    with _lock:
        _mouse_locked = True
    print("")
    print("[PoC] ★ 마우스 잠금 시작 ★")
    print("[PoC] 마우스를 움직여 보세요 — 반응하지 않아야 합니다")
    print("[PoC] Ctrl+Alt+P로 해제 가능")
    print("")

    # 10초 자동 해제 타이머
    for i in range(10, 0, -1):
        if not _mouse_locked:
            print("[PoC] 사용자가 해제함")
            break
        print("  자동 해제까지 %d초..." % i)
        time.sleep(1)

    # 해제
    with _lock:
        _mouse_locked = False
    print("")
    print("[PoC] ★ 마우스 해제됨 ★")
    print("[PoC] 마우스가 정상 동작하는지 확인하세요")

    time.sleep(2)
    _cleanup()
    print("[PoC] 테스트 종료")


if __name__ == "__main__":
    main()

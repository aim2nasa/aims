# -*- coding: utf-8 -*-
"""
마우스 독점 모듈 - AC 실행 중 외부 마우스 입력 차단

- WH_MOUSE_LL Hook으로 물리 마우스 입력(클릭, 이동, 휠) 차단
- 프로그래밍 입력(Java Robot/SendInput)은 LLMHF_INJECTED 플래그로 통과
- Ctrl+Alt+P 키보드 Hook으로 잠금/해제 토글
- 좌측 하단 오버레이로 잠금 상태 표시
"""
import ctypes
import ctypes.wintypes
import threading
import atexit
import tkinter as tk

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
user32.PostThreadMessageW.argtypes = [
    ctypes.wintypes.DWORD, ctypes.c_uint,
    ctypes.wintypes.WPARAM, ctypes.wintypes.LPARAM,
]
user32.PostThreadMessageW.restype = ctypes.wintypes.BOOL

# --- Constants ---
WH_MOUSE_LL = 14
WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_SYSKEYDOWN = 0x0104
WM_QUIT = 0x0012
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_P = 0x50

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


class MouseLock:
    """마우스 독점 모드 관리 클래스"""

    def __init__(self):
        self._locked = False
        self._lock = threading.Lock()
        self._hook_thread = None
        self._hook_thread_id = None
        self._overlay_thread = None
        self._mouse_hook = None
        self._keyboard_hook = None
        self._on_toggle = None
        self._overlay_root = None
        self._overlay_ready = threading.Event()

        # C 함수 포인터 유지 (GC 방지)
        self._mouse_hook_ptr = HOOKPROC(self._mouse_hook_proc)
        self._keyboard_hook_ptr = HOOKPROC(self._keyboard_hook_proc)

    # ── Hook 콜백 ──

    def _mouse_hook_proc(self, nCode, wParam, lParam):
        """마우스 Hook 콜백 - 물리 입력만 차단"""
        if nCode >= 0 and self._locked:
            # LLMHF_INJECTED (bit 0) = 프로그래밍 입력
            info = ctypes.cast(lParam, ctypes.POINTER(MSLLHOOKSTRUCT)).contents
            is_injected = bool(info.flags & 0x01)
            if not is_injected:
                # 물리 입력 차단 (1 반환 = 이벤트 소비)
                return 1
        return user32.CallNextHookEx(self._mouse_hook, nCode, wParam, lParam)

    def _keyboard_hook_proc(self, nCode, wParam, lParam):
        """키보드 Hook 콜백 - Ctrl+Alt+P 감지"""
        if nCode >= 0 and wParam in (WM_KEYDOWN, WM_SYSKEYDOWN):
            info = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
            if info.vkCode == VK_P:
                ctrl = user32.GetAsyncKeyState(VK_CONTROL) & 0x8000
                alt = user32.GetAsyncKeyState(VK_MENU) & 0x8000
                if ctrl and alt:
                    self.toggle()
        return user32.CallNextHookEx(self._keyboard_hook, nCode, wParam, lParam)

    # ── Hook 스레드 ──

    def _hook_thread_func(self):
        """Hook 메시지 펌프 (별도 스레드)"""
        self._hook_thread_id = kernel32.GetCurrentThreadId()

        self._mouse_hook = user32.SetWindowsHookExW(
            WH_MOUSE_LL,
            ctypes.cast(self._mouse_hook_ptr, ctypes.c_void_p),
            None, 0,
        )
        self._keyboard_hook = user32.SetWindowsHookExW(
            WH_KEYBOARD_LL,
            ctypes.cast(self._keyboard_hook_ptr, ctypes.c_void_p),
            None, 0,
        )

        if not self._mouse_hook or not self._keyboard_hook:
            # Hook 설치 실패 시 잠금 상태 롤백
            with self._lock:
                self._locked = False
            return

        # 메시지 펌프 (Hook이 동작하려면 필수)
        msg = ctypes.wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))

    # ── 오버레이 ──

    def _overlay_thread_func(self):
        """오버레이 tkinter 루프 (별도 스레드)"""
        root = tk.Tk()
        root.withdraw()
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", 0.8)
        root.configure(bg="#cc0000")

        label = tk.Label(
            root,
            text="\U0001f512 \ub9c8\uc6b0\uc2a4 \uc7a0\uae08 | Ctrl+Alt+P \ud574\uc81c",
            font=("맑은 고딕", 11, "bold"),
            fg="white", bg="#cc0000",
            padx=12, pady=6,
        )
        label.pack()

        # 위치: 화면 좌측 하단
        root.update_idletasks()
        w = root.winfo_reqwidth()
        h = root.winfo_reqheight()
        screen_h = root.winfo_screenheight()
        root.geometry(f"{w}x{h}+16+{screen_h - h - 60}")

        self._overlay_root = root
        self._overlay_ready.set()
        root.mainloop()

    def _show_overlay(self):
        """오버레이 표시"""
        if self._overlay_root:
            try:
                self._overlay_root.after(0, self._overlay_root.deiconify)
            except Exception:
                pass

    def _hide_overlay(self):
        """오버레이 숨김"""
        if self._overlay_root:
            try:
                self._overlay_root.after(0, self._overlay_root.withdraw)
            except Exception:
                pass

    def _destroy_overlay(self):
        """오버레이 완전 파괴"""
        if self._overlay_root:
            try:
                self._overlay_root.after(0, self._overlay_root.destroy)
            except Exception:
                pass
            self._overlay_root = None
            self._overlay_ready.clear()

    # ── 공개 API ──

    def start(self):
        """마우스 잠금 시작 + 오버레이 표시"""
        with self._lock:
            if self._locked:
                return
            self._locked = True

        # Hook 스레드 시작 (이미 실행 중이면 건너뜀)
        if self._hook_thread is None or not self._hook_thread.is_alive():
            self._hook_thread = threading.Thread(
                target=self._hook_thread_func, daemon=True,
            )
            self._hook_thread.start()

        # 오버레이 스레드 시작
        if self._overlay_thread is None or not self._overlay_thread.is_alive():
            self._overlay_ready.clear()
            self._overlay_thread = threading.Thread(
                target=self._overlay_thread_func, daemon=True,
            )
            self._overlay_thread.start()
            self._overlay_ready.wait(timeout=3)

        self._show_overlay()

    def stop(self):
        """마우스 잠금 해제 + 오버레이 숨김 (idempotent)"""
        with self._lock:
            if not self._locked:
                return
            self._locked = False

        self._hide_overlay()

    def cleanup(self):
        """Hook 해제 + 오버레이 파괴 (프로세스 종료 시)"""
        with self._lock:
            self._locked = False

        # Hook 해제
        if self._mouse_hook:
            user32.UnhookWindowsHookEx(self._mouse_hook)
            self._mouse_hook = None
        if self._keyboard_hook:
            user32.UnhookWindowsHookEx(self._keyboard_hook)
            self._keyboard_hook = None

        # Hook 스레드 메시지 펌프 종료
        if self._hook_thread_id:
            user32.PostThreadMessageW(self._hook_thread_id, WM_QUIT, 0, 0)
            self._hook_thread_id = None

        # 오버레이 파괴
        self._destroy_overlay()

    def toggle(self):
        """잠금/해제 토글 (Ctrl+Alt+P 호출용)"""
        with self._lock:
            was_locked = self._locked

        if was_locked:
            self.stop()
        else:
            # 재잠금: Hook은 이미 살아있으므로 상태+오버레이만
            with self._lock:
                self._locked = True
            self._show_overlay()

        # 콜백 호출 (gui_main 일시정지 연동)
        if self._on_toggle:
            try:
                self._on_toggle(self._locked)
            except Exception:
                pass

    def is_locked(self):
        """현재 잠금 상태 반환"""
        return self._locked

    def set_on_toggle_callback(self, cb):
        """토글 시 콜백 설정 (cb(is_locked: bool))"""
        self._on_toggle = cb


# ── 모듈 레벨 싱글턴 ──
_instance = MouseLock()


def start():
    _instance.start()


def stop():
    _instance.stop()


def cleanup():
    _instance.cleanup()


def toggle():
    _instance.toggle()


def is_locked():
    return _instance.is_locked()


def set_on_toggle_callback(cb):
    _instance.set_on_toggle_callback(cb)


# 프로세스 종료 시 반드시 Hook 해제
atexit.register(cleanup)

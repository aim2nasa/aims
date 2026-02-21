# -*- coding: utf-8 -*-
"""Windows 알림 차단 모듈 — AutoClicker v2

AC 실행 중 화면 우측 하단의 토스트 알림, 팝업, 광고창 등을 차단합니다.
AC 종료 시 원래 설정으로 자동 복원됩니다.

전략 (다층 방어):
  Layer 1: 레지스트리 — 토스트 알림 + 풍선 도움말 + Action Center + 알림 사운드 비활성화
  Layer 1B: ShellExperienceHost 재시작 — 레지스트리 변경 즉시 적용 (explorer 재시작 불필요)
  Layer 1C: WM_SETTINGCHANGE 브로드캐스트 — 시스템 전체에 설정 변경 통보
  Layer 2: 백그라운드 모니터 — 우측 하단에 나타나는 창 감지 및 즉시 숨김 (0.3초 간격)
  Layer 3: atexit + marker 파일 — 비정상 종료 시에도 다음 실행에서 복원 보장
"""
import atexit
import ctypes
import ctypes.wintypes
import datetime
import json
import os
import subprocess
import threading
import time
import winreg
from typing import Optional

from path_helper import get_app_dir

user32 = ctypes.windll.user32

# ── Win32 상수 ──
SW_HIDE = 0
GWL_EXSTYLE = -20
WS_EX_TOPMOST = 0x00000008
WS_EX_NOACTIVATE = 0x08000000
WS_EX_TOOLWINDOW = 0x00000080

# ── 알림 관련 Window Class (이 클래스 + 알림 영역 = 즉시 숨김) ──
_NOTIFICATION_CLASSES = frozenset({
    "Windows.UI.Core.CoreWindow",       # UWP 토스트/알림 호스트 (ShellExperienceHost)
    "NativeHWNDHost",                    # UWP 알림 컨테이너
    "ForegroundStaging",                 # Windows 알림 스테이징
})

# ── 절대 건드리지 않는 Window Class (안전 리스트) ──
_SAFE_CLASSES = frozenset({
    "Shell_TrayWnd",                     # 작업표시줄
    "Shell_SecondaryTrayWnd",            # 보조 모니터 작업표시줄
    "Progman",                           # 바탕화면
    "WorkerW",                           # 바탕화면 워커
    "DV2ControlHost",                    # 시작 메뉴
    "Windows.UI.Input.InputSite.WindowClass",
    "TaskListThumbnailWnd",              # 작업표시줄 미리보기
    "MSTaskSwWClass",                    # 작업표시줄 스위처
    "TrayNotifyWnd",                     # 시스템 트레이
    "NotifyIconOverflowWindow",          # 트레이 오버플로
})

# EnumWindows 콜백 시그니처 (한 번만 정의)
_WNDENUMPROC = ctypes.WINFUNCTYPE(
    ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM,
)

# 크래시 복원용 marker 파일
_MARKER_FILE = os.path.join(get_app_dir(), ".notification_blocked")

# 레지스트리 경로 상수
_REG_NOTIFICATIONS = r"Software\Microsoft\Windows\CurrentVersion\Notifications\Settings"
_REG_EXPLORER_ADV = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"
_REG_EXPLORER_POLICY = r"Software\Policies\Microsoft\Windows\Explorer"


class NotificationBlocker:
    """AC 실행 중 Windows 알림 차단. 종료 시 자동 복원."""

    def __init__(self, ac_hwnd: int = 0):
        """
        Args:
            ac_hwnd: AC 메인 윈도우 핸들 (차단 대상에서 제외)
        """
        self._ac_hwnd = ac_hwnd
        self._active = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        # 원래 레지스트리 값 (복원용)
        self._original_toast: Optional[int] = None
        self._original_balloon: Optional[int] = None
        self._original_action_center: Optional[int] = None
        self._original_sound: Optional[int] = None
        # AC 관련 윈도우 핸들 (차단 제외, frozenset으로 스레드 안전)
        self._ac_hwnds: frozenset[int] = frozenset()
        # 로그
        self._log_path = os.path.join(get_app_dir(), "debug_trace.log")

    # ── Public API ──

    def block(self):
        """알림 차단 시작. AC 실행 전에 호출."""
        with self._lock:
            if self._active:
                return
            self._active = True

        self._log("=== 알림 차단 시작 ===")

        # AC 관련 창 등록
        self._register_ac_windows()

        # 레지스트리 수정 (새 알림 억제)
        self._disable_registry()

        # ShellExperienceHost 재시작 (토스트 렌더러가 레지스트리 재읽기)
        self._restart_notification_host()

        # 재시작된 프로세스에 설정 변경 알림 (restart 이후 호출해야 효과 있음)
        self._broadcast_setting_change()

        # marker 파일 생성 (크래시 복원용)
        self._write_marker()

        # 기존 알림 창 즉시 숨김
        count = self._dismiss_notifications()
        self._log(f"기존 알림 {count}건 숨김")

        # 모니터링 스레드 시작
        self._thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="NotifBlocker",
        )
        self._thread.start()

        # atexit 안전장치
        atexit.register(self.restore)

    def restore(self):
        """알림 차단 해제. AC 종료 시 호출. 원래 설정으로 복원."""
        with self._lock:
            if not self._active:
                return
            self._active = False

        self._log("=== 알림 차단 해제 (설정 복원) ===")

        # 레지스트리 복원
        self._restore_registry()

        # 시스템에 설정 변경 알림 (복원 즉시 적용)
        self._broadcast_setting_change()

        # marker 파일 삭제
        self._remove_marker()

        # 원래 값 초기화 (다음 block() 주기에서 정상 재조회 보장)
        self._original_toast = None
        self._original_balloon = None
        self._original_action_center = None
        self._original_sound = None

        self._ac_hwnds = frozenset()

        try:
            atexit.unregister(self.restore)
        except Exception:
            pass

    @property
    def is_active(self) -> bool:
        with self._lock:
            return self._active

    def update_ac_hwnd(self, hwnd: int):
        """AC 메인 윈도우 핸들 업데이트 (overrideredirect 전환 시 핸들 변경 대비)"""
        self._ac_hwnd = hwnd
        self._register_ac_windows()

    @staticmethod
    def recover_if_needed():
        """앱 시작 시 이전 크래시로 남은 차단 상태 복원.

        marker 파일에서 원본 레지스트리 값을 읽어 정확히 복원합니다.
        marker 파일이 손상되었으면 시스템 기본값(알림 활성화)으로 복원합니다.
        """
        if not os.path.exists(_MARKER_FILE):
            return

        _static_log("크래시 복원: 이전 세션에서 알림 차단이 해제되지 않음 → 복원 중...")

        # marker 파일에서 원본값 읽기
        orig_toast = 1
        orig_sound = 1
        orig_balloon = 1
        orig_ac = None  # None = 키 삭제 (원래 없었음)

        try:
            with open(_MARKER_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            orig_toast = data.get("original_toast", 1)
            orig_sound = data.get("original_sound", 1)
            orig_balloon = data.get("original_balloon", 1)
            orig_ac = data.get("original_action_center")
            _static_log(f"marker 파일에서 원본값 복원: toast={orig_toast}, sound={orig_sound}, "
                        f"balloon={orig_balloon}, ac={orig_ac}")
        except (json.JSONDecodeError, OSError):
            _static_log("marker 파일 손상 — 시스템 기본값으로 복원")

        # 레지스트리 원본값 복원
        _reg_set_dword(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", orig_toast)
        _reg_set_dword(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", orig_sound)
        _reg_set_dword(_REG_EXPLORER_ADV, "EnableBalloonTips", orig_balloon)
        if orig_ac is None:
            _reg_delete_value(_REG_EXPLORER_POLICY, "DisableNotificationCenter")
        else:
            _reg_set_dword(
                _REG_EXPLORER_POLICY, "DisableNotificationCenter", orig_ac, create_key=True,
            )

        # 시스템에 설정 변경 알림
        try:
            HWND_BROADCAST = 0xFFFF
            WM_SETTINGCHANGE = 0x001A
            SMTO_ABORTIFHUNG = 0x0002
            result = ctypes.wintypes.DWORD()
            user32.SendMessageTimeoutW(
                HWND_BROADCAST, WM_SETTINGCHANGE, 0,
                "Policy", SMTO_ABORTIFHUNG, 1000, ctypes.byref(result),
            )
        except Exception:
            pass

        try:
            os.remove(_MARKER_FILE)
        except OSError:
            pass

        _static_log("크래시 복원 완료")

    # ── 레지스트리 ──

    def _disable_registry(self):
        """레지스트리를 통해 Windows 알림 비활성화"""
        # 1. 토스트 알림
        self._original_toast = _reg_get_dword(
            _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", default=1,
        )
        _reg_set_dword(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", 0)
        self._log(f"Registry Toast: {self._original_toast} → 0")

        # 2. 풍선 도움말
        self._original_balloon = _reg_get_dword(
            _REG_EXPLORER_ADV, "EnableBalloonTips", default=1,
        )
        _reg_set_dword(_REG_EXPLORER_ADV, "EnableBalloonTips", 0)
        self._log(f"Registry Balloon: {self._original_balloon} → 0")

        # 3. Action Center
        self._original_action_center = _reg_get_dword(
            _REG_EXPLORER_POLICY, "DisableNotificationCenter", default=None,
        )
        _reg_set_dword(
            _REG_EXPLORER_POLICY, "DisableNotificationCenter", 1, create_key=True,
        )
        self._log(f"Registry ActionCenter: {self._original_action_center} → disabled")

        # 4. 알림 사운드
        self._original_sound = _reg_get_dword(
            _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", default=1,
        )
        _reg_set_dword(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", 0)
        self._log(f"Registry Sound: {self._original_sound} → 0")

    def _restore_registry(self):
        """레지스트리 원래 상태 복원"""
        # 1. 토스트
        if self._original_toast is not None:
            _reg_set_dword(
                _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED",
                self._original_toast,
            )
            self._log(f"Registry Toast 복원: {self._original_toast}")

        # 2. 풍선
        if self._original_balloon is not None:
            _reg_set_dword(
                _REG_EXPLORER_ADV, "EnableBalloonTips",
                self._original_balloon,
            )
            self._log(f"Registry Balloon 복원: {self._original_balloon}")

        # 3. Action Center
        if self._original_action_center is None:
            # 원래 키가 없었으면 삭제
            _reg_delete_value(_REG_EXPLORER_POLICY, "DisableNotificationCenter")
            self._log("Registry ActionCenter: 키 삭제 (원래 없었음)")
        else:
            _reg_set_dword(
                _REG_EXPLORER_POLICY, "DisableNotificationCenter",
                self._original_action_center,
            )
            self._log(f"Registry ActionCenter 복원: {self._original_action_center}")

        # 4. 알림 사운드
        if self._original_sound is not None:
            _reg_set_dword(
                _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND",
                self._original_sound,
            )
            self._log(f"Registry Sound 복원: {self._original_sound}")

    # ── 레지스트리 즉시 적용 ──

    def _broadcast_setting_change(self):
        """WM_SETTINGCHANGE를 브로드캐스트하여 레지스트리 변경을 시스템에 알림."""
        HWND_BROADCAST = 0xFFFF
        WM_SETTINGCHANGE = 0x001A
        SMTO_ABORTIFHUNG = 0x0002
        result = ctypes.wintypes.DWORD()
        try:
            # "Policy" — 정책 레지스트리 변경 알림
            user32.SendMessageTimeoutW(
                HWND_BROADCAST, WM_SETTINGCHANGE, 0,
                "Policy", SMTO_ABORTIFHUNG, 1000, ctypes.byref(result),
            )
            # "TraySettings" — 트레이/알림 설정 변경 알림
            user32.SendMessageTimeoutW(
                HWND_BROADCAST, WM_SETTINGCHANGE, 0,
                "TraySettings", SMTO_ABORTIFHUNG, 1000, ctypes.byref(result),
            )
            self._log("WM_SETTINGCHANGE 브로드캐스트 완료")
        except Exception as e:
            self._log(f"WM_SETTINGCHANGE 브로드캐스트 실패: {e}")

    def _restart_notification_host(self):
        """ShellExperienceHost.exe를 재시작하여 레지스트리 변경 즉시 적용.

        ShellExperienceHost는 Windows 토스트 알림 렌더러입니다.
        Kill 후 자동 재시작되며, 재시작 시 레지스트리를 다시 읽습니다.
        explorer.exe 재시작보다 훨씬 덜 침습적입니다 (작업표시줄 유지).
        비동기: Popen 사용으로 메인 스레드(Tkinter 이벤트 루프) 블로킹 방지.
        """
        try:
            subprocess.Popen(
                ["taskkill", "/f", "/im", "ShellExperienceHost.exe"],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            self._log("ShellExperienceHost 종료 요청 (비동기)")
        except Exception as e:
            self._log(f"ShellExperienceHost 재시작 실패: {e}")

    # ── 창 모니터링 ──

    def _register_ac_windows(self):
        """AC 관련 윈도우 핸들 등록 (차단 대상에서 제외, frozenset으로 원자적 교체)"""
        hwnds: set[int] = set()
        if self._ac_hwnd:
            hwnds.add(self._ac_hwnd)
            # Tkinter/CTk는 내부 프레임 핸들과 실제 Win32 부모 핸들이 다름
            parent = user32.GetParent(self._ac_hwnd)
            if parent:
                hwnds.add(parent)
            # GetAncestor(GA_ROOT)로 최상위 핸들도 등록
            GA_ROOT = 2
            root = user32.GetAncestor(self._ac_hwnd, GA_ROOT)
            if root:
                hwnds.add(root)
        self._ac_hwnds = frozenset(hwnds)

    def _get_notification_zone(self) -> tuple[int, int, int, int]:
        """알림 영역 좌표 반환 (left, top, right, bottom).

        AC 창이 위치한 모니터의 우측 하단 500x300 영역.
        AC 창이 없으면 주 모니터 기준.
        """
        if self._ac_hwnd:
            try:
                # AC 창이 위치한 모니터 탐색
                hmon = user32.MonitorFromWindow(self._ac_hwnd, 2)  # MONITOR_DEFAULTTONEAREST
                if hmon:
                    info = ctypes.create_string_buffer(104)
                    ctypes.c_uint.from_buffer(info, 0).value = 104
                    if user32.GetMonitorInfoW(hmon, info):
                        # rcMonitor: offset 4, 4 ints (left, top, right, bottom)
                        ml = ctypes.c_long.from_buffer(info, 4).value
                        mt = ctypes.c_long.from_buffer(info, 8).value
                        mr = ctypes.c_long.from_buffer(info, 12).value
                        mb = ctypes.c_long.from_buffer(info, 16).value
                        return (mr - 500, mb - 300, mr, mb)
            except Exception:
                pass

        # 폴백: 주 모니터 (GetSystemMetrics 실패 시 1920x1080 가정)
        sw = user32.GetSystemMetrics(0) or 1920  # SM_CXSCREEN
        sh = user32.GetSystemMetrics(1) or 1080  # SM_CYSCREEN
        return (sw - 500, sh - 300, sw, sh)

    def _dismiss_notifications(self) -> int:
        """알림 영역의 알림 창 감지 및 숨김. 숨긴 개수 반환."""
        zone = self._get_notification_zone()
        to_hide: list[tuple[int, str]] = []

        @_WNDENUMPROC
        def cb(hwnd, _):
            try:
                result = self._classify_window(hwnd, zone)
                if result:
                    to_hide.append(result)
            except Exception:
                pass
            return True

        user32.EnumWindows(cb, 0)

        for hwnd, cls in to_hide:
            try:
                user32.ShowWindow(hwnd, SW_HIDE)
                self._log(f"숨김: hwnd={hwnd}, class={cls}")
            except Exception:
                pass

        return len(to_hide)

    def _classify_window(
        self, hwnd: int, zone: tuple[int, int, int, int],
    ) -> Optional[tuple[int, str]]:
        """창을 분석하여 숨겨야 하면 (hwnd, class_name) 반환, 아니면 None."""
        if not user32.IsWindowVisible(hwnd):
            return None

        # AC 관련 창 → 스킵
        if hwnd in self._ac_hwnds or hwnd == self._ac_hwnd:
            return None

        # 클래스명
        cls_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls_buf, 256)
        cls = cls_buf.value

        # 안전 리스트 → 스킵
        if cls in _SAFE_CLASSES:
            return None

        # 위치 확인
        rect = ctypes.wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))

        zl, zt, zr, zb = zone
        # 창의 어느 부분이라도 알림 영역과 겹치는지
        overlaps = (
            rect.right > zl and rect.left < zr
            and rect.bottom > zt and rect.top < zb
        )
        if not overlaps:
            return None

        # 알림 클래스 → 즉시 숨김
        if cls in _NOTIFICATION_CLASSES:
            return (hwnd, cls)

        # 휴리스틱: 위치 + 스타일 + 크기로 알림 판단
        w = rect.right - rect.left
        h = rect.bottom - rect.top

        # 너무 크거나 작은 창 → 알림 아님
        if w < 40 or h < 20 or w > 600 or h > 400:
            return None

        ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        is_topmost = bool(ex_style & WS_EX_TOPMOST)
        is_tool = bool(ex_style & WS_EX_TOOLWINDOW)
        is_noactivate = bool(ex_style & WS_EX_NOACTIVATE)

        # TOPMOST + (TOOLWINDOW 또는 NOACTIVATE) → 알림일 가능성 높음
        if is_topmost and (is_tool or is_noactivate):
            return (hwnd, cls)

        return None

    def _monitor_loop(self):
        """백그라운드 스레드: 주기적으로 알림 창 감지 및 숨김.

        콜백은 루프 외부에서 한 번만 생성하여 ctypes 객체 반복 생성 방지.
        _classify_window 휴리스틱으로 알림 창 판별 (위치+스타일+크기).
        콜백 내부 예외는 반드시 잡아야 함 (미처리 예외 → return 0 → EnumWindows 조기 중단).
        zone은 매 루프 재계산 (모니터 구성 변경 대응).
        """
        to_hide: list[tuple[int, str]] = []
        # zone을 리스트로 감싸 클로저에서 참조 가능하게 함
        zone_ref: list[tuple[int, int, int, int]] = [self._get_notification_zone()]

        @_WNDENUMPROC
        def cb(hwnd, _):
            try:
                result = self._classify_window(hwnd, zone_ref[0])
                if result:
                    to_hide.append(result)
            except Exception:
                pass
            return True

        while self._active:
            try:
                zone_ref[0] = self._get_notification_zone()
                to_hide.clear()
                user32.EnumWindows(cb, 0)

                for hwnd, cls in to_hide:
                    try:
                        user32.ShowWindow(hwnd, SW_HIDE)
                        self._log(f"모니터: 새 알림 숨김 hwnd={hwnd}, class={cls}")
                    except Exception:
                        pass
            except Exception:
                pass

            time.sleep(0.3)

    # ── Marker 파일 (크래시 복원) ──

    def _write_marker(self):
        """원본 레지스트리 값을 JSON으로 marker 파일에 저장.

        크래시 시 recover_if_needed()가 이 파일을 읽어 정확한 원본값으로 복원합니다.
        """
        try:
            data = {
                "timestamp": datetime.datetime.now().isoformat(),
                "original_toast": self._original_toast,
                "original_balloon": self._original_balloon,
                "original_action_center": self._original_action_center,
                "original_sound": self._original_sound,
            }
            with open(_MARKER_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except OSError:
            pass

    @staticmethod
    def _remove_marker():
        try:
            os.remove(_MARKER_FILE)
        except OSError:
            pass

    # ── 로깅 ──

    def _log(self, msg: str):
        try:
            ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
            with open(self._log_path, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] NOTIF: {msg}\n")
        except Exception:
            pass


# ── 모듈 레벨 유틸 (레지스트리 조작) ──

def _reg_get_dword(subkey: str, name: str, default=None) -> Optional[int]:
    """HKCU에서 DWORD 값 읽기"""
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, name)
        winreg.CloseKey(key)
        return val
    except (FileNotFoundError, OSError):
        return default


def _reg_set_dword(subkey: str, name: str, value: int, create_key: bool = False):
    """HKCU에 DWORD 값 쓰기"""
    try:
        if create_key:
            key = winreg.CreateKeyEx(
                winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_ALL_ACCESS,
            )
        else:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_ALL_ACCESS,
            )
        winreg.SetValueEx(key, name, 0, winreg.REG_DWORD, value)
        winreg.CloseKey(key)
    except OSError as e:
        _static_log(f"[WARN] 레지스트리 쓰기 실패: {subkey}\\{name} = {value} — {e}")


def _reg_delete_value(subkey: str, name: str):
    """HKCU에서 레지스트리 값 삭제"""
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_ALL_ACCESS,
        )
        winreg.DeleteValue(key, name)
        winreg.CloseKey(key)
    except (FileNotFoundError, OSError):
        pass


def _static_log(msg: str):
    """모듈 레벨 로그 (recover 등 인스턴스 없이 호출)"""
    try:
        ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_path = os.path.join(get_app_dir(), "debug_trace.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] NOTIF: {msg}\n")
    except Exception:
        pass

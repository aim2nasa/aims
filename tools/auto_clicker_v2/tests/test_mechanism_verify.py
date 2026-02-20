# -*- coding: utf-8 -*-
"""notification_blocker 메커니즘 실증 검증

스크린샷이 아닌 프로그래밍적 방법으로 각 Layer가 동작하는지 증명합니다.

Layer 1: 레지스트리 값 변경 확인
Layer 1B: ShellExperienceHost 재시작 확인 (PID 변경)
Layer 1C: WM_SETTINGCHANGE 브로드캐스트 (호출 성공 확인)
Layer 2: 테스트 팝업 창 숨김 확인

실행: python tests/test_mechanism_verify.py
"""
import ctypes
import ctypes.wintypes
import os
import subprocess
import sys
import time
import winreg

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notification_blocker import (
    NotificationBlocker,
    _REG_NOTIFICATIONS,
    _REG_EXPLORER_ADV,
    _reg_get_dword,
)

user32 = ctypes.windll.user32

_passed = 0
_failed = 0


def check(name, condition, detail=""):
    global _passed, _failed
    if condition:
        _passed += 1
        print(f"  [PASS] {name}")
    else:
        _failed += 1
        msg = f"  [FAIL] {name}"
        if detail:
            msg += f" -- {detail}"
        print(msg)


def get_shell_host_pid():
    """ShellExperienceHost.exe의 PID 반환 (없으면 None)"""
    try:
        result = subprocess.run(
            ["tasklist", "/fi", "imagename eq ShellExperienceHost.exe", "/fo", "csv", "/nh"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.strip().split("\n"):
            if "ShellExperienceHost" in line:
                parts = line.strip('"').split('","')
                if len(parts) >= 2:
                    return int(parts[1])
    except Exception:
        pass
    return None


def create_notification_popup():
    """알림 영역(우측 하단)에 TOPMOST+TOOLWINDOW 팝업 생성, hwnd 반환"""
    WS_EX_TOPMOST = 0x00000008
    WS_EX_TOOLWINDOW = 0x00000080
    WS_POPUP = 0x80000000
    WS_VISIBLE = 0x10000000

    WNDPROC = ctypes.WINFUNCTYPE(
        ctypes.c_long, ctypes.c_void_p, ctypes.c_uint,
        ctypes.c_void_p, ctypes.c_void_p,
    )

    def wnd_proc(hwnd, msg, wparam, lparam):
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    create_notification_popup._proc = WNDPROC(wnd_proc)

    class WNDCLASSEXW(ctypes.Structure):
        _fields_ = [
            ("cbSize", ctypes.c_uint), ("style", ctypes.c_uint),
            ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int), ("hInstance", ctypes.c_void_p),
            ("hIcon", ctypes.c_void_p), ("hCursor", ctypes.c_void_p),
            ("hbrBackground", ctypes.c_void_p), ("lpszMenuName", ctypes.c_wchar_p),
            ("lpszClassName", ctypes.c_wchar_p), ("hIconSm", ctypes.c_void_p),
        ]

    cls_name = f"TestNotifVerify_{int(time.time() * 1000)}"
    wc = WNDCLASSEXW()
    wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
    wc.lpfnWndProc = create_notification_popup._proc
    wc.lpszClassName = cls_name
    wc.hbrBackground = ctypes.windll.gdi32.GetStockObject(0)

    atom = user32.RegisterClassExW(ctypes.byref(wc))
    if not atom:
        return 0

    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)

    hwnd = user32.CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
        cls_name, "Fake Notification Ad",
        WS_POPUP | WS_VISIBLE,
        sw - 350, sh - 200, 300, 100,
        None, None, None, None,
    )
    return hwnd


def main():
    print("=" * 70)
    print("NotificationBlocker Mechanism Verification")
    print("=" * 70)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Layer 1: 레지스트리 변경 검증
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("\n[Layer 1] Registry Modification")

    orig_toast = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", default=1,
    )
    orig_sound = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", default=1,
    )
    orig_balloon = _reg_get_dword(
        _REG_EXPLORER_ADV, "EnableBalloonTips", default=1,
    )
    print(f"  Before: toast={orig_toast}, sound={orig_sound}, balloon={orig_balloon}")

    blocker = NotificationBlocker()
    blocker.block()

    toast_blocked = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", default=1,
    )
    sound_blocked = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", default=1,
    )
    balloon_blocked = _reg_get_dword(
        _REG_EXPLORER_ADV, "EnableBalloonTips", default=1,
    )
    print(f"  After block: toast={toast_blocked}, sound={sound_blocked}, balloon={balloon_blocked}")

    check("Toast disabled (0)", toast_blocked == 0, f"got {toast_blocked}")
    check("Sound disabled (0)", sound_blocked == 0, f"got {sound_blocked}")
    check("Balloon disabled (0)", balloon_blocked == 0, f"got {balloon_blocked}")

    blocker.restore()

    toast_restored = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED", default=1,
    )
    sound_restored = _reg_get_dword(
        _REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND", default=1,
    )
    balloon_restored = _reg_get_dword(
        _REG_EXPLORER_ADV, "EnableBalloonTips", default=1,
    )
    print(f"  After restore: toast={toast_restored}, sound={sound_restored}, balloon={balloon_restored}")

    check("Toast restored", toast_restored == orig_toast,
          f"expected {orig_toast}, got {toast_restored}")
    check("Sound restored", sound_restored == orig_sound,
          f"expected {orig_sound}, got {sound_restored}")
    check("Balloon restored", balloon_restored == orig_balloon,
          f"expected {orig_balloon}, got {balloon_restored}")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Layer 1B: ShellExperienceHost 재시작 검증
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("\n[Layer 1B] ShellExperienceHost Restart")

    pid_before = get_shell_host_pid()
    print(f"  PID before block: {pid_before}")

    if pid_before is None:
        print("  [SKIP] ShellExperienceHost not running")
    else:
        blocker2 = NotificationBlocker()
        blocker2.block()

        # block() 내부에서 ShellExperienceHost를 kill하고 1초 대기
        # 자동 재시작되므로 새 PID가 있어야 함
        time.sleep(2)  # 추가 대기 (재시작 충분히 기다림)

        pid_after = get_shell_host_pid()
        print(f"  PID after block: {pid_after}")

        check("ShellExperienceHost restarted (PID changed)",
              pid_after is not None and pid_after != pid_before,
              f"before={pid_before}, after={pid_after}")

        blocker2.restore()
        time.sleep(1)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Layer 1C: WM_SETTINGCHANGE 브로드캐스트 검증
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("\n[Layer 1C] WM_SETTINGCHANGE Broadcast")

    # 브로드캐스트는 block/restore 내부에서 자동 호출됨
    # 에러 없이 완료되었으면 성공 (로그 확인)
    from path_helper import get_app_dir
    log_path = os.path.join(get_app_dir(), "debug_trace.log")
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8") as f:
            log_content = f.read()
        broadcast_count = log_content.count("WM_SETTINGCHANGE")
        check("WM_SETTINGCHANGE logged", broadcast_count > 0,
              f"found {broadcast_count} entries")
        shell_count = log_content.count("ShellExperienceHost")
        check("ShellExperienceHost restart logged", shell_count > 0,
              f"found {shell_count} entries")
    else:
        print("  [SKIP] Log file not found")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Layer 2: 서드파티 팝업 창 숨김 검증
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("\n[Layer 2] Third-party Popup Hiding")

    blocker3 = NotificationBlocker()
    blocker3.block()
    time.sleep(0.5)

    # 블로커 활성 상태에서 팝업 생성 (알약 등 서드파티 광고 시뮬레이션)
    hwnd = create_notification_popup()
    if hwnd:
        print(f"  Popup created: hwnd={hwnd}")
        visible_before = user32.IsWindowVisible(hwnd)
        print(f"  Visible immediately: {bool(visible_before)}")

        # 모니터 스레드가 감지할 시간 대기
        # 메시지 펌프 필수: cross-thread ShowWindow는 대상 스레드가
        # 메시지를 처리해야 동작함 (실제 알림 앱은 자체 메시지 루프 보유)
        hidden = False
        msg = ctypes.wintypes.MSG()
        for i in range(50):
            # 메시지 펌프: ShowWindow가 보낸 WM 메시지 처리
            while user32.PeekMessageW(
                ctypes.byref(msg), None, 0, 0, 1,  # PM_REMOVE
            ):
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))

            if not user32.IsWindowVisible(hwnd):
                hidden = True
                print(f"  Hidden after {(i + 1) * 0.1:.1f}s")
                break
            time.sleep(0.1)

        if not hidden:
            print(f"  Still visible after 5s")

        check("Popup hidden by monitor thread", hidden,
              "monitor thread did not hide popup within 5s")

        user32.DestroyWindow(hwnd)
    else:
        print("  [SKIP] Popup creation failed")

    blocker3.restore()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 결과 요약
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("\n" + "=" * 70)
    total = _passed + _failed
    if _failed == 0:
        print(f"RESULT: ALL {total} CHECKS PASSED")
    else:
        print(f"RESULT: {_passed}/{total} PASSED, {_failed} FAILED")
    print("=" * 70)

    # 동작 원리 설명
    print("""
=== How it works (why this proves blocking) ===

[Layer 1] Registry: Windows toast settings set to DISABLED
  -> NOC_GLOBAL_SETTING_TOASTS_ENABLED = 0 (no toasts)
  -> NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND = 0 (no sounds)
  -> EnableBalloonTips = 0 (no balloon tips)

[Layer 1B] ShellExperienceHost: KILLED and auto-restarted
  -> This is the process that renders Windows toast notifications
  -> After restart, it reads the UPDATED registry (toasts disabled)
  -> Without this step, registry changes don't take effect immediately

[Layer 1C] WM_SETTINGCHANGE: Broadcast to ALL windows
  -> Notifies all running applications that system settings changed
  -> Applications that respect this message will stop showing notifications

[Layer 2] Monitor Thread: Scans for popup windows every 0.3s
  -> Detects TOPMOST+TOOLWINDOW popups in notification zone (bottom-right)
  -> Immediately hides them (ShowWindow SW_HIDE)
  -> Catches: antivirus alerts (ALYac), update notifications, ad popups
  -> Does NOT catch: Windows UWP toasts (handled by Layer 1+1B instead)
""")

    sys.exit(1 if _failed else 0)


if __name__ == "__main__":
    main()

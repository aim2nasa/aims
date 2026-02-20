# -*- coding: utf-8 -*-
"""notification_blocker 동작 검증 스크립트

실행: python tests/test_notification_blocker.py
(auto_clicker_v2 디렉토리에서 실행)

검증 항목:
  1. 레지스트리: block → 값 변경 확인, restore → 원래 값 복원 확인
  2. 모니터 스레드: block 후 활성 확인, restore 후 종료 확인
  3. 창 감지: 테스트용 팝업 창 → 알림 영역에서 숨김 확인
  4. 크래시 복원: marker 파일 기반 복원 확인
  5. 중복 호출 안전성: block/restore 반복 호출 시 오류 없음
"""
import ctypes
import ctypes.wintypes
import os
import sys
import time
import winreg

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notification_blocker import (
    NotificationBlocker,
    _MARKER_FILE,
    _REG_NOTIFICATIONS,
    _REG_EXPLORER_ADV,
    _REG_EXPLORER_POLICY,
    _reg_get_dword,
)

user32 = ctypes.windll.user32

# ── 헬퍼 ──

_passed = 0
_failed = 0


def check(name: str, condition: bool, detail: str = ""):
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


def read_reg(subkey, name):
    """레지스트리 값 읽기 (없으면 None)"""
    return _reg_get_dword(subkey, name, default=None)


def create_test_popup(x: int, y: int, w: int = 300, h: int = 100) -> int:
    """테스트용 TOPMOST+TOOLWINDOW 팝업 창 생성 (알림 영역)"""
    WS_EX_TOPMOST = 0x00000008
    WS_EX_TOOLWINDOW = 0x00000080
    WS_POPUP = 0x80000000
    WS_VISIBLE = 0x10000000

    # WNDCLASSEXW 등록
    WNDPROC = ctypes.WINFUNCTYPE(
        ctypes.c_long, ctypes.c_void_p, ctypes.c_uint,
        ctypes.c_void_p, ctypes.c_void_p,
    )

    def wnd_proc(hwnd, msg, wparam, lparam):
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    # 콜백을 살려두기 위해 변수에 유지
    create_test_popup._proc = WNDPROC(wnd_proc)

    class WNDCLASSEXW(ctypes.Structure):
        _fields_ = [
            ("cbSize", ctypes.c_uint),
            ("style", ctypes.c_uint),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", ctypes.c_void_p),
            ("hIcon", ctypes.c_void_p),
            ("hCursor", ctypes.c_void_p),
            ("hbrBackground", ctypes.c_void_p),
            ("lpszMenuName", ctypes.c_wchar_p),
            ("lpszClassName", ctypes.c_wchar_p),
            ("hIconSm", ctypes.c_void_p),
        ]

    cls_name = f"TestNotifPopup_{int(time.time() * 1000)}"
    wc = WNDCLASSEXW()
    wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
    wc.lpfnWndProc = create_test_popup._proc
    wc.lpszClassName = cls_name
    wc.hbrBackground = ctypes.windll.gdi32.GetStockObject(0)  # WHITE_BRUSH

    atom = user32.RegisterClassExW(ctypes.byref(wc))
    if not atom:
        return 0

    hwnd = user32.CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
        cls_name, "Test Notification",
        WS_POPUP | WS_VISIBLE,
        x, y, w, h,
        None, None, None, None,
    )
    return hwnd


# ── 테스트 ──

def test_registry():
    """테스트 1: 레지스트리 block/restore 검증"""
    print("\n[1] 레지스트리 block/restore")

    # 현재 값 기록
    orig_toast = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    orig_balloon = read_reg(_REG_EXPLORER_ADV, "EnableBalloonTips")
    orig_ac = read_reg(_REG_EXPLORER_POLICY, "DisableNotificationCenter")
    print(f"  원본: toast={orig_toast}, balloon={orig_balloon}, action_center={orig_ac}")

    blocker = NotificationBlocker()
    blocker.block()

    # block 후: 값이 비활성화되었는지
    toast_after = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    balloon_after = read_reg(_REG_EXPLORER_ADV, "EnableBalloonTips")
    ac_after = read_reg(_REG_EXPLORER_POLICY, "DisableNotificationCenter")
    print(f"  block 후: toast={toast_after}, balloon={balloon_after}, action_center={ac_after}")

    check("토스트 비활성화", toast_after == 0, f"expected 0, got {toast_after}")
    check("풍선 비활성화", balloon_after == 0, f"expected 0, got {balloon_after}")
    # Policy 키는 권한 부족으로 실패할 수 있음
    if ac_after is not None:
        check("Action Center 비활성화", ac_after == 1, f"expected 1, got {ac_after}")
    else:
        print("  [SKIP] Action Center -- Policy 키 쓰기 권한 없음 (정상)")

    blocker.restore()

    # restore 후: 원래 값 복원 확인
    toast_restored = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    balloon_restored = read_reg(_REG_EXPLORER_ADV, "EnableBalloonTips")
    ac_restored = read_reg(_REG_EXPLORER_POLICY, "DisableNotificationCenter")
    print(f"  restore: toast={toast_restored}, balloon={balloon_restored}, action_center={ac_restored}")

    check("toast restore", toast_restored == orig_toast,
          f"expected {orig_toast}, got {toast_restored}")
    check("balloon restore", balloon_restored == orig_balloon,
          f"expected {orig_balloon}, got {balloon_restored}")
    check("action center restore", ac_restored == orig_ac,
          f"expected {orig_ac}, got {ac_restored}")


def test_monitor_thread():
    """테스트 2: 모니터 스레드 생명주기"""
    print("\n[2] 모니터 스레드 생명주기")

    blocker = NotificationBlocker()

    check("초기 비활성", not blocker.is_active)

    blocker.block()
    check("block 후 활성", blocker.is_active)
    check("스레드 실행 중", blocker._thread is not None and blocker._thread.is_alive())

    thread = blocker._thread
    blocker.restore()
    time.sleep(0.5)  # 스레드 종료 대기

    check("restore 후 비활성", not blocker.is_active)
    check("스레드 종료", not thread.is_alive(), "스레드가 아직 실행 중")


def test_window_detection():
    """테스트 3: 알림 영역 팝업 창 감지 및 숨김"""
    print("\n[3] 창 감지 및 숨김")

    # 화면 우측 하단에 테스트 팝업 생성
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    popup_x = sw - 350
    popup_y = sh - 200

    hwnd = create_test_popup(popup_x, popup_y)
    if not hwnd:
        print("  [SKIP] popup creation failed (may need admin)")
        return

    check("팝업 생성됨", user32.IsWindowVisible(hwnd))

    blocker = NotificationBlocker()
    blocker.block()
    time.sleep(0.5)  # 모니터 스레드가 감지할 시간

    visible = user32.IsWindowVisible(hwnd)
    check("팝업 숨김 처리됨", not visible,
          f"IsWindowVisible={visible} (여전히 보임)")

    blocker.restore()

    # 정리
    user32.DestroyWindow(hwnd)


def test_crash_recovery():
    """테스트 4: 크래시 복원 (marker 파일)"""
    print("\n[4] 크래시 복원")

    import json

    # 4A: 손상된 marker 파일 → 시스템 기본값(1)으로 복원
    print("  [4A] 손상된 marker 파일 (기본값 복원)")
    with open(_MARKER_FILE, "w") as f:
        f.write("corrupted-data")
    check("마커 파일 존재", os.path.exists(_MARKER_FILE))

    NotificationBlocker.recover_if_needed()
    check("마커 파일 삭제됨", not os.path.exists(_MARKER_FILE))

    toast = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    check("손상 marker: 토스트 기본값(1)", toast == 1, f"got {toast}")

    # 4B: 정상 JSON marker → 원본값 정확 복원
    print("  [4B] JSON marker 파일 (정확한 원본값 복원)")
    with open(_MARKER_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "original_toast": 1,
            "original_sound": 1,
            "original_balloon": 1,
            "original_action_center": None,
        }, f)
    check("JSON 마커 파일 존재", os.path.exists(_MARKER_FILE))

    NotificationBlocker.recover_if_needed()
    check("JSON 마커 파일 삭제됨", not os.path.exists(_MARKER_FILE))

    toast = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    sound = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND")
    balloon = read_reg(_REG_EXPLORER_ADV, "EnableBalloonTips")
    check("JSON marker: 토스트 복원", toast == 1, f"got {toast}")
    check("JSON marker: 사운드 복원", sound == 1, f"got {sound}")
    check("JSON marker: 풍선 복원", balloon == 1, f"got {balloon}")


def test_idempotent():
    """테스트 5: 중복 호출 안전성"""
    print("\n[5] 중복 호출 안전성")

    blocker = NotificationBlocker()

    # block 2회
    blocker.block()
    blocker.block()  # 두 번째는 무시되어야 함
    check("block 2회: 활성 상태 유지", blocker.is_active)

    # restore 2회
    blocker.restore()
    blocker.restore()  # 두 번째는 무시되어야 함
    check("restore 2회: 비활성 상태", not blocker.is_active)

    # 레지스트리 정상 복원 확인
    toast = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
    check("중복 restore 후 레지스트리 정상", toast is not None and toast != 0,
          f"toast={toast}")


def test_block_restore_cycle():
    """테스트 6: block → restore → block → restore 반복"""
    print("\n[6] block/restore 반복 사이클")

    blocker = NotificationBlocker()
    orig_toast = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")

    for i in range(3):
        blocker.block()
        val = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
        check(f"사이클 {i+1} block: toast=0", val == 0, f"got {val}")

        blocker.restore()
        val = read_reg(_REG_NOTIFICATIONS, "NOC_GLOBAL_SETTING_TOASTS_ENABLED")
        check(f"사이클 {i+1} restore: toast={orig_toast}", val == orig_toast,
              f"got {val}")


# ── 메인 ──

if __name__ == "__main__":
    print("=" * 60)
    print("NotificationBlocker 동작 검증")
    print("=" * 60)

    test_registry()
    test_monitor_thread()
    test_window_detection()
    test_crash_recovery()
    test_idempotent()
    test_block_restore_cycle()

    print("\n" + "=" * 60)
    total = _passed + _failed
    if _failed == 0:
        print(f"결과: 전체 {total}건 PASS")
    else:
        print(f"결과: {_passed}/{total} PASS, {_failed} FAIL")
    print("=" * 60)

    sys.exit(1 if _failed else 0)

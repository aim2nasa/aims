# -*- coding: utf-8 -*-
"""notification_blocker 실전 검증 스크립트

실제 Windows 토스트 알림을 발생시킨 뒤, blocker가 차단하는지 확인합니다.

실행: python tests/test_notification_real.py
"""
import ctypes
import ctypes.wintypes
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notification_blocker import NotificationBlocker

user32 = ctypes.windll.user32


def send_real_toast():
    """PowerShell로 실제 Windows 토스트 알림 발생"""
    ps_script = r'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>AC Test Notification</text>
      <text>This should be blocked by NotificationBlocker</text>
    </binding>
  </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AutoClicker.Test")
$notifier.Show($toast)
'''
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_script],
        capture_output=True, text=True, timeout=10,
    )
    return result.returncode == 0, result.stderr


def find_notification_windows():
    """현재 화면에 보이는 알림 관련 창 목록 반환"""
    found = []
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    zone_left = sw - 500
    zone_top = sh - 300

    WNDENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM,
    )

    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True

        cls_buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls_buf, 256)
        cls = cls_buf.value

        title_buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, title_buf, 256)
        title = title_buf.value

        rect = ctypes.wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))

        # 우측 하단 영역에 있는 창만
        if rect.right > zone_left and rect.top > zone_top:
            w = rect.right - rect.left
            h = rect.bottom - rect.top
            if 30 < w < 700 and 20 < h < 500:
                ex = user32.GetWindowLongW(hwnd, -20)  # GWL_EXSTYLE
                found.append({
                    "hwnd": hwnd,
                    "class": cls,
                    "title": title[:60],
                    "rect": f"({rect.left},{rect.top},{rect.right},{rect.bottom})",
                    "size": f"{w}x{h}",
                    "topmost": bool(ex & 0x8),
                    "toolwin": bool(ex & 0x80),
                    "noactivate": bool(ex & 0x08000000),
                })
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return found


def main():
    print("=" * 70)
    print("NotificationBlocker REAL-WORLD TEST")
    print("=" * 70)

    # Phase 1: blocker 없이 토스트 발생 → 어떤 창이 뜨는지 관찰
    print("\n[Phase 1] blocker OFF -- send toast, observe windows")
    print("  Sending toast notification...")
    ok, err = send_real_toast()
    if not ok:
        print(f"  Toast send failed: {err}")
        print("  (WinRT not available? Trying alternative...)")
    else:
        print("  Toast sent OK")

    time.sleep(3)
    windows_before = find_notification_windows()
    print(f"  Bottom-right windows found: {len(windows_before)}")
    for w in windows_before:
        print(f"    hwnd={w['hwnd']} class={w['class']!r} title={w['title']!r}")
        print(f"      {w['size']} {w['rect']} topmost={w['topmost']} "
              f"tool={w['toolwin']} noact={w['noactivate']}")

    # Phase 2: blocker ON → 토스트 발생 → 차단 확인
    print("\n[Phase 2] blocker ON -- send toast, check blocking")
    blocker = NotificationBlocker()
    blocker.block()
    print("  Blocker activated")
    print(f"  Registry applied, monitor thread running: {blocker._thread.is_alive()}")

    time.sleep(1)
    print("  Sending toast notification...")
    ok2, err2 = send_real_toast()
    if ok2:
        print("  Toast sent OK")
    else:
        print(f"  Toast send result: {err2[:100]}")

    time.sleep(3)
    windows_after = find_notification_windows()
    print(f"  Bottom-right windows found: {len(windows_after)}")
    for w in windows_after:
        print(f"    hwnd={w['hwnd']} class={w['class']!r} title={w['title']!r}")
        print(f"      {w['size']} {w['rect']} topmost={w['topmost']} "
              f"tool={w['toolwin']} noact={w['noactivate']}")

    # Phase 3: restore
    print("\n[Phase 3] blocker OFF -- restore")
    blocker.restore()
    print("  Blocker deactivated, settings restored")

    # Phase 4: 결과 판정
    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)

    if len(windows_after) < len(windows_before):
        print("[PASS] Blocker reduced notification windows")
        print(f"  Before: {len(windows_before)} -> After: {len(windows_after)}")
    elif len(windows_after) == 0 and len(windows_before) == 0:
        print("[INFO] No notification windows detected in either phase")
        print("  Toast may not have rendered (background app, Focus Assist, etc)")
        print("  Registry blocking likely prevented toast from appearing")
    elif len(windows_after) == 0:
        print("[PASS] No notification windows visible with blocker ON")
    else:
        print("[WARN] Notification windows still visible with blocker ON")
        print("  May need explorer restart for registry to take effect")
        print("  Monitor thread heuristic may not match these window styles")

    print()


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Windows toast notification 발생 후 모든 창 스캔

실제 토스트 알림이 어떤 Window Class/Style로 나타나는지 확인합니다.
"""
import ctypes
import ctypes.wintypes
import os
import subprocess
import sys
import time

user32 = ctypes.windll.user32
WNDENUMPROC = ctypes.WINFUNCTYPE(
    ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM,
)


def scan_all_windows():
    """모든 보이는 창의 정보 수집"""
    windows = []

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
        w = rect.right - rect.left
        h = rect.bottom - rect.top

        ex = user32.GetWindowLongW(hwnd, -20)

        windows.append({
            "hwnd": hwnd,
            "class": cls,
            "title": title[:80] if title else "",
            "left": rect.left, "top": rect.top,
            "right": rect.right, "bottom": rect.bottom,
            "w": w, "h": h,
            "topmost": bool(ex & 0x8),
            "toolwin": bool(ex & 0x80),
            "noactivate": bool(ex & 0x08000000),
        })
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return windows


def send_toast():
    ps = r'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>TEST ALERT</text><text>Scan me!</text></binding></visual></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AC.Test").Show($toast)
'''
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, timeout=10)


def main():
    sw = user32.GetSystemMetrics(0)
    sh = user32.GetSystemMetrics(1)
    print(f"Screen: {sw}x{sh}")
    print(f"Notification zone: x>{sw-500}, y>{sh-300}")

    # 토스트 발생 전 스냅샷
    before = {w["hwnd"] for w in scan_all_windows()}
    print(f"\nBefore toast: {len(before)} visible windows")

    # 토스트 발생
    print("Sending toast...")
    send_toast()
    time.sleep(2)

    # 토스트 발생 후 스냅샷
    after_all = scan_all_windows()
    after_set = {w["hwnd"] for w in after_all}
    print(f"After toast: {len(after_set)} visible windows")

    # 새로 나타난 창
    new_hwnds = after_set - before
    print(f"\nNEW windows appeared: {len(new_hwnds)}")

    if new_hwnds:
        for w in after_all:
            if w["hwnd"] in new_hwnds:
                print(f"\n  hwnd={w['hwnd']}")
                print(f"  class={w['class']!r}")
                print(f"  title={w['title']!r}")
                print(f"  pos=({w['left']},{w['top']})-({w['right']},{w['bottom']}) {w['w']}x{w['h']}")
                print(f"  topmost={w['topmost']} toolwin={w['toolwin']} noactivate={w['noactivate']}")

                # 알림 영역 내인지
                in_zone = w["right"] > sw - 500 and w["top"] > sh - 300
                print(f"  in_notification_zone={in_zone}")
    else:
        print("\n  (No new windows! Toast may be rendered inside existing CoreWindow)")
        # CoreWindow 찾기
        print("\n  Searching for Windows.UI.Core.CoreWindow...")
        for w in after_all:
            if "CoreWindow" in w["class"] or "Notification" in w["title"].lower():
                print(f"    hwnd={w['hwnd']} class={w['class']!r} "
                      f"title={w['title']!r} {w['w']}x{w['h']} "
                      f"pos=({w['left']},{w['top']})")

    # 5초 더 기다렸다가 다시 스캔 (알림이 늦게 뜰 수 있음)
    print("\nWaiting 5 more seconds...")
    time.sleep(5)
    late_all = scan_all_windows()
    late_set = {w["hwnd"] for w in late_all}
    late_new = late_set - before
    if late_new - new_hwnds:
        print(f"LATE new windows: {len(late_new - new_hwnds)}")
        for w in late_all:
            if w["hwnd"] in (late_new - new_hwnds):
                print(f"  hwnd={w['hwnd']} class={w['class']!r} "
                      f"title={w['title']!r} {w['w']}x{w['h']}")
    else:
        print("No additional windows appeared")


if __name__ == "__main__":
    main()

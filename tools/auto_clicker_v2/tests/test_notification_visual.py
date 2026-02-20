# -*- coding: utf-8 -*-
"""스크린캡처로 토스트 알림 차단 여부 시각적 검증

1. blocker OFF -> toast -> 캡처 (알림이 보여야 함)
2. blocker ON  -> toast -> 캡처 (알림이 안 보여야 함)
3. restore -> 완료

캡처 파일: D:/tmp/notif_test_*.png
"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notification_blocker import NotificationBlocker


def send_toast(msg="TEST"):
    ps = f'''
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast duration="long"><visual><binding template="ToastGeneric"><text>{msg}</text><text>Notification blocker test - should this be visible?</text></binding></visual></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("AC.Test").Show($toast)
'''
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, timeout=10)


def capture(filename):
    """DXGI 캡처"""
    capture_py = os.path.join(os.path.dirname(__file__), "..", "..", "capture", "capture.py")
    if not os.path.exists(capture_py):
        # fallback: PowerShell screenshot
        ps = f'''
Add-Type -AssemblyName System.Windows.Forms
$bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
$bmp.Save("{filename}")
$g.Dispose()
$bmp.Dispose()
'''
        subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       capture_output=True, timeout=10)
    else:
        subprocess.run([sys.executable, capture_py, "--monitor", "1",
                        "--output", filename], capture_output=True, timeout=10)
    return os.path.exists(filename)


def main():
    os.makedirs("D:/tmp", exist_ok=True)
    print("=" * 60)
    print("Visual Notification Blocking Test")
    print("=" * 60)

    # Phase 1: blocker OFF
    print("\n[Phase 1] Blocker OFF - sending toast...")
    send_toast("BLOCKER OFF - You should SEE this")
    time.sleep(3)
    f1 = "D:/tmp/notif_test_1_blocker_OFF.png"
    if capture(f1):
        print(f"  Captured: {f1}")
    else:
        print("  Capture failed")

    time.sleep(3)  # toast 사라질 때까지 대기

    # Phase 2: blocker ON
    print("\n[Phase 2] Blocker ON - activating...")
    blocker = NotificationBlocker()
    blocker.block()
    print("  Blocker active. Sending toast...")
    time.sleep(1)
    send_toast("BLOCKER ON - You should NOT see this")
    time.sleep(3)
    f2 = "D:/tmp/notif_test_2_blocker_ON.png"
    if capture(f2):
        print(f"  Captured: {f2}")
    else:
        print("  Capture failed")

    # Phase 3: restore
    print("\n[Phase 3] Restoring...")
    blocker.restore()
    print("  Blocker deactivated")

    # Phase 4: verify restore works
    print("\n[Phase 4] Blocker OFF again - sending toast to verify restore...")
    time.sleep(2)
    send_toast("RESTORED - You should SEE this again")
    time.sleep(3)
    f3 = "D:/tmp/notif_test_3_restored.png"
    if capture(f3):
        print(f"  Captured: {f3}")
    else:
        print("  Capture failed")

    print("\n" + "=" * 60)
    print("Compare the 3 screenshots:")
    print(f"  1. {f1}  <-- toast should be VISIBLE")
    print(f"  2. {f2}  <-- toast should be BLOCKED")
    print(f"  3. {f3}  <-- toast should be VISIBLE (restored)")
    print("=" * 60)


if __name__ == "__main__":
    main()

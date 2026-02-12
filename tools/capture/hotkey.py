# hotkey.py - Ctrl+Alt+1/2 글로벌 핫키로 화면 캡처
import keyboard
import subprocess
import sys
import os

CAPTURE_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capture.py")
PYTHON = sys.executable
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hotkey.log")

def on_capture(monitor):
    with open(LOG, "a") as f:
        f.write(f"Hotkey pressed: monitor {monitor}\n")
    try:
        result = subprocess.run(
            [PYTHON, CAPTURE_SCRIPT, "--monitor", str(monitor)],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW
        )
        with open(LOG, "a") as f:
            f.write(f"  stdout: {result.stdout.strip()}\n")
            if result.stderr:
                f.write(f"  stderr: {result.stderr.strip()[:200]}\n")
    except Exception as e:
        with open(LOG, "a") as f:
            f.write(f"  ERROR: {e}\n")

keyboard.add_hotkey("ctrl+alt+1", lambda: on_capture(1))
keyboard.add_hotkey("ctrl+alt+2", lambda: on_capture(2))

print("Capture hotkeys active: Ctrl+Alt+1, Ctrl+Alt+2")
keyboard.wait()

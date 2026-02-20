# -*- coding: utf-8 -*-
"""
AC Pause/Resume 스트레스 테스트 — GUI 버튼 클릭 방식

실제 사용자가 하는 것과 동일하게:
  1. AC GUI의 "일시정지" 버튼을 클릭하여 pause
  2. 마우스를 다른 곳으로 이동 (사용자 행동 시뮬레이션)
  3. AC GUI의 "계속" 버튼을 클릭하여 resume
  4. AC 종료까지 반복

사용법:
  python test_pause_injector.py --continuous --auto-start
"""
import os
import sys
import time
import random
import ctypes
import ctypes.wintypes as wintypes
import subprocess

RESULT_FILE = r"D:\tmp\pause_injector_result.txt"

user32 = ctypes.windll.user32
EnumWindows = user32.EnumWindows
GetWindowTextW = user32.GetWindowTextW
IsWindowVisible = user32.IsWindowVisible
GetWindowRect = user32.GetWindowRect
SetForegroundWindow = user32.SetForegroundWindow
SetCursorPos = user32.SetCursorPos
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)


def click(x, y):
    """스크린 좌표 (x, y)를 클릭"""
    SetCursorPos(x, y)
    time.sleep(0.1)
    user32.mouse_event(0x0002, 0, 0, 0, 0)  # LEFTDOWN
    time.sleep(0.05)
    user32.mouse_event(0x0004, 0, 0, 0, 0)  # LEFTUP


def get_mouse_pos():
    pt = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


def find_ac_gui():
    """AC GUI 윈도우 찾기. (hwnd, left, top, right, bottom) 반환"""
    results = []
    def callback(hwnd, lParam):
        if IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(256)
            GetWindowTextW(hwnd, buf, 256)
            title = buf.value
            if title and "AutoClicker v" in title:
                rect = wintypes.RECT()
                GetWindowRect(hwnd, ctypes.byref(rect))
                results.append((hwnd, rect.left, rect.top, rect.right, rect.bottom))
        return True
    EnumWindows(WNDENUMPROC(callback), 0)
    return results[0] if results else None


def is_ac_running():
    """AC(SikuliX/Java) 프로세스가 실행 중인지 확인"""
    try:
        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq java.exe"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if "java.exe" in line.lower():
                parts = line.split()
                for j, p in enumerate(parts):
                    if p == "K" and j > 0:
                        mem_str = parts[j - 1].replace(",", "")
                        try:
                            if int(mem_str) > 100000:
                                return True
                        except ValueError:
                            pass
        return False
    except Exception:
        return True


def log(msg, f=None):
    ts = time.strftime("%H:%M:%S")
    line = "[%s] %s" % (ts, msg)
    print(line)
    sys.stdout.flush()
    if f:
        f.write(line + "\n")
        f.flush()


def run_continuous(pause_duration, interval_min, interval_max, move_mouse_enabled, auto_start):
    """AC GUI 버튼 클릭으로 pause/resume 반복 (AC 종료까지)"""
    with open(RESULT_FILE, "w", encoding="utf-8") as rf:
        log("=" * 60, rf)
        log("AC PAUSE/RESUME STRESS TEST (GUI BUTTON)", rf)
        log("  Mode: GUI 버튼 클릭 (실제 사용자 동일)", rf)
        log("  Pause duration: %ds" % pause_duration, rf)
        log("  Interval: %d-%ds" % (interval_min, interval_max), rf)
        log("  Mouse move: %s" % move_mouse_enabled, rf)
        log("=" * 60, rf)
        log("", rf)

        if not auto_start:
            log("AC가 GUI에서 실행 중이어야 합니다!", rf)
            log("준비되면 Enter를 누르세요...", rf)
            input()

        # AC GUI 찾기
        gui = find_ac_gui()
        if not gui:
            log("[ERROR] AC GUI 윈도우를 찾을 수 없습니다!", rf)
            return
        hwnd, gl, gt, gr, gb = gui
        gw = gr - gl
        gh = gb - gt
        log("AC GUI 발견: HWND=%d (%d,%d)-(%d,%d) %dx%d" % (hwnd, gl, gt, gr, gb, gw, gh), rf)

        # AC 프로세스 확인
        if not is_ac_running():
            log("[WARN] AC(Java) 프로세스 미감지! 10초 대기...", rf)
            time.sleep(10)

        log("시작! AC 종료까지 GUI 버튼으로 pause/resume 반복!", rf)
        log("", rf)

        pauses_done = 0

        while True:
            # 랜덤 간격 대기
            wait = random.uniform(interval_min, interval_max)
            pauses_done += 1
            log("Waiting %.1fs before pause #%d..." % (wait, pauses_done), rf)
            time.sleep(wait)

            # AC 생존 확인
            if not is_ac_running():
                log("", rf)
                log("[STOP] AC 프로세스 종료 감지! 테스트 종료.", rf)
                break

            # AC GUI 재검색 (윈도우가 이동/재생성될 수 있음)
            gui = find_ac_gui()
            if not gui:
                log("[WARN] AC GUI 찾을 수 없음 — 스킵", rf)
                continue
            hwnd, gl, gt, gr, gb = gui

            # === PAUSE: "일시정지" 버튼 클릭 ===
            # overrideredirect(True)로 타이틀바 없음! 버튼이 y=6-27에 위치
            # 픽셀 측정: 주황 버튼 x=62~125, y=6~27, 중심 (93, 16)
            pause_btn_x = gl + 93
            pause_btn_y = gt + 16
            log("--- PAUSE #%d START ---" % pauses_done, rf)

            mx, my = get_mouse_pos()
            log("  Mouse before: (%d, %d)" % (mx, my), rf)

            # AC GUI 활성화 후 일시정지 버튼 클릭
            SetForegroundWindow(hwnd)
            time.sleep(0.2)
            click(pause_btn_x, pause_btn_y)
            log("  [일시정지] 버튼 클릭: (%d, %d)" % (pause_btn_x, pause_btn_y), rf)
            time.sleep(0.5)

            # 마우스 이동 (사용자 행동 시뮬)
            if move_mouse_enabled:
                rx = random.randint(100, 1200)
                ry = random.randint(100, 800)
                SetCursorPos(rx, ry)
                log("  Mouse moved to: (%d, %d)" % (rx, ry), rf)

            # pause 유지
            time.sleep(pause_duration)

            # === RESUME: "계속" 버튼 클릭 ===
            # 같은 위치 (일시정지→계속 텍스트 변경, 타이틀바 없음)
            resume_btn_x = gl + 93
            resume_btn_y = gt + 16

            mx2, my2 = get_mouse_pos()
            log("  Mouse before resume: (%d, %d)" % (mx2, my2), rf)

            SetForegroundWindow(hwnd)
            time.sleep(0.2)
            click(resume_btn_x, resume_btn_y)
            log("  [계속] 버튼 클릭: (%d, %d)" % (resume_btn_x, resume_btn_y), rf)
            log("--- PAUSE #%d END (held %.1fs) ---" % (pauses_done, pause_duration), rf)

            # 재개 후 안정화 시간
            time.sleep(3)
            log("", rf)

        log("=" * 60, rf)
        log("STRESS TEST COMPLETE (GUI BUTTON)", rf)
        log("  Total pauses: %d" % pauses_done, rf)
        log("  AC 종료로 자동 중단", rf)
        log("=" * 60, rf)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--continuous", action="store_true")
    parser.add_argument("--auto-start", action="store_true")
    parser.add_argument("--pause-duration", type=int, default=4)
    parser.add_argument("--interval-min", type=int, default=8)
    parser.add_argument("--interval-max", type=int, default=20)
    parser.add_argument("--no-mouse", action="store_true")
    args = parser.parse_args()

    try:
        run_continuous(
            pause_duration=args.pause_duration,
            interval_min=args.interval_min,
            interval_max=args.interval_max,
            move_mouse_enabled=not args.no_mouse,
            auto_start=args.auto_start,
        )
    except KeyboardInterrupt:
        print("\nInterrupted")
        sys.exit(130)

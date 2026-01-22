# -*- coding: utf-8 -*-
"""
화면 캡처 도구
스페이스바를 누르면 지정된 모니터의 전체 화면을 캡처하여 저장합니다.
"""

import os
import sys
import time
import winsound
from datetime import datetime

try:
    import mss
    import mss.tools
except ImportError:
    print("[ERROR] mss 라이브러리가 필요합니다.")
    print("        pip install mss")
    sys.exit(1)

try:
    import keyboard
except ImportError:
    print("[ERROR] keyboard 라이브러리가 필요합니다.")
    print("        pip install keyboard")
    sys.exit(1)

# 설정 (환경변수로 오버라이드 가능)
SAVE_PATH = os.environ.get("CAPTURE_SAVE_PATH", "D:\\captures")
MONITOR_INDEX = int(os.environ.get("CAPTURE_MONITOR", "2"))  # 1 = 메인, 2 = 보조, 0 = 전체
HOTKEY = os.environ.get("CAPTURE_HOTKEY", "space")  # 캡처 핫키
EXIT_KEY = "esc"  # 종료 핫키

# 저장 폴더 생성
if not os.path.exists(SAVE_PATH):
    os.makedirs(SAVE_PATH)

# 캡처 카운터
capture_count = 0

def get_next_filename():
    """다음 저장 파일명 생성 (001.png, 002.png, ...)"""
    global capture_count
    capture_count += 1
    return os.path.join(SAVE_PATH, f"{capture_count:03d}.png")

def get_timestamp_filename():
    """타임스탬프 기반 파일명 생성"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(SAVE_PATH, f"capture_{timestamp}.png")

def capture_screen():
    """화면 캡처 실행"""
    global capture_count
    try:
        with mss.mss() as sct:
            # 모니터 정보 확인
            if MONITOR_INDEX >= len(sct.monitors):
                print(f"[ERROR] 모니터 {MONITOR_INDEX}가 없습니다. 사용 가능: 0~{len(sct.monitors)-1}")
                return

            # 캡처
            monitor = sct.monitors[MONITOR_INDEX]
            screenshot = sct.grab(monitor)

            # 저장
            filename = get_next_filename()
            mss.tools.to_png(screenshot.rgb, screenshot.size, output=filename)

            # 파일 저장 검증
            if os.path.exists(filename) and os.path.getsize(filename) > 0:
                # 캡처 성공 알림음
                winsound.Beep(1000, 100)  # 1000Hz, 100ms
                print(f"[캡처] {filename} ({screenshot.width}x{screenshot.height})")
            else:
                capture_count -= 1  # 실패 시 카운터 롤백
                print(f"[ERROR] 파일 저장 실패: {filename}")
    except Exception as e:
        capture_count -= 1  # 실패 시 카운터 롤백
        print(f"[ERROR] 캡처 실패: {e}")

def show_monitors():
    """사용 가능한 모니터 목록 표시"""
    with mss.mss() as sct:
        print("\n사용 가능한 모니터:")
        print("-" * 50)
        for i, m in enumerate(sct.monitors):
            if i == 0:
                print(f"  [{i}] 전체 화면: {m['width']}x{m['height']}")
            else:
                print(f"  [{i}] 모니터 {i}: {m['width']}x{m['height']} (위치: {m['left']}, {m['top']})")
        print("-" * 50)
        print(f"현재 설정: 모니터 {MONITOR_INDEX}")
        print()

def main():
    """메인 함수"""
    print("=" * 50)
    print("화면 캡처 도구")
    print("=" * 50)

    show_monitors()

    print(f"저장 경로: {SAVE_PATH}")
    print(f"캡처 키: {HOTKEY.upper()}")
    print(f"종료 키: {EXIT_KEY.upper()}")
    print()
    print("대기 중... (스페이스바를 누르면 캡처)")
    print()

    # 핫키 등록
    keyboard.add_hotkey(HOTKEY, capture_screen)

    # ESC 누를 때까지 대기
    keyboard.wait(EXIT_KEY)

    print("\n프로그램 종료")
    print(f"총 {capture_count}장 캡처됨")

if __name__ == "__main__":
    main()

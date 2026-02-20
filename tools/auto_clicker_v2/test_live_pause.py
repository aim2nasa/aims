# -*- coding: utf-8 -*-
"""
실제 AC 실행 + 자동 일시정지/재개 스트레스 테스트

동작:
1. SikuliX MetlifeCustomerList.py를 실행 (--only 모드로 1명만)
2. 실행 중 자동으로 일시정지 → 마우스 이동 → 앱 전환 시뮬 → 재개
3. 크래시 없이 완료되는지 확인

사용법:
  python test_live_pause.py [--customer 고객명] [--chosung ㅎ]
"""
import os
import sys
import time
import subprocess
import threading
import random
import ctypes

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PAUSE_SIGNAL = os.path.join(SCRIPT_DIR, ".pause_signal")
SIKULIX_JAR = r"C:\Sikulix\sikulixide-2.0.5.jar"
SCRIPT_PATH = os.path.join(SCRIPT_DIR, "MetlifeCustomerList.py")

# 테스트 설정
PAUSE_COUNT = 8        # 총 일시정지 횟수
PAUSE_DURATION = 3     # 각 일시정지 유지 시간(초)
PAUSE_INTERVAL_MIN = 5  # 일시정지 간 최소 간격(초)
PAUSE_INTERVAL_MAX = 12 # 일시정지 간 최대 간격(초)
MOUSE_MOVE_DURING_PAUSE = True  # 일시정지 중 마우스 이동 시뮬
RESULT_FILE = r"D:\tmp\live_test_result.txt"  # 결과 파일

# --- ctypes로 마우스 이동 (SikuliX 없이) ---
def move_mouse(x, y):
    ctypes.windll.user32.SetCursorPos(x, y)

def get_mouse_pos():
    from ctypes import wintypes
    pt = wintypes.POINT()
    ctypes.windll.user32.GetCursorPos(ctypes.byref(pt))
    return pt.x, pt.y


class LivePauseTester:
    def __init__(self, chosung="", customer="", no_ocr=True):
        self.chosung = chosung
        self.customer = customer
        self.no_ocr = no_ocr
        self.process = None
        self.stdout_lines = []
        self.pause_log = []
        self.crash_detected = False
        self.error_lines = []
        self._running = False

    def log(self, msg):
        ts = time.strftime("%H:%M:%S")
        line = "[%s] %s" % (ts, msg)
        print(line)
        sys.stdout.flush()
        self.pause_log.append(line)
        # 결과 파일에도 기록
        try:
            with open(RESULT_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except:
            pass

    def start_ac(self):
        """SikuliX 프로세스 시작"""
        cmd = [
            "java", "-Dfile.encoding=UTF-8",
            "-jar", SIKULIX_JAR,
            "-r", SCRIPT_PATH,
        ]
        extra = []
        if self.chosung:
            extra += ["--chosung", self.chosung]
        if self.customer:
            extra += ["--only", self.customer]
        if self.no_ocr:
            extra += ["--no-ocr"]
        # 통합뷰 비활성화 (빠른 테스트)
        # extra += ["--integrated-view"]  # 필요시 활성화

        if extra:
            cmd += ["--"] + extra

        self.log("AC START: %s" % " ".join(cmd[-6:]))

        # 이전 pause signal 정리
        if os.path.exists(PAUSE_SIGNAL):
            os.remove(PAUSE_SIGNAL)

        env = os.environ.copy()
        env["AC_HOME"] = SCRIPT_DIR

        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
            creationflags=0,  # no CREATE_NO_WINDOW
        )
        self._running = True

        # stdout 읽기 스레드
        t = threading.Thread(target=self._read_stdout, daemon=True)
        t.start()

    def _read_stdout(self):
        """SikuliX stdout 실시간 읽기 (CP949 + 0x82 backslash bug 보정)"""
        try:
            for raw_line in iter(self.process.stdout.readline, b''):
                # SikuliX 0x82 → 0x5C (backslash) 보정
                raw_line = raw_line.replace(b'\x82', b'\\')
                try:
                    line = raw_line.decode('cp949', errors='replace').rstrip()
                except:
                    line = raw_line.decode('utf-8', errors='replace').rstrip()

                self.stdout_lines.append(line)

                # 핵심 로그만 출력
                if any(kw in line for kw in [
                    '[1', '[2', 'FATAL', 'ERROR', 'PAUSE', 'CRASH',
                    'SystemExit', 'FindFailed', 'error', 'Exception',
                    'nav_retry', 'OCR', 'IPC', 'SCROLL', 'click',
                ]):
                    print("  AC> %s" % line[:120])
                    sys.stdout.flush()

                # 크래시 감지
                if any(kw in line for kw in ['FATAL', 'SystemExit', 'FindFailed', 'Traceback']):
                    self.error_lines.append(line)
        except:
            pass
        finally:
            self._running = False

    def do_pause(self, pause_num):
        """일시정지 실행: 신호 생성 → 마우스 이동 → 대기 → 신호 제거"""
        self.log("--- PAUSE #%d START ---" % pause_num)

        # 마우스 위치 기록
        mx, my = get_mouse_pos()
        self.log("  Mouse before pause: (%d, %d)" % (mx, my))

        # 일시정지 신호 생성
        with open(PAUSE_SIGNAL, "w") as f:
            f.write("test_pause_%d" % pause_num)

        # 일시정지 중 사용자 행동 시뮬레이션
        time.sleep(0.5)

        if MOUSE_MOVE_DURING_PAUSE:
            # 마우스를 화면 구석으로 이동 (사용자가 다른 작업하는 것 시뮬)
            random_x = random.randint(100, 800)
            random_y = random.randint(100, 600)
            move_mouse(random_x, random_y)
            self.log("  Mouse moved to: (%d, %d)" % (random_x, random_y))

        # 일시정지 유지
        time.sleep(PAUSE_DURATION)

        # 재개
        mx2, my2 = get_mouse_pos()
        self.log("  Mouse before resume: (%d, %d)" % (mx2, my2))

        if os.path.exists(PAUSE_SIGNAL):
            os.remove(PAUSE_SIGNAL)
        self.log("--- PAUSE #%d END (held %.1fs) ---" % (pause_num, PAUSE_DURATION))

        # 재개 후 AC가 [PAUSE] 로그를 출력하는지 확인 (3초 대기)
        time.sleep(3)
        recent = self.stdout_lines[-10:] if len(self.stdout_lines) > 10 else self.stdout_lines
        pause_logs = [l for l in recent if '[PAUSE]' in l]
        if pause_logs:
            self.log("  AC responded with %d [PAUSE] log lines" % len(pause_logs))
        else:
            self.log("  WARNING: No [PAUSE] response from AC (may be in non-pause-aware section)")

    def run_test(self):
        """전체 테스트 실행"""
        self.log("=" * 60)
        self.log("LIVE PAUSE/RESUME STRESS TEST")
        self.log("  Pause count: %d" % PAUSE_COUNT)
        self.log("  Pause duration: %ds" % PAUSE_DURATION)
        self.log("  Interval: %d-%ds" % (PAUSE_INTERVAL_MIN, PAUSE_INTERVAL_MAX))
        self.log("  Mouse move during pause: %s" % MOUSE_MOVE_DURING_PAUSE)
        self.log("=" * 60)

        # AC 시작
        self.start_ac()

        # 1단계 네비게이션이 시작될 때까지 대기 (최대 60초)
        self.log("Waiting for AC to start navigation...")
        nav_started = False
        for _ in range(120):
            time.sleep(0.5)
            if not self._running:
                self.log("AC process ended before navigation started!")
                break
            all_text = " ".join(self.stdout_lines[-20:]) if self.stdout_lines else ""
            if "[IPC]" in all_text or "[1" in all_text or "MetLife" in all_text:
                nav_started = True
                self.log("Navigation detected! (stdout lines: %d)" % len(self.stdout_lines))
                break

        if not nav_started and self._running:
            self.log("Navigation not detected but AC is still running, proceeding anyway...")

        # 일시정지/재개 반복
        for i in range(1, PAUSE_COUNT + 1):
            if not self._running:
                self.log("AC process ended. Stopping pause test at #%d" % i)
                break

            # 랜덤 간격 대기
            wait = random.uniform(PAUSE_INTERVAL_MIN, PAUSE_INTERVAL_MAX)
            self.log("Waiting %.1fs before pause #%d..." % (wait, i))

            # 대기 중 AC가 종료되면 중단
            waited = 0
            while waited < wait and self._running:
                time.sleep(0.5)
                waited += 0.5

            if not self._running:
                self.log("AC ended during wait. Stopping.")
                break

            # 일시정지 실행
            self.do_pause(i)

        # AC 완료 대기 (최대 300초 — 10행 + pause 시간)
        if self._running:
            self.log("Waiting for AC to complete (max 300s)...")
            self.process.wait(timeout=300)

        # 결과 분석
        exit_code = self.process.returncode if self.process else -1

        self.log("")
        self.log("=" * 60)
        self.log("TEST RESULT")
        self.log("=" * 60)
        self.log("  AC exit code: %s" % exit_code)
        self.log("  Total stdout lines: %d" % len(self.stdout_lines))
        self.log("  Error lines: %d" % len(self.error_lines))

        # [PAUSE] 로그 분석
        pause_logs = [l for l in self.stdout_lines if '[PAUSE]' in l]
        self.log("  [PAUSE] log lines: %d" % len(pause_logs))
        for pl in pause_logs:
            self.log("    %s" % pl[:100])

        if self.error_lines:
            self.log("\n  ERRORS FOUND:")
            for el in self.error_lines:
                self.log("    %s" % el[:120])

        if exit_code == 0:
            self.log("\n  >>> PASS: AC completed without crash <<<")
        elif exit_code == 1:
            self.log("\n  >>> FAIL: AC crashed (exit code 1) <<<")
        else:
            self.log("\n  >>> EXIT CODE: %s <<<" % exit_code)

        self.log("=" * 60)

        # 정리
        if os.path.exists(PAUSE_SIGNAL):
            os.remove(PAUSE_SIGNAL)

        return exit_code


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--customer", default="", help="--only customer name")
    parser.add_argument("--chosung", default="", help="chosung filter")
    parser.add_argument("--pause-count", type=int, default=8)
    parser.add_argument("--pause-duration", type=int, default=3)
    parser.add_argument("--interval-min", type=int, default=5)
    parser.add_argument("--interval-max", type=int, default=12)
    parser.add_argument("--with-ocr", action="store_true")
    args = parser.parse_args()

    PAUSE_COUNT = args.pause_count
    PAUSE_DURATION = args.pause_duration
    PAUSE_INTERVAL_MIN = args.interval_min
    PAUSE_INTERVAL_MAX = args.interval_max

    tester = LivePauseTester(
        chosung=args.chosung,
        customer=args.customer,
        no_ocr=not args.with_ocr,
    )

    try:
        exit_code = tester.run_test()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
        if os.path.exists(PAUSE_SIGNAL):
            os.remove(PAUSE_SIGNAL)
        if tester.process:
            tester.process.kill()
        sys.exit(130)
    except Exception as e:
        print("Test harness error: %s" % e)
        import traceback
        traceback.print_exc()
        if os.path.exists(PAUSE_SIGNAL):
            os.remove(PAUSE_SIGNAL)
        sys.exit(1)

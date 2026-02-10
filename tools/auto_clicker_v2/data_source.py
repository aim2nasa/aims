# -*- coding: utf-8 -*-
"""
데이터 소스: 로그 파일 리플레이 / 실시간 프로세스 stdout
"""
import datetime
import os
import subprocess
import threading
import time
from abc import ABC, abstractmethod
from typing import Callable, Optional

from log_parser import LogEvent, parse_line, parse_file


def _ds_log(action: str, detail: str):
    """data_source 디버그 로그"""
    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    _base = os.path.dirname(os.path.abspath(__file__))
    try:
        with open(os.path.join(_base, "debug_trace.log"), "a", encoding="utf-8") as f:
            f.write(f"[{ts}] DS.{action}: {detail}\n")
    except Exception:
        pass

# SikuliX 실행 경로
SIKULIX_JAR = r"C:\Sikulix\sikulixide-2.0.5.jar"
# 같은 폴더의 MetlifeCustomerList.py (v2 통합)
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SIKULIX_SCRIPT = os.path.join(_BASE_DIR, "MetlifeCustomerList.py")

# 일시정지 신호 파일 (GUI ↔ SikuliX 프로세스 간 통신)
PAUSE_SIGNAL_FILE = os.path.join(_BASE_DIR, ".pause_signal")


class DataSource(ABC):
    """데이터 소스 추상 인터페이스"""

    @abstractmethod
    def start(self, on_event: Callable[[LogEvent], None]) -> None:
        """이벤트 소비 시작. on_event 콜백으로 이벤트 전달."""
        ...

    @abstractmethod
    def stop(self) -> None:
        """이벤트 소비 중지."""
        ...

    @abstractmethod
    def pause(self) -> None:
        ...

    @abstractmethod
    def resume(self) -> None:
        ...

    @abstractmethod
    def is_running(self) -> bool:
        ...


class FileReplaySource(DataSource):
    """기존 로그 파일을 시간차를 두고 리플레이"""

    def __init__(self, filepath: str, speed: float = 5.0, line_delay: float = 0.05):
        """
        Args:
            filepath: 로그 파일 경로
            speed: 리플레이 속도 배율 (1.0 = 실시간, 5.0 = 5배속)
            line_delay: 각 줄 사이 기본 딜레이 (초). speed로 나눠짐.
        """
        self.filepath = filepath
        self.speed = speed
        self.line_delay = line_delay
        self._events: list[LogEvent] = []
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._paused = False
        self._on_event: Optional[Callable] = None

    def set_speed(self, speed: float) -> None:
        self.speed = max(0.1, speed)

    def start(self, on_event: Callable[[LogEvent], None]) -> None:
        self._events = parse_file(self.filepath)
        self._on_event = on_event
        self._running = True
        self._paused = False
        self._thread = threading.Thread(target=self._replay, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        self._paused = False

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def is_running(self) -> bool:
        return self._running

    def _replay(self) -> None:
        """백그라운드 스레드: 이벤트를 순차적으로 콜백에 전달"""
        for event in self._events:
            if not self._running:
                break

            while self._paused:
                time.sleep(0.05)
                if not self._running:
                    return

            if self._on_event:
                self._on_event(event)

            # 이벤트 유형별 딜레이 조절
            delay = self._get_delay(event)
            time.sleep(delay / self.speed)

        self._running = False

    def _get_delay(self, event: LogEvent) -> float:
        """이벤트 유형별 딜레이 결정 (리플레이 체감 향상)"""
        t = event.type

        # 중요 이벤트는 좀 더 길게
        if t in ("chosung_start", "phase_start", "summary_header"):
            return 0.3
        elif t in ("ocr_result", "customer_process_start"):
            return 0.2
        elif t in ("customer_click", "customer_skip"):
            return 0.15
        elif t in ("customer_done",):
            return 0.1
        elif t in ("ocr_table_row",):
            return 0.03  # 테이블 행은 빠르게
        elif t == "raw_line":
            return 0.02

        return self.line_delay


class LiveProcessSource(DataSource):
    """SikuliX 프로세스 stdout을 실시간 읽어 이벤트 생성"""

    def __init__(self, chosung: str = "", save_dir: str = "",
                 integrated_view: bool = True,
                 start_from: str = "", only_customer: str = "",
                 resume_mode: bool = False, no_ocr: bool = False):
        self.chosung = chosung
        self.save_dir = save_dir
        self.integrated_view = integrated_view
        self.start_from = start_from
        self.only_customer = only_customer
        self.resume_mode = resume_mode
        self.no_ocr = no_ocr
        self._process: Optional[subprocess.Popen] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._paused = False
        self._on_event: Optional[Callable] = None
        self._exit_code: Optional[int] = None

    def start(self, on_event: Callable[[LogEvent], None]) -> None:
        cmd = [
            "java",
            "-jar", SIKULIX_JAR,
            "-r", SIKULIX_SCRIPT,
        ]
        extra_args = []
        if self.chosung:
            extra_args += ["--chosung", self.chosung]
        if self.save_dir:
            extra_args += ["--save-dir", self.save_dir]
        if self.integrated_view:
            extra_args += ["--integrated-view"]
        if self.start_from:
            extra_args += ["--start-from", self.start_from]
        if self.only_customer:
            extra_args += ["--only", self.only_customer]
        if self.resume_mode:
            extra_args += ["--resume"]
        if self.no_ocr:
            extra_args += ["--no-ocr"]
        if extra_args:
            cmd += ["--"] + extra_args

        self._on_event = on_event
        self._running = True
        self._paused = False

        # 이전 세션의 잔류 신호 파일 정리
        try:
            os.remove(PAUSE_SIGNAL_FILE)
        except OSError:
            pass

        # encoding 지정하지 않음 → raw bytes로 읽기 (CP949/UTF-8 자동 감지)
        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

        self._thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        self._paused = False
        try:
            os.remove(PAUSE_SIGNAL_FILE)
        except OSError:
            pass
        proc = self._process
        self._process = None
        if proc and proc.pid:
            # Windows: 프로세스 트리 전체 강제 종료 (Java 자식 포함)
            subprocess.Popen(
                f"taskkill /F /T /PID {proc.pid}",
                shell=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )

    def pause(self) -> None:
        self._paused = True
        try:
            with open(PAUSE_SIGNAL_FILE, "w") as f:
                f.write("paused")
        except OSError:
            pass
        _ds_log("pause", f"_paused=True, _running={self._running}")

    def resume(self) -> None:
        self._paused = False
        try:
            os.remove(PAUSE_SIGNAL_FILE)
        except OSError:
            pass
        _ds_log("resume", f"_paused=False, _running={self._running}")

    def is_running(self) -> bool:
        return self._running

    @property
    def exit_code(self) -> Optional[int]:
        return self._exit_code

    @staticmethod
    def _decode_line(raw_bytes: bytes) -> str:
        """raw bytes → 문자열. SikuliX 0x82→0x5C 백슬래시 복원 + CP949 디코딩."""
        # SikuliX/Jython이 백슬래시(0x5C)를 0x82로 출력하는 버그 보정
        fixed = raw_bytes.replace(b'\x82', b'\x5c') if b'\x82' in raw_bytes else raw_bytes
        try:
            return fixed.decode("cp949").rstrip()
        except UnicodeDecodeError:
            pass
        try:
            return fixed.decode("utf-8").rstrip()
        except UnicodeDecodeError:
            pass
        # 보정 실패 시 원본 바이트로 재시도
        try:
            return raw_bytes.decode("cp949").rstrip()
        except UnicodeDecodeError:
            pass
        try:
            return raw_bytes.decode("utf-8").rstrip()
        except UnicodeDecodeError:
            return raw_bytes.decode("utf-8", errors="replace").rstrip()

    def _read_stdout(self) -> None:
        """백그라운드 스레드: stdout raw bytes → 인코딩 감지 → parse_line → 콜백"""
        _BASE = os.path.dirname(os.path.abspath(__file__))
        raw_log_path = os.path.join(_BASE, "live_raw_stdout.log")
        raw_log = open(raw_log_path, "w", encoding="utf-8")
        hex_log_path = os.path.join(_BASE, "live_raw_hex.log")
        hex_log = open(hex_log_path, "w", encoding="ascii")

        line_no = 0
        proc = self._process
        try:
            if proc and proc.stdout:
                for raw_bytes in proc.stdout:
                    if not self._running:
                        break

                    if self._paused:
                        _ds_log("_read_stdout", f"entering pause loop, poll={proc.poll()}")
                    while self._paused:
                        time.sleep(0.05)
                        if not self._running:
                            _ds_log("_read_stdout", "pause loop: _running=False, breaking")
                            break
                        # 프로세스 종료 감지 (pause 루프 탈출)
                        if proc and proc.poll() is not None:
                            _ds_log("_read_stdout", f"pause loop: proc ended (poll={proc.poll()}), breaking")
                            break

                    line_no += 1
                    # hex 덤프 (경로 깨짐 디버깅용)
                    hex_str = raw_bytes.rstrip().hex()
                    hex_log.write(f"{line_no:04d} | {hex_str}\n")
                    hex_log.flush()

                    line = self._decode_line(raw_bytes)
                    raw_log.write(f"{line_no:04d} | {line}\n")
                    raw_log.flush()

                    event = parse_line(line, line_no)
                    if event and self._on_event:
                        self._on_event(event)
        except (OSError, ValueError):
            pass  # 프로세스 종료 시 stdout 파이프 끊김 → 정상
        except Exception as e:
            raw_log.write(f"\n!!! EXCEPTION: {e}\n")
        finally:
            rc = None
            try:
                if proc:
                    rc = proc.wait(timeout=3)
            except Exception:
                pass
            self._exit_code = rc
            _ds_log("_read_stdout FINALLY", f"exit_code={rc}, lines={line_no}, setting _running=False")
            raw_log.write(f"\n=== PROCESS EXIT (code={rc}, lines={line_no}) ===\n")
            raw_log.close()
            hex_log.close()
            self._running = False

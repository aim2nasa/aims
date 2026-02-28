# -*- coding: utf-8 -*-
"""
데이터 소스: 로그 파일 리플레이 / 실시간 프로세스 stdout
"""
import datetime
import io
import os
import subprocess
import threading
import time
from abc import ABC, abstractmethod
from typing import Callable, Optional

from log_parser import LogEvent, parse_line, parse_file
from path_helper import get_app_dir, get_java_exe, get_sikulix_jar, get_sikulix_script, is_frozen

_APP_DIR = get_app_dir()

# PROD 모드 판정: 패키징(AC_EXE_PATH 존재) + DEV_MODE 미설정
_is_packaged_ds = bool(os.environ.get("AC_EXE_PATH", ""))
_DS_DEV_MODE = not _is_packaged_ds
if os.environ.get("AC_DEV_MODE", "").strip() == "1":
    _DS_DEV_MODE = True
elif os.environ.get("AC_DEV_MODE", "").strip() == "0":
    _DS_DEV_MODE = False


def _ds_log(action: str, detail: str):
    """data_source 디버그 로그 (PROD: 메모리만, DEV: 파일)"""
    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    if not _DS_DEV_MODE:
        return  # PROD: 디스크 쓰기 안 함
    try:
        with open(os.path.join(_APP_DIR, "debug_trace.log"), "a", encoding="utf-8") as f:
            f.write(f"[{ts}] DS.{action}: {detail}\n")
    except Exception:
        pass

# 일시정지 신호 파일 (GUI ↔ SikuliX 프로세스 간 통신)
PAUSE_SIGNAL_FILE = os.path.join(_APP_DIR, ".pause_signal")


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
                 resume_mode: bool = False, no_ocr: bool = False,
                 scroll_test: bool = False):
        self.chosung = chosung
        self.save_dir = save_dir
        self.integrated_view = integrated_view
        self.start_from = start_from
        self.only_customer = only_customer
        self.resume_mode = resume_mode
        self.no_ocr = no_ocr
        self.scroll_test = scroll_test
        self._process: Optional[subprocess.Popen] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._paused = False
        self._on_event: Optional[Callable] = None
        self._exit_code: Optional[int] = None

    def start(self, on_event: Callable[[LogEvent], None]) -> None:
        cmd = [
            get_java_exe(),
            "-jar", get_sikulix_jar(),
            "-r", get_sikulix_script(),
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
        if self.scroll_test:
            extra_args += ["--scroll-test"]
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

        # SikuliX에 환경변수 전달 (패키징 모드에서 경로 해석에 사용)
        env = os.environ.copy()
        env["AC_HOME"] = _APP_DIR
        if is_frozen():
            import sys
            env["AC_EXE_PATH"] = sys.executable

        # encoding 지정하지 않음 → raw bytes로 읽기 (CP949/UTF-8 자동 감지)
        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW,
            env=env,
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
            exists = os.path.exists(PAUSE_SIGNAL_FILE)
            _ds_log("pause", f"_paused=True, signal_file={exists}, path={PAUSE_SIGNAL_FILE}")
        except OSError as e:
            _ds_log("pause", f"_paused=True, signal_file FAILED: {e}")

    def resume(self) -> None:
        self._paused = False
        existed = os.path.exists(PAUSE_SIGNAL_FILE)
        try:
            os.remove(PAUSE_SIGNAL_FILE)
        except OSError:
            pass
        _ds_log("resume", f"_paused=False, signal_existed={existed}, removed={not os.path.exists(PAUSE_SIGNAL_FILE)}")

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
        if _DS_DEV_MODE:
            raw_log_path = os.path.join(_APP_DIR, "live_raw_stdout.log")
            raw_log = open(raw_log_path, "w", encoding="utf-8")
            hex_log_path = os.path.join(_APP_DIR, "live_raw_hex.log")
            hex_log = open(hex_log_path, "w", encoding="ascii")
        else:
            # PROD: 디스크 쓰기 안 함, 메모리에도 누적하지 않음
            raw_log = None
            hex_log = None

        line_no = 0
        proc = self._process
        _pause_entered = False  # pause loop 진입 여부 (중복 로그 방지)
        try:
            if proc and proc.stdout:
                for raw_bytes in proc.stdout:
                    if not self._running:
                        break

                    ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    line_no += 1

                    # 일시정지 상태에서 stdout 수신 = SikuliX가 아직 동작 중!
                    if self._paused and not _pause_entered:
                        _ds_log("_read_stdout", f"⚠ LINE WHILE PAUSED: #{line_no}")

                    # 프로세스가 살아있을 때만 pause 대기
                    if self._paused and proc.poll() is None:
                        if not _pause_entered:
                            _ds_log("_read_stdout", f"entering pause loop (last line=#{line_no})")
                            _pause_entered = True
                        while self._paused:
                            time.sleep(0.05)
                            if not self._running:
                                break
                            if proc.poll() is not None:
                                _ds_log("_read_stdout", f"pause loop: proc ended (poll={proc.poll()})")
                                break
                    else:
                        if _pause_entered and not self._paused:
                            _ds_log("_read_stdout", f"resumed at line #{line_no}")
                            _pause_entered = False

                    # hex 덤프 (경로 깨짐 디버깅용, DEV에서만)
                    if hex_log is not None:
                        hex_str = raw_bytes.rstrip().hex()
                        hex_log.write(f"{line_no:04d} | {hex_str}\n")
                        hex_log.flush()

                    line = self._decode_line(raw_bytes)
                    if raw_log is not None:
                        raw_log.write(f"{ts} | {line_no:04d} | paused={self._paused} | {line}\n")
                        raw_log.flush()

                    event = parse_line(line, line_no)
                    if event and self._on_event:
                        self._on_event(event)
        except (OSError, ValueError):
            pass  # 프로세스 종료 시 stdout 파이프 끊김 → 정상
        except Exception as e:
            if raw_log is not None:
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
            if raw_log is not None:
                raw_log.write(f"\n=== PROCESS EXIT (code={rc}, lines={line_no}) ===\n")
                raw_log.close()
            if hex_log is not None:
                hex_log.close()
            self._running = False

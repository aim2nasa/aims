# -*- coding: utf-8 -*-
"""
데이터 소스: 로그 파일 리플레이 / 실시간 프로세스 stdout
"""
import os
import subprocess
import threading
import time
from abc import ABC, abstractmethod
from typing import Callable, Optional

from log_parser import LogEvent, parse_line, parse_file

# SikuliX 실행 경로
SIKULIX_JAR = r"C:\Sikulix\sikulixide-2.0.5.jar"
# 같은 폴더의 MetlifeCustomerList.py (v2 통합)
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SIKULIX_SCRIPT = os.path.join(_BASE_DIR, "MetlifeCustomerList.py")


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

    def __init__(self, chosung: str = "", save_dir: str = ""):
        self.chosung = chosung
        self.save_dir = save_dir
        self._process: Optional[subprocess.Popen] = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._paused = False
        self._on_event: Optional[Callable] = None

    def start(self, on_event: Callable[[LogEvent], None]) -> None:
        cmd = [
            "java", "-Dfile.encoding=UTF-8",
            "-jar", SIKULIX_JAR,
            "-r", SIKULIX_SCRIPT,
        ]
        if self.chosung:
            cmd += ["--", "--chosung", self.chosung]

        self._on_event = on_event
        self._running = True
        self._paused = False

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
            creationflags=subprocess.CREATE_NO_WINDOW,
        )

        self._thread = threading.Thread(target=self._read_stdout, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        self._paused = False
        if self._process:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None

    def pause(self) -> None:
        self._paused = True

    def resume(self) -> None:
        self._paused = False

    def is_running(self) -> bool:
        return self._running

    def _read_stdout(self) -> None:
        """백그라운드 스레드: stdout 라인별 읽기 → parse_line → 콜백"""
        line_no = 0
        try:
            for raw_line in self._process.stdout:
                if not self._running:
                    break

                while self._paused:
                    time.sleep(0.05)
                    if not self._running:
                        return

                line_no += 1
                event = parse_line(raw_line, line_no)
                if event and self._on_event:
                    self._on_event(event)
        except Exception:
            pass
        finally:
            # 프로세스 종료 대기
            if self._process:
                self._process.wait()
            self._running = False

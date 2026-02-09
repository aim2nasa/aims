# -*- coding: utf-8 -*-
"""
데이터 소스: 로그 파일 리플레이 / 실시간 프로세스 stdout
"""
import threading
import time
from abc import ABC, abstractmethod
from typing import Callable, Optional

from log_parser import LogEvent, parse_line, parse_file


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

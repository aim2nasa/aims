"""
xPipe FIFO 큐 — InMemoryQueue + Job

Phase 0: 단일 프로세스, 단일 머신.
- InMemoryQueue: asyncio.Queue 래핑. FIFO 보장.
- Job: 작업 단위 데이터클래스.
- 동시성 제어는 server.py에서 정수 카운터로 직접 수행.
- Scheduler 클래스는 멀티 머신 운용 시(Phase 1+) 도입.

설계 원칙:
- 외부 종속성 없음 (표준 라이브러리만)
- 큐에는 Job 참조만 (파일은 디스크에)
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ===========================================================================
# Job
# ===========================================================================


class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Job:
    job_id: str
    file_path: str
    filename: str
    status: JobStatus = JobStatus.QUEUED
    config_snapshot: dict = field(default_factory=dict)
    result: Optional[dict] = None
    error: Optional[str] = None
    error_stage: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


# ===========================================================================
# InMemoryQueue
# ===========================================================================


class InMemoryQueue:
    """asyncio.Queue 래핑. 단일 프로세스 전용. 서버 재시작 시 유실."""

    def __init__(self, maxsize: int = 100):
        self._queue: asyncio.Queue[Job] = asyncio.Queue(maxsize=maxsize)

    async def put(self, job: Job) -> None:
        """작업 추가. 큐가 가득 차면 QueueFull 예외."""
        self._queue.put_nowait(job)

    async def get(self, timeout: float = 5.0) -> Optional[Job]:
        """작업 꺼내기. timeout 초과 시 None 반환."""
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    async def remove(self, job_id: str) -> bool:
        """특정 job 제거 (취소). O(n) 순회."""
        items = []
        found = False
        while not self._queue.empty():
            try:
                item = self._queue.get_nowait()
                if item.job_id == job_id:
                    found = True
                else:
                    items.append(item)
            except asyncio.QueueEmpty:
                break

        for item in items:
            self._queue.put_nowait(item)

        return found

    def qsize(self) -> int:
        return self._queue.qsize()

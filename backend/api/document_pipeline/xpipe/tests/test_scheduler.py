"""
xPipe FIFO 큐 테스트

- Job 데이터클래스
- InMemoryQueue (FIFO, QueueFull, remove, qsize, timeout)
"""
from __future__ import annotations

import asyncio
import time

import pytest

from xpipe.scheduler import InMemoryQueue, Job, JobStatus


# ===========================================================================
# Job 테스트
# ===========================================================================


class TestJob:
    """Job 데이터클래스"""

    def test_create_job(self):
        """기본 Job 생성"""
        job = Job(job_id="j1", file_path="/tmp/a.pdf", filename="a.pdf")
        assert job.status == JobStatus.QUEUED
        assert job.result is None
        assert job.error is None
        assert job.started_at is None
        assert job.completed_at is None

    def test_job_status_enum(self):
        """JobStatus 열거형 값"""
        assert JobStatus.QUEUED.value == "queued"
        assert JobStatus.PROCESSING.value == "processing"
        assert JobStatus.COMPLETED.value == "completed"
        assert JobStatus.FAILED.value == "failed"

    def test_job_config_snapshot_default(self):
        """config_snapshot 기본값은 빈 dict"""
        job = Job(job_id="j1", file_path="/tmp/a.pdf", filename="a.pdf")
        assert job.config_snapshot == {}

    def test_job_created_at(self):
        """created_at 자동 설정"""
        before = time.time()
        job = Job(job_id="j1", file_path="/tmp/a.pdf", filename="a.pdf")
        after = time.time()
        assert before <= job.created_at <= after


# ===========================================================================
# InMemoryQueue 테스트
# ===========================================================================


class TestInMemoryQueue:
    """InMemoryQueue — asyncio.Queue 래핑"""

    @pytest.mark.asyncio
    async def test_fifo_order(self):
        """FIFO 순서 보장: put 순서대로 get"""
        q = InMemoryQueue(maxsize=10)
        jobs = [
            Job(job_id=f"j{i}", file_path=f"/tmp/{i}.pdf", filename=f"{i}.pdf")
            for i in range(3)
        ]
        for job in jobs:
            await q.put(job)

        results = []
        for _ in range(3):
            j = await q.get(timeout=1.0)
            results.append(j)

        assert [j.job_id for j in results] == ["j0", "j1", "j2"]

    @pytest.mark.asyncio
    async def test_qsize(self):
        """qsize는 대기 중인 작업 수 반환"""
        q = InMemoryQueue(maxsize=10)
        assert q.qsize() == 0

        await q.put(Job(job_id="j1", file_path="/tmp/a.pdf", filename="a.pdf"))
        assert q.qsize() == 1

        await q.get(timeout=1.0)
        assert q.qsize() == 0

    @pytest.mark.asyncio
    async def test_queue_full(self):
        """maxsize 초과 시 QueueFull 예외"""
        q = InMemoryQueue(maxsize=2)
        await q.put(Job(job_id="j1", file_path="/tmp/1.pdf", filename="1.pdf"))
        await q.put(Job(job_id="j2", file_path="/tmp/2.pdf", filename="2.pdf"))

        with pytest.raises(asyncio.QueueFull):
            await q.put(Job(job_id="j3", file_path="/tmp/3.pdf", filename="3.pdf"))

    @pytest.mark.asyncio
    async def test_get_timeout(self):
        """빈 큐에서 get → timeout 후 None 반환"""
        q = InMemoryQueue(maxsize=10)
        result = await q.get(timeout=0.1)
        assert result is None

    @pytest.mark.asyncio
    async def test_remove(self):
        """큐에서 특정 job 제거 (취소)"""
        q = InMemoryQueue(maxsize=10)
        await q.put(Job(job_id="j1", file_path="/tmp/1.pdf", filename="1.pdf"))
        await q.put(Job(job_id="j2", file_path="/tmp/2.pdf", filename="2.pdf"))
        await q.put(Job(job_id="j3", file_path="/tmp/3.pdf", filename="3.pdf"))

        removed = await q.remove("j2")
        assert removed is True
        assert q.qsize() == 2

        # j1, j3만 남아있어야 함
        r1 = await q.get(timeout=1.0)
        r2 = await q.get(timeout=1.0)
        assert r1.job_id == "j1"
        assert r2.job_id == "j3"

    @pytest.mark.asyncio
    async def test_remove_nonexistent(self):
        """존재하지 않는 job 제거 시 False"""
        q = InMemoryQueue(maxsize=10)
        removed = await q.remove("nonexistent")
        assert removed is False

    @pytest.mark.asyncio
    async def test_fifo_order_many(self):
        """10개 작업 FIFO 순서 보장"""
        q = InMemoryQueue(maxsize=20)
        for i in range(10):
            await q.put(Job(job_id=f"j{i}", file_path=f"/tmp/{i}.pdf", filename=f"{i}.pdf"))

        results = []
        for _ in range(10):
            j = await q.get(timeout=1.0)
            results.append(j.job_id)

        assert results == [f"j{i}" for i in range(10)]

    @pytest.mark.asyncio
    async def test_remove_preserves_order(self):
        """중간 항목 제거 후에도 나머지 FIFO 순서 유지"""
        q = InMemoryQueue(maxsize=10)
        for i in range(5):
            await q.put(Job(job_id=f"j{i}", file_path=f"/tmp/{i}.pdf", filename=f"{i}.pdf"))

        # j1, j3 제거
        await q.remove("j1")
        await q.remove("j3")
        assert q.qsize() == 3

        results = []
        for _ in range(3):
            j = await q.get(timeout=1.0)
            results.append(j.job_id)

        assert results == ["j0", "j2", "j4"]

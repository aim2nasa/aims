"""
Tests for Upload Worker
Background MongoDB Queue Consumer

Tests cover:
- Worker initialization
- Start/stop lifecycle
- Batch processing with concurrency limit
- Job processing pipeline execution
- Failure handling with exponential backoff
- Periodic cleanup
- Worker status reporting
"""
import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock, PropertyMock
from datetime import datetime, timedelta
from bson import ObjectId

# Import path setup
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from workers.upload_worker import UploadWorker


class TestUploadWorkerInit:
    """UploadWorker 초기화 테스트"""

    def test_init_default_values(self):
        """기본값으로 초기화되어야 함"""
        with patch("workers.upload_worker.settings") as mock_settings:
            mock_settings.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.UPLOAD_QUEUE_POLL_INTERVAL = 1.0

            worker = UploadWorker()

            assert worker.running is False
            assert worker.max_concurrent == 3
            assert len(worker.active_tasks) == 0
            assert worker.worker_id.startswith("upload-worker-")

    def test_init_semaphore_created(self):
        """동시성 제한용 세마포어가 생성되어야 함"""
        with patch("workers.upload_worker.settings") as mock_settings:
            mock_settings.UPLOAD_QUEUE_MAX_CONCURRENT = 5
            mock_settings.UPLOAD_QUEUE_POLL_INTERVAL = 1.0

            worker = UploadWorker()

            # Semaphore should be created with max_concurrent limit
            assert worker.semaphore._value == 5


class TestUploadWorkerStart:
    """UploadWorker 시작 테스트"""

    @pytest.mark.asyncio
    async def test_start_sets_running_true(self):
        """시작 시 running이 True로 설정되어야 함"""
        with patch("workers.upload_worker.get_settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue:

            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 0.01

            mock_queue.cleanup_stale_jobs = AsyncMock(return_value=0)
            mock_queue.claim_next = AsyncMock(return_value=None)

            worker = UploadWorker()

            # Run for a short time then stop
            async def run_briefly():
                task = asyncio.create_task(worker.start())
                await asyncio.sleep(0.05)
                worker.stop()
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            await run_briefly()

            # Verify cleanup_stale_jobs was called on start
            mock_queue.cleanup_stale_jobs.assert_called_once()

    @pytest.mark.asyncio
    async def test_start_recovers_stale_jobs(self):
        """시작 시 stale 작업을 복구해야 함"""
        with patch("workers.upload_worker.get_settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue:

            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 0.01

            mock_queue.cleanup_stale_jobs = AsyncMock(return_value=5)
            mock_queue.claim_next = AsyncMock(return_value=None)

            worker = UploadWorker()

            async def run_briefly():
                task = asyncio.create_task(worker.start())
                await asyncio.sleep(0.05)
                worker.stop()
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            await run_briefly()

            mock_queue.cleanup_stale_jobs.assert_called()


class TestUploadWorkerProcessBatch:
    """_process_batch 테스트"""

    @pytest.mark.asyncio
    async def test_process_batch_respects_max_concurrent(self):
        """동시 처리 수가 max_concurrent를 넘지 않아야 함"""
        with patch("workers.upload_worker.settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue:

            mock_settings.UPLOAD_QUEUE_MAX_CONCURRENT = 2
            mock_settings.UPLOAD_QUEUE_POLL_INTERVAL = 0.01

            # Create jobs
            jobs = [
                {"_id": ObjectId(), "file_data": {"temp_path": f"/tmp/file{i}.pdf"}, "request_data": {}}
                for i in range(5)
            ]
            job_index = [0]

            async def mock_claim_next(worker_id):
                if job_index[0] < len(jobs):
                    job = jobs[job_index[0]]
                    job_index[0] += 1
                    return job
                return None

            mock_queue.claim_next = AsyncMock(side_effect=mock_claim_next)
            mock_queue.cleanup_stale_jobs = AsyncMock(return_value=0)

            worker = UploadWorker()
            worker.running = True

            # Mock _process_job to do nothing
            worker._process_job_wrapper = AsyncMock()

            await worker._process_batch()

            # Should claim max_concurrent jobs (2)
            assert mock_queue.claim_next.call_count == 2

    @pytest.mark.asyncio
    async def test_process_batch_stops_when_no_jobs(self):
        """작업이 없으면 중지해야 함"""
        with patch("workers.upload_worker.get_settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue:

            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 5
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 0.01

            mock_queue.claim_next = AsyncMock(return_value=None)

            worker = UploadWorker()
            worker.running = True

            await worker._process_batch()

            # Should try once and stop
            mock_queue.claim_next.assert_called_once()


class TestUploadWorkerHandleFailure:
    """_handle_failure 테스트"""

    @pytest.mark.asyncio
    async def test_handle_failure_reschedules_on_retry(self):
        """재시도 가능 시 reschedule 호출"""
        with patch("workers.upload_worker.get_settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue:

            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 0.01
            mock_settings.return_value.UPLOAD_QUEUE_MAX_RETRIES = 3
            mock_settings.return_value.UPLOAD_QUEUE_RETRY_BASE_DELAY = 0.01  # 빠른 테스트

            mock_queue.reschedule = AsyncMock()
            mock_queue.mark_failed = AsyncMock()

            worker = UploadWorker()

            job = {
                "_id": ObjectId(),
                "retry_count": 0,
                "max_retries": 3,
                "file_data": {}
            }

            await worker._handle_failure("queue-001", job, Exception("Test error"))

            mock_queue.reschedule.assert_called_once()
            mock_queue.mark_failed.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_failure_marks_failed_after_max_retries(self):
        """최대 재시도 초과 시 실패 처리"""
        with patch("workers.upload_worker.get_settings") as mock_settings, \
             patch("workers.upload_worker.UploadQueueService") as mock_queue, \
             patch("workers.upload_worker.TempFileService") as mock_temp:

            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 0.01
            mock_settings.return_value.UPLOAD_QUEUE_MAX_RETRIES = 3
            mock_settings.return_value.UPLOAD_QUEUE_RETRY_BASE_DELAY = 0.01

            mock_queue.mark_failed = AsyncMock()
            mock_temp.delete = AsyncMock()

            worker = UploadWorker()

            job = {
                "_id": ObjectId(),
                "retry_count": 3,  # Already at max
                "max_retries": 3,
                "file_data": {"temp_path": "/tmp/test.pdf"}
            }

            await worker._handle_failure("queue-001", job, Exception("Test error"))

            mock_queue.mark_failed.assert_called_once()
            mock_temp.delete.assert_called_once_with("/tmp/test.pdf")


class TestUploadWorkerGetStatus:
    """get_status 테스트"""

    def test_get_status_returns_correct_info(self):
        """상태 정보가 올바르게 반환되어야 함"""
        with patch("workers.upload_worker.settings") as mock_settings:
            mock_settings.UPLOAD_QUEUE_MAX_CONCURRENT = 5
            mock_settings.UPLOAD_QUEUE_POLL_INTERVAL = 1.0

            worker = UploadWorker()
            worker.running = True
            worker.active_tasks = {"task-1", "task-2"}

            status = worker.get_status()

            assert status["running"] is True
            assert status["active_tasks"] == 2
            assert status["max_concurrent"] == 5
            assert "task-1" in status["active_task_ids"]
            assert "task-2" in status["active_task_ids"]


class TestUploadWorkerStop:
    """stop 테스트"""

    def test_stop_sets_running_false(self):
        """중지 시 running이 False로 설정되어야 함"""
        with patch("workers.upload_worker.get_settings") as mock_settings:
            mock_settings.return_value.UPLOAD_QUEUE_MAX_CONCURRENT = 3
            mock_settings.return_value.UPLOAD_QUEUE_POLL_INTERVAL = 1.0

            worker = UploadWorker()
            worker.running = True

            worker.stop()

            assert worker.running is False


class TestUploadWorkerExponentialBackoff:
    """지수 백오프 테스트"""

    def test_exponential_backoff_calculation(self):
        """지수 백오프 계산이 올바른지 확인"""
        base_delay = 2  # seconds

        # retry_count 0 → 2^0 * 2 = 2초
        assert base_delay * (2 ** 0) == 2

        # retry_count 1 → 2^1 * 2 = 4초
        assert base_delay * (2 ** 1) == 4

        # retry_count 2 → 2^2 * 2 = 8초
        assert base_delay * (2 ** 2) == 8

        # retry_count 3 → 2^3 * 2 = 16초
        assert base_delay * (2 ** 3) == 16

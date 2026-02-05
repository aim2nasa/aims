"""
Tests for Upload Queue Service
MongoDB-based upload queue management

Tests cover:
- enqueue() - Add job to queue
- claim_next() - Atomic job acquisition (FIFO order)
- mark_completed() - Complete job
- mark_failed() - Mark job as failed
- reschedule() - Reschedule failed job for retry
- cleanup_stale_jobs() - Recover stale processing jobs
- delete_completed_jobs() - Clean up old completed jobs
- get_queue_stats() - Queue statistics
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timedelta
from bson import ObjectId

# Import path setup
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.upload_queue_service import UploadQueueService


class TestUploadQueueServiceEnqueue:
    """enqueue 테스트"""

    @pytest.mark.asyncio
    async def test_enqueue_creates_pending_job(self):
        """새 작업이 pending 상태로 생성되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.inserted_id = ObjectId()
            mock_collection.insert_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            file_data = {
                "temp_path": "/tmp/test.pdf",
                "original_filename": "test.pdf",
                "file_size": 1024,
                "mime_type": "application/pdf"
            }
            request_data = {
                "userId": "user-001",
                "customerId": "customer-001"
            }

            queue_id = await UploadQueueService.enqueue(
                file_data=file_data,
                request_data=request_data,
                owner_id="user-001",
                customer_id="customer-001"
            )

            # Verify insert was called
            mock_collection.insert_one.assert_called_once()
            call_args = mock_collection.insert_one.call_args[0][0]

            assert call_args["status"] == "pending"
            assert call_args["file_data"] == file_data
            assert call_args["request_data"] == request_data
            assert call_args["owner_id"] == "user-001"
            assert call_args["retry_count"] == 0
            assert call_args["worker_id"] is None

    @pytest.mark.asyncio
    async def test_enqueue_returns_queue_id(self):
        """큐 ID가 문자열로 반환되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            test_id = ObjectId()
            mock_result = MagicMock()
            mock_result.inserted_id = test_id
            mock_collection.insert_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            queue_id = await UploadQueueService.enqueue(
                file_data={},
                request_data={},
                owner_id="user-001"
            )

            assert queue_id == str(test_id)
            assert isinstance(queue_id, str)


class TestUploadQueueServiceClaimNext:
    """claim_next 테스트"""

    @pytest.mark.asyncio
    async def test_claim_next_returns_pending_job(self):
        """pending 작업을 반환해야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            test_job = {
                "_id": ObjectId(),
                "status": "processing",  # 변경 후 상태
                "file_data": {"temp_path": "/tmp/test.pdf"},
                "worker_id": "worker-001"
            }
            mock_collection.find_one_and_update.return_value = test_job
            mock_get_col.return_value = mock_collection

            job = await UploadQueueService.claim_next("worker-001")

            assert job is not None
            assert job["worker_id"] == "worker-001"

    @pytest.mark.asyncio
    async def test_claim_next_updates_status_to_processing(self):
        """status가 processing으로 변경되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_collection.find_one_and_update.return_value = {"_id": ObjectId()}
            mock_get_col.return_value = mock_collection

            await UploadQueueService.claim_next("worker-001")

            # Verify update parameters
            call_args = mock_collection.find_one_and_update.call_args
            filter_query = call_args[0][0]
            update_query = call_args[0][1]

            assert filter_query == {"status": "pending"}
            assert update_query["$set"]["status"] == "processing"
            assert update_query["$set"]["worker_id"] == "worker-001"

    @pytest.mark.asyncio
    async def test_claim_next_uses_fifo_order(self):
        """FIFO 순서로 작업을 가져와야 함 (created_at 오름차순)"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_collection.find_one_and_update.return_value = None
            mock_get_col.return_value = mock_collection

            await UploadQueueService.claim_next("worker-001")

            # Verify sort order
            call_args = mock_collection.find_one_and_update.call_args
            sort_param = call_args[1].get("sort")

            assert sort_param == [("created_at", 1)]  # 오름차순

    @pytest.mark.asyncio
    async def test_claim_next_returns_none_when_no_jobs(self):
        """작업이 없으면 None을 반환해야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_collection.find_one_and_update.return_value = None
            mock_get_col.return_value = mock_collection

            job = await UploadQueueService.claim_next("worker-001")

            assert job is None


class TestUploadQueueServiceMarkCompleted:
    """mark_completed 테스트"""

    @pytest.mark.asyncio
    async def test_mark_completed_updates_status(self):
        """상태가 completed로 변경되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.modified_count = 1
            mock_collection.update_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            result = {"document_id": "doc-001", "status": "success"}
            success = await UploadQueueService.mark_completed("507f1f77bcf86cd799439011", result)

            assert success is True

            # Verify update
            call_args = mock_collection.update_one.call_args[0]
            update_query = call_args[1]

            assert update_query["$set"]["status"] == "completed"
            assert update_query["$set"]["result"] == result

    @pytest.mark.asyncio
    async def test_mark_completed_returns_false_when_not_found(self):
        """문서가 없으면 False를 반환해야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.modified_count = 0
            mock_collection.update_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            success = await UploadQueueService.mark_completed("507f1f77bcf86cd799439011", {})

            assert success is False


class TestUploadQueueServiceMarkFailed:
    """mark_failed 테스트"""

    @pytest.mark.asyncio
    async def test_mark_failed_updates_status(self):
        """상태가 failed로 변경되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.modified_count = 1
            mock_collection.update_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            success = await UploadQueueService.mark_failed(
                "507f1f77bcf86cd799439011",
                "Test error message"
            )

            assert success is True

            # Verify update
            call_args = mock_collection.update_one.call_args[0]
            update_query = call_args[1]

            assert update_query["$set"]["status"] == "failed"
            assert update_query["$set"]["error_message"] == "Test error message"


class TestUploadQueueServiceReschedule:
    """reschedule 테스트"""

    @pytest.mark.asyncio
    async def test_reschedule_increments_retry_count(self):
        """retry_count가 증가해야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.modified_count = 1
            mock_collection.update_one.return_value = mock_result
            mock_get_col.return_value = mock_collection

            await UploadQueueService.reschedule("507f1f77bcf86cd799439011", "Retry error")

            # Verify update
            call_args = mock_collection.update_one.call_args[0]
            update_query = call_args[1]

            assert "$inc" in update_query
            assert update_query["$inc"]["retry_count"] == 1
            assert update_query["$set"]["status"] == "pending"


class TestUploadQueueServiceCleanupStaleJobs:
    """cleanup_stale_jobs 테스트"""

    @pytest.mark.asyncio
    async def test_cleanup_stale_jobs_resets_status(self):
        """stale 작업의 상태가 pending으로 리셋되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col, \
             patch("services.upload_queue_service.get_settings") as mock_settings:

            mock_settings.return_value.UPLOAD_QUEUE_STALE_TIMEOUT = 300  # 5분

            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.modified_count = 3
            mock_collection.update_many.return_value = mock_result
            mock_get_col.return_value = mock_collection

            count = await UploadQueueService.cleanup_stale_jobs()

            assert count == 3

            # Verify query targets processing jobs older than timeout
            call_args = mock_collection.update_many.call_args[0]
            filter_query = call_args[0]
            update_query = call_args[1]

            assert filter_query["status"] == "processing"
            assert "$lt" in str(filter_query["started_at"])
            assert update_query["$set"]["status"] == "pending"


class TestUploadQueueServiceDeleteCompletedJobs:
    """delete_completed_jobs 테스트"""

    @pytest.mark.asyncio
    async def test_delete_completed_jobs_removes_old_jobs(self):
        """오래된 완료 작업이 삭제되어야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_result = MagicMock()
            mock_result.deleted_count = 10
            mock_collection.delete_many.return_value = mock_result
            mock_get_col.return_value = mock_collection

            count = await UploadQueueService.delete_completed_jobs(older_than_hours=24)

            assert count == 10

            # Verify query targets completed jobs
            call_args = mock_collection.delete_many.call_args[0][0]
            assert call_args["status"] == "completed"


class TestUploadQueueServiceConstants:
    """상수 테스트"""

    def test_status_constants(self):
        """상태 상수가 올바르게 정의되어야 함"""
        assert UploadQueueService.STATUS_PENDING == "pending"
        assert UploadQueueService.STATUS_PROCESSING == "processing"
        assert UploadQueueService.STATUS_COMPLETED == "completed"
        assert UploadQueueService.STATUS_FAILED == "failed"

    def test_collection_name(self):
        """컬렉션 이름이 올바르게 정의되어야 함"""
        assert UploadQueueService.COLLECTION_NAME == "upload_queue"


class TestUploadQueueServiceAtomicity:
    """원자성 테스트"""

    @pytest.mark.asyncio
    async def test_claim_next_uses_find_one_and_update(self):
        """claim_next가 원자적 find_one_and_update를 사용해야 함"""
        with patch.object(UploadQueueService, "_get_collection") as mock_get_col:
            mock_collection = AsyncMock()
            mock_collection.find_one_and_update.return_value = None
            mock_get_col.return_value = mock_collection

            await UploadQueueService.claim_next("worker-001")

            # find_one_and_update should be called, not find_one + update_one
            mock_collection.find_one_and_update.assert_called_once()
            mock_collection.find_one.assert_not_called()
            mock_collection.update_one.assert_not_called()

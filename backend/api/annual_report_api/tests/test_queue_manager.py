"""
AR 파싱 큐 관리자 유닛테스트
"""
import pytest
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from pymongo import MongoClient

from services.queue_manager import ARParseQueueManager, QueueStatus, MAX_RETRY_COUNT


@pytest.fixture
def test_db():
    """테스트용 MongoDB 연결"""
    import os
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    client = MongoClient(mongo_uri)
    db = client["test_ar_queue"]
    yield db
    # 테스트 후 정리
    client.drop_database("test_ar_queue")
    client.close()


@pytest.fixture
def queue_manager(test_db):
    """큐 관리자 인스턴스"""
    manager = ARParseQueueManager(test_db)
    yield manager
    # 테스트 후 큐 비우기
    manager.queue.delete_many({})


class TestQueueManager:
    """큐 관리자 테스트"""

    def test_enqueue_success(self, queue_manager):
        """작업 추가 성공 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        result = queue_manager.enqueue(file_id, customer_id)

        assert result is True
        task = queue_manager.queue.find_one({"file_id": file_id})
        assert task is not None
        assert task["customer_id"] == customer_id
        assert task["status"] == QueueStatus.PENDING
        assert task["retry_count"] == 0

    def test_enqueue_duplicate_prevention(self, queue_manager):
        """중복 작업 방지 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        # 첫 번째 추가
        queue_manager.enqueue(file_id, customer_id)

        # 같은 file_id로 다시 추가 시도
        queue_manager.enqueue(file_id, customer_id)

        # 큐에 1개만 존재해야 함
        count = queue_manager.queue.count_documents({"file_id": file_id})
        assert count == 1

    def test_dequeue_success(self, queue_manager):
        """작업 가져오기 성공 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)
        task = queue_manager.dequeue()

        assert task is not None
        assert task["file_id"] == file_id
        assert task["status"] == QueueStatus.PROCESSING

    def test_dequeue_empty_queue(self, queue_manager):
        """빈 큐에서 작업 가져오기 테스트"""
        task = queue_manager.dequeue()
        assert task is None

    def test_dequeue_fifo_order(self, queue_manager):
        """FIFO 순서 테스트"""
        file_id_1 = ObjectId()
        file_id_2 = ObjectId()
        customer_id = ObjectId()

        # 순서대로 추가
        queue_manager.enqueue(file_id_1, customer_id)
        queue_manager.enqueue(file_id_2, customer_id)

        # 첫 번째 작업 먼저 나와야 함
        task_1 = queue_manager.dequeue()
        assert task_1["file_id"] == file_id_1

        task_2 = queue_manager.dequeue()
        assert task_2["file_id"] == file_id_2

    def test_mark_completed_success(self, queue_manager):
        """작업 완료 표시 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)
        task = queue_manager.dequeue()

        result = queue_manager.mark_completed(task["_id"])

        assert result is True
        updated_task = queue_manager.queue.find_one({"_id": task["_id"]})
        assert updated_task["status"] == QueueStatus.COMPLETED
        assert updated_task["processed_at"] is not None

    def test_mark_failed_with_retry(self, queue_manager):
        """작업 실패 (재시도) 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)
        task = queue_manager.dequeue()

        result = queue_manager.mark_failed(task["_id"], "Test error", retry=True)

        assert result is True
        updated_task = queue_manager.queue.find_one({"_id": task["_id"]})
        assert updated_task["status"] == QueueStatus.PENDING  # 재시도를 위해 pending
        assert updated_task["retry_count"] == 1
        assert updated_task["error_message"] == "Test error"

    def test_mark_failed_max_retries(self, queue_manager):
        """최대 재시도 횟수 초과 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)

        # MAX_RETRY_COUNT번 실패시키기
        for i in range(MAX_RETRY_COUNT):
            task = queue_manager.dequeue()
            assert task is not None, f"Failed to dequeue at retry {i}"
            queue_manager.mark_failed(task["_id"], f"Error {i}", retry=True)

        # 더 이상 dequeue 안 됨 (retry_count가 MAX에 도달)
        task = queue_manager.dequeue()
        assert task is None

        # 상태 확인
        final_task = queue_manager.queue.find_one({"file_id": file_id})
        assert final_task["retry_count"] == MAX_RETRY_COUNT
        assert final_task["status"] == QueueStatus.FAILED  # retry_count가 MAX에 도달하면 failed

    def test_mark_failed_no_retry(self, queue_manager):
        """재시도 없이 즉시 실패 처리 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)
        task = queue_manager.dequeue()

        result = queue_manager.mark_failed(task["_id"], "Fatal error", retry=False)

        assert result is True
        updated_task = queue_manager.queue.find_one({"_id": task["_id"]})
        assert updated_task["status"] == QueueStatus.FAILED
        assert updated_task["retry_count"] == 1

    def test_get_pending_count(self, queue_manager):
        """대기 작업 수 조회 테스트"""
        file_id_1 = ObjectId()
        file_id_2 = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id_1, customer_id)
        queue_manager.enqueue(file_id_2, customer_id)

        count = queue_manager.get_pending_count()
        assert count == 2

    def test_get_processing_count(self, queue_manager):
        """처리 중 작업 수 조회 테스트"""
        file_id_1 = ObjectId()
        file_id_2 = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id_1, customer_id)
        queue_manager.enqueue(file_id_2, customer_id)

        queue_manager.dequeue()  # 하나 처리 시작

        count = queue_manager.get_processing_count()
        assert count == 1

    def test_get_stats(self, queue_manager):
        """큐 통계 조회 테스트"""
        file_id_1 = ObjectId()
        file_id_2 = ObjectId()
        file_id_3 = ObjectId()
        customer_id = ObjectId()

        # 3개 추가
        queue_manager.enqueue(file_id_1, customer_id)
        queue_manager.enqueue(file_id_2, customer_id)
        queue_manager.enqueue(file_id_3, customer_id)

        # 1개 처리 중
        task_1 = queue_manager.dequeue()

        # 1개 완료
        task_2 = queue_manager.dequeue()
        queue_manager.mark_completed(task_2["_id"])

        stats = queue_manager.get_stats()

        assert stats["total"] == 3
        assert stats["pending"] == 1
        assert stats["processing"] == 1
        assert stats["completed"] == 1
        assert stats["failed"] == 0

    def test_reset_stale_processing_tasks(self, queue_manager):
        """좀비 작업 복구 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()

        queue_manager.enqueue(file_id, customer_id)
        task = queue_manager.dequeue()

        # updated_at을 과거로 조작
        queue_manager.queue.update_one(
            {"_id": task["_id"]},
            {"$set": {"updated_at": datetime.now(timezone.utc) - timedelta(seconds=400)}}
        )

        # 300초(5분) 타임아웃으로 복구
        reset_count = queue_manager.reset_stale_processing_tasks(timeout_seconds=300)

        assert reset_count == 1
        updated_task = queue_manager.queue.find_one({"_id": task["_id"]})
        assert updated_task["status"] == QueueStatus.PENDING

    def test_clear_old_completed_tasks(self, queue_manager):
        """오래된 완료 작업 삭제 테스트"""
        file_id_1 = ObjectId()
        file_id_2 = ObjectId()
        customer_id = ObjectId()

        # 2개 작업 추가 및 완료
        queue_manager.enqueue(file_id_1, customer_id)
        task_1 = queue_manager.dequeue()
        queue_manager.mark_completed(task_1["_id"])

        queue_manager.enqueue(file_id_2, customer_id)
        task_2 = queue_manager.dequeue()
        queue_manager.mark_completed(task_2["_id"])

        # 첫 번째 작업의 processed_at을 8일 전으로 조작
        queue_manager.queue.update_one(
            {"_id": task_1["_id"]},
            {"$set": {"processed_at": datetime.now(timezone.utc) - timedelta(days=8)}}
        )

        # 7일 이상 된 작업 삭제
        deleted_count = queue_manager.clear_old_completed_tasks(days=7)

        assert deleted_count == 1
        remaining = queue_manager.queue.count_documents({"status": QueueStatus.COMPLETED})
        assert remaining == 1

    def test_enqueue_with_metadata(self, queue_manager):
        """메타데이터 포함 작업 추가 테스트"""
        file_id = ObjectId()
        customer_id = ObjectId()
        metadata = {
            "filename": "test.pdf",
            "file_size": 12345
        }

        queue_manager.enqueue(file_id, customer_id, metadata)

        task = queue_manager.queue.find_one({"file_id": file_id})
        assert task["metadata"]["filename"] == "test.pdf"
        assert task["metadata"]["file_size"] == 12345


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

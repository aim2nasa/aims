"""
Upload Queue Service
MongoDB 기반 업로드 큐 관리
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from config import get_settings
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)
settings = get_settings()


class UploadQueueService:
    """MongoDB 기반 업로드 큐 서비스"""

    COLLECTION_NAME = "upload_queue"

    # 상태 상수
    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    @classmethod
    def _get_collection(cls):
        """컬렉션 가져오기"""
        return MongoService.get_collection(cls.COLLECTION_NAME)

    @classmethod
    async def enqueue(
        cls,
        file_data: Dict[str, Any],
        request_data: Dict[str, Any],
        owner_id: str,
        customer_id: Optional[str] = None
    ) -> str:
        """
        새 업로드 작업을 큐에 추가

        Args:
            file_data: 파일 정보 (temp_path, original_filename, file_size, mime_type)
            request_data: 요청 정보 (userId, customerId, source_path)
            owner_id: 소유자 ID
            customer_id: 고객 ID (선택)

        Returns:
            queue_id (str)
        """
        collection = cls._get_collection()

        doc = {
            "status": cls.STATUS_PENDING,
            "file_data": file_data,
            "request_data": request_data,
            "owner_id": owner_id,
            "customer_id": customer_id,
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "retry_count": 0,
            "max_retries": settings.UPLOAD_QUEUE_MAX_RETRIES,
            "error_message": None,
            "result": None,
            "worker_id": None
        }

        result = await collection.insert_one(doc)
        queue_id = str(result.inserted_id)

        logger.info(f"Enqueued upload job: {queue_id} for owner: {owner_id}")
        return queue_id

    @classmethod
    async def claim_next(cls, worker_id: str) -> Optional[Dict[str, Any]]:
        """
        다음 pending 작업을 원자적으로 가져오기

        findOneAndUpdate를 사용하여 race condition 방지
        status: pending → processing 변경

        Args:
            worker_id: 워커 ID

        Returns:
            작업 문서 또는 None
        """
        collection = cls._get_collection()

        result = await collection.find_one_and_update(
            {"status": cls.STATUS_PENDING},
            {
                "$set": {
                    "status": cls.STATUS_PROCESSING,
                    "started_at": datetime.utcnow(),
                    "worker_id": worker_id
                }
            },
            sort=[("created_at", 1)],  # FIFO 순서
            return_document=True
        )

        if result:
            logger.debug(f"Worker {worker_id} claimed job: {result['_id']}")

        return result

    @classmethod
    async def mark_completed(
        cls,
        queue_id: str,
        result: Dict[str, Any]
    ) -> bool:
        """
        작업 완료 처리

        Args:
            queue_id: 큐 작업 ID
            result: 처리 결과

        Returns:
            성공 여부
        """
        collection = cls._get_collection()

        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_COMPLETED,
                    "completed_at": datetime.utcnow(),
                    "result": result
                }
            }
        )

        if update_result.modified_count > 0:
            logger.info(f"Job completed: {queue_id}")
            return True
        return False

    @classmethod
    async def mark_failed(
        cls,
        queue_id: str,
        error_message: str
    ) -> bool:
        """
        작업 최종 실패 처리 (재시도 초과)

        Args:
            queue_id: 큐 작업 ID
            error_message: 에러 메시지

        Returns:
            성공 여부
        """
        collection = cls._get_collection()

        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_FAILED,
                    "completed_at": datetime.utcnow(),
                    "error_message": error_message
                }
            }
        )

        if update_result.modified_count > 0:
            logger.error(f"Job failed permanently: {queue_id} - {error_message}")
            return True
        return False

    @classmethod
    async def reschedule(
        cls,
        queue_id: str,
        error_message: str
    ) -> bool:
        """
        재시도를 위해 status를 pending으로 변경

        Args:
            queue_id: 큐 작업 ID
            error_message: 에러 메시지

        Returns:
            성공 여부 (재시도 가능하면 True)
        """
        collection = cls._get_collection()

        # 현재 작업 조회
        job = await collection.find_one({"_id": ObjectId(queue_id)})
        if not job:
            return False

        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", settings.UPLOAD_QUEUE_MAX_RETRIES)

        # 재시도 횟수 초과 체크
        if retry_count >= max_retries:
            await cls.mark_failed(queue_id, f"Max retries exceeded: {error_message}")
            return False

        # 재시도 스케줄링
        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_PENDING,
                    "started_at": None,
                    "worker_id": None,
                    "error_message": error_message
                },
                "$inc": {"retry_count": 1}
            }
        )

        if update_result.modified_count > 0:
            logger.warning(f"Job rescheduled: {queue_id} (retry {retry_count + 1}/{max_retries})")
            return True
        return False

    @classmethod
    async def get_pending_count(cls) -> int:
        """대기 중인 작업 수"""
        collection = cls._get_collection()
        return await collection.count_documents({"status": cls.STATUS_PENDING})

    @classmethod
    async def get_processing_count(cls) -> int:
        """처리 중인 작업 수"""
        collection = cls._get_collection()
        return await collection.count_documents({"status": cls.STATUS_PROCESSING})

    @classmethod
    async def get_queue_stats(cls) -> Dict[str, int]:
        """큐 통계 조회"""
        collection = cls._get_collection()

        pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]

        stats = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
        async for doc in collection.aggregate(pipeline):
            status = doc["_id"]
            if status in stats:
                stats[status] = doc["count"]

        return stats

    @classmethod
    async def cleanup_stale_jobs(
        cls,
        timeout_minutes: int = None
    ) -> int:
        """
        타임아웃된 processing 작업을 pending으로 복구

        서버 재시작 또는 워커 충돌 시 멈춘 작업 복구용

        Args:
            timeout_minutes: 타임아웃 시간 (분)

        Returns:
            복구된 작업 수
        """
        if timeout_minutes is None:
            timeout_minutes = settings.UPLOAD_QUEUE_STALE_TIMEOUT_MINUTES

        collection = cls._get_collection()
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        result = await collection.update_many(
            {
                "status": cls.STATUS_PROCESSING,
                "started_at": {"$lt": cutoff_time}
            },
            {
                "$set": {
                    "status": cls.STATUS_PENDING,
                    "started_at": None,
                    "worker_id": None,
                    "error_message": f"Recovered from stale state (>{timeout_minutes}min)"
                }
            }
        )

        if result.modified_count > 0:
            logger.warning(f"Recovered {result.modified_count} stale jobs")

        return result.modified_count

    @classmethod
    async def get_job(cls, queue_id: str) -> Optional[Dict[str, Any]]:
        """작업 조회"""
        collection = cls._get_collection()
        return await collection.find_one({"_id": ObjectId(queue_id)})

    @classmethod
    async def get_jobs_by_owner(
        cls,
        owner_id: str,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """소유자별 작업 목록 조회"""
        collection = cls._get_collection()

        query = {"owner_id": owner_id}
        if status:
            query["status"] = status

        cursor = collection.find(query).sort("created_at", -1).limit(limit)
        return await cursor.to_list(length=limit)

    @classmethod
    async def delete_completed_jobs(cls, older_than_hours: int = 24) -> int:
        """완료된 작업 정리"""
        collection = cls._get_collection()
        cutoff_time = datetime.utcnow() - timedelta(hours=older_than_hours)

        result = await collection.delete_many({
            "status": {"$in": [cls.STATUS_COMPLETED, cls.STATUS_FAILED]},
            "completed_at": {"$lt": cutoff_time}
        })

        if result.deleted_count > 0:
            logger.info(f"Deleted {result.deleted_count} old completed jobs")

        return result.deleted_count

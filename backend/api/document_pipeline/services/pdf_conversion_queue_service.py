"""
PDF Conversion Queue Service
MongoDB 기반 PDF 변환 큐 관리

pdf_converter(:8005) 서비스에 대한 변환 요청을 직렬화하여
동시 요청으로 인한 타임아웃을 방지.

upload_queue_service.py 패턴 기반.
"""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from bson import ObjectId
from config import get_settings
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)
settings = get_settings()


class PdfConversionQueueService:
    """MongoDB 기반 PDF 변환 큐 서비스"""

    COLLECTION_NAME = "pdf_conversion_queue"

    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    @classmethod
    def _get_collection(cls):
        return MongoService.get_collection(cls.COLLECTION_NAME)

    @classmethod
    async def ensure_indexes(cls):
        """인덱스 생성 (워커 시작 시 1회 호출)"""
        collection = cls._get_collection()
        await collection.create_index(
            [("status", 1), ("created_at", 1)],
            name="idx_status_created"
        )
        # document_id가 string인 경우만 중복 방지 (text_extraction은 document_id=null)
        # sparse=True는 필드가 null이면 여전히 인덱스에 포함되므로 partialFilterExpression 사용
        try:
            await collection.drop_index("idx_dedup")
        except Exception:
            pass  # 인덱스가 없을 수 있음
        await collection.create_index(
            [("document_id", 1), ("job_type", 1)],
            unique=True,
            name="idx_dedup_v2",
            partialFilterExpression={"document_id": {"$type": "string"}},
        )
        await collection.create_index(
            [("status", 1), ("started_at", 1)],
            name="idx_stale_recovery"
        )
        logger.info("PDF conversion queue indexes ensured")

    @classmethod
    async def enqueue(
        cls,
        job_type: str,
        input_path: str,
        original_name: str,
        caller: str,
        document_id: Optional[str] = None,
        callback_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        새 변환 작업을 큐에 추가

        Args:
            job_type: "text_extraction" 또는 "preview_pdf"
            input_path: 원본 파일 경로 (서버 로컬)
            original_name: 원본 파일명
            caller: "document_pipeline" 또는 "aims_api"
            document_id: files 컬렉션 _id (preview_pdf 시 필수)
            callback_data: 콜백 데이터 (customer_id 등)

        Returns:
            queue_id (str)
        """
        collection = cls._get_collection()

        doc = {
            "status": cls.STATUS_PENDING,
            "document_id": document_id,
            "job_type": job_type,
            "input_path": input_path,
            "original_name": original_name,
            "caller": caller,
            "callback_data": callback_data or {},
            "result": None,
            "created_at": datetime.utcnow(),
            "started_at": None,
            "completed_at": None,
            "worker_id": None,
            "retry_count": 0,
            "max_retries": settings.PDF_CONV_QUEUE_MAX_RETRIES,
            "error_message": None,
            "process_after": None,
        }

        # preview_pdf는 document_id + job_type 중복 방지 (upsert)
        if document_id and job_type == "preview_pdf":
            result = await collection.update_one(
                {"document_id": document_id, "job_type": job_type},
                {"$setOnInsert": doc},
                upsert=True,
            )
            if result.upserted_id:
                queue_id = str(result.upserted_id)
                logger.info(f"[PDF큐] 등록: {queue_id} ({original_name}, {job_type})")
                return queue_id
            else:
                # 이미 존재 — 기존 job ID 반환
                existing = await collection.find_one(
                    {"document_id": document_id, "job_type": job_type}
                )
                queue_id = str(existing["_id"])
                logger.info(f"[PDF큐] 이미 존재: {queue_id} ({original_name})")
                return queue_id
        else:
            # text_extraction은 항상 새 job 생성 (document_id 없을 수 있음)
            result = await collection.insert_one(doc)
            queue_id = str(result.inserted_id)
            logger.info(f"[PDF큐] 등록: {queue_id} ({original_name}, {job_type})")
            return queue_id

    @classmethod
    async def claim_next(cls, worker_id: str) -> Optional[Dict[str, Any]]:
        """
        다음 pending 작업을 원자적으로 가져오기 (FIFO)
        """
        collection = cls._get_collection()

        now = datetime.utcnow()
        result = await collection.find_one_and_update(
            {
                "status": cls.STATUS_PENDING,
                "$or": [
                    {"process_after": None},
                    {"process_after": {"$lte": now}},
                ],
            },
            {
                "$set": {
                    "status": cls.STATUS_PROCESSING,
                    "started_at": datetime.utcnow(),
                    "worker_id": worker_id,
                }
            },
            sort=[("created_at", 1)],
            return_document=True,
        )

        if result:
            logger.debug(f"[PDF큐] Worker {worker_id} claimed: {result['_id']}")

        return result

    @classmethod
    async def mark_completed(
        cls,
        queue_id: str,
        result: Dict[str, Any],
    ) -> bool:
        """작업 완료 처리"""
        collection = cls._get_collection()

        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_COMPLETED,
                    "completed_at": datetime.utcnow(),
                    "result": result,
                }
            },
        )

        if update_result.modified_count > 0:
            logger.info(f"[PDF큐] 완료: {queue_id}")
            return True
        return False

    @classmethod
    async def mark_failed(cls, queue_id: str, error_message: str) -> bool:
        """작업 최종 실패 처리"""
        collection = cls._get_collection()

        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_FAILED,
                    "completed_at": datetime.utcnow(),
                    "error_message": error_message,
                }
            },
        )

        if update_result.modified_count > 0:
            logger.error(f"[PDF큐] 최종 실패: {queue_id} - {error_message}")
            return True
        return False

    @classmethod
    async def reschedule(
        cls,
        queue_id: str,
        error_message: str,
        delay_seconds: float = 0,
    ) -> bool:
        """재시도를 위해 pending으로 변경 (delay_seconds 후 처리 가능)"""
        collection = cls._get_collection()

        job = await collection.find_one({"_id": ObjectId(queue_id)})
        if not job:
            return False

        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", settings.PDF_CONV_QUEUE_MAX_RETRIES)

        if retry_count >= max_retries:
            await cls.mark_failed(queue_id, f"재시도 초과: {error_message}")
            return False

        process_after = (
            datetime.utcnow() + timedelta(seconds=delay_seconds)
            if delay_seconds > 0
            else None
        )

        update_result = await collection.update_one(
            {"_id": ObjectId(queue_id)},
            {
                "$set": {
                    "status": cls.STATUS_PENDING,
                    "started_at": None,
                    "worker_id": None,
                    "error_message": error_message,
                    "process_after": process_after,
                },
                "$inc": {"retry_count": 1},
            },
        )

        if update_result.modified_count > 0:
            logger.warning(
                f"[PDF큐] 재스케줄: {queue_id} (retry {retry_count + 1}/{max_retries})"
            )
            return True
        return False

    @classmethod
    async def wait_for_result(
        cls,
        queue_id: str,
        timeout: float = 180.0,
        poll_interval: float = 1.0,
    ) -> Optional[Dict[str, Any]]:
        """
        작업 완료까지 폴링 대기 (document_pipeline 동기 호출용)

        Args:
            queue_id: 큐 작업 ID
            timeout: 최대 대기 시간 (초)
            poll_interval: 폴링 간격 (초)

        Returns:
            완료/실패된 job 문서 또는 None (타임아웃)
        """
        collection = cls._get_collection()
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout

        while loop.time() < deadline:
            job = await collection.find_one({"_id": ObjectId(queue_id)})
            if not job:
                logger.error(f"[PDF큐] wait: job not found: {queue_id}")
                return None

            if job["status"] == cls.STATUS_COMPLETED:
                return job
            elif job["status"] == cls.STATUS_FAILED:
                logger.error(
                    f"[PDF큐] wait: job failed: {queue_id} - {job.get('error_message')}"
                )
                return job

            await asyncio.sleep(poll_interval)

        # 타임아웃: pending/processing 상태의 job을 cancelled로 마킹 (고아 방지)
        logger.error(f"[PDF큐] wait: 타임아웃 ({timeout}s): {queue_id}")
        try:
            await collection.update_one(
                {
                    "_id": ObjectId(queue_id),
                    "status": {"$in": [cls.STATUS_PENDING, cls.STATUS_PROCESSING]},
                },
                {
                    "$set": {
                        "status": cls.STATUS_FAILED,
                        "error_message": f"caller timeout ({timeout}s)",
                        "completed_at": datetime.utcnow(),
                    }
                },
            )
        except Exception as e:
            logger.error(f"[PDF큐] wait: 타임아웃 취소 실패: {queue_id} - {e}")
        return None

    @classmethod
    async def cleanup_stale_jobs(
        cls,
        timeout_minutes: int = None,
    ) -> int:
        """타임아웃된 processing 작업을 pending으로 복구"""
        if timeout_minutes is None:
            timeout_minutes = settings.PDF_CONV_QUEUE_STALE_TIMEOUT_MINUTES

        collection = cls._get_collection()
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        result = await collection.update_many(
            {
                "status": cls.STATUS_PROCESSING,
                "started_at": {"$lt": cutoff_time},
            },
            {
                "$set": {
                    "status": cls.STATUS_PENDING,
                    "started_at": None,
                    "worker_id": None,
                    "error_message": f"Stale 복구 (>{timeout_minutes}분)",
                }
            },
        )

        if result.modified_count > 0:
            logger.warning(f"[PDF큐] Stale 복구: {result.modified_count}건")

        return result.modified_count

    @classmethod
    async def get_queue_stats(cls) -> Dict[str, int]:
        """큐 통계"""
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
    async def delete_completed_jobs(cls, older_than_hours: int = 24) -> int:
        """완료/실패 작업 정리"""
        collection = cls._get_collection()
        cutoff_time = datetime.utcnow() - timedelta(hours=older_than_hours)

        result = await collection.delete_many(
            {
                "status": {"$in": [cls.STATUS_COMPLETED, cls.STATUS_FAILED]},
                "completed_at": {"$lt": cutoff_time},
            }
        )

        if result.deleted_count > 0:
            logger.info(f"[PDF큐] 오래된 job 삭제: {result.deleted_count}건")

        return result.deleted_count

    @classmethod
    async def get_job(cls, queue_id: str) -> Optional[Dict[str, Any]]:
        """작업 조회"""
        collection = cls._get_collection()
        return await collection.find_one({"_id": ObjectId(queue_id)})

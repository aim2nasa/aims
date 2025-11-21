"""
AR 파싱 작업 큐 관리 서비스
MongoDB를 작업 큐로 사용하여 AR 파싱 작업을 관리
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from pymongo.database import Database
from pymongo import ASCENDING, DESCENDING
import logging

logger = logging.getLogger(__name__)

# 큐 상태 상수
class QueueStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

# 재시도 설정
MAX_RETRY_COUNT = 3
QUEUE_COLLECTION = "ar_parse_queue"

class ARParseQueueManager:
    """AR 파싱 작업 큐 관리자"""

    def __init__(self, db: Database):
        """
        초기화 및 인덱스 생성

        Args:
            db: MongoDB 데이터베이스 인스턴스
        """
        self.db = db
        self.queue = db[QUEUE_COLLECTION]
        self._ensure_indexes()

    def _ensure_indexes(self):
        """큐 컬렉션에 필요한 인덱스 생성"""
        try:
            # 1. status + created_at 복합 인덱스 (pending 작업 빠른 조회)
            self.queue.create_index(
                [("status", ASCENDING), ("created_at", ASCENDING)],
                name="idx_status_created"
            )

            # 2. file_id 유니크 인덱스 (중복 방지)
            self.queue.create_index(
                [("file_id", ASCENDING)],
                unique=True,
                name="idx_file_id_unique"
            )

            # 3. customer_id 인덱스 (고객별 조회)
            self.queue.create_index(
                [("customer_id", ASCENDING)],
                name="idx_customer_id"
            )

            logger.info("✅ AR 파싱 큐 인덱스 생성 완료")
        except Exception as e:
            logger.warning(f"⚠️  인덱스 생성 중 일부 실패 (이미 존재할 수 있음): {e}")

    def enqueue(self, file_id: ObjectId, customer_id: ObjectId, metadata: Optional[Dict] = None) -> bool:
        """
        AR 파싱 작업을 큐에 추가

        Args:
            file_id: 문서 ID
            customer_id: 고객 ID
            metadata: 추가 메타데이터 (선택)

        Returns:
            bool: 성공 여부
        """
        try:
            now = datetime.now(timezone.utc)

            task = {
                "file_id": file_id,
                "customer_id": customer_id,
                "status": QueueStatus.PENDING,
                "retry_count": 0,
                "created_at": now,
                "updated_at": now,
                "processed_at": None,
                "error_message": None,
                "metadata": metadata or {}
            }

            # 중복 방지: file_id가 이미 존재하면 무시
            self.queue.update_one(
                {"file_id": file_id},
                {"$setOnInsert": task},
                upsert=True
            )

            logger.info(f"✅ 큐에 작업 추가: file_id={file_id}, customer_id={customer_id}")
            return True

        except Exception as e:
            logger.error(f"❌ 큐 추가 실패: {e}", exc_info=True)
            return False

    def dequeue(self) -> Optional[Dict[str, Any]]:
        """
        큐에서 처리할 작업 하나를 가져오고 processing 상태로 변경

        Returns:
            Dict: 작업 정보 또는 None (작업 없음)
        """
        try:
            now = datetime.now(timezone.utc)

            # pending 상태이고 재시도 횟수가 MAX_RETRY_COUNT 미만인 작업 찾기
            task = self.queue.find_one_and_update(
                {
                    "status": QueueStatus.PENDING,
                    "retry_count": {"$lt": MAX_RETRY_COUNT}
                },
                {
                    "$set": {
                        "status": QueueStatus.PROCESSING,
                        "updated_at": now
                    }
                },
                sort=[("created_at", ASCENDING)],  # 오래된 작업부터 처리
                return_document=True  # 업데이트된 문서 반환
            )

            if task:
                logger.info(f"🔍 큐에서 작업 가져옴: file_id={task['file_id']}")

            return task

        except Exception as e:
            logger.error(f"❌ 큐 조회 실패: {e}", exc_info=True)
            return None

    def mark_completed(self, task_id: ObjectId) -> bool:
        """
        작업을 완료 상태로 변경

        Args:
            task_id: 작업 ID

        Returns:
            bool: 성공 여부
        """
        try:
            now = datetime.now(timezone.utc)

            result = self.queue.update_one(
                {"_id": task_id},
                {
                    "$set": {
                        "status": QueueStatus.COMPLETED,
                        "updated_at": now,
                        "processed_at": now,
                        "error_message": None
                    }
                }
            )

            if result.modified_count > 0:
                logger.info(f"✅ 작업 완료: task_id={task_id}")
                return True
            else:
                logger.warning(f"⚠️  작업 완료 실패 (작업 없음): task_id={task_id}")
                return False

        except Exception as e:
            logger.error(f"❌ 작업 완료 처리 실패: {e}", exc_info=True)
            return False

    def mark_failed(self, task_id: ObjectId, error_message: str, retry: bool = True) -> bool:
        """
        작업을 실패 상태로 변경 (재시도 가능)

        Args:
            task_id: 작업 ID
            error_message: 에러 메시지
            retry: 재시도 여부 (True면 pending으로, False면 failed로)

        Returns:
            bool: 성공 여부
        """
        try:
            now = datetime.now(timezone.utc)

            task = self.queue.find_one({"_id": task_id})
            if not task:
                logger.warning(f"⚠️  작업 실패 처리 불가 (작업 없음): task_id={task_id}")
                return False

            retry_count = task.get("retry_count", 0) + 1

            # 재시도 횟수 초과 또는 재시도 안 함
            if retry_count >= MAX_RETRY_COUNT or not retry:
                status = QueueStatus.FAILED
                logger.warning(f"⚠️  작업 최종 실패: task_id={task_id}, retry={retry_count}")
            else:
                status = QueueStatus.PENDING
                logger.info(f"🔄 작업 재시도 예약: task_id={task_id}, retry={retry_count}/{MAX_RETRY_COUNT}")

            result = self.queue.update_one(
                {"_id": task_id},
                {
                    "$set": {
                        "status": status,
                        "retry_count": retry_count,
                        "updated_at": now,
                        "error_message": error_message
                    }
                }
            )

            return result.modified_count > 0

        except Exception as e:
            logger.error(f"❌ 작업 실패 처리 중 오류: {e}", exc_info=True)
            return False

    def get_pending_count(self) -> int:
        """대기 중인 작업 수 조회"""
        try:
            return self.queue.count_documents({
                "status": QueueStatus.PENDING,
                "retry_count": {"$lt": MAX_RETRY_COUNT}
            })
        except Exception as e:
            logger.error(f"❌ 대기 작업 수 조회 실패: {e}")
            return 0

    def get_processing_count(self) -> int:
        """처리 중인 작업 수 조회"""
        try:
            return self.queue.count_documents({"status": QueueStatus.PROCESSING})
        except Exception as e:
            logger.error(f"❌ 처리 중 작업 수 조회 실패: {e}")
            return 0

    def get_stats(self) -> Dict[str, int]:
        """큐 통계 조회"""
        try:
            return {
                "pending": self.get_pending_count(),
                "processing": self.get_processing_count(),
                "completed": self.queue.count_documents({"status": QueueStatus.COMPLETED}),
                "failed": self.queue.count_documents({"status": QueueStatus.FAILED}),
                "total": self.queue.count_documents({})
            }
        except Exception as e:
            logger.error(f"❌ 큐 통계 조회 실패: {e}")
            return {"error": str(e)}

    def reset_stale_processing_tasks(self, timeout_seconds: int = 300) -> int:
        """
        오래된 processing 상태 작업을 pending으로 되돌림
        (서버 크래시 등으로 인한 좀비 작업 복구)

        Args:
            timeout_seconds: 타임아웃 시간 (초)

        Returns:
            int: 복구된 작업 수
        """
        try:
            from datetime import timedelta

            now = datetime.now(timezone.utc)
            timeout_threshold = now - timedelta(seconds=timeout_seconds)

            result = self.queue.update_many(
                {
                    "status": QueueStatus.PROCESSING,
                    "updated_at": {"$lt": timeout_threshold}
                },
                {
                    "$set": {
                        "status": QueueStatus.PENDING,
                        "updated_at": now
                    }
                }
            )

            if result.modified_count > 0:
                logger.warning(f"⚠️  좀비 작업 복구: {result.modified_count}건")

            return result.modified_count

        except Exception as e:
            logger.error(f"❌ 좀비 작업 복구 실패: {e}", exc_info=True)
            return 0

    def clear_old_completed_tasks(self, days: int = 7) -> int:
        """
        오래된 완료 작업 삭제 (큐 정리)

        Args:
            days: 보관 기간 (일)

        Returns:
            int: 삭제된 작업 수
        """
        try:
            from datetime import timedelta

            now = datetime.now(timezone.utc)
            threshold = now - timedelta(days=days)

            result = self.queue.delete_many({
                "status": QueueStatus.COMPLETED,
                "processed_at": {"$lt": threshold}
            })

            if result.deleted_count > 0:
                logger.info(f"🗑️  오래된 완료 작업 삭제: {result.deleted_count}건")

            return result.deleted_count

        except Exception as e:
            logger.error(f"❌ 완료 작업 삭제 실패: {e}", exc_info=True)
            return 0

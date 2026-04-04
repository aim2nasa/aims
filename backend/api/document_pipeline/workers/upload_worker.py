"""
Upload Worker - Background MongoDB Queue Consumer
문서 업로드 큐 처리 워커
"""
import asyncio
import logging
import uuid
from typing import Any, Dict, Optional, Set

from config import get_settings
from services.temp_file_service import TempFileService
from services.upload_queue_service import UploadQueueService

logger = logging.getLogger(__name__)
settings = get_settings()


class UploadWorker:
    """백그라운드 업로드 큐 처리 워커"""

    def __init__(self):
        self.running = False
        self.max_concurrent = settings.UPLOAD_QUEUE_MAX_CONCURRENT
        self.semaphore = asyncio.Semaphore(self.max_concurrent)
        self.active_tasks: Set[str] = set()
        self.worker_id = f"upload-worker-{uuid.uuid4().hex[:8]}"
        self.poll_interval = settings.UPLOAD_QUEUE_POLL_INTERVAL
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start(self):
        """워커 시작"""
        self.running = True
        logger.info(f"Upload Worker started: {self.worker_id} (max_concurrent={self.max_concurrent})")

        # 시작 시 stale 작업 복구
        recovered = await UploadQueueService.cleanup_stale_jobs()
        if recovered > 0:
            logger.info(f"Recovered {recovered} stale jobs on startup")

        # 정기적 정리 작업 시작
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

        # 메인 처리 루프
        while self.running:
            try:
                await self._process_batch()
            except Exception as e:
                logger.error(f"Upload Worker error: {e}", exc_info=True)

            await asyncio.sleep(self.poll_interval)

    def stop(self):
        """워커 중지"""
        self.running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
        logger.info(f"Upload Worker stopped: {self.worker_id}")

    async def _process_batch(self):
        """가능한 만큼 작업 처리 (최대 max_concurrent개)"""
        while len(self.active_tasks) < self.max_concurrent and self.running:
            job = await UploadQueueService.claim_next(self.worker_id)
            if not job:
                break

            queue_id = str(job["_id"])
            self.active_tasks.add(queue_id)

            # 비동기로 작업 처리 시작
            asyncio.create_task(self._process_job_wrapper(job))

    async def _process_job_wrapper(self, job: Dict[str, Any]):
        """작업 처리 래퍼 (finally에서 active_tasks 정리)"""
        queue_id = str(job["_id"])
        try:
            await self._process_job(job)
        finally:
            self.active_tasks.discard(queue_id)

    async def _process_job(self, job: Dict[str, Any]):
        """단일 작업 처리"""
        queue_id = str(job["_id"])
        file_data = job.get("file_data", {})

        logger.info(f"Processing job: {queue_id} - {file_data.get('original_filename')}")

        try:
            async with self.semaphore:
                # 실제 문서 처리 파이프라인 실행
                result = await self._execute_pipeline(job)

                # 완료 처리
                await UploadQueueService.mark_completed(queue_id, result)

                # 임시 파일 삭제
                temp_path = file_data.get("temp_path")
                if temp_path:
                    await TempFileService.delete(temp_path)

                logger.info(f"Job completed: {queue_id}")

        except Exception as e:
            await self._handle_failure(queue_id, job, e)

    async def _execute_pipeline(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        실제 문서 처리 파이프라인 실행

        doc_prep_main.py의 process_document_pipeline() 호출
        """
        from routers.doc_prep_main import process_document_pipeline

        file_data = job.get("file_data", {})
        request_data = job.get("request_data", {})

        temp_path = file_data.get("temp_path")
        if not temp_path:
            raise ValueError("Missing temp_path in job")

        # 임시 파일 읽기
        file_content = await TempFileService.read(temp_path)

        # 파이프라인 실행 (기존 document_id가 있으면 전달)
        result = await process_document_pipeline(
            file_content=file_content,
            original_name=file_data.get("original_filename", "unknown"),
            user_id=request_data.get("userId"),
            customer_id=request_data.get("customerId"),
            source_path=request_data.get("source_path"),
            mime_type=file_data.get("mime_type"),
            existing_doc_id=request_data.get("document_id")  # 큐잉 시 생성된 문서 ID
        )

        return result

    async def _handle_failure(
        self,
        queue_id: str,
        job: Dict[str, Any],
        error: Exception
    ):
        """실패 처리 및 재시도 스케줄링"""
        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", settings.UPLOAD_QUEUE_MAX_RETRIES)
        error_message = str(error)

        logger.warning(f"Job failed: {queue_id} (retry {retry_count}/{max_retries}) - {error_message}")

        if retry_count < max_retries:
            # 지수 백오프 대기
            delay = settings.UPLOAD_QUEUE_RETRY_BASE_DELAY * (2 ** retry_count)
            logger.info(f"Retrying job {queue_id} in {delay}s")
            await asyncio.sleep(delay)

            # 재스케줄링
            await UploadQueueService.reschedule(queue_id, error_message)
        else:
            # 최대 재시도 초과 - 최종 실패
            await UploadQueueService.mark_failed(queue_id, error_message)

            # 임시 파일 삭제 (실패해도 정리)
            file_data = job.get("file_data", {})
            temp_path = file_data.get("temp_path")
            if temp_path:
                await TempFileService.delete(temp_path)

    async def _periodic_cleanup(self):
        """정기적 정리 작업 (1시간마다)"""
        while self.running:
            try:
                await asyncio.sleep(3600)  # 1시간

                if not self.running:
                    break

                # Stale 작업 복구
                await UploadQueueService.cleanup_stale_jobs()

                # 오래된 임시 파일 정리
                await TempFileService.cleanup_old(hours=24)

                # 완료된 작업 정리 (24시간 이상)
                await UploadQueueService.delete_completed_jobs(older_than_hours=24)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic cleanup error: {e}")

    def get_status(self) -> Dict[str, Any]:
        """워커 상태 조회"""
        return {
            "running": self.running,
            "worker_id": self.worker_id,
            "active_tasks": len(self.active_tasks),
            "active_task_ids": list(self.active_tasks),
            "max_concurrent": self.max_concurrent
        }


# 전역 워커 인스턴스
upload_worker = UploadWorker()

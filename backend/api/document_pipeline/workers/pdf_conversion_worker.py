"""
PDF Conversion Worker - Background MongoDB Queue Consumer
PDF 변환 큐 처리 워커 (concurrency=1)

pdf_converter(:8005)에 대한 변환 요청을 순차적으로 처리하여
동시 요청으로 인한 타임아웃을 방지.

upload_worker.py 패턴 기반.
"""
import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

import httpx
import fitz  # PyMuPDF

from config import get_settings
from services.pdf_conversion_queue_service import PdfConversionQueueService
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)
settings = get_settings()


class PdfConversionWorker:
    """PDF 변환 큐 처리 워커 (concurrency=1)"""

    def __init__(self):
        self.running = False
        self.worker_id = f"pdf-conv-{uuid.uuid4().hex[:8]}"
        self.poll_interval = settings.PDF_CONV_QUEUE_POLL_INTERVAL
        self._cleanup_task: Optional[asyncio.Task] = None
        self._current_job_id: Optional[str] = None

    async def start(self):
        """워커 시작"""
        self.running = True
        logger.info(f"[PDF변환워커] 시작: {self.worker_id}")

        # 인덱스 보장
        await PdfConversionQueueService.ensure_indexes()

        # 시작 시 stale 작업 복구
        recovered = await PdfConversionQueueService.cleanup_stale_jobs()
        if recovered > 0:
            logger.info(f"[PDF변환워커] Stale 복구: {recovered}건")

        # 정기적 정리 작업
        self._cleanup_task = asyncio.create_task(self._periodic_cleanup())

        # 메인 처리 루프
        while self.running:
            try:
                await self._process_next()
            except Exception as e:
                logger.error(f"[PDF변환워커] 루프 에러: {e}", exc_info=True)

            await asyncio.sleep(self.poll_interval)

    def stop(self):
        """워커 중지"""
        self.running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
        logger.info(f"[PDF변환워커] 중지: {self.worker_id}")

    async def _process_next(self):
        """다음 작업 1건 처리"""
        job = await PdfConversionQueueService.claim_next(self.worker_id)
        if not job:
            return

        queue_id = str(job["_id"])
        self._current_job_id = queue_id
        original_name = job.get("original_name", "unknown")

        logger.info(f"[PDF변환워커] 처리 시작: {queue_id} ({original_name})")

        try:
            result = await self._convert(job)
            await self._post_process(job, result)
            await PdfConversionQueueService.mark_completed(queue_id, result)
            logger.info(f"[PDF변환워커] 처리 완료: {queue_id} ({original_name})")
        except Exception as e:
            await self._handle_failure(queue_id, job, e)
        finally:
            self._current_job_id = None

    async def _convert(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """pdf_converter HTTP API 호출"""
        input_path = job["input_path"]
        original_name = job.get("original_name", os.path.basename(input_path))

        if not os.path.exists(input_path):
            raise FileNotFoundError(f"파일 없음: {input_path}")

        convert_url = f"{settings.PDF_CONVERTER_URL}/convert"

        async with httpx.AsyncClient(timeout=180.0) as client:
            with open(input_path, "rb") as f:
                files = {"file": (original_name, f, "application/octet-stream")}
                response = await client.post(convert_url, files=files)

            if response.status_code != 200:
                error_body = response.text[:500]
                raise RuntimeError(
                    f"변환 실패 (HTTP {response.status_code}): {error_body}"
                )

            pdf_bytes = response.content
            if not pdf_bytes or len(pdf_bytes) == 0:
                raise RuntimeError("빈 PDF 수신")

        job_type = job["job_type"]

        if job_type == "text_extraction":
            text = self._extract_text_from_pdf_bytes(pdf_bytes)
            return {"extracted_text": text}

        elif job_type == "preview_pdf":
            pdf_path = self._save_pdf(input_path, pdf_bytes)
            return {"pdf_path": pdf_path}

        else:
            raise ValueError(f"알 수 없는 job_type: {job_type}")

    def _extract_text_from_pdf_bytes(self, pdf_bytes: bytes) -> Optional[str]:
        """PyMuPDF로 PDF 바이트에서 텍스트 추출"""
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            try:
                text_parts = []
                for page in doc:
                    text_parts.append(page.get_text())
            finally:
                doc.close()

            full_text = "\n".join(text_parts)
            return full_text if full_text.strip() else None
        except Exception as e:
            logger.error(f"[PDF변환워커] PyMuPDF 추출 실패: {e}")
            return None

    def _save_pdf(self, input_path: str, pdf_bytes: bytes) -> str:
        """변환된 PDF를 원본 파일 옆에 저장"""
        dir_name = os.path.dirname(input_path)
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        pdf_path = os.path.join(dir_name, base_name + ".pdf")

        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        logger.info(f"[PDF변환워커] PDF 저장: {pdf_path}")
        return pdf_path

    async def _post_process(self, job: Dict[str, Any], result: Dict[str, Any]):
        """변환 완료 후 후처리"""
        job_type = job["job_type"]

        if job_type == "preview_pdf":
            await self._post_process_preview(job, result)

    async def _post_process_preview(self, job: Dict[str, Any], result: Dict[str, Any]):
        """preview_pdf 완료 후: files 컬렉션 업데이트 + SSE 알림"""
        document_id = job.get("document_id")
        if not document_id:
            return

        pdf_path = result.get("pdf_path")
        if not pdf_path:
            return

        # 1. files 컬렉션 직접 업데이트
        try:
            from bson import ObjectId as BsonObjectId

            files_col = MongoService.get_collection("files")
            await files_col.update_one(
                {"_id": BsonObjectId(document_id)},
                {
                    "$set": {
                        "upload.convPdfPath": pdf_path,
                        "upload.converted_at": datetime.utcnow(),
                        "upload.conversion_status": "completed",
                    }
                },
            )
            logger.info(f"[PDF변환워커] files 업데이트: {document_id}")
        except Exception as e:
            logger.error(f"[PDF변환워커] files 업데이트 실패: {document_id} - {e}")

        # 2. aims-api에 SSE 알림 요청
        await self._notify_conversion_complete(document_id, "completed")

    async def _notify_conversion_failed(self, job: Dict[str, Any], error_message: str):
        """preview_pdf 실패 후: files 컬렉션 업데이트 + SSE 알림"""
        document_id = job.get("document_id")
        if not document_id or job.get("job_type") != "preview_pdf":
            return

        try:
            from bson import ObjectId as BsonObjectId

            files_col = MongoService.get_collection("files")
            await files_col.update_one(
                {"_id": BsonObjectId(document_id)},
                {
                    "$set": {
                        "upload.conversion_status": "failed",
                        "upload.conversion_error": error_message,
                    }
                },
            )
        except Exception as e:
            logger.error(f"[PDF변환워커] files 실패 업데이트 오류: {document_id} - {e}")

        await self._notify_conversion_complete(document_id, "failed")

    async def _notify_conversion_complete(self, document_id: str, status: str):
        """aims-api 내부 API로 SSE 알림 발송"""
        try:
            notify_url = f"{settings.AIMS_API_URL}/api/internal/notify-conversion"
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    notify_url,
                    json={
                        "documentId": document_id,
                        "status": status,
                    },
                    headers={"x-api-key": settings.INTERNAL_API_KEY},
                )
        except Exception as e:
            # SSE 알림 실패는 변환 결과에 영향 없음
            logger.warning(f"[PDF변환워커] SSE 알림 실패: {document_id} - {e}")

    async def _handle_failure(
        self,
        queue_id: str,
        job: Dict[str, Any],
        error: Exception,
    ):
        """실패 처리 및 재시도 스케줄링"""
        retry_count = job.get("retry_count", 0)
        max_retries = job.get("max_retries", settings.PDF_CONV_QUEUE_MAX_RETRIES)
        error_message = str(error)
        original_name = job.get("original_name", "unknown")

        logger.warning(
            f"[PDF변환워커] 실패: {queue_id} ({original_name}) "
            f"retry {retry_count}/{max_retries} - {error_message}"
        )

        # FileNotFoundError는 재시도 불필요
        if isinstance(error, FileNotFoundError):
            await PdfConversionQueueService.mark_failed(queue_id, error_message)
            await self._notify_conversion_failed(job, error_message)
            return

        # 논블로킹 재시도: delay를 process_after로 설정하여 워커 루프를 블로킹하지 않음
        delay = settings.PDF_CONV_QUEUE_RETRY_BASE_DELAY * (2 ** retry_count)
        logger.info(f"[PDF변환워커] {delay}s 후 재시도 예약: {queue_id}")
        rescheduled = await PdfConversionQueueService.reschedule(
            queue_id, error_message, delay_seconds=delay
        )
        if not rescheduled:
            # 재시도 초과로 mark_failed됨
            await self._notify_conversion_failed(job, error_message)

    async def _periodic_cleanup(self):
        """정기적 정리 작업 (1시간마다)"""
        while self.running:
            try:
                await asyncio.sleep(3600)

                if not self.running:
                    break

                await PdfConversionQueueService.cleanup_stale_jobs()
                await PdfConversionQueueService.delete_completed_jobs(older_than_hours=24)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[PDF변환워커] 정리 에러: {e}")

    def get_status(self) -> Dict[str, Any]:
        """워커 상태 조회"""
        return {
            "running": self.running,
            "worker_id": self.worker_id,
            "current_job_id": self._current_job_id,
        }


# 전역 워커 인스턴스
pdf_conversion_worker = PdfConversionWorker()

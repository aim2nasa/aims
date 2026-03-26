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
import re
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
        await self._ensure_files_indexes()

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

    async def _ensure_files_indexes(self):
        """files 컬렉션 인덱스 보장 (워커 시작 시 1회)

        _recover_completed_without_text()와 _recover_stuck_pending_documents()가
        3분마다 upload.conversion_status로 쿼리하므로 COLLSCAN 방지.
        """
        try:
            files_col = MongoService.get_collection("files")
            await files_col.create_index(
                [("upload.conversion_status", 1)],
                name="idx_conversion_status",
                sparse=True,
            )
            logger.info("[PDF변환워커] files 인덱스 보장 완료: idx_conversion_status")
        except Exception as e:
            logger.warning(f"[PDF변환워커] files 인덱스 생성 실패 (무시): {e}")

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
        """preview_pdf 완료 후: files 컬렉션 업데이트 + 텍스트 추출 + SSE 알림"""
        document_id = job.get("document_id")
        if not document_id:
            return

        pdf_path = result.get("pdf_path")
        if not pdf_path:
            return

        from bson import ObjectId as BsonObjectId

        files_col = MongoService.get_collection("files")

        # 1. files 컬렉션 직접 업데이트 (변환 상태)
        try:
            await files_col.update_one(
                {"_id": BsonObjectId(document_id)},
                {
                    "$set": {
                        "upload.convPdfPath": pdf_path,
                        "upload.converted_at": datetime.utcnow(),
                        "upload.conversion_status": "completed",
                    },
                    "$unset": {
                        "meta.text_extraction_failed": "",
                    },
                },
            )
            logger.info(f"[PDF변환워커] files 업데이트: {document_id}")
        except Exception as e:
            logger.error(f"[PDF변환워커] files 업데이트 실패: {document_id} - {e}")

        # 2. 변환된 PDF에서 텍스트 추출 → meta.full_text가 비어있으면 업데이트
        await self._extract_and_update_text(document_id, pdf_path, files_col)

        # 3. aims-api에 SSE 알림 요청
        await self._notify_conversion_complete(document_id, "completed")

    async def _extract_and_update_text(
        self,
        document_id: str,
        pdf_path: str,
        files_col,
    ) -> bool:
        """
        변환된 PDF에서 텍스트 추출 후 meta.full_text가 비어있으면 DB 업데이트.

        파이프라인 업로드 시 text_extraction이 실패했거나,
        preview_pdf 재변환 성공 후 텍스트가 누락된 경우를 보완.
        텍스트가 추출되면 AI 분류(요약/문서유형)도 수행.

        Returns:
            True: 텍스트 추출 성공 및 DB 업데이트 완료
            False: 텍스트 추출 불가 또는 스킵
        """
        from bson import ObjectId as BsonObjectId

        try:
            # 현재 문서의 meta.full_text 확인 — 이미 있으면 스킵
            doc = await files_col.find_one(
                {"_id": BsonObjectId(document_id)},
                {
                    "meta.full_text": 1,
                    "ocr.full_text": 1,
                    "ownerId": 1,
                    "upload.originalName": 1,
                    "displayName": 1,
                    "customerId": 1,
                },
            )
            if not doc:
                return False

            meta_text = (doc.get("meta") or {}).get("full_text", "")
            ocr_text = (doc.get("ocr") or {}).get("full_text", "")

            # 이미 텍스트가 있으면 재추출 불필요
            if (meta_text and meta_text.strip()) or (ocr_text and ocr_text.strip()):
                logger.debug(
                    f"[PDF변환워커] 텍스트 이미 존재, 추출 스킵: {document_id}"
                )
                return False

            # 변환된 PDF 파일에서 텍스트 추출
            if not os.path.exists(pdf_path):
                logger.warning(f"[PDF변환워커] 변환 PDF 파일 없음: {pdf_path}")
                # 파일 없음 → 재시도해도 무의미, 마커 기록
                await files_col.update_one(
                    {"_id": BsonObjectId(document_id)},
                    {"$set": {"meta.text_extraction_failed": True}},
                )
                return False

            with open(pdf_path, "rb") as f:
                pdf_bytes = f.read()

            extracted_text = self._extract_text_from_pdf_bytes(pdf_bytes)

            if not extracted_text or not extracted_text.strip():
                logger.info(
                    f"[PDF변환워커] 변환 PDF에서 텍스트 없음 (스캔/이미지 문서), OCR fallback 큐 등록: {document_id}"
                )
                # 스캔/이미지 문서 → OCR fallback 마커 설정 + OCR 큐에 직접 등록
                await files_col.update_one(
                    {"_id": BsonObjectId(document_id)},
                    {"$set": {"meta.ocr_fallback_needed": True}},
                )
                # Redis Stream OCR 큐에 등록하여 즉시 OCR 처리 시작
                await self._enqueue_ocr_fallback(document_id, pdf_path, doc)
                return False

            logger.info(
                f"[PDF변환워커] 텍스트 추출 성공: {document_id} ({len(extracted_text)} chars)"
            )

            # AI 분류 (요약 + 문서유형 + 제목) 수행
            text_update = {
                "meta.full_text": extracted_text,
                "meta.length": len(extracted_text),
                "meta.document_type": "general",
                "meta.confidence": 0.0,
            }

            owner_id = doc.get("ownerId", "")
            original_name = (doc.get("upload") or {}).get("originalName", "")

            try:
                from services.openai_service import OpenAIService

                # 고객명 조회 (summarize_text 프롬프트에 전달하여 이름 환각 방지)
                customer_name_for_summary = None
                customer_id_for_summary = doc.get("customerId")
                if customer_id_for_summary:
                    try:
                        customers_col_summary = MongoService.get_collection("customers")
                        customer_doc_summary = await customers_col_summary.find_one(
                            {"_id": BsonObjectId(str(customer_id_for_summary))},
                            {"personal_info.name": 1}
                        )
                        if customer_doc_summary:
                            customer_name_for_summary = (customer_doc_summary.get("personal_info") or {}).get("name")
                    except Exception:
                        pass

                summary_result = await OpenAIService.summarize_text(
                    extracted_text,
                    owner_id=owner_id,
                    document_id=document_id,
                    filename=original_name,
                    customer_name=customer_name_for_summary,
                )
                text_update["meta.summary"] = summary_result.get("summary", "")
                text_update["meta.title"] = summary_result.get("title", "")
                text_update["meta.document_type"] = summary_result.get(
                    "document_type", "general"
                )
                text_update["meta.confidence"] = summary_result.get("confidence", 0.0)
                logger.info(
                    f"[PDF변환워커] AI 분류 완료: {document_id} → {summary_result.get('document_type', 'general')}"
                )

                # displayName 생성 (OCR 경로와 동일 패턴, 미설정 시에만)
                if not doc.get("displayName"):
                    # 고객명은 위에서 조회한 customer_name_for_summary 재사용
                    customer_name = customer_name_for_summary

                    title = summary_result.get("title", "")
                    if not title and len(extracted_text.strip()) >= 10:
                        try:
                            title_result = await OpenAIService.generate_title_only(
                                text=extracted_text,
                                owner_id=owner_id,
                                document_id=document_id,
                                original_filename=original_name,
                                customer_name=customer_name,
                            )
                            title = title_result.get("title") or ""
                        except Exception:
                            pass
                    if title:
                        ext = os.path.splitext(original_name)[1].lower() if original_name else ""
                        safe_title = re.sub(r'[\\/:*?"<>|]', '', title)
                        safe_title = re.sub(r'\s+', ' ', safe_title).strip()
                        if len(safe_title) > 40:
                            safe_title = safe_title[:40].rstrip()
                        text_update["displayName"] = f"{safe_title}{ext}" if ext else safe_title
                        logger.info(
                            f"[PDF변환워커] displayName 생성: {original_name} → {text_update['displayName']}"
                        )
            except Exception as ai_err:
                logger.warning(
                    f"[PDF변환워커] AI 분류 실패 (텍스트는 저장): {document_id} - {ai_err}"
                )

            # DB 업데이트
            await files_col.update_one(
                {"_id": BsonObjectId(document_id)},
                {"$set": text_update},
            )
            logger.info(
                f"[PDF변환워커] 텍스트+분류 DB 업데이트 완료: {document_id}"
            )
            return True

        except Exception as e:
            # 텍스트 추출 실패가 변환 결과에 영향을 주지 않도록 격리
            logger.error(
                f"[PDF변환워커] 텍스트 추출/업데이트 실패: {document_id} - {e}",
                exc_info=True,
            )
            return False

    async def _enqueue_ocr_fallback(self, document_id: str, pdf_path: str, doc: dict):
        """OCR fallback이 필요한 문서를 Redis Stream OCR 큐에 등록.

        실패해도 DB 마커(ocr_fallback_needed)는 이미 기록되어 있으므로
        변환 결과에 영향을 주지 않도록 격리.
        """
        try:
            from services.redis_service import RedisService

            owner_id = doc.get("ownerId", "")
            original_name = (doc.get("upload") or {}).get("originalName", "")
            queued_at = datetime.utcnow().isoformat()

            await RedisService.add_to_stream(
                file_id=document_id,
                file_path=pdf_path,
                doc_id=document_id,
                owner_id=owner_id,
                queued_at=queued_at,
                original_name=original_name,
            )
            logger.info(
                f"[PDF변환워커] OCR fallback 큐 등록 완료: {document_id}"
            )
        except Exception as e:
            # OCR 큐 등록 실패는 변환 결과에 영향 없음 (마커로 추후 복구 가능)
            logger.warning(
                f"[PDF변환워커] OCR fallback 큐 등록 실패: {document_id} - {e}"
            )

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
        """정기적 정리 작업 (3분마다)"""
        while self.running:
            try:
                await asyncio.sleep(180)  # 3분

                if not self.running:
                    break

                await PdfConversionQueueService.cleanup_stale_jobs()
                await PdfConversionQueueService.delete_completed_jobs(older_than_hours=24)
                await self._recover_stuck_pending_documents()
                await self._recover_completed_without_text()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[PDF변환워커] 정리 에러: {e}")

    async def _recover_stuck_pending_documents(self):
        """
        files 컬렉션에서 conversion_status='pending'이지만
        큐에 active job이 없는 문서를 failed로 복구.
        (시스템 문제로 stuck된 것이므로 retry_count도 리셋)
        """
        try:
            db = MongoService.get_db()
            files_collection = db["files"]
            queue_collection = db["pdf_conversion_queue"]

            # pending 상태인 모든 문서 조회
            pending_docs = await files_collection.find(
                {"upload.conversion_status": "pending"},
                {"_id": 1}
            ).to_list(length=100)

            if not pending_docs:
                return

            recovered = 0
            for doc in pending_docs:
                doc_id_str = str(doc["_id"])
                # 큐에 active job(pending/processing)이 있는지 확인
                active_job = await queue_collection.find_one({
                    "document_id": doc_id_str,
                    "job_type": "preview_pdf",
                    "status": {"$in": ["pending", "processing"]}
                })
                if active_job:
                    continue  # 정상 처리 중

                # stuck 확정 → failed로 복구
                await files_collection.update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "upload.conversion_status": "failed",
                            "upload.conversion_error": "자동 복구: 변환 큐에 작업 없음 (stuck)",
                            "upload.conversion_retry_count": 0,
                        }
                    }
                )
                recovered += 1
                logger.info(f"[PDF변환워커] stuck pending 복구: {doc_id_str}")

            if recovered > 0:
                logger.info(f"[PDF변환워커] stuck pending 총 {recovered}건 복구 → failed")
        except Exception as e:
            logger.error(f"[PDF변환워커] stuck pending 복구 에러: {e}")

    async def _recover_completed_without_text(self):
        """
        변환 완료(completed)인데 meta.full_text가 비어있는 문서를 감지하여
        변환된 PDF에서 텍스트를 재추출.

        이슈1(파이프라인 이슈): 변환 성공했지만 텍스트 추출 누락
        이슈2(재변환 이슈): 재변환 성공 후 텍스트 추출 미트리거
        """
        try:
            files_col = MongoService.get_collection("files")

            # 변환 완료 + convPdfPath 있음 + meta/ocr 텍스트 모두 비어있음
            # + 이미 추출 시도하여 실패한 문서는 제외 (무한 재시도 방지)
            candidates = await files_col.find(
                {
                    "upload.conversion_status": "completed",
                    "upload.convPdfPath": {"$exists": True, "$ne": ""},
                    "meta.text_extraction_failed": {"$ne": True},
                    "meta.ocr_fallback_needed": {"$ne": True},
                    "$and": [
                        {"$or": [
                            {"meta.full_text": {"$exists": False}},
                            {"meta.full_text": ""},
                            {"meta.full_text": None},
                        ]},
                        {"$or": [
                            {"ocr.full_text": {"$exists": False}},
                            {"ocr.full_text": ""},
                            {"ocr.full_text": None},
                        ]},
                    ],
                },
                {"_id": 1, "upload.convPdfPath": 1, "upload.originalName": 1},
            ).to_list(length=50)

            if not candidates:
                return

            recovered = 0
            for doc in candidates:

                doc_id = str(doc["_id"])
                pdf_path = (doc.get("upload") or {}).get("convPdfPath", "")
                if not pdf_path:
                    continue

                logger.info(
                    f"[PDF변환워커] 텍스트 누락 감지 (completed): {doc_id} - "
                    f"{(doc.get('upload') or {}).get('originalName', '')}"
                )
                success = await self._extract_and_update_text(doc_id, pdf_path, files_col)
                if success:
                    recovered += 1

            if recovered > 0:
                logger.info(
                    f"[PDF변환워커] 텍스트 누락 복구 완료: {recovered}건"
                )
        except Exception as e:
            logger.error(
                f"[PDF변환워커] 텍스트 누락 복구 에러: {e}", exc_info=True
            )

    def get_status(self) -> Dict[str, Any]:
        """워커 상태 조회"""
        return {
            "running": self.running,
            "worker_id": self.worker_id,
            "current_job_id": self._current_job_id,
        }


# 전역 워커 인스턴스
pdf_conversion_worker = PdfConversionWorker()

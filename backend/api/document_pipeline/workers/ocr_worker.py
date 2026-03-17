"""
OCR Worker - Background Redis Stream Consumer
Replaces n8n OCRWorker workflow
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any
import httpx
import os
import re
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import ObjectId
from config import get_settings
from services.redis_service import RedisService
from services.mongo_service import MongoService
from services.upstage_service import UpstageService
from services.openai_service import OpenAIService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
settings = get_settings()


class OCRWorker:
    """Background worker for processing OCR jobs from Redis stream"""

    def __init__(self):
        self.running = False
        self.poll_interval = 5  # seconds
        self.aims_api_url = settings.AIMS_API_URL
        self.upstage_service = UpstageService()
        self.openai_service = OpenAIService()

    async def start(self):
        """Start the OCR worker loop"""
        self.running = True
        logger.info("OCR Worker started")

        await RedisService.connect()

        # Recover pending messages from previous crash (PEL)
        try:
            pending = await RedisService.claim_pending_messages(min_idle_ms=30000)
            for msg in pending:
                logger.info(f"Recovering pending OCR job: file_id={msg['file_id']}")
                await self._process_message(msg)
        except Exception as e:
            logger.error(f"PEL recovery failed: {e}", exc_info=True)

        logger.info("OCR Worker entering poll loop")

        while self.running:
            try:
                await self._process_next_job()
            except asyncio.CancelledError:
                logger.warning("OCR Worker task cancelled")
                break
            except Exception as e:
                logger.error(f"OCR Worker error: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

        logger.info("OCR Worker loop exited")

    async def stop(self):
        """Stop the OCR worker"""
        self.running = False
        logger.info("OCR Worker stopped")

    async def _process_next_job(self):
        """Process the next job from Redis stream"""
        try:
            messages = await RedisService.read_stream(count=1, block=5000)
        except Exception as e:
            logger.error(f"OCR Worker read_stream failed: {e}", exc_info=True)
            await asyncio.sleep(self.poll_interval)
            return

        if not messages:
            return

        for msg in messages:
            await self._process_message(msg)

    async def _process_message(self, msg: Dict[str, Any]):
        """Process a single OCR message"""
        message_id = msg["message_id"]
        file_id = msg["file_id"]
        file_path = msg["file_path"]
        doc_id = msg["doc_id"]
        owner_id = msg["owner_id"]
        queued_at = msg["queued_at"]
        original_name = msg.get("original_name", "")

        logger.info(f"Processing OCR job: file_id={file_id}, path={file_path}")

        try:
            # 0. 고객명 조회 (summarize_text 프롬프트에 전달하여 이름 환각 방지)
            customer_name = None
            try:
                collection = MongoService.get_collection("files")
                file_doc = await collection.find_one(
                    {"_id": ObjectId(file_id)},
                    {"customerId": 1}
                )
                if file_doc and file_doc.get("customerId"):
                    customers_col = MongoService.get_collection("customers")
                    customer_doc = await customers_col.find_one(
                        {"_id": ObjectId(str(file_doc["customerId"]))},
                        {"personal_info.name": 1}
                    )
                    if customer_doc:
                        customer_name = (customer_doc.get("personal_info") or {}).get("name")
            except Exception as e:
                logger.warning(f"Customer name lookup for summarize_text failed: {e}")

            # 1. Get page count
            page_count = await self._get_page_count(file_path)

            # 2. Check OCR quota
            quota_result = await self._check_quota(owner_id, page_count)

            if not quota_result.get("allowed", False):
                await self._handle_quota_exceeded(
                    msg, quota_result, page_count
                )
                return

            # 3. Set status to running
            await self._update_ocr_status(file_id, {
                "ocr.status": "running",
                "ocr.queued_at": queued_at,
                "ocr.started_at": datetime.utcnow().isoformat()
            })

            # 4. Process OCR
            ocr_result = await self._process_ocr(file_path, owner_id=owner_id, doc_id=doc_id, original_name=original_name, customer_name=customer_name)

            if ocr_result.get("error"):
                await self._handle_ocr_error(msg, ocr_result, queued_at)
            else:
                await self._handle_ocr_success(msg, ocr_result, queued_at, page_count)

        except Exception as e:
            logger.error(f"OCR processing failed: {e}", exc_info=True)
            await self._handle_ocr_error(msg, {"statusCode": 500, "statusMessage": str(e)}, queued_at)

    async def _get_page_count(self, file_path: str) -> int:
        """Get page count for PDF files"""
        try:
            if not os.path.exists(file_path):
                return 1

            import fitz  # PyMuPDF
            if file_path.lower().endswith('.pdf'):
                doc = fitz.open(file_path)
                count = len(doc)
                doc.close()
                return count
            return 1
        except Exception as e:
            logger.warning(f"Page count failed: {e}")
            return 1

    async def _check_quota(self, owner_id: str, page_count: int) -> Dict[str, Any]:
        """Check OCR quota via AIMS API"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.aims_api_url}/api/internal/ocr/check-quota",
                    json={"owner_id": owner_id, "page_count": page_count},
                    headers={"Content-Type": "application/json"},
                    timeout=10.0
                )
                if response.status_code == 200:
                    return response.json()
                logger.warning(f"[QuotaCheck] API 호출 실패 (fail-closed): {response.status_code}")
                # fail-closed: API 실패 시 OCR 처리 보류 (안전 우선)
                return {"allowed": False, "reason": "api_error_fallback"}
        except Exception as e:
            logger.warning(f"[QuotaCheck] 오류 (fail-closed): {e}")
            # fail-closed: 오류 시 OCR 처리 보류 (aims_api 복구 후 재시도)
            return {"allowed": False, "reason": "quota_check_error"}

    async def _process_ocr(self, file_path: str, owner_id: Optional[str] = None, doc_id: Optional[str] = None, original_name: str = "", customer_name: Optional[str] = None) -> Dict[str, Any]:
        """Process OCR using Upstage service"""
        try:
            if not os.path.exists(file_path):
                return {
                    "error": True,
                    "status": 404,
                    "userMessage": f"파일을 찾을 수 없습니다: {file_path}"
                }

            with open(file_path, "rb") as f:
                content = f.read()

            filename = os.path.basename(file_path)
            ocr_result = await self.upstage_service.process_ocr(content, filename)

            if ocr_result.get("error"):
                return ocr_result

            # Generate summary if text was extracted
            summary = None
            result = None
            document_type = "general"
            doc_confidence = 0.0
            if ocr_result.get("full_text"):
                try:
                    result = await self.openai_service.summarize_text(
                        ocr_result["full_text"],
                        owner_id=owner_id,
                        document_id=doc_id,
                        filename=original_name or None,
                        customer_name=customer_name
                    )
                    summary = result.get("summary")
                    document_type = result.get("document_type", "general")
                    doc_confidence = result.get("confidence", 0.0)
                except Exception as e:
                    logger.warning(f"Summary generation failed: {e}")

            return {
                "error": False,
                "status": 200,
                "confidence": ocr_result.get("confidence"),
                "full_text": ocr_result.get("full_text"),
                "summary": summary,
                "title": result.get("title") if result else None,
                "document_type": document_type,
                "doc_confidence": doc_confidence,
                "num_pages": ocr_result.get("num_pages", 1)
            }

        except Exception as e:
            logger.error(f"OCR processing error: {e}")
            return {
                "error": True,
                "status": 500,
                "userMessage": str(e)
            }

    async def _update_ocr_status(self, file_id: str, update: Dict[str, Any]):
        """Update OCR status in MongoDB"""
        collection = MongoService.get_collection("files")
        await collection.update_one(
            {"_id": ObjectId(file_id)},
            {"$set": update}
        )

    async def _handle_quota_exceeded(
        self,
        msg: Dict[str, Any],
        quota_result: Dict[str, Any],
        page_count: int
    ):
        """Handle quota exceeded case"""
        file_id = msg["file_id"]
        doc_id = msg["doc_id"]
        owner_id = msg["owner_id"]
        message_id = msg["message_id"]

        reason = quota_result.get("reason", "OCR 한도 초과")
        current_usage = quota_result.get("current_usage", 0)
        quota = quota_result.get("quota", 0)

        quota_message = f"{reason}: 현재 {current_usage}p / {quota}p, 요청 {page_count}p"

        # Update MongoDB
        await self._update_ocr_status(file_id, {
            "ocr.status": "quota_exceeded",
            "ocr.quota_message": quota_message,
            "status": "failed",
            "overallStatus": "error",
            "stages.ocr.status": "error",
            "stages.ocr.message": "OCR 한도 초과",
            "stages.ocr.timestamp": datetime.utcnow().isoformat()
        })

        # Notify
        await self._notify_processing_complete(doc_id, owner_id, "quota_exceeded")

        # Delete from Redis
        await RedisService.ack_and_delete(message_id)

        logger.info(f"Quota exceeded for file {file_id}: {quota_message}")

    async def _handle_ocr_success(
        self,
        msg: Dict[str, Any],
        ocr_result: Dict[str, Any],
        queued_at: str,
        page_count: int
    ):
        """Handle successful OCR processing"""
        file_id = msg["file_id"]
        doc_id = msg["doc_id"]
        owner_id = msg["owner_id"]
        message_id = msg["message_id"]

        # Build OCR update
        ocr_update = {
            "ocr.status": "done",
            "ocr.queued_at": queued_at,
            "ocr.done_at": datetime.utcnow().isoformat(),
            "ocr.confidence": ocr_result.get("confidence"),
            "ocr.full_text": ocr_result.get("full_text"),
            "ocr.summary": ocr_result.get("summary"),
            "ocr.page_count": ocr_result.get("num_pages", page_count),
            "meta.document_type": ocr_result.get("document_type", "general"),
            "meta.confidence": ocr_result.get("doc_confidence", 0.0),
            "status": "completed",
            "overallStatus": "completed",
            "progress": 100,
            "progressStage": "complete",
            "progressMessage": "OCR 처리 완료",
        }

        # Generate displayName (only if not already set)
        try:
            collection = MongoService.get_collection("files")
            doc = await collection.find_one(
                {"_id": ObjectId(file_id)},
                {"displayName": 1, "upload.originalName": 1, "customerId": 1}
            )
            if doc and not doc.get("displayName"):
                original_name = doc.get("upload", {}).get("originalName", "")
                full_text = ocr_result.get("full_text", "")

                # 고객명 조회 (프롬프트에 전달하여 이름 환각 방지)
                customer_name = None
                customer_id = doc.get("customerId")
                if customer_id:
                    try:
                        customers_col = MongoService.get_collection("customers")
                        customer_doc = await customers_col.find_one(
                            {"_id": ObjectId(str(customer_id))},
                            {"personal_info.name": 1}
                        )
                        if customer_doc:
                            customer_name = (customer_doc.get("personal_info") or {}).get("name")
                    except Exception as e:
                        logger.warning(f"Customer name lookup failed: {e}")

                # 1순위: summarize_text에서 받은 title
                title = ocr_result.get("title")

                # 2순위: title이 없으면 generate_title_only로 경량 생성
                if not title and full_text and len(full_text.strip()) >= 10:
                    try:
                        title_result = await OpenAIService.generate_title_only(
                            text=full_text,
                            owner_id=owner_id,
                            document_id=doc_id,
                            original_filename=original_name,
                            customer_name=customer_name
                        )
                        title = title_result.get("title")
                    except Exception as e:
                        logger.warning(f"generate_title_only failed: {e}")

                if title:
                    ext = os.path.splitext(original_name)[1].lower() if original_name else ""
                    safe_title = re.sub(r'[\\/:*?"<>|]', '', title)
                    safe_title = re.sub(r'\s+', ' ', safe_title).strip()
                    if len(safe_title) > 40:
                        safe_title = safe_title[:40].rstrip()
                    display_name = f"{safe_title}{ext}" if ext else safe_title
                    ocr_update["displayName"] = display_name
                    logger.info(f"OCR displayName generated: {original_name} -> {display_name}")
        except Exception as e:
            logger.warning(f"displayName generation failed: {e}")

        # Update MongoDB with OCR results
        await self._update_ocr_status(file_id, ocr_update)

        # Log OCR usage
        await self._log_ocr_usage(
            doc_id, owner_id, page_count, "done"
        )

        # Notify processing complete
        await self._notify_processing_complete(doc_id, owner_id, "completed")

        # Delete from Redis
        await RedisService.ack_and_delete(message_id)

        logger.info(f"OCR completed for file {file_id}")

    async def _handle_ocr_error(
        self,
        msg: Dict[str, Any],
        ocr_result: Dict[str, Any],
        queued_at: str
    ):
        """Handle OCR processing error"""
        file_id = msg["file_id"]
        doc_id = msg["doc_id"]
        owner_id = msg["owner_id"]
        message_id = msg["message_id"]

        # Update MongoDB with error
        await self._update_ocr_status(file_id, {
            "ocr.status": "error",
            "ocr.queued_at": queued_at,
            "ocr.failed_at": datetime.utcnow().isoformat(),
            "ocr.statusCode": ocr_result.get("status", 500),
            "ocr.statusMessage": ocr_result.get("userMessage", "Unknown error"),
            "progress": -1,
            "progressStage": "error",
            "progressMessage": "OCR 처리 실패",
            "status": "failed",
            "overallStatus": "error",
        })

        # Log OCR usage with error
        await self._log_ocr_usage(
            doc_id, owner_id, 0, "error",
            error_code=ocr_result.get("status"),
            error_message=ocr_result.get("userMessage")
        )

        # Notify processing error
        await self._notify_processing_complete(doc_id, owner_id, "error")

        # Delete from Redis
        await RedisService.ack_and_delete(message_id)

        logger.error(f"OCR failed for file {file_id}: {ocr_result.get('userMessage')}")

    async def _log_ocr_usage(
        self,
        file_id: str,
        owner_id: str,
        page_count: int,
        status: str,
        error_code: Optional[int] = None,
        error_message: Optional[str] = None
    ):
        """Log OCR usage via AIMS API"""
        try:
            payload = {
                "file_id": file_id,
                "owner_id": owner_id,
                "page_count": page_count,
                "status": status,
                "processed_at": datetime.utcnow().isoformat()
            }
            if error_code:
                payload["error_code"] = error_code
            if error_message:
                payload["error_message"] = error_message

            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.aims_api_url}/api/internal/ocr/log-usage",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=10.0
                )
        except Exception as e:
            logger.warning(f"Failed to log OCR usage: {e}")

    async def _notify_processing_complete(
        self,
        doc_id: str,
        owner_id: str,
        status: str
    ):
        """Notify AIMS API that processing is complete"""
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.aims_api_url}/api/webhooks/document-processing-complete",
                    json={
                        "document_id": doc_id,
                        "owner_id": owner_id,
                        "status": status
                    },
                    headers={
                        "Content-Type": "application/json",
                        "X-API-Key": settings.WEBHOOK_API_KEY
                    },
                    timeout=10.0
                )
        except Exception as e:
            logger.warning(f"Failed to notify processing complete: {e}")


# Global worker instance
ocr_worker = OCRWorker()

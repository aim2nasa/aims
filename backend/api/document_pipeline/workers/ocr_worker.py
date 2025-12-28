"""
OCR Worker - Background Redis Stream Consumer
Replaces n8n OCRWorker workflow
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from bson import ObjectId
import httpx
import os

from config import get_settings
from services.redis_service import RedisService
from services.mongo_service import MongoService
from services.upstage_service import UpstageService
from services.openai_service import OpenAIService

logger = logging.getLogger(__name__)
settings = get_settings()


class OCRWorker:
    """Background worker for processing OCR jobs from Redis stream"""

    def __init__(self):
        self.running = False
        self.upstage_service = UpstageService()
        self.openai_service = OpenAIService()
        self.poll_interval = 5  # seconds
        self.aims_api_url = settings.AIMS_API_URL

    async def start(self):
        """Start the OCR worker loop"""
        self.running = True
        logger.info("OCR Worker started")

        await RedisService.connect()

        while self.running:
            try:
                await self._process_next_job()
            except Exception as e:
                logger.error(f"OCR Worker error: {e}")
                await asyncio.sleep(self.poll_interval)

    async def stop(self):
        """Stop the OCR worker"""
        self.running = False
        logger.info("OCR Worker stopped")

    async def _process_next_job(self):
        """Process the next job from Redis stream"""
        messages = await RedisService.read_stream(count=1, block=5000)

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

        logger.info(f"Processing OCR job: file_id={file_id}, path={file_path}")

        try:
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
            ocr_result = await self._process_ocr(file_path)

            if ocr_result.get("error"):
                await self._handle_ocr_error(msg, ocr_result, queued_at)
            else:
                await self._handle_ocr_success(msg, ocr_result, queued_at, page_count)

        except Exception as e:
            logger.error(f"OCR processing failed: {e}")
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
                return {"allowed": True}  # Default to allowed if API fails
        except Exception as e:
            logger.warning(f"Quota check failed: {e}, allowing by default")
            return {"allowed": True}

    async def _process_ocr(self, file_path: str) -> Dict[str, Any]:
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
            tags = []
            if ocr_result.get("full_text"):
                try:
                    summary, tags = await self.openai_service.summarize_text(
                        ocr_result["full_text"]
                    )
                except Exception as e:
                    logger.warning(f"Summary generation failed: {e}")

            return {
                "error": False,
                "status": 200,
                "confidence": ocr_result.get("confidence"),
                "full_text": ocr_result.get("full_text"),
                "summary": summary,
                "tags": tags,
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

        # Update MongoDB with OCR results
        await self._update_ocr_status(file_id, {
            "ocr.status": "done",
            "ocr.queued_at": queued_at,
            "ocr.done_at": datetime.utcnow().isoformat(),
            "ocr.confidence": ocr_result.get("confidence"),
            "ocr.full_text": ocr_result.get("full_text"),
            "ocr.summary": ocr_result.get("summary"),
            "ocr.tags": ocr_result.get("tags", []),
            "ocr.page_count": ocr_result.get("num_pages", page_count)
        })

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
            "ocr.statusMessage": ocr_result.get("userMessage", "Unknown error")
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

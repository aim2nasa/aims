"""
DocPrepMain Router
Main orchestrator for document processing pipeline
"""
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from bson import ObjectId

from config import get_settings
from services.mongo_service import MongoService
from services.file_service import FileService
from services.meta_service import MetaService
from services.openai_service import OpenAIService
from services.redis_service import RedisService

logger = logging.getLogger(__name__)
router = APIRouter()

# Unsupported MIME types
UNSUPPORTED_MIME_TYPES = [
    "application/postscript",
    "application/zip",
    "application/octet-stream"
]


@router.post("/docprep-main")
async def doc_prep_main(
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    source_path: Optional[str] = Form(None),
    shadow: bool = False  # Shadow mode: 문서 생성 없이 응답만 시뮬레이션
):
    """
    Main document processing orchestrator.

    Flow:
    1. Create document in MongoDB
    2. Save file to disk
    3. Extract metadata
    4. Route based on MIME type:
       - text/plain: Extract and save text
       - unsupported: Return 415
       - OCR needed: Queue to Redis
       - Has text: Notify complete
    """
    settings = get_settings()
    doc_id = None

    # Shadow mode: 문서 생성 없이 메타데이터 추출 및 응답 시뮬레이션만 수행
    if shadow:
        logger.info(f"[SHADOW] Processing file for comparison (no DB write)")
        try:
            file_content = await file.read()
            original_name = file.filename or "unknown"

            # n8n과 동일한 파일명 패턴 생성 (YYMMDDHHMMSS_randomhash.ext)
            simulated_filename = FileService._generate_filename(original_name)

            # 임시 파일로 메타데이터 추출
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(original_name)[1]) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                meta_result = await MetaService.extract_metadata(tmp_path)
                # 임시 파일명 대신 시뮬레이션된 파일명으로 교체
                meta_result["filename"] = simulated_filename
            finally:
                os.unlink(tmp_path)  # 임시 파일 삭제

            if meta_result.get("error"):
                return JSONResponse(
                    status_code=meta_result.get("status", 500),
                    content=meta_result
                )

            mime_type = meta_result.get("mime_type", "")
            full_text = meta_result.get("extracted_text", "")

            # MIME 타입별 응답 시뮬레이션
            if mime_type == "text/plain":
                return {"exitCode": 0, "stderr": ""}

            if mime_type in UNSUPPORTED_MIME_TYPES:
                return JSONResponse(
                    status_code=415,
                    content={
                        "warn": True,
                        "status": 415,
                        "userMessage": "OCR 생략: 지원하지 않는 문서 형식입니다.",
                        "mime": mime_type,
                        "filename": original_name,
                        "document_id": "shadow_simulated"
                    }
                )

            if not full_text or len(full_text.strip()) == 0:
                return {
                    "result": "success",
                    "document_id": "shadow_simulated",
                    "ocr": {
                        "status": "queued",
                        "queued_at": datetime.utcnow().isoformat()
                    }
                }

            # 텍스트 추출 성공 - 요약 생성
            summary_result = await OpenAIService.summarize_text(full_text)

            return {
                "result": "success",
                "document_id": "shadow_simulated",
                "status": "completed",
                "meta": {
                    "filename": meta_result.get("filename"),
                    "extension": meta_result.get("extension"),
                    "mime": meta_result.get("mime_type"),
                    "size_bytes": str(meta_result.get("file_size", "")),
                    "created_at": datetime.utcnow().isoformat() + "Z",
                    "meta_status": "ok",
                    "exif": "{}",
                    "pdf_pages": str(meta_result.get("num_pages", "")),
                    "full_text": (full_text[:10000] + "...") if len(full_text) > 10000 else full_text
                }
            }
        except Exception as e:
            logger.error(f"[SHADOW] Error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    try:
        # Step 1: Create document in MongoDB
        logger.info(f"Creating document for userId: {userId}, customerId: {customerId}")

        files_collection = MongoService.get_collection("files")
        doc_data = {
            "ownerId": userId,
            "createdAt": datetime.utcnow(),
        }
        if customerId:
            doc_data["customerId"] = customerId

        result = await files_collection.insert_one(doc_data)
        doc_id = str(result.inserted_id)
        logger.info(f"Created document: {doc_id}")

        # Step 2: Save file to disk (DocUpload logic)
        file_content = await file.read()
        original_name = file.filename or "unknown"

        saved_name, dest_path = await FileService.save_file(
            content=file_content,
            original_name=original_name,
            user_id=userId,
            source_path=source_path
        )

        logger.info(f"Saved file: {saved_name} to {dest_path}")

        # Update MongoDB with upload info
        upload_info = {
            "upload.originalName": original_name,
            "upload.saveName": saved_name,
            "upload.destPath": dest_path,
            "upload.uploaded_at": datetime.utcnow().isoformat(),
        }
        if source_path:
            upload_info["upload.sourcePath"] = source_path

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": upload_info}
        )

        # Connect document to customer if customerId provided
        if customerId:
            await _connect_document_to_customer(customerId, doc_id, userId)

        # Step 3: Extract metadata (DocMeta logic)
        meta_result = await MetaService.extract_metadata(dest_path)

        if meta_result.get("error"):
            logger.warning(f"Metadata extraction failed: {meta_result}")
            # Save error to MongoDB
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"meta.error": meta_result.get("message", "Unknown error")}}
            )
            return JSONResponse(
                status_code=meta_result.get("status", 500),
                content=meta_result
            )

        # Get summary if text was extracted
        full_text = meta_result.get("extracted_text", "")
        summary = ""
        tags = []

        if full_text and len(full_text.strip()) > 0:
            summary_result = await OpenAIService.summarize_text(full_text)
            summary = summary_result.get("summary", "")
            tags = summary_result.get("tags", [])

        # Update MongoDB with meta info
        meta_update = {
            "meta.filename": meta_result.get("filename"),
            "meta.extension": meta_result.get("extension"),
            "meta.mime": meta_result.get("mime_type"),
            "meta.size_bytes": meta_result.get("file_size"),
            "meta.file_hash": meta_result.get("file_hash"),
            "meta.pdf_pages": meta_result.get("num_pages"),
            "meta.full_text": full_text or "",
            "meta.summary": summary,
            "meta.tags": tags,
            "meta.length": len(full_text) if full_text else 0,
            "meta.meta_status": "done"
        }

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": meta_update}
        )

        mime_type = meta_result.get("mime_type", "")

        # Step 4: Route based on MIME type

        # Case 1: text/plain - extract and save text
        if mime_type == "text/plain":
            logger.info(f"Processing text/plain file: {doc_id}")

            # Read file content as text
            text_content = await FileService.read_file_as_text(dest_path)

            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"text.full_text": text_content}}
            )

            # Match n8n response format exactly
            return {
                "exitCode": 0,
                "stderr": ""
            }

        # Case 2: Unsupported MIME type
        if mime_type in UNSUPPORTED_MIME_TYPES:
            logger.warning(f"Unsupported MIME type: {mime_type} for {doc_id}")

            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"ocr.warn": "Skipped OCR due to unsupported MIME type"}}
            )

            return JSONResponse(
                status_code=415,
                content={
                    "warn": True,
                    "status": 415,
                    "userMessage": "OCR 생략: 지원하지 않는 문서 형식입니다.",
                    "mime": mime_type,
                    "filename": original_name,
                    "document_id": doc_id
                }
            )

        # Case 3: Check if OCR is needed (no text extracted)
        if not full_text or len(full_text.strip()) == 0:
            logger.info(f"Queueing OCR for document: {doc_id}")

            queued_at = datetime.utcnow().isoformat()

            # Queue to Redis
            await RedisService.add_to_stream(
                file_id=doc_id,
                file_path=dest_path,
                doc_id=doc_id,
                owner_id=userId,
                queued_at=queued_at
            )

            # Update MongoDB with queue status
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {
                    "ocr.status": "queued",
                    "ocr.queued_at": queued_at
                }}
            )

            return {
                "result": "success",
                "document_id": doc_id,
                "ocr": {
                    "status": "queued",
                    "queued_at": queued_at
                }
            }

        # Case 4: Text already extracted, notify complete
        logger.info(f"Document {doc_id} processed without OCR (text already extracted)")

        # Send completion notification (async, don't wait)
        await _notify_document_complete(doc_id, userId)

        # Match n8n response format exactly (include meta, exclude has_text)
        return {
            "result": "success",
            "document_id": doc_id,
            "status": "completed",
            "meta": {
                "filename": meta_result.get("filename"),
                "extension": meta_result.get("extension"),
                "mime": meta_result.get("mime_type"),
                "size_bytes": str(meta_result.get("file_size", "")),
                "created_at": datetime.utcnow().isoformat() + "Z",
                "meta_status": "ok",
                "exif": "{}",
                "pdf_pages": str(meta_result.get("num_pages", "")),
                "full_text": (full_text[:10000] + "...") if len(full_text) > 10000 else full_text
            }
        }

    except Exception as e:
        logger.error(f"Error in doc_prep_main: {e}", exc_info=True)

        # Save error to MongoDB if we have a doc_id
        if doc_id:
            try:
                files_collection = MongoService.get_collection("files")
                await files_collection.update_one(
                    {"_id": ObjectId(doc_id)},
                    {"$set": {
                        "error.statusCode": 500,
                        "error.statusMessage": str(e),
                        "error.timestamp": datetime.utcnow().isoformat()
                    }}
                )
            except Exception as save_error:
                logger.error(f"Failed to save error to MongoDB: {save_error}")

        raise HTTPException(status_code=500, detail=str(e))


async def _connect_document_to_customer(customer_id: str, doc_id: str, user_id: str):
    """Connect document to customer via internal API call"""
    import httpx

    settings = get_settings()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.AIMS_API_URL}/api/customers/{customer_id}/documents",
                json={
                    "document_id": doc_id,
                    "userId": user_id,
                    "notes": ""
                },
                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                timeout=10.0
            )

            if response.status_code != 200:
                logger.warning(f"Failed to connect document to customer: {response.text}")
    except Exception as e:
        logger.warning(f"Error connecting document to customer: {e}")


async def _notify_document_complete(doc_id: str, owner_id: str):
    """Notify that document processing is complete"""
    import httpx
    import asyncio

    settings = get_settings()

    async def _send_notification():
        # Wait 3 seconds for SSE to be ready (as in n8n workflow)
        await asyncio.sleep(3)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.AIMS_API_URL}/api/webhooks/document-processing-complete",
                    json={
                        "document_id": doc_id,
                        "status": "completed",
                        "owner_id": owner_id
                    },
                    headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                    timeout=10.0
                )

                if response.status_code != 200:
                    logger.warning(f"Failed to notify document complete: {response.text}")
        except Exception as e:
            logger.warning(f"Error notifying document complete: {e}")

    # Run notification in background
    asyncio.create_task(_send_notification())

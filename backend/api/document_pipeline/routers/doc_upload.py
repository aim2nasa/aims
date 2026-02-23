"""
DocUpload Router - File Upload Handler
Replaces n8n DocUpload workflow
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import logging

from config import get_settings
from services.file_service import FileService
from models.document import UploadResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/docupload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    userId: str = Form(...),
    source_path: Optional[str] = Form(None),
    customerId: Optional[str] = Form(None)
):
    """
    Upload a document file.

    - Saves file to user-specific directory
    - Returns saved file information

    Compatible with n8n DocUpload webhook response format.
    """
    try:
        if not file.filename:
            return UploadResponse(
                result="error",
                code="REQUEST_INVALID",
                message="No file provided"
            )

        # Read file content
        content = await file.read()

        # 🔴 파일 크기 검증 (B4: 서버사이드 방어)
        settings = get_settings()
        max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(content) > max_size_bytes:
            file_size_mb = round(len(content) / (1024 * 1024), 1)
            return JSONResponse(
                status_code=413,
                content={
                    "result": "error",
                    "status": 413,
                    "userMessage": f"파일 크기({file_size_mb}MB)가 제한({settings.MAX_UPLOAD_SIZE_MB}MB)을 초과합니다.",
                    "filename": file.filename
                }
            )

        if len(content) == 0:
            return UploadResponse(
                result="error",
                code="REQUEST_INVALID",
                message="Empty file"
            )

        # Save file
        saved_name, dest_path = await FileService.save_file(
            content=content,
            original_name=file.filename,
            user_id=userId,
            source_path=source_path
        )

        logger.info(f"File uploaded: {file.filename} -> {dest_path}")

        return UploadResponse(
            result="success",
            original=file.filename,
            sourcePath=source_path or "",
            saved_name=saved_name,
            path=dest_path
        )

    except Exception as e:
        logger.error(f"Upload failed: {str(e)}")
        return UploadResponse(
            result="error",
            code="UPLOAD_FAILED",
            message=str(e)
        )

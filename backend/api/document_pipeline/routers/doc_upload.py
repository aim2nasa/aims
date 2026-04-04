"""
DocUpload Router - File Upload Handler
Replaces n8n DocUpload workflow
"""
import logging
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile
from models.document import UploadResponse
from services.file_service import FileService

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

        # 파일 크기 제한은 Nginx 서버 블록(10G)이 담당하며, 여기서는 제한하지 않는다.
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

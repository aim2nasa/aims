"""
DocUpload Router - File Upload Handler
Replaces n8n DocUpload workflow
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import logging

from services.file_service import FileService
from models.document import UploadResponse

router = APIRouter()
logger = logging.getLogger(__name__)
file_service = FileService()


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

        if len(content) == 0:
            return UploadResponse(
                result="error",
                code="REQUEST_INVALID",
                message="Empty file"
            )

        # Save file
        saved_name, dest_path, src_path = await file_service.save_file(
            file_content=content,
            original_name=file.filename,
            user_id=userId,
            source_path=source_path
        )

        logger.info(f"File uploaded: {file.filename} -> {dest_path}")

        return UploadResponse(
            result="success",
            original=file.filename,
            sourcePath=src_path,
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

"""
DocMeta Router - Metadata Extraction Handler
Replaces n8n DocMeta workflow
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body
from typing import Optional
import logging
import tempfile
import os
from pydantic import BaseModel

from services.meta_service import MetaService
from services.openai_service import OpenAIService
from models.document import MetaRequest, MetaResponse

router = APIRouter()
logger = logging.getLogger(__name__)


class MetaPathRequest(BaseModel):
    path: str
    saved_name: Optional[str] = None
    original: Optional[str] = None
    owner_id: Optional[str] = None
    document_id: Optional[str] = None


@router.post("/docmeta")
async def extract_metadata(
    file: Optional[UploadFile] = File(None),
    path: Optional[str] = Form(None),
    saved_name: Optional[str] = Form(None),
    original: Optional[str] = Form(None),
    owner_id: Optional[str] = Form(None),
    document_id: Optional[str] = Form(None)
):
    """
    Extract document metadata.

    Supports two modes:
    1. Binary mode: Upload file directly
    2. Path mode: Provide path to existing file

    - Extracts filename, extension, MIME type, size, etc.
    - For PDFs: extracts page count and text
    - Generates summary using OpenAI (if text available)

    Compatible with n8n DocMeta webhook response format.
    """
    try:
        # Determine input mode
        if file and file.filename:
            # Binary mode
            content = await file.read()
            if len(content) == 0:
                return _error_response(400, "NO_CONTENT", "빈 파일입니다.")

            meta = await MetaService.extract_metadata(
                file_content=content,
                filename=file.filename
            )
        elif path:
            # Path mode
            meta = await MetaService.extract_metadata(file_path=path)
        else:
            return _error_response(400, "NO_INPUT", "파일 또는 경로가 필요합니다.")

        if meta.get("error"):
            return _error_response(
                meta.get("status", 500),
                meta.get("code", "UNKNOWN"),
                meta.get("message", "메타데이터 추출 실패")
            )

        # Generate summary if text was extracted
        summary = None
        tags = []
        length = 0
        truncated = False

        extracted_text = meta.get("extracted_text")
        if extracted_text:
            try:
                summary_result = await OpenAIService.summarize_text(
                    extracted_text,
                    owner_id=owner_id,
                    document_id=document_id
                )
                summary = summary_result.get("summary")
                tags = summary_result.get("tags", [])
                length = len(summary) if summary else 0
                truncated = summary_result.get("truncated", False)
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")

        logger.info(
            f"Metadata extracted: {meta.get('filename')}, "
            f"mime: {meta.get('mime_type')}, "
            f"pages: {meta.get('num_pages')}"
        )

        return {
            "filename": meta.get("filename"),
            "extension": meta.get("extension"),
            "mime": meta.get("mime_type"),
            "size_bytes": meta.get("file_size"),
            "created_at": meta.get("created_at"),
            "status": "OK",
            "exif": meta.get("exif"),
            "pdf_pages": meta.get("num_pages"),
            "extracted_text": extracted_text,
            "pdf_text_ratio": meta.get("pdf_text_ratio"),
            "summary": summary,
            "length": length,
            "truncated": truncated,
            "tags": tags,
            "file_hash": meta.get("file_hash"),
            # Image-specific metadata
            "width": meta.get("width"),
            "height": meta.get("height"),
            "date_taken": meta.get("date_taken"),
            "camera_make": meta.get("camera_make"),
            "camera_model": meta.get("camera_model"),
            "gps_latitude": meta.get("gps_latitude"),
            "gps_longitude": meta.get("gps_longitude"),
            "gps_latitude_ref": meta.get("gps_latitude_ref"),
            "gps_longitude_ref": meta.get("gps_longitude_ref"),
            "orientation": meta.get("orientation"),
            "error": None
        }

    except Exception as e:
        logger.error(f"Metadata extraction failed: {str(e)}")
        return _error_response(500, "EXTRACTION_FAILED", str(e))


@router.post("/docmeta/json")
async def extract_metadata_json(request: MetaPathRequest):
    """
    Extract metadata from file path (JSON request).
    Alternative endpoint for JSON body requests.
    """
    try:
        meta = await MetaService.extract_metadata(file_path=request.path)

        if meta.get("error"):
            return _error_response(
                meta.get("status", 500),
                meta.get("code", "UNKNOWN"),
                meta.get("message", "메타데이터 추출 실패")
            )

        # Generate summary if text was extracted
        summary = None
        tags = []
        length = 0
        truncated = False

        extracted_text = meta.get("extracted_text")
        if extracted_text:
            try:
                summary_result = await OpenAIService.summarize_text(
                    extracted_text,
                    owner_id=request.owner_id,
                    document_id=request.document_id
                )
                summary = summary_result.get("summary")
                tags = summary_result.get("tags", [])
                length = len(summary) if summary else 0
                truncated = summary_result.get("truncated", False)
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")

        return {
            "filename": meta.get("filename"),
            "extension": meta.get("extension"),
            "mime": meta.get("mime_type"),
            "size_bytes": meta.get("file_size"),
            "created_at": meta.get("created_at"),
            "status": "OK",
            "exif": meta.get("exif"),
            "pdf_pages": meta.get("num_pages"),
            "extracted_text": extracted_text,
            "pdf_text_ratio": meta.get("pdf_text_ratio"),
            "summary": summary,
            "length": length,
            "truncated": truncated,
            "tags": tags,
            "file_hash": meta.get("file_hash"),
            # Image-specific metadata
            "width": meta.get("width"),
            "height": meta.get("height"),
            "date_taken": meta.get("date_taken"),
            "camera_make": meta.get("camera_make"),
            "camera_model": meta.get("camera_model"),
            "gps_latitude": meta.get("gps_latitude"),
            "gps_longitude": meta.get("gps_longitude"),
            "gps_latitude_ref": meta.get("gps_latitude_ref"),
            "gps_longitude_ref": meta.get("gps_longitude_ref"),
            "orientation": meta.get("orientation"),
            "error": None
        }

    except Exception as e:
        logger.error(f"Metadata extraction failed: {str(e)}")
        return _error_response(500, "EXTRACTION_FAILED", str(e))


def _error_response(status_code: int, error: str, message: str):
    """Generate error response"""
    return {
        "status": "ERROR",
        "error": error,
        "message": message,
        "filename": None,
        "extension": None,
        "mime": None,
        "size_bytes": None,
        "created_at": None,
        "exif": None,
        "pdf_pages": None,
        "extracted_text": None,
        "pdf_text_ratio": None,
        "summary": None,
        "length": 0,
        "truncated": False,
        "tags": [],
        "file_hash": None,
        # Image-specific metadata
        "width": None,
        "height": None,
        "date_taken": None,
        "camera_make": None,
        "camera_model": None,
        "gps_latitude": None,
        "gps_longitude": None,
        "gps_latitude_ref": None,
        "gps_longitude_ref": None,
        "orientation": None
    }

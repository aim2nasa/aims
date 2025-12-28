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
meta_service = MetaService()
openai_service = OpenAIService()


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

            meta = await meta_service.extract_metadata(
                file_content=content,
                filename=file.filename
            )
        elif path:
            # Path mode
            meta = await meta_service.extract_metadata(file_path=path)
        else:
            return _error_response(400, "NO_INPUT", "파일 또는 경로가 필요합니다.")

        if meta.get("status") == "ERROR":
            return _error_response(
                500,
                meta.get("error", "UNKNOWN"),
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
                summary, tags = await openai_service.summarize_text(extracted_text)
                length = len(summary) if summary else 0
                truncated = len(extracted_text) > 10000
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")

        logger.info(
            f"Metadata extracted: {meta.get('filename')}, "
            f"mime: {meta.get('mime')}, "
            f"pages: {meta.get('pdf_pages')}"
        )

        return {
            "filename": meta.get("filename"),
            "extension": meta.get("extension"),
            "mime": meta.get("mime"),
            "size_bytes": meta.get("size_bytes"),
            "created_at": meta.get("created_at"),
            "status": "OK",
            "exif": meta.get("exif"),
            "pdf_pages": meta.get("pdf_pages"),
            "extracted_text": extracted_text,
            "pdf_text_ratio": meta.get("pdf_text_ratio"),
            "summary": summary,
            "length": length,
            "truncated": truncated,
            "tags": tags,
            "file_hash": meta.get("file_hash"),
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
        meta = await meta_service.extract_metadata(file_path=request.path)

        if meta.get("status") == "ERROR":
            return _error_response(
                500,
                meta.get("error", "UNKNOWN"),
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
                summary, tags = await openai_service.summarize_text(extracted_text)
                length = len(summary) if summary else 0
                truncated = len(extracted_text) > 10000
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")

        return {
            "filename": meta.get("filename"),
            "extension": meta.get("extension"),
            "mime": meta.get("mime"),
            "size_bytes": meta.get("size_bytes"),
            "created_at": meta.get("created_at"),
            "status": "OK",
            "exif": meta.get("exif"),
            "pdf_pages": meta.get("pdf_pages"),
            "extracted_text": extracted_text,
            "pdf_text_ratio": meta.get("pdf_text_ratio"),
            "summary": summary,
            "length": length,
            "truncated": truncated,
            "tags": tags,
            "file_hash": meta.get("file_hash"),
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
        "file_hash": None
    }

"""
DocOCR Router - OCR Processing Handler
Replaces n8n DocOCR workflow
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import logging

from services.upstage_service import UpstageService
from services.openai_service import OpenAIService
from models.document import OCRResponse

router = APIRouter()
logger = logging.getLogger(__name__)
upstage_service = UpstageService()
openai_service = OpenAIService()


@router.post("/dococr")
async def process_ocr(
    file: UploadFile = File(...),
    owner_id: Optional[str] = Form(None),
    document_id: Optional[str] = Form(None)
):
    """
    Process OCR using Upstage API.

    - Extracts text from images/PDFs using Upstage OCR
    - Generates summary using OpenAI (if text extracted)
    - Returns OCR results with summary and tags

    Compatible with n8n DocOCR webhook response format.
    """
    try:
        if not file.filename:
            return {
                "status": 400,
                "error": True,
                "userMessage": "파일이 제공되지 않았습니다.",
                "confidence": None,
                "summary": None,
                "tags": [],
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

        # Read file content
        content = await file.read()

        # 파일 크기 제한은 Nginx 서버 블록(10G)이 담당하며, 여기서는 제한하지 않는다.
        if len(content) == 0:
            return {
                "status": 400,
                "error": True,
                "userMessage": "빈 파일입니다.",
                "confidence": None,
                "summary": None,
                "tags": [],
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

        # Process OCR
        ocr_result = await upstage_service.process_ocr(content, file.filename)

        if ocr_result["error"]:
            return {
                "status": ocr_result["status"],
                "error": True,
                "userMessage": ocr_result["userMessage"],
                "confidence": None,
                "summary": None,
                "tags": [],
                "full_text": None,
                "num_pages": None,
                "pages": []
            }

        # Generate summary if text was extracted
        summary = None
        tags = []

        document_type = "general"
        doc_confidence = 0.0

        ocr_full_text = (ocr_result.get("full_text") or "").strip()
        if len(ocr_full_text) >= 10:
            try:
                result = await openai_service.summarize_text(
                    ocr_result["full_text"],
                    owner_id=owner_id,
                    document_id=document_id
                )
                summary = result.get("summary")
                tags = result.get("tags", [])
                document_type = result.get("document_type", "general")
                doc_confidence = result.get("confidence", 0.0)
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")

        logger.info(
            f"OCR completed: {file.filename}, "
            f"pages: {ocr_result.get('num_pages')}, "
            f"text_length: {len(ocr_result.get('full_text') or '')}"
        )

        return {
            "status": 200,
            "error": False,
            "userMessage": "OCR 성공",
            "confidence": ocr_result.get("confidence"),
            "summary": summary,
            "tags": tags,
            "document_type": document_type,
            "doc_confidence": doc_confidence,
            "full_text": ocr_result.get("full_text"),
            "num_pages": ocr_result.get("num_pages"),
            "pages": ocr_result.get("pages", [])
        }

    except Exception as e:
        logger.error(f"OCR processing failed: {str(e)}")
        return {
            "status": 500,
            "error": True,
            "userMessage": f"OCR 처리 실패: {str(e)}",
            "confidence": None,
            "summary": None,
            "tags": [],
            "full_text": None,
            "num_pages": None,
            "pages": []
        }

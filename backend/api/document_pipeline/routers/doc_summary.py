"""
DocSummary Router - Text Summarization Handler
Replaces n8n DocSummary workflow
"""
from fastapi import APIRouter, HTTPException
import logging
from bson import ObjectId

from services.openai_service import OpenAIService
from services.mongo_service import MongoService
from models.document import SummaryRequest, SummaryResponse

router = APIRouter()
logger = logging.getLogger(__name__)
openai_service = OpenAIService()


async def _get_document_text(doc_id: str) -> str:
    """DB에서 문서 텍스트 조회"""
    try:
        collection = MongoService.get_collection("files")
        doc = await collection.find_one({"_id": ObjectId(doc_id)})
        if doc:
            # full_text 또는 extracted_text 필드 확인
            return doc.get("full_text") or doc.get("extracted_text") or ""
        return ""
    except Exception as e:
        logger.warning(f"Failed to fetch document {doc_id}: {e}")
        return ""


@router.post("/docsummary", response_model=SummaryResponse)
async def summarize_document(request: SummaryRequest):
    """
    Summarize document text using OpenAI.

    - doc_id: DB에서 문서 조회하여 텍스트 추출
    - full_text: 직접 텍스트 전달

    Compatible with n8n DocSummary webhook response format.
    """
    try:
        # 텍스트 결정: doc_id > document_id > full_text
        full_text = request.full_text or ""

        # doc_id로 DB에서 조회
        doc_id = request.doc_id or request.document_id
        if doc_id and not full_text:
            full_text = await _get_document_text(doc_id)
            logger.info(f"Fetched text from doc_id={doc_id}: {len(full_text)} chars")

        if not full_text or len(full_text.strip()) == 0:
            # n8n 호환: 빈 텍스트 시 안내 메시지 반환
            empty_msg = "입력된 텍스트가 없습니다. 요약 및 태그 추출을 위해 원문 내용을 제공해 주세요."
            return SummaryResponse(
                summary=empty_msg,
                length=len(empty_msg),
                truncated=False,
                tags=[]
            )

        # Check if text is too long
        truncated = len(full_text) > 10000

        # Generate summary + classification
        result = await openai_service.summarize_text(
            full_text,
            owner_id=request.user_id,
            document_id=doc_id
        )
        summary = result.get("summary", "")
        tags = result.get("tags", [])
        document_type = result.get("document_type", "general")
        confidence = result.get("confidence", 0.0)

        logger.info(
            f"Summary generated: {len(full_text)} chars -> {len(summary)} chars, "
            f"tags: {tags}, type: {document_type}, confidence: {confidence:.2f}"
        )

        return SummaryResponse(
            summary=summary,
            length=len(summary),
            truncated=truncated,
            tags=tags,
            document_type=document_type,
            confidence=confidence
        )

    except Exception as e:
        logger.error(f"Summary failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

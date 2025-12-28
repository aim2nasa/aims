"""
DocSummary Router - Text Summarization Handler
Replaces n8n DocSummary workflow
"""
from fastapi import APIRouter, HTTPException
import logging

from services.openai_service import OpenAIService
from models.document import SummaryRequest, SummaryResponse

router = APIRouter()
logger = logging.getLogger(__name__)
openai_service = OpenAIService()


@router.post("/docsummary", response_model=SummaryResponse)
async def summarize_document(request: SummaryRequest):
    """
    Summarize document text using OpenAI.

    - Takes full text as input
    - Returns summary and extracted tags

    Compatible with n8n DocSummary webhook response format.
    """
    try:
        if not request.full_text or len(request.full_text.strip()) == 0:
            return SummaryResponse(
                summary="",
                length=0,
                truncated=False,
                tags=[]
            )

        # Check if text is too long
        truncated = len(request.full_text) > 10000

        # Generate summary
        summary, tags = await openai_service.summarize_text(request.full_text)

        logger.info(
            f"Summary generated: {len(request.full_text)} chars -> {len(summary)} chars, "
            f"tags: {tags}"
        )

        return SummaryResponse(
            summary=summary,
            length=len(summary),
            truncated=truncated,
            tags=tags
        )

    except Exception as e:
        logger.error(f"Summary failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

"""
DocDisplayName Router - 문서 표시명(displayName) 배치 생성
AI를 활용하여 문서 내용 기반의 의미 있는 표시명을 생성한다.
"""
import asyncio
import re
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId

from services.openai_service import OpenAIService
from services.mongo_service import MongoService

router = APIRouter()
logger = logging.getLogger(__name__)

# 배치 제한
MAX_BATCH_SIZE = 50
# 문서간 대기 시간 (초) - API 레이트 리밋 방지
INTER_DOCUMENT_DELAY = 0.3


class BatchDisplayNameRequest(BaseModel):
    """배치 displayName 생성 요청"""
    document_ids: List[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)
    user_id: str
    force_regenerate: bool = False


class DocumentResult(BaseModel):
    """개별 문서 처리 결과"""
    document_id: str
    status: str  # "completed" | "skipped" | "failed"
    display_name: Optional[str] = None
    reason: Optional[str] = None


class BatchDisplayNameResponse(BaseModel):
    """배치 displayName 생성 응답"""
    results: List[DocumentResult]
    summary: dict  # { completed, skipped, failed }


def sanitize_display_name(name: str, original_filename: str = "") -> str:
    """
    displayName 정리: 특수문자 제거, 40자 제한, 확장자 보존

    Args:
        name: AI가 생성한 제목
        original_filename: 원본 파일명 (확장자 추출용)

    Returns:
        정리된 displayName
    """
    if not name:
        return ""

    # 확장자 추출 (원본 파일명에서)
    ext = ""
    if original_filename:
        dot_idx = original_filename.rfind(".")
        if dot_idx > 0:
            ext = original_filename[dot_idx:]  # ".pdf", ".jpg" 등

    # 특수문자 제거 (한글, 영문, 숫자, 공백, 하이픈, 언더스코어만 허용)
    cleaned = re.sub(r'[^가-힣a-zA-Z0-9\s\-_]', '', name).strip()

    # 연속 공백 제거
    cleaned = re.sub(r'\s+', ' ', cleaned)

    if not cleaned:
        return ""

    # 40자 제한 (확장자 길이 제외)
    max_name_length = 40 - len(ext)
    if len(cleaned) > max_name_length:
        cleaned = cleaned[:max_name_length].rstrip()

    return cleaned + ext


def _extract_text_from_document(doc: dict) -> str:
    """
    문서에서 텍스트 추출 (우선순위)
    1. ocr.summary
    2. meta.full_text
    3. ocr.full_text
    4. text.full_text
    """
    # 1순위: ocr.summary
    ocr = doc.get("ocr", {})
    if isinstance(ocr, dict) and ocr.get("summary"):
        return ocr["summary"]

    # 2순위: meta.full_text
    meta = doc.get("meta", {})
    if isinstance(meta, dict) and meta.get("full_text"):
        return meta["full_text"]

    # 3순위: ocr.full_text
    if isinstance(ocr, dict) and ocr.get("full_text"):
        return ocr["full_text"]

    # 4순위: text.full_text
    text_obj = doc.get("text", {})
    if isinstance(text_obj, dict) and text_obj.get("full_text"):
        return text_obj["full_text"]

    return ""


def _is_ar_or_crs(doc: dict) -> bool:
    """AR/CRS 문서인지 확인"""
    if doc.get("is_annual_report"):
        return True
    if doc.get("is_customer_review"):
        return True
    tags = doc.get("tags", [])
    if isinstance(tags, list):
        if "AR" in tags or "CRS" in tags:
            return True
    return False


@router.post("/batch-display-names", response_model=BatchDisplayNameResponse)
async def batch_generate_display_names(request: BatchDisplayNameRequest):
    """
    문서 배치 displayName 생성

    - AR/CRS 문서는 스킵 (자체 displayName 생성 규칙 보유)
    - force_regenerate=false 시 이미 displayName이 있는 문서 스킵
    - ownerId 기반 보안 격리
    - 배치 제한: 50건
    - 문서간 0.3초 대기 (API 레이트 리밋 방지)
    - credit_exceeded 시 나머지 문서 중단
    """
    if len(request.document_ids) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"배치 크기 초과: 최대 {MAX_BATCH_SIZE}건"
        )

    if not request.user_id:
        raise HTTPException(status_code=400, detail="user_id는 필수입니다.")

    collection = MongoService.get_collection("files")
    results: List[DocumentResult] = []
    completed = 0
    skipped = 0
    failed = 0
    credit_exceeded = False

    for idx, doc_id in enumerate(request.document_ids):
        # 크레딧 초과 시 나머지 문서 모두 중단
        if credit_exceeded:
            results.append(DocumentResult(
                document_id=doc_id,
                status="failed",
                reason="credit_exceeded"
            ))
            failed += 1
            continue

        try:
            # 1. 문서 조회
            try:
                obj_id = ObjectId(doc_id)
            except Exception:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="invalid_document_id"
                ))
                failed += 1
                continue

            doc = await collection.find_one({"_id": obj_id})
            if not doc:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="document_not_found"
                ))
                failed += 1
                continue

            # 2. 보안 격리: ownerId 확인
            doc_owner = doc.get("ownerId") or doc.get("owner_id") or ""
            if str(doc_owner) != request.user_id:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="unauthorized"
                ))
                failed += 1
                continue

            # 3. AR/CRS 문서 스킵
            if _is_ar_or_crs(doc):
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="skipped",
                    reason="ar_crs_document"
                ))
                skipped += 1
                continue

            # 4. displayName 이미 존재 + force=false 시 스킵
            existing_display_name = doc.get("displayName")
            if existing_display_name and not request.force_regenerate:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="skipped",
                    display_name=existing_display_name,
                    reason="already_exists"
                ))
                skipped += 1
                continue

            # 5. 텍스트 추출
            text = _extract_text_from_document(doc)
            if not text or len(text.strip()) < 10:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="skipped",
                    reason="insufficient_text"
                ))
                skipped += 1
                continue

            # 6. OpenAI로 제목 생성
            title_result = await OpenAIService.generate_title_only(
                text=text,
                owner_id=request.user_id,
                document_id=doc_id
            )

            # 크레딧 초과 체크
            if title_result.get("error") == "credit_exceeded":
                credit_exceeded = True
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="credit_exceeded"
                ))
                failed += 1
                continue

            title = title_result.get("title")
            if not title:
                error_type = title_result.get("error", "title_generation_failed")
                # 민감 정보 노출 방지: 분류된 에러 코드만 반환
                safe_reason = "credit_exceeded" if error_type == "credit_exceeded" else "title_generation_failed"
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason=safe_reason
                ))
                failed += 1
                continue

            # 7. displayName 정리
            upload_obj = doc.get("upload")
            upload_original = upload_obj.get("originalName", "") if isinstance(upload_obj, dict) else ""
            original_name = doc.get("originalName") or doc.get("original_name") or upload_original or ""
            display_name = sanitize_display_name(title, original_name)

            if not display_name:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="sanitize_failed"
                ))
                failed += 1
                continue

            # 8. MongoDB 업데이트
            await collection.update_one(
                {"_id": obj_id},
                {"$set": {"displayName": display_name}}
            )

            results.append(DocumentResult(
                document_id=doc_id,
                status="completed",
                display_name=display_name
            ))
            completed += 1
            logger.info(f"[DisplayName] 생성 완료: doc_id={doc_id}, displayName={display_name}")

        except Exception as e:
            logger.error(f"[DisplayName] 처리 실패: doc_id={doc_id}, error={e}", exc_info=True)
            results.append(DocumentResult(
                document_id=doc_id,
                status="failed",
                reason="internal_error"
            ))
            failed += 1

        # 문서간 대기 (마지막 문서 제외)
        if idx < len(request.document_ids) - 1:
            await asyncio.sleep(INTER_DOCUMENT_DELAY)

    logger.info(
        f"[DisplayName] 배치 완료: completed={completed}, skipped={skipped}, failed={failed}"
    )

    return BatchDisplayNameResponse(
        results=results,
        summary={
            "completed": completed,
            "skipped": skipped,
            "failed": failed
        }
    )

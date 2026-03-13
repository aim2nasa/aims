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


class SingleDisplayNameRequest(BaseModel):
    """단건 displayName 생성 요청"""
    document_id: str
    user_id: str
    force_regenerate: bool = False
    existing_aliases: List[str] = Field(default_factory=list)


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

    # AI가 확장자를 포함했을 수 있으므로 제거
    # 예: "안영미 진료비 2011.09.jpg" → "안영미 진료비 2011.09"
    common_exts = ['.jpg', '.jpeg', '.png', '.pdf', '.tiff', '.tif', '.gif', '.bmp', '.webp', '.heic']
    name_lower = name.lower()
    for c_ext in common_exts:
        if name_lower.endswith(c_ext):
            name = name[:-len(c_ext)]
            break

    # 특수문자 제거 (한글, 영문, 숫자, 공백, 하이픈, 언더스코어, 점만 허용)
    cleaned = re.sub(r'[^가-힣a-zA-Z0-9\s\-_.]', '', name).strip()

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
    문서에서 텍스트 추출 (별칭 생성용 - full_text 우선)

    별칭 생성에는 구체적 정보(이름, 날짜, 금액 등)가 필요하므로
    요약본(summary)보다 원문(full_text)을 우선 사용한다.
    full_text는 500자로 truncate하여 프롬프트 크기를 제한한다.

    우선순위:
    1. meta.full_text (텍스트 기반 추출)
    2. ocr.full_text (OCR 추출)
    3. text.full_text
    4. ocr.summary (full_text 없을 때 폴백)
    """
    MAX_TEXT_LENGTH = 500

    # 1순위: meta.full_text
    meta = doc.get("meta", {})
    if isinstance(meta, dict) and meta.get("full_text", "").strip():
        return meta["full_text"][:MAX_TEXT_LENGTH]

    # 2순위: ocr.full_text
    ocr = doc.get("ocr", {})
    if isinstance(ocr, dict) and ocr.get("full_text", "").strip():
        return ocr["full_text"][:MAX_TEXT_LENGTH]

    # 3순위: text.full_text
    text_obj = doc.get("text", {})
    if isinstance(text_obj, dict) and text_obj.get("full_text", "").strip():
        return text_obj["full_text"][:MAX_TEXT_LENGTH]

    # 4순위: ocr.summary (폴백)
    if isinstance(ocr, dict) and ocr.get("summary", "").strip():
        return ocr["summary"]

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


@router.post("/generate-display-name", response_model=DocumentResult)
async def generate_single_display_name(request: SingleDisplayNameRequest):
    """
    단건 displayName 생성 — 프론트엔드에서 건별 호출하여 실시간 진행률 표시용

    - AR/CRS 문서는 스킵
    - force_regenerate=false 시 이미 displayName이 있는 문서 스킵
    - ownerId 기반 보안 격리
    - existing_aliases: 프론트에서 누적 전달 (중복 방지)
    """
    doc_id = request.document_id
    if not request.user_id:
        raise HTTPException(status_code=400, detail="user_id는 필수입니다.")

    collection = MongoService.get_collection("files")

    try:
        obj_id = ObjectId(doc_id)
    except Exception:
        return DocumentResult(document_id=doc_id, status="failed", reason="invalid_document_id")

    doc = await collection.find_one({"_id": obj_id})
    if not doc:
        return DocumentResult(document_id=doc_id, status="failed", reason="document_not_found")

    # 보안 격리: ownerId 확인
    doc_owner = doc.get("ownerId") or doc.get("owner_id") or ""
    if str(doc_owner) != request.user_id:
        return DocumentResult(document_id=doc_id, status="failed", reason="unauthorized")

    # AR/CRS 문서 스킵
    if _is_ar_or_crs(doc):
        return DocumentResult(document_id=doc_id, status="skipped", reason="ar_crs_document")

    # displayName 이미 존재 + force=false 시 스킵
    existing_display_name = doc.get("displayName")
    if existing_display_name and not request.force_regenerate:
        return DocumentResult(
            document_id=doc_id, status="skipped",
            display_name=existing_display_name, reason="already_exists"
        )

    # 텍스트 추출
    text = _extract_text_from_document(doc)
    if not text or len(text.strip()) < 10:
        return DocumentResult(document_id=doc_id, status="skipped", reason="insufficient_text")

    # 원본 파일명 및 문서 유형 추출
    upload_obj = doc.get("upload")
    upload_original = upload_obj.get("originalName", "") if isinstance(upload_obj, dict) else ""
    original_name = doc.get("originalName") or doc.get("original_name") or upload_original or ""
    doc_type = doc.get("document_type") or ""

    try:
        # OpenAI로 제목 생성
        title_result = await OpenAIService.generate_title_only(
            text=text,
            owner_id=request.user_id,
            document_id=doc_id,
            original_filename=original_name,
            document_type=doc_type,
            existing_aliases=request.existing_aliases
        )

        # 크레딧 초과 체크
        if title_result.get("error") == "credit_exceeded":
            return DocumentResult(document_id=doc_id, status="failed", reason="credit_exceeded")

        title = title_result.get("title")
        if not title:
            return DocumentResult(document_id=doc_id, status="failed", reason="title_generation_failed")

        # displayName 정리
        display_name = sanitize_display_name(title, original_name)
        if not display_name:
            return DocumentResult(document_id=doc_id, status="failed", reason="sanitize_failed")

        # MongoDB 업데이트
        await collection.update_one(
            {"_id": obj_id},
            {
                "$set": {"displayName": display_name},
                "$unset": {"displayNameStatus": ""}
            }
        )

        logger.info(f"[DisplayName] 단건 생성 완료: doc_id={doc_id}, displayName={display_name}")
        return DocumentResult(document_id=doc_id, status="completed", display_name=display_name)

    except Exception as e:
        logger.error(f"[DisplayName] 단건 처리 실패: doc_id={doc_id}, error={e}", exc_info=True)
        return DocumentResult(document_id=doc_id, status="failed", reason="internal_error")


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

    # 동일 고객의 기존 별칭 목록 조회 (중복 방지용)
    # 첫 문서의 customerId로 조회 (배치 내 문서는 동일 고객)
    existing_aliases: List[str] = []
    try:
        first_doc = await collection.find_one(
            {"_id": ObjectId(request.document_ids[0])},
            {"customerId": 1}
        )
        if first_doc and first_doc.get("customerId"):
            cursor = collection.find(
                {
                    "customerId": first_doc["customerId"],
                    "displayName": {"$exists": True, "$ne": None}
                },
                {"displayName": 1}
            )
            async for d in cursor:
                dn = d.get("displayName")
                if dn:
                    existing_aliases.append(dn)
            logger.info(f"[DisplayName] 기존 별칭 {len(existing_aliases)}건 조회 완료")
    except Exception as e:
        logger.warning(f"[DisplayName] 기존 별칭 조회 실패 (계속 진행): {e}")

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

            # 6. 원본 파일명 및 문서 유형 추출
            upload_obj = doc.get("upload")
            upload_original = upload_obj.get("originalName", "") if isinstance(upload_obj, dict) else ""
            original_name = doc.get("originalName") or doc.get("original_name") or upload_original or ""
            doc_type = doc.get("document_type") or ""

            # 7. OpenAI로 제목 생성 (개선: 파일명 + 유형 + 기존 별칭 전달)
            title_result = await OpenAIService.generate_title_only(
                text=text,
                owner_id=request.user_id,
                document_id=doc_id,
                original_filename=original_name,
                document_type=doc_type,
                existing_aliases=existing_aliases
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

            # 8. displayName 정리
            display_name = sanitize_display_name(title, original_name)

            if not display_name:
                results.append(DocumentResult(
                    document_id=doc_id,
                    status="failed",
                    reason="sanitize_failed"
                ))
                failed += 1
                continue

            # 9. MongoDB 업데이트 (성공 시 displayNameStatus 제거)
            await collection.update_one(
                {"_id": obj_id},
                {
                    "$set": {"displayName": display_name},
                    "$unset": {"displayNameStatus": ""}
                }
            )

            results.append(DocumentResult(
                document_id=doc_id,
                status="completed",
                display_name=display_name
            ))
            completed += 1
            # 배치 내 중복 방지: 생성된 별칭을 누적
            existing_aliases.append(display_name)
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

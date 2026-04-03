"""
DocPrepMain Router
Main orchestrator for document processing pipeline

큐잉 모드 지원:
- UPLOAD_QUEUE_ENABLED=True: 요청을 MongoDB 큐에 저장 후 즉시 응답
- UPLOAD_QUEUE_ENABLED=False: 기존 동기 처리 (롤백용)

컬렉션 스키마 계약: @aims/shared-schema (backend/shared/schema/)
- files → COLLECTIONS.FILES
"""
import json
import logging
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Tuple, Union
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

import httpx

from config import get_settings
from services.mongo_service import MongoService
from services.file_service import FileService
from services.meta_service import MetaService
from services.openai_service import OpenAIService
from services.redis_service import RedisService
from services.temp_file_service import TempFileService
from services.upload_queue_service import UploadQueueService
from routers.doc_display_name import sanitize_display_name
from services.pdf_conversion_text_service import (
    is_convertible_mime,
    convert_and_extract_text,
)
from services.internal_api import (
    create_file, update_file, delete_file, delete_file_by_filter,
    pull_customer_document, _serialize_for_api,
    query_file_one,
)

logger = logging.getLogger(__name__)

# 크레딧 체크 API 설정
CREDIT_CHECK_URL = None  # 런타임에 설정


def _extract_page_count(file_content: bytes, content_type: Optional[str]) -> int:
    """
    파일 바이트에서 페이지 수 추출 (크레딧 체크용)

    PDF → fitz(PyMuPDF)로 실제 페이지 수 추출
    비PDF / 파싱 실패 → 1 (안전한 기본값)
    """
    if not content_type or content_type != "application/pdf" or not file_content:
        return 1
    try:
        import fitz
        pdf_doc = fitz.open(stream=file_content, filetype="pdf")
        try:
            page_count = len(pdf_doc)
            return max(page_count, 1)
        finally:
            pdf_doc.close()
    except Exception as e:
        logger.warning(f"[PageCount] PDF 페이지 수 추출 실패 (기본값 1 사용): {e}")
        return 1


def _extract_page_count_from_path(file_path: str, content_type: Optional[str]) -> int:
    """
    디스크 파일 경로에서 PDF 페이지 수 추출 (스트리밍 모드용)

    PDF → fitz(PyMuPDF)로 파일 경로에서 직접 열어 페이지 수 추출
    비PDF / 파싱 실패 / 파일 없음 → 1 (안전한 기본값)
    """
    if not content_type or content_type != "application/pdf":
        return 1
    if not file_path or not os.path.exists(file_path):
        return 1
    try:
        import fitz
        pdf_doc = fitz.open(file_path)
        try:
            page_count = len(pdf_doc)
            return max(page_count, 1)
        finally:
            pdf_doc.close()
    except Exception as e:
        logger.warning(f"[PageCount] PDF 페이지 수 추출 실패 (기본값 1 사용): {e}")
        return 1


STREAMING_CHUNK_SIZE = 1024 * 1024  # 1MB


async def _stream_upload_to_disk(
    upload_file: UploadFile,
) -> Tuple[str, int]:
    """
    UploadFile을 청크 단위로 디스크에 스트리밍 저장.

    메모리에 전체 파일을 적재하지 않고 디스크에 직접 쓴다 (OOM 방지).
    파일 크기 제한은 Nginx 서버 블록(10G)이 담당하며, 여기서는 제한하지 않는다.
    사용자별 용량 쿼터 체크는 저장 완료 후 별도로 수행한다.

    Returns:
        (temp_path, file_size) 튜플
    """
    fd, temp_path = tempfile.mkstemp(prefix="upload_")
    os.close(fd)
    file_size = 0

    try:
        with open(temp_path, 'wb') as f:
            while True:
                chunk = await upload_file.read(STREAMING_CHUNK_SIZE)
                if not chunk:
                    break
                file_size += len(chunk)
                f.write(chunk)
        return (temp_path, file_size)
    except Exception as e:
        # 스트리밍 실패 시 임시 파일 정리
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


async def check_credit_for_upload(user_id: str, estimated_pages: int = 1) -> Dict[str, Any]:
    """
    문서 업로드 전 크레딧 체크 (aims_api 내부 API 호출)

    Args:
        user_id: 사용자 ID
        estimated_pages: 예상 페이지 수

    Returns:
        dict: {
            allowed: bool,
            reason: str,
            credits_remaining: int,
            days_until_reset: int,
            ...
        }

    @see docs/EMBEDDING_CREDIT_POLICY.md
    """
    global CREDIT_CHECK_URL
    settings = get_settings()

    if CREDIT_CHECK_URL is None:
        CREDIT_CHECK_URL = f"{settings.AIMS_API_URL}/api/internal/check-credit"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CREDIT_CHECK_URL,
                json={
                    "user_id": user_id,
                    "estimated_pages": estimated_pages
                },
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": settings.INTERNAL_API_KEY
                },
                timeout=10.0
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"[CreditCheck] API 호출 실패 (fail-closed): {response.status_code}")
                # fail-closed: API 실패 시 처리 보류 (credit_pending 경로로 진입)
                return {"allowed": False, "reason": "api_error_fallback"}

    except Exception as e:
        logger.warning(f"[CreditCheck] 오류 (fail-closed): {e}")
        # fail-closed: 오류 시 처리 보류 (안전 우선 — aims_api 복구 후 자동 재처리)
        return {"allowed": False, "reason": "error_fallback", "error": str(e)}
router = APIRouter()
settings = get_settings()

# Unsupported MIME types — extract.py의 UNSUPPORTED_MIME_TYPES와 동일 범위를 유지할 것
# application/postscript: .ai (Adobe Illustrator) 파일 — PostScript 기반이므로 이 MIME으로 감지됨
# application/x-zip-compressed: Windows 환경에서 ZIP 파일의 대체 MIME 타입
# application/x-rar-compressed, x-7z-compressed, gzip, x-tar: 아카이브 파일
UNSUPPORTED_MIME_TYPES = [
    "application/postscript",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
    "application/octet-stream",
]

# 시스템 파일명 목록 — Single Source of Truth: shared/file-validation-constants.json
def _load_system_file_names() -> set:
    json_path = os.path.join(os.path.dirname(__file__), "../../aims_api/file-validation-constants.json")
    try:
        with open(json_path, encoding="utf-8") as f:
            return set(json.load(f).get("systemFileNames", []))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"Thumbs.db", "thumbs.db", ".DS_Store", "desktop.ini", "Desktop.ini", "ehthumbs.db", "ehthumbs_vista.db"}

SYSTEM_FILE_NAMES = _load_system_file_names()


def _is_system_file(filename: str) -> bool:
    """시스템 파일명인지 확인 (경로 포함 시 basename 추출)"""
    basename = os.path.basename(filename)
    return basename in SYSTEM_FILE_NAMES


@router.post("/docprep-main")
async def doc_prep_main(
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    source_path: Optional[str] = Form(None),
    batchId: Optional[str] = Form(None),  # 🔴 업로드 묶음 ID (현재 세션 진행률 추적용)
    shadow: bool = False,  # Shadow mode: 문서 생성 없이 응답만 시뮬레이션
    shadow_saved_name: Optional[str] = Form(None),  # n8n이 생성한 파일명 (shadow mode용)
    shadow_created_at: Optional[str] = Form(None),  # n8n이 생성한 created_at (shadow mode용)
):
    """
    Main document processing orchestrator.

    Flow:
    1. Create document in MongoDB
    2. Save file to disk
    3. Extract metadata
    4. Route based on MIME type:
       - text/plain: Extract and save text
       - unsupported: Return 415
       - OCR needed: Queue to Redis
       - Has text: Notify complete
    """
    settings = get_settings()
    doc_id = None

    # 시스템 파일 차단 (Thumbs.db, .DS_Store 등 — 폴더 드래그앤드롭 시 혼입 방지)
    original_filename = file.filename or "unknown"
    if _is_system_file(original_filename):
        raise HTTPException(
            status_code=400,
            detail=f"시스템 파일은 업로드할 수 없습니다: {original_filename}"
        )

    # Shadow mode: 문서 생성 없이 메타데이터 추출 및 응답 시뮬레이션만 수행
    if shadow:
        logger.info(f"[SHADOW] Processing file for comparison (no DB write)")
        logger.info(f"[SHADOW] Using n8n values - saved_name: {shadow_saved_name}, created_at: {shadow_created_at}")
        try:
            file_content = await file.read()
            original_name = file.filename or "unknown"

            # n8n이 전달한 파일명 사용 (없으면 자체 생성 - 비교용)
            if shadow_saved_name:
                simulated_filename = shadow_saved_name
            else:
                # Fallback: n8n 파일명이 없으면 자체 생성 (비교 불일치 예상)
                simulated_filename = FileService._generate_filename(original_name)
                logger.warning(f"[SHADOW] No shadow_saved_name provided, generated: {simulated_filename}")

            # 임시 파일로 메타데이터 추출
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(original_name)[1]) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                meta_result = await MetaService.extract_metadata(tmp_path)
                # n8n이 생성한 파일명으로 교체
                meta_result["filename"] = simulated_filename

                if meta_result.get("error"):
                    return JSONResponse(
                        status_code=meta_result.get("status", 500),
                        content=meta_result
                    )

                mime_type = meta_result.get("mime_type", "")
                full_text = meta_result.get("extracted_text", "")

                # MIME 타입별 응답 시뮬레이션
                if mime_type == "text/plain":
                    return {"exitCode": 0, "stderr": ""}

                if mime_type in UNSUPPORTED_MIME_TYPES:
                    return {
                        "result": "success",
                        "document_id": "shadow_simulated",
                        "status": "completed",
                        "processingSkipReason": "unsupported_format",
                        "mime": mime_type,
                        "filename": original_name
                    }

                # PDF 변환 텍스트 추출 (HWP, DOC 등 - 임시 파일 삭제 전에 수행)
                if (not full_text or len(full_text.strip()) == 0) and is_convertible_mime(mime_type):
                    converted_text = await convert_and_extract_text(tmp_path)
                    if converted_text and converted_text.strip():
                        full_text = converted_text

                if not full_text or len(full_text.strip()) == 0:
                    return {
                        "result": "success",
                        "document_id": "shadow_simulated",
                        "ocr": {
                            "status": "queued",
                            "queued_at": datetime.utcnow().isoformat()
                        }
                    }
            finally:
                os.unlink(tmp_path)  # 임시 파일 삭제

            # 텍스트 추출 성공 - 요약 생성
            summary_result = await OpenAIService.summarize_text(
                full_text,
                owner_id=userId,
                document_id="shadow_simulated",
                filename=original_name
            )

            # n8n이 전달한 created_at 사용 (없으면 현재 시간)
            if shadow_created_at:
                created_at_value = shadow_created_at
            else:
                created_at_value = datetime.utcnow().isoformat() + "Z"

            return {
                "result": "success",
                "document_id": "shadow_simulated",
                "status": "completed",
                "meta": {
                    "filename": meta_result.get("filename"),
                    "extension": meta_result.get("extension"),
                    "mime": meta_result.get("mime_type"),
                    "size_bytes": str(meta_result.get("file_size", "")),
                    "created_at": created_at_value,
                    "meta_status": "ok",
                    "exif": "{}",
                    "pdf_pages": str(meta_result.get("num_pages", "")),
                    "full_text": (full_text[:10000] + "...") if len(full_text) > 10000 else full_text
                }
            }
        except Exception as e:
            logger.error(f"[SHADOW] Error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    try:
        # 🔴 스트리밍 업로드: 메모리에 전체 적재하지 않고 디스크에 직접 저장 (OOM 방지)
        # 파일 크기 제한 없음 — 사용자별 저장 용량 쿼터로 관리 (Nginx 10G가 인프라 보호)
        original_name = file.filename or "unknown"
        stream_temp_path, file_size = await _stream_upload_to_disk(file)

        # 큐잉 모드 확인
        if settings.UPLOAD_QUEUE_ENABLED:
            # 큐잉 모드: 문서를 먼저 생성 후 파일 처리를 큐에 등록
            logger.info(f"Queueing upload for userId: {userId}, file: {original_name}")

            # 🔴 0. 텍스트 추출을 먼저 시도하여 OCR 필요 여부 판단
            # 텍스트가 이미 있는 PDF는 OCR이 불필요 → 크레딧 소모 없이 정상 처리
            estimated_pages = _extract_page_count_from_path(stream_temp_path, file.content_type)

            # 🍎 사전 텍스트 추출 (pdfplumber - 크레딧 소모 없음)
            pre_extracted_text = ""
            pre_detected_mime = ""
            pre_num_pages = 0
            try:
                pre_meta = await MetaService.extract_metadata(stream_temp_path)
                pre_extracted_text = pre_meta.get("extracted_text", "")
                pre_detected_mime = pre_meta.get("mime_type", "")
                pre_num_pages = pre_meta.get("num_pages", 0)

                # PDF 변환 텍스트 추출 (HWP, DOC 등 - 크레딧 소모 없음)
                if (not pre_extracted_text or len(pre_extracted_text.strip()) == 0) and is_convertible_mime(pre_detected_mime):
                    converted_text = await convert_and_extract_text(stream_temp_path)
                    if converted_text and converted_text.strip():
                        pre_extracted_text = converted_text
            except Exception as pre_meta_err:
                logger.warning(f"[PreTextExtract] 사전 텍스트 추출 실패 (크레딧 체크로 진행): {pre_meta_err}")

            # 텍스트가 있으면 OCR 불필요 → 크레딧 체크 스킵
            has_text = bool(pre_extracted_text and len(pre_extracted_text.strip()) > 0)
            if has_text:
                logger.info(f"[TextFound] 텍스트 추출 성공 ({len(pre_extracted_text)} chars), OCR 불필요 → 크레딧 체크 스킵: {original_name}")
                is_credit_pending = False
                credit_check = {"allowed": True, "reason": "text_already_extracted"}
            else:
                # 텍스트 없음 → OCR 필요 → 크레딧 체크
                credit_check = await check_credit_for_upload(userId, estimated_pages)
                is_credit_pending = not credit_check.get("allowed", False)
                if is_credit_pending:
                    logger.info(f"[CreditPending] 텍스트 없음 + 크레딧 부족 → 처리 보류: userId={userId}, reason={credit_check.get('reason')}")

            # 1. MongoDB 문서 생성 (크레딧 상태에 따라 다르게)
            files_collection = MongoService.get_collection("files")

            if is_credit_pending:
                # 🔴 크레딧 부족 + OCR 필요: credit_pending 상태로 문서 생성
                # ⚠️ 파일명 기반 AR/CRS 판단 절대 금지!
                doc_data = {
                    "ownerId": userId,
                    "createdAt": datetime.utcnow(),
                    "batchId": batchId,
                    "upload": {
                        "originalName": original_name,
                        "uploaded_at": datetime.utcnow().isoformat(),
                        "fileSize": file_size,
                        "mimeType": file.content_type
                    },
                    "meta": {
                        "size_bytes": file_size,
                        "mime": file.content_type,
                        "filename": original_name
                    },
                    # credit_pending 상태 (OCR이 실제로 필요한 문서만 여기 도달)
                    "overallStatus": "credit_pending",
                    "ocrStatus": "credit_pending",
                    "progress": 0,
                    "progressStage": "credit_pending",
                    "progressMessage": "OCR 처리를 위한 크레딧 대기 중",
                    "status": "credit_pending",
                    "credit_pending_since": datetime.utcnow(),
                    "credit_pending_info": {
                        "credits_remaining": credit_check.get("credits_remaining", 0),
                        "credit_quota": credit_check.get("credit_quota", 0),
                        "days_until_reset": credit_check.get("days_until_reset", 0),
                        "estimated_credits": credit_check.get("estimated_credits", 0)
                    },
                    "docembed": {
                        "status": "credit_pending",
                        "credit_pending_since": datetime.utcnow().isoformat()
                    }
                }
                logger.info(f"[CreditPending] OCR 필요 + 크레딧 부족 → 보류: {original_name}")
            else:
                # 크레딧 충분 또는 텍스트 있어서 OCR 불필요: 정상 처리
                doc_data = {
                    "ownerId": userId,
                    "createdAt": datetime.utcnow(),
                    "batchId": batchId,
                    "upload": {
                        "originalName": original_name,
                        "uploaded_at": datetime.utcnow().isoformat()
                    },
                    "progress": 10,
                    "progressStage": "queued",
                    "progressMessage": "대기열에 추가됨",
                    "status": "processing",
                    "overallStatus": "pending",
                }

            if customerId:
                # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
                doc_data["customerId"] = ObjectId(customerId) if ObjectId.is_valid(customerId) else customerId

            api_result = await create_file(_serialize_for_api(doc_data))
            doc_id = api_result.get("data", {}).get("insertedId", "")
            if not doc_id:
                raise HTTPException(status_code=500, detail="파일 생성 실패")
            logger.info(f"Created document: {doc_id} (credit_pending={is_credit_pending})")

            # 2. 파일 저장 (스트리밍 temp 파일을 최종 경로로 이동 — 메모리 적재 없음)
            saved_name, dest_path = await FileService.save_from_path(
                source_path=stream_temp_path,
                original_name=original_name,
                user_id=userId
            )
            logger.info(f"Saved file: {saved_name} to {dest_path}")

            # 파일 저장 정보 업데이트
            await update_file(doc_id, set_fields={
                "upload.saveName": saved_name,
                "upload.destPath": dest_path
            })


            # 🍎 사전 추출 텍스트가 있으면 meta에 저장 (정상 경로에서도 큐 워커가 활용)
            if has_text and not is_credit_pending:
                try:
                    pre_meta_update = {
                        "meta.mime": pre_detected_mime,
                        "meta.pdf_pages": pre_num_pages,
                        "meta.length": len(pre_extracted_text),
                        "meta.full_text": pre_extracted_text,
                        "meta.filename": original_name,
                        "meta.size_bytes": file_size,
                    }
                    await update_file(doc_id, set_fields=pre_meta_update)
                    logger.info(f"[TextFound] 사전 추출 메타 저장 완료: {doc_id} ({len(pre_extracted_text)} chars)")
                except Exception as pre_store_err:
                    logger.warning(f"[TextFound] 사전 추출 메타 저장 실패 (큐 워커에서 재추출): {pre_store_err}")

            # 🔴 크레딧 부족 시: 텍스트 추출 + AR/CRS 파싱 판단 (임베딩만 안함)
            if is_credit_pending:
                # 🍎 PDF 텍스트 추출 (pdfplumber - 크레딧 소모 없음)
                try:
                    meta_result = await MetaService.extract_metadata(dest_path)
                    full_text = meta_result.get("extracted_text", "")
                    detected_mime = meta_result.get("mime_type", "")

                    # PDF 변환 텍스트 추출 (HWP, DOC 등 - 크레딧 소모 없음)
                    if (not full_text or len(full_text.strip()) == 0) and is_convertible_mime(detected_mime):
                        logger.info(f"[CreditPending] PDF 변환 텍스트 추출 시도: {original_name} (MIME: {detected_mime})")
                        converted_text = await convert_and_extract_text(dest_path)
                        if converted_text and converted_text.strip():
                            full_text = converted_text
                            logger.info(f"[CreditPending] PDF 변환 텍스트 추출 성공: {len(full_text)} chars")

                    # 메타 정보 업데이트 (🔴 full_text 포함 - 크레딧 충전 후 임베딩 처리용)
                    meta_update = {
                        "meta.mime": detected_mime,
                        "meta.pdf_pages": meta_result.get("num_pages", 0),
                        "meta.length": len(full_text) if full_text else 0,
                        "meta.full_text": full_text or "",  # 🔴 임베딩 처리를 위해 full_text 저장
                    }

                    # 🍎 AR/CRS 파싱 판단 (텍스트 기반 - CLAUDE.md 0-2 규칙!)
                    # 🔴 AR/CRS 감지를 개별 try/except로 격리하여 한쪽 실패가 다른 쪽에 영향 안 주도록
                    if detected_mime == "application/pdf" and full_text and len(full_text.strip()) > 0:
                        # AR 감지
                        try:
                            ar_result = await _detect_and_process_annual_report(
                                doc_id=doc_id,
                                full_text=full_text,
                                original_name=original_name,
                                user_id=userId,
                                files_collection=files_collection
                            )
                            if ar_result.get("is_annual_report"):
                                meta_update["is_annual_report"] = True
                                meta_update["document_type"] = "annual_report"
                                meta_update["badgeType"] = "TXT"
                                logger.info(f"[CreditPending] AR 문서 감지 (텍스트 파싱): {original_name}")
                        except Exception as ar_error:
                            logger.error(f"[CreditPending] AR 감지 실패: {ar_error}", exc_info=True)

                        # CRS 감지 (AR이 아닌 경우에만)
                        if not meta_update.get("is_annual_report"):
                            try:
                                crs_result = await _detect_and_process_customer_review(
                                    doc_id=doc_id,
                                    full_text=full_text,
                                    original_name=original_name,
                                    user_id=userId,
                                    files_collection=files_collection
                                )
                                if crs_result.get("is_customer_review"):
                                    meta_update["is_customer_review"] = True
                                    meta_update["document_type"] = "customer_review"
                                    meta_update["badgeType"] = "TXT"
                                    logger.info(f"[CreditPending] CRS 문서 감지 (텍스트 파싱): {original_name}")
                            except Exception as crs_error:
                                logger.error(f"[CreditPending] CRS 감지 실패: {crs_error}", exc_info=True)

                    # 문서 업데이트 (AR/CRS 감지 실패해도 메타 정보는 반드시 저장)
                    await update_file(doc_id, set_fields=_serialize_for_api(meta_update))
                    logger.info(f"[CreditPending] 메타 정보 및 AR/CRS 판단 완료: {doc_id}")

                except Exception as meta_error:
                    logger.error(f"[CreditPending] 메타 추출 실패: {meta_error}", exc_info=True)

                # 스트리밍 temp 파일 정리 (파일은 이미 dest_path에 복사됨)
                if os.path.exists(stream_temp_path):
                    os.unlink(stream_temp_path)

                return {
                    "result": "success",
                    "status": "credit_pending",
                    "document_id": doc_id,
                    "message": "크레딧이 부족하여 문서 처리가 보류되었습니다. 크레딧 리셋 시 자동 처리됩니다.",
                    "credit_info": {
                        "credits_remaining": credit_check.get("credits_remaining", 0),
                        "credit_quota": credit_check.get("credit_quota", 0),
                        "days_until_reset": credit_check.get("days_until_reset", 0)
                    }
                }

            # 3. 큐용 임시 파일 저장 (스트리밍 temp → 큐 temp 복사, 워커가 처리 후 삭제)
            temp_path = await TempFileService.save_from_path(stream_temp_path, original_name)
            # 스트리밍 temp 파일 정리 (파일은 dest_path + temp_path에 복사됨)
            if os.path.exists(stream_temp_path):
                os.unlink(stream_temp_path)

            # 4. 큐에 작업 등록 (document_id 포함)
            queue_id = await UploadQueueService.enqueue(
                file_data={
                    "temp_path": temp_path,
                    "original_filename": original_name,
                    "file_size": file_size,
                    "mime_type": file.content_type
                },
                request_data={
                    "userId": userId,
                    "customerId": customerId,
                    "source_path": source_path,
                    "document_id": doc_id  # 기존 문서 ID 전달
                },
                owner_id=userId,
                customer_id=customerId
            )

            logger.info(f"Upload queued: {queue_id} for document: {doc_id}")

            # 5. 즉시 응답 반환 (document_id 포함)
            return {
                "result": "success",
                "status": "queued",
                "queue_id": queue_id,
                "document_id": doc_id,  # 프론트엔드가 사용할 document_id
                "message": "문서가 처리 대기열에 추가되었습니다."
            }

        # 동기 처리 모드 (UPLOAD_QUEUE_ENABLED=False 또는 롤백용)
        logger.info(f"Processing document synchronously for userId: {userId}, customerId: {customerId}")

        # 동기 모드에서는 디스크에서 파일을 읽어 기존 함수에 전달
        with open(stream_temp_path, 'rb') as f:
            file_content = f.read()
        # 스트리밍 temp 파일 정리
        if os.path.exists(stream_temp_path):
            os.unlink(stream_temp_path)

        return await process_document_pipeline(
            file_content=file_content,
            original_name=original_name,
            user_id=userId,
            customer_id=customerId,
            source_path=source_path,
            mime_type=file.content_type
        )

    except Exception as e:
        logger.error(f"Error in doc_prep_main: {e}", exc_info=True)
        # 예외 시 스트리밍 temp 파일 정리
        if 'stream_temp_path' in locals() and os.path.exists(stream_temp_path):
            os.unlink(stream_temp_path)
        raise HTTPException(status_code=500, detail=str(e))


async def _detect_and_process_annual_report(
    doc_id: str,
    full_text: str,
    original_name: str,
    user_id: str,
    files_collection
) -> Dict[str, Any]:
    """
    🔴 AR 자동 감지 및 고객 연결

    텍스트에서 AR 패턴을 감지하고, AR이면:
    1. is_annual_report=True 설정
    2. 고객명 추출 → 고객 생성/검색
    3. customerId 설정
    4. ar_parsing_status='pending' 설정 (백그라운드 파싱 대기)

    Args:
        doc_id: 문서 ID
        full_text: 추출된 텍스트
        original_name: 원본 파일명
        user_id: 설계사 ID
        files_collection: MongoDB files 컬렉션

    Returns:
        dict: {
            "is_annual_report": bool,
            "customer_id": str or None,
            "customer_name": str or None
        }
    """
    import re
    import httpx

    settings = get_settings()

    try:
        # 1. AR 패턴 매칭 (공백 정규화)
        normalized_text = re.sub(r'\s+', ' ', full_text)

        # 필수 키워드: "Annual Review Report"
        required_keywords = ['Annual Review Report']
        # 선택 키워드: MetLife 관련
        optional_keywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명', '메트라이프']

        matched_required = [kw for kw in required_keywords if kw in normalized_text]
        matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

        # AR 판단: 필수 키워드 1개 이상 + 선택 키워드 1개 이상
        is_annual_report = len(matched_required) > 0 and len(matched_optional) > 0

        if not is_annual_report:
            logger.debug(f"AR 패턴 불일치: doc_id={doc_id}, required={matched_required}, optional={matched_optional}")
            return {"is_annual_report": False, "related_customer_id": None, "customer_name": None}

        logger.info(f"🔍 AR 감지: doc_id={doc_id}, 매칭={matched_required + matched_optional}")

        # 2. 고객명 추출: "Annual" 키워드가 포함된 줄의 바로 위 줄에서 추출 (🔴 파일명 사용 절대 금지!)
        # PDF 포맷: "{NAME} 고객님을 위한\nAnnual Review Report"
        # 에뮬레이션 파일: "MetLife\n{NAME} 고객님을 위한\nAnnual Review Report"
        # → "Annual" 위 줄 = "{NAME} 고객님을 위한" → 고객명 추출
        customer_name = None
        lines = full_text.split('\n')
        for i, line in enumerate(lines):
            if 'Annual' in line:
                if i > 0:
                    name_line = lines[i - 1].strip()
                    go_idx = name_line.find(' 고')
                    if go_idx > 0:
                        name = name_line[:go_idx]
                    else:
                        space_idx = name_line.find(' ')
                        name = name_line[:space_idx] if space_idx > 0 else name_line
                    if len(name) >= 2:
                        customer_name = name
                        logger.info(f"📄 고객명 추출 (Annual 위 줄): {customer_name}")
                break

        # 3. 발행기준일 추출: PDF 텍스트에서 추출
        issue_date = None
        date_pattern1 = r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년?\s*[\-.]?\s*(\d{1,2})월?\s*[\-.]?\s*(\d{1,2})일?'
        date_match1 = re.search(date_pattern1, normalized_text)
        if date_match1:
            year, month, day = date_match1.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        else:
            date_pattern2 = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
            date_match2 = re.search(date_pattern2, normalized_text)
            if date_match2:
                year, month, day = date_match2.groups()
                issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        if issue_date:
            logger.info(f"📅 발행기준일: {issue_date}")

        # 4. 관련 고객 검색 (relatedCustomerId 설정용 — customerId는 변경하지 않음)
        # AR은 개인의 보유계약현황이므로, 법인에 업로드해도 개인 고객을 연결한다.
        # 단, customerId(소유권)는 업로드한 고객에 그대로 유지하고 relatedCustomerId로만 연결.
        related_customer_id = None
        if customer_name and user_id:
            from services.internal_api import resolve_customer_by_name
            related_customer_id = await resolve_customer_by_name(customer_name, user_id)
            if related_customer_id:
                logger.info(f"✅ AR 관련 고객 발견: {customer_name} (ID: {related_customer_id})")

        # 5. displayName 생성 (AR)
        # 형식: {고객명}_AR_{YYYY-MM-DD}.pdf
        display_name = None
        if customer_name and issue_date:
            display_name = f"{customer_name}_AR_{issue_date}.pdf"
            logger.info(f"📄 AR displayName 생성: {display_name}")

        # 6. DB 업데이트
        # ⚠️ ar_parsing_status는 "pending"으로 설정!
        # - AR 감지(is_annual_report=True)와 AR 파싱(계약 테이블 추출)은 다름
        # - annual_report_api가 "pending" 상태를 스캔하여 실제 파싱 수행
        # - 파싱 완료 후 annual_report_api가 "completed"로 변경
        update_fields = {
            "is_annual_report": True,
            "document_type": "annual_report",
            "ar_parsing_status": "pending",  # AR 파싱 대기 (annual_report_api가 처리)
        }

        if display_name:
            update_fields["displayName"] = display_name

        if related_customer_id and ObjectId.is_valid(related_customer_id):
            # relatedCustomerId: AR 문서의 실제 대상 개인 고객 (소유권 이전 없이 연결만)
            update_fields["relatedCustomerId"] = ObjectId(related_customer_id)

        if issue_date:
            update_fields["ar_issue_date"] = issue_date

        await update_file(doc_id, set_fields=_serialize_for_api(update_fields), add_to_set={"tags": "AR"})

        logger.info(f"✅ AR 플래그 설정 완료: doc_id={doc_id}, related_customer_id={related_customer_id}")

        # 🔴 [ROOT FIX] AR 감지 즉시 이벤트 발행 → 프론트엔드가 "파싱 대기 중" 즉시 표시
        if related_customer_id:
            try:
                from services.redis_service import CHANNELS
                await RedisService.publish_event(CHANNELS["AR_STATUS"], {
                    "customer_id": str(related_customer_id),
                    "file_id": doc_id,
                    "status": "pending"
                })
                logger.info(f"📡 AR 감지 이벤트 발행: related_customer_id={related_customer_id}, doc_id={doc_id}")
            except Exception as sse_err:
                logger.warning(f"⚠️ AR 감지 이벤트 발행 실패 (무시): {sse_err}")

        return {
            "is_annual_report": True,
            "related_customer_id": related_customer_id,
            "customer_name": customer_name,
            "issue_date": issue_date
        }

    except Exception as e:
        logger.error(f"AR 자동 감지 중 오류: {e}", exc_info=True)
        return {"is_annual_report": False, "related_customer_id": None, "customer_name": None}


async def _detect_and_process_customer_review(
    doc_id: str,
    full_text: str,
    original_name: str,
    user_id: str,
    files_collection
) -> Dict[str, Any]:
    """
    🔴 CRS (Customer Review Service) 자동 감지 및 displayName 생성

    Args:
        doc_id: 문서 ID
        full_text: PDF에서 추출된 전체 텍스트
        original_name: 원본 파일명
        user_id: 사용자 ID
        files_collection: MongoDB 컬렉션

    Returns:
        dict: {
            "is_customer_review": bool,
            "customer_name": str | None,
            "product_name": str | None,
            "issue_date": str | None,
            "display_name": str | None
        }
    """
    import httpx

    settings = get_settings()

    try:
        # 1. CRS 패턴 매칭
        normalized_text = re.sub(r'\s+', ' ', full_text)

        required_keywords = ['Customer Review Service']
        optional_keywords = ['메트라이프', '변액', '적립금', '투자수익률', '펀드', '해지환급금']

        matched_required = [kw for kw in required_keywords if kw in normalized_text]
        matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

        # CRS 판단: "Customer Review Service" 필수 + 선택 키워드 1개 이상
        has_cr_keyword = "Customer Review Service" in normalized_text
        is_customer_review = has_cr_keyword and len(matched_optional) >= 1

        if not is_customer_review:
            logger.debug(f"CRS 패턴 불일치: doc_id={doc_id}")
            return {"is_customer_review": False}

        logger.info(f"🔍 CRS 감지: doc_id={doc_id}, 매칭={matched_required + matched_optional}")

        # 2. 메타데이터 추출 (고객명, 상품명, 발행일)

        # 2-1. 고객명 추출: "Customer" 키워드가 포함된 줄의 바로 위 줄에서 추출 (🔴 파일명 사용 절대 금지!)
        # PDF 포맷: "{NAME} 고객님을 위한\nCustomer Review Service"
        # → "Customer" 위 줄 = "{NAME} 고객님을 위한" → 고객명 추출
        customer_name = None
        lines = full_text.split('\n')
        for i, line in enumerate(lines):
            if 'Customer' in line:
                if i > 0:
                    name_line = lines[i - 1].strip()
                    go_idx = name_line.find(' 고')
                    if go_idx > 0:
                        name = name_line[:go_idx]
                    else:
                        space_idx = name_line.find(' ')
                        name = name_line[:space_idx] if space_idx > 0 else name_line
                    if len(name) >= 2:
                        customer_name = name
                        logger.info(f"📄 CRS 고객명 추출 (Customer 위 줄): {customer_name}")
                break
        # fallback: "계약자" 필드에서 추출
        if not customer_name:
            contractor_idx = normalized_text.find('계약자')
            if contractor_idx >= 0:
                after = normalized_text[contractor_idx + 3:]
                while after and after[0] in (':', '：', ' '):
                    after = after[1:]
                space_idx = after.find(' ')
                name = after[:space_idx].strip() if space_idx > 0 else after.strip()
                if len(name) >= 2:
                    customer_name = name
                    logger.info(f"📄 CRS 계약자명 추출 (PDF fallback): {customer_name}")

        # 2-2. 상품명 추출: 발행일 바로 윗줄이 상품명
        product_name = None
        발행_idx = full_text.find("발행")
        if 발행_idx > 0:
            before = full_text[:발행_idx].rstrip()
            nl = before.rfind("\n")
            if nl >= 0:
                product_name = before[nl + 1:].strip()
                if product_name:
                    logger.info(f"📄 CRS 상품명 추출: {product_name}")

        # 2-3. 발행일 추출
        issue_date = None
        date_pattern = r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
        date_match = re.search(date_pattern, full_text)
        if date_match:
            year, month, day = date_match.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            logger.info(f"📅 CRS 발행일 추출: {issue_date}")
        else:
            # 대체 패턴: 일반 날짜
            alt_date_pattern = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
            alt_date_match = re.search(alt_date_pattern, full_text)
            if alt_date_match:
                year, month, day = alt_date_match.groups()
                issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                logger.info(f"📅 CRS 발행일 추출 (대체): {issue_date}")

        # 3. displayName 생성
        # 형식: {고객명}_CRS_{상품명}_{YYYY-MM-DD}.pdf
        display_name = None
        if customer_name and product_name and issue_date:
            # 상품명 정규화 (파일명에 사용 불가 문자 제거)
            safe_product = re.sub(r'[\\/:*?"<>|]', '', product_name)
            safe_product = re.sub(r'\s+', ' ', safe_product).strip()
            display_name = f"{customer_name}_CRS_{safe_product}_{issue_date}.pdf"
            logger.info(f"📄 CRS displayName 생성: {display_name}")
        elif customer_name and issue_date:
            # 상품명 없이 생성
            display_name = f"{customer_name}_CRS_{issue_date}.pdf"
            logger.info(f"📄 CRS displayName 생성 (상품명 없음): {display_name}")

        # 4. 관련 고객 검색 (relatedCustomerId 설정용 — customerId는 변경하지 않음)
        related_customer_id = None
        if customer_name and user_id:
            from services.internal_api import resolve_customer_by_name
            related_customer_id = await resolve_customer_by_name(customer_name, user_id)
            if related_customer_id:
                logger.info(f"✅ CRS 관련 고객 발견: {customer_name} (ID: {related_customer_id})")

        # 5. DB 업데이트
        update_fields = {
            "is_customer_review": True,
            "document_type": "customer_review",
            "cr_parsing_status": "pending",
            "cr_metadata": {
                "contractor_name": customer_name,
                "product_name": product_name,
                "issue_date": issue_date,
            }
        }

        if display_name:
            update_fields["displayName"] = display_name

        if related_customer_id and ObjectId.is_valid(related_customer_id):
            update_fields["relatedCustomerId"] = ObjectId(related_customer_id)

        await update_file(doc_id, set_fields=_serialize_for_api(update_fields), add_to_set={"tags": "CRS"})

        logger.info(f"✅ CRS 플래그 설정 완료: doc_id={doc_id}, related_customer_id={related_customer_id}")

        if related_customer_id:
            try:
                from services.redis_service import CHANNELS
                await RedisService.publish_event(CHANNELS["CR_STATUS"], {
                    "customer_id": str(related_customer_id),
                    "file_id": doc_id,
                    "status": "pending"
                })
                logger.info(f"📡 CRS 감지 이벤트 발행: related_customer_id={related_customer_id}, doc_id={doc_id}")
            except Exception as sse_err:
                logger.warning(f"⚠️ CRS 감지 이벤트 발행 실패 (무시): {sse_err}")

        return {
            "is_customer_review": True,
            "related_customer_id": related_customer_id,
            "customer_name": customer_name,
            "product_name": product_name,
            "issue_date": issue_date,
            "display_name": display_name
        }

    except Exception as e:
        logger.error(f"CRS 자동 감지 중 오류: {e}", exc_info=True)
        return {"is_customer_review": False}


async def _cleanup_failed_document(doc_id: str, customer_id: Optional[str], dest_path: Optional[str]):
    """
    문서 처리 실패 시 cleanup: DB 레코드 + 고객 연결 + 디스크 파일 삭제.
    DuplicateKeyError 등 파이프라인 중간 실패 시 고아 데이터 방지.
    """
    try:
        files_collection = MongoService.get_collection("files")

        # 1. customers.documents에서 해당 문서 참조 제거
        if customer_id:
            try:
                await pull_customer_document(customer_id, doc_id)
                logger.info(f"🧹 Cleanup: 고객({customer_id})에서 문서({doc_id}) 연결 제거 완료")
            except Exception as e:
                logger.error(f"🧹 Cleanup 실패 (고객 연결 제거): doc_id={doc_id}, error={e}")

        # 2. 디스크 파일 삭제
        if dest_path and os.path.exists(dest_path):
            try:
                os.unlink(dest_path)
                logger.info(f"🧹 Cleanup: 디스크 파일 삭제 완료 ({dest_path})")
            except Exception as e:
                logger.error(f"🧹 Cleanup 실패 (디스크 파일 삭제): path={dest_path}, error={e}")

        # 3. files 컬렉션에서 문서 레코드 삭제
        try:
            await delete_file(doc_id)
            logger.info(f"🧹 Cleanup: files 레코드 삭제 완료 (doc_id={doc_id})")
        except Exception as e:
            logger.error(f"🧹 Cleanup 실패 (files 레코드 삭제): doc_id={doc_id}, error={e}")

    except Exception as e:
        logger.error(f"🧹 Cleanup 전체 실패: doc_id={doc_id}, error={e}")


async def _connect_document_to_customer(customer_id: str, doc_id: str, user_id: str):
    """Connect document to customer via internal API call"""
    import httpx

    settings = get_settings()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.AIMS_API_URL}/api/customers/{customer_id}/documents",
                json={
                    "document_id": doc_id,
                    "userId": user_id,
                    "notes": ""
                },
                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                timeout=10.0
            )

            if response.status_code != 200:
                logger.warning(f"Failed to connect document to customer: {response.text}")
    except Exception as e:
        logger.warning(f"Error connecting document to customer: {e}")


async def _notify_progress(doc_id: str, owner_id: str, progress: int, stage: str, message: str = ""):
    """Send progress update notification via SSE webhook and update MongoDB"""
    import httpx

    settings = get_settings()

    # 1. MongoDB에 progress 필드 업데이트 (폴링용)
    try:
        files_collection = MongoService.get_collection("files")
        update_fields = {
            "progress": progress,
            "progressStage": stage,
            "progressMessage": message
        }

        # ⭐ 처리 완료 시 status + overallStatus 동시 설정 (불일치 방지)
        if progress == 100 and stage == "complete":
            update_fields["status"] = "completed"
            update_fields["overallStatus"] = "completed"

        # 🔴 에러 상태 처리 (progress == -1)
        if progress == -1 and stage == "error":
            update_fields["status"] = "failed"
            update_fields["overallStatus"] = "error"
            update_fields["error"] = {
                "statusCode": 409,
                "statusMessage": message,
                "timestamp": datetime.utcnow().isoformat()
            }

        await update_file(doc_id, set_fields=_serialize_for_api(update_fields))
    except Exception as e:
        logger.warning(f"Error updating progress in MongoDB: {e}")

    # 2. Redis 이벤트 발행 (실시간 SSE 업데이트용)
    try:
        from services.redis_service import CHANNELS
        await RedisService.publish_event(CHANNELS["DOC_PROGRESS"], {
            "document_id": doc_id,
            "progress": progress,
            "stage": stage,
            "message": message,
            "owner_id": owner_id
        })

        # 🔴 에러 상태일 때 complete 이벤트도 발행
        if progress == -1 and stage == "error":
            await RedisService.publish_event(CHANNELS["DOC_COMPLETE"], {
                "document_id": doc_id,
                "status": "failed",
                "owner_id": owner_id
            })
            logger.info(f"🔴 에러 완료 알림 발행: doc_id={doc_id}")
    except Exception as e:
        logger.warning(f"Error publishing progress event: {e}")


async def _notify_document_complete(doc_id: str, owner_id: str):
    """Notify that document processing is complete via Redis event"""
    import asyncio

    async def _send_notification():
        # Wait 3 seconds for SSE to be ready
        await asyncio.sleep(3)

        try:
            from services.redis_service import CHANNELS
            await RedisService.publish_event(CHANNELS["DOC_COMPLETE"], {
                "document_id": doc_id,
                "status": "completed",
                "owner_id": owner_id
            })
        except Exception as e:
            logger.warning(f"Error publishing document complete event: {e}")

    # Run notification in background
    asyncio.create_task(_send_notification())


@dataclass
class PipelineContext:
    """process_document_pipeline 내부에서 공유되는 상태 객체"""
    # 입력
    file_content: bytes
    original_name: str
    user_id: str
    customer_id: Optional[str]
    source_path: Optional[str]
    mime_type: Optional[str]
    existing_doc_id: Optional[str]
    # 진행 중 상태
    doc_id: Optional[str] = None
    dest_path: Optional[str] = None
    files_collection: Any = None
    customer_connected: bool = False
    cleanup_done: bool = False
    metric_record: Any = None
    # 추출 결과
    full_text: str = ""
    detected_mime: str = ""
    meta_result: Dict[str, Any] = field(default_factory=dict)
    summary_result: Dict[str, Any] = field(default_factory=dict)
    ai_document_type: str = "general"
    ai_confidence: float = 0.0
    is_ar_detected: bool = False
    is_crs_detected: bool = False


async def _step_create_or_update_document(ctx: PipelineContext) -> None:
    """Step 1: MongoDB에 문서 생성 또는 기존 문서 업데이트"""
    if ctx.existing_doc_id:
        # 큐잉 모드: 기존 문서 업데이트
        logger.info(f"Using existing document: {ctx.existing_doc_id} for userId: {ctx.user_id}")
        ctx.doc_id = ctx.existing_doc_id
        await update_file(ctx.doc_id, set_fields=_serialize_for_api({
            "progress": 20,
            "progressStage": "upload",
            "progressMessage": "업로드 준비 중",
            "overallStatus": "uploading",
            "overallStatusUpdatedAt": datetime.utcnow(),
        }))
    else:
        # 동기 모드: 새 문서 생성
        logger.info(f"Creating document for userId: {ctx.user_id}, customerId: {ctx.customer_id}")
        doc_data = {
            "ownerId": ctx.user_id,
            "createdAt": datetime.utcnow(),
            # 초기 progress 설정 - 프론트엔드에서 즉시 20% 표시
            "progress": 20,
            "progressStage": "upload",
            "progressMessage": "업로드 준비 중",
            "status": "processing",
            "overallStatus": "uploading",
        }
        if ctx.customer_id:
            # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
            doc_data["customerId"] = ObjectId(ctx.customer_id) if ObjectId.is_valid(ctx.customer_id) else ctx.customer_id

        api_result = await create_file(_serialize_for_api(doc_data))
        ctx.doc_id = api_result.get("data", {}).get("insertedId", "")
        if not ctx.doc_id:
            raise Exception("파일 생성 실패 (Internal API)")
        logger.info(f"Created document: {ctx.doc_id}")


async def _step_save_file(ctx: PipelineContext) -> None:
    """Step 2: 파일을 디스크에 저장하고 MongoDB에 업로드 정보 업데이트"""
    saved_name, ctx.dest_path = await FileService.save_file(
        content=ctx.file_content,
        original_name=ctx.original_name,
        user_id=ctx.user_id,
        source_path=ctx.source_path
    )

    logger.info(f"Saved file: {saved_name} to {ctx.dest_path}")

    # Update MongoDB with upload info
    upload_info = {
        "upload.originalName": ctx.original_name,
        "upload.saveName": saved_name,
        "upload.destPath": ctx.dest_path,
        "upload.uploaded_at": datetime.utcnow().isoformat(),
    }
    if ctx.source_path:
        upload_info["upload.sourcePath"] = ctx.source_path

    await update_file(ctx.doc_id, set_fields=upload_info)


async def _step_extract_metadata(ctx: PipelineContext) -> Optional[Dict[str, Any]]:
    """
    Step 3: 메타데이터 추출 (사전 추출된 텍스트가 있으면 재추출 스킵)

    Returns:
        None: 정상 진행
        dict: 에러 시 early return할 응답 dict
    """
    # Progress: 40% - Starting meta extraction
    await _notify_progress(ctx.doc_id, ctx.user_id, 40, "meta", "메타데이터 추출 중")

    # overallStatus: extracting (메타데이터/텍스트 추출 단계)
    await update_file(ctx.doc_id, set_fields=_serialize_for_api({
        "overallStatus": "extracting", "overallStatusUpdatedAt": datetime.utcnow()
    }))

    # 🍎 DB에 사전 추출된 meta.full_text가 있는지 확인 (업로드 시 저장됨)
    existing_doc = await query_file_one(
        {"_id": ctx.doc_id},
        {"meta.full_text": 1, "meta.mime": 1, "meta.pdf_pages": 1, "meta.size_bytes": 1, "meta.filename": 1}
    )
    pre_full_text = (existing_doc or {}).get("meta", {}).get("full_text", "")
    pre_mime = (existing_doc or {}).get("meta", {}).get("mime", "")

    if pre_full_text and len(pre_full_text.strip()) > 0 and pre_mime:
        # 사전 추출된 텍스트 재사용 → MetaService 재호출 스킵
        logger.info(f"[MetaSkip] DB에 사전 추출 텍스트 존재 ({len(pre_full_text)} chars), 메타 추출 스킵: {ctx.doc_id}")
        ctx.full_text = pre_full_text
        ctx.detected_mime = pre_mime
        # meta_result는 후속 코드에서 참조하므로 DB 값으로 구성
        existing_meta = (existing_doc or {}).get("meta", {})
        ctx.meta_result = {
            "extracted_text": pre_full_text,
            "mime_type": pre_mime,
            "num_pages": existing_meta.get("pdf_pages", 0),
            "file_size": existing_meta.get("size_bytes", 0),
            "filename": existing_meta.get("filename", ctx.original_name),
            "error": None,
        }
    else:
        # 사전 추출 텍스트 없음 → 기존대로 MetaService 호출
        ctx.meta_result = await MetaService.extract_metadata(ctx.dest_path)

        if ctx.meta_result.get("error"):
            logger.warning(f"Metadata extraction failed: {ctx.meta_result}")
            await update_file(ctx.doc_id, set_fields={
                "status": "failed",
                "overallStatus": "error",
                "meta.error": ctx.meta_result.get("message", "Unknown error")
            })
            return {
                "result": "error",
                "document_id": ctx.doc_id,
                "error": ctx.meta_result.get("message", "Unknown error"),
                "status": ctx.meta_result.get("status", 500)
            }

        ctx.full_text = ctx.meta_result.get("extracted_text", "")
        ctx.detected_mime = ctx.meta_result.get("mime_type", "")

        # PDF 변환 텍스트 추출: 직접 파서로 텍스트가 없고 변환 가능한 형식인 경우
        if (not ctx.full_text or len(ctx.full_text.strip()) == 0) and is_convertible_mime(ctx.detected_mime):
            await _notify_progress(ctx.doc_id, ctx.user_id, 50, "convert", "PDF 변환 후 텍스트 추출 중")
            # overallStatus: converting (PDF 변환 중)
            await update_file(ctx.doc_id, set_fields=_serialize_for_api({
                "overallStatus": "converting", "overallStatusUpdatedAt": datetime.utcnow()
            }))
            logger.info(f"[PDF변환텍스트] 직접 파서 없음, PDF 변환 시도: {ctx.doc_id} (MIME: {ctx.detected_mime})")

            converted_text = await convert_and_extract_text(ctx.dest_path)
            if converted_text and converted_text.strip():
                ctx.full_text = converted_text
                logger.info(f"[PDF변환텍스트] 성공: {ctx.doc_id} ({len(ctx.full_text)} chars)")
            else:
                logger.info(f"[PDF변환텍스트] 텍스트 추출 실패, OCR fallback: {ctx.doc_id}")

    return None


async def _step_ai_summarize(ctx: PipelineContext) -> None:
    """Step: AI 요약 생성 (텍스트가 추출된 경우에만)

    Strangler Fig: 어댑터가 있으면 어댑터의 분류 config를 사용.
    없으면 OpenAIService의 하드코딩 프롬프트로 fallback.
    """
    if ctx.full_text and len(ctx.full_text.strip()) >= 10:
        # 어댑터에서 분류 config 가져오기 (있으면)
        classification_config = None
        adapter = _get_insurance_adapter()
        if adapter is not None:
            try:
                classification_config = await adapter.get_classification_config()
            except Exception as e:
                logger.warning(f"⚠️ 어댑터 분류 config 조회 실패 (fallback): {e}")

        ctx.summary_result = await OpenAIService.summarize_text(
            ctx.full_text,
            owner_id=ctx.user_id,
            document_id=ctx.doc_id,
            filename=ctx.original_name,
            classification_config=classification_config,
        )
        ctx.ai_document_type = ctx.summary_result.get("document_type", "general")
        ctx.ai_confidence = ctx.summary_result.get("confidence", 0.0)


async def _step_update_meta_to_db(ctx: PipelineContext) -> None:
    """Step: 메타데이터를 MongoDB에 업데이트 (중복 해시 처리 + DuplicateKeyError 포함)"""
    summary = ctx.summary_result.get("summary", "") if ctx.summary_result else ""

    meta_update = {
        "meta.filename": ctx.meta_result.get("filename"),
        "meta.extension": ctx.meta_result.get("extension"),
        "meta.mime": ctx.meta_result.get("mime_type"),
        "meta.size_bytes": ctx.meta_result.get("file_size"),
        "meta.file_hash": ctx.meta_result.get("file_hash"),
        "meta.pdf_pages": ctx.meta_result.get("num_pages"),
        "meta.full_text": ctx.full_text or "",
        "meta.summary": summary,
        "meta.confidence": ctx.ai_confidence,
        "document_type": ctx.ai_document_type or "general",
        "document_type_auto": True,
        "meta.length": len(ctx.full_text) if ctx.full_text else 0,
        "meta.meta_status": "done",
        # Image EXIF metadata
        "meta.width": ctx.meta_result.get("width"),
        "meta.height": ctx.meta_result.get("height"),
        "meta.date_taken": ctx.meta_result.get("date_taken"),
        "meta.camera_make": ctx.meta_result.get("camera_make"),
        "meta.camera_model": ctx.meta_result.get("camera_model"),
        "meta.gps_latitude": ctx.meta_result.get("gps_latitude"),
        "meta.gps_longitude": ctx.meta_result.get("gps_longitude"),
        "meta.gps_latitude_ref": ctx.meta_result.get("gps_latitude_ref"),
        "meta.gps_longitude_ref": ctx.meta_result.get("gps_longitude_ref"),
        "meta.orientation": ctx.meta_result.get("orientation"),
        "meta.exif": ctx.meta_result.get("exif"),
    }

    # 🔴 중복 파일 해시 처리: 고아 문서(customerId: null) 안전하게 정리
    file_hash = ctx.meta_result.get("file_hash")
    if file_hash:
        # 안전한 삭제 조건 (race condition 완벽 방지):
        # 1. customerId가 null인 문서만 (고아 상태)
        # 2. status가 "completed"가 아닌 문서만 (처리 완료된 정상 문서 보호)
        # 3. 생성된 지 30초 이상 된 문서만 (동시 업로드 시 처리 중인 문서 보호)
        # 4. 현재 문서가 아닌 것만
        orphan_threshold = datetime.utcnow() - timedelta(seconds=30)
        delete_result_api = await delete_file_by_filter(
            owner_id=ctx.user_id,
            file_hash=file_hash,
            exclude_id=ctx.doc_id,
            created_before=orphan_threshold.isoformat(),
            max_status="completed"
        )
        delete_count = delete_result_api.get("data", {}).get("deletedCount", 0) if delete_result_api.get("success") else 0
        if delete_count > 0:
            logger.info(f"🗑️ 고아 문서 삭제 완료 (file_hash: {file_hash[:16]}...)")

    try:
        await update_file(ctx.doc_id, set_fields=_serialize_for_api(meta_update))
    except DuplicateKeyError as e:
        # 중복 에러 발생 시 SSE 에러 전달 후 cleanup 수행
        # (cleanup이 files 레코드를 삭제하므로 notify_progress를 먼저 호출)
        error_msg = "동일한 파일이 이미 등록되어 있습니다."
        logger.error(f"🔴 중복 파일 에러: {ctx.doc_id} - {error_msg}")
        await _notify_progress(ctx.doc_id, ctx.user_id, -1, "error", error_msg)
        await _cleanup_failed_document(ctx.doc_id, ctx.customer_id, ctx.dest_path)
        ctx.cleanup_done = True
        raise Exception(error_msg) from e

    ctx.detected_mime = ctx.meta_result.get("mime_type", "")

    # Progress: 50% - Meta extraction complete
    await _notify_progress(ctx.doc_id, ctx.user_id, 50, "meta", "메타데이터 추출 완료")


async def _step_detect_ar_crs(ctx: PipelineContext) -> None:
    """Step: AR/CRS 자동 감지 (PDF 파일이고 텍스트가 있는 경우)

    Strangler Fig 패턴:
    - InsuranceDomainAdapter가 등록되어 있으면 adapter.detect_special_documents() 사용
    - 없으면 기존 _detect_and_process_*() 함수로 fallback
    """
    # AR/CRS 감지 실패가 문서 처리 전체를 중단시키지 않도록 개별 격리
    if ctx.detected_mime == "application/pdf" and ctx.full_text and len(ctx.full_text.strip()) > 0:
        # Strangler Fig: 어댑터가 있으면 새 경로 사용
        adapter = _get_insurance_adapter()
        if adapter is not None:
            await _step_detect_ar_crs_via_adapter(ctx, adapter)
        else:
            await _step_detect_ar_crs_legacy(ctx)


def _get_insurance_adapter():
    """InsuranceDomainAdapter 인스턴스 반환 (없으면 None — fallback 사용)

    Strangler Fig 전환 제어점. Phase 완료 후 항상 인스턴스를 반환하도록 변경 예정.
    """
    try:
        from insurance.adapter import InsuranceDomainAdapter
        return InsuranceDomainAdapter()
    except ImportError:
        return None


async def _step_detect_ar_crs_via_adapter(ctx: PipelineContext, adapter) -> None:
    """어댑터 경로: detect → resolve_entity → on_stage_complete → HookResult 실행

    Phase 2: legacy 함수 호출 없이 어댑터 + HookResult 실행기로 자립 동작.
    순수 텍스트 분석(어댑터)과 부수 효과(HookResult)를 완전 분리.
    """
    try:
        detections = await adapter.detect_special_documents(
            text=ctx.full_text,
            mime_type=ctx.detected_mime,
            filename=ctx.original_name,
        )
    except Exception as detect_err:
        logger.error(f"❌ 어댑터 감지 예외 (legacy fallback): doc_id={ctx.doc_id}, error={detect_err}", exc_info=True)
        await _step_detect_ar_crs_legacy(ctx)
        return

    if not detections:
        return

    detection = detections[0]  # AR/CRS는 상호 배타적

    # 1. 엔티티 연결 (고객명 → 고객 ID)
    related_customer_id = None
    try:
        entity_result = await adapter.resolve_entity(detection, ctx.user_id)
        related_customer_id = entity_result.get("customer_id") if entity_result else None
    except Exception as entity_err:
        logger.warning(f"⚠️ 엔티티 연결 실패 (감지는 계속): doc_id={ctx.doc_id}, error={entity_err}")

    # 2. 표시명 생성
    display_name = ""
    try:
        display_name = await adapter.generate_display_name(
            {"originalName": ctx.original_name},
            detection,
        )
    except Exception:
        pass

    # 3. on_stage_complete() → HookResult 목록 반환
    stage_name = "ar_detected" if detection.doc_type == "annual_report" else "crs_detected"
    hook_context = {
        "doc_id": ctx.doc_id,
        "detection": detection,
        "related_customer_id": related_customer_id,
        "display_name": display_name,
        "user_id": ctx.user_id,
    }

    try:
        hook_results = await adapter.on_stage_complete(
            stage=stage_name,
            doc={},
            context=hook_context,
        )
    except Exception as hook_err:
        logger.error(f"❌ 어댑터 훅 예외: doc_id={ctx.doc_id}, error={hook_err}", exc_info=True)
        hook_results = []

    # 4. HookResult 실행
    await _execute_hook_results(ctx, hook_results)

    # 5. 상태 플래그 업데이트
    if detection.doc_type == "annual_report":
        ctx.is_ar_detected = True
        logger.info(f"✅ AR 자동 감지 완료 (어댑터+HookResult): doc_id={ctx.doc_id}, customer={related_customer_id}")
    elif detection.doc_type == "customer_review":
        ctx.is_crs_detected = True
        logger.info(f"✅ CRS 자동 감지 완료 (어댑터+HookResult): doc_id={ctx.doc_id}, customer={related_customer_id}")


async def _execute_hook_results(ctx: PipelineContext, hook_results: list) -> None:
    """HookResult 목록을 실행 — DB 업데이트, SSE 알림, 프로세스 트리거

    어댑터가 반환한 HookResult를 실제로 실행하는 단일 실행기.
    이 함수가 있으므로 어댑터는 순수 로직만 담당하고,
    부수 효과(DB, SSE, HTTP)는 이 함수가 처리한다.
    """
    from xpipe.adapter import StageHookAction

    for result in hook_results:
        try:
            if result.action == StageHookAction.UPDATE_STATUS:
                # MongoDB $set + $addToSet
                payload = result.payload
                doc_id = payload.get("doc_id", ctx.doc_id)
                fields = payload.get("fields", {})
                add_to_set = payload.get("add_to_set", {})

                update_ops = {}
                if fields:
                    update_ops["$set"] = fields
                if add_to_set:
                    update_ops["$addToSet"] = add_to_set

                # relatedCustomerId는 문자열 → ObjectId 변환 필요
                if fields.get("relatedCustomerId"):
                    from bson import ObjectId
                    rid = fields["relatedCustomerId"]
                    if isinstance(rid, str) and ObjectId.is_valid(rid):
                        fields["relatedCustomerId"] = ObjectId(rid)

                if update_ops:
                    await update_file(
                        doc_id,
                        set_fields=_serialize_for_api(fields) if fields else None,
                        add_to_set=add_to_set if add_to_set else None,
                    )

            elif result.action == StageHookAction.NOTIFY:
                # SSE 웹훅 호출
                payload = result.payload
                event = payload.get("event", "")
                if event:
                    await _send_sse_webhook(event, payload)

            elif result.action == StageHookAction.TRIGGER_PROCESS:
                # AR 파싱 트리거 등 — annual_report_api 스캐너가 polling으로 처리하므로
                # ar_parsing_status=pending 설정만 하면 됨 (UPDATE_STATUS에서 이미 처리)
                pass

        except Exception as exec_err:
            logger.error(f"❌ HookResult 실행 오류: action={result.action}, error={exec_err}", exc_info=True)


async def _send_sse_webhook(event: str, payload: dict) -> None:
    """SSE 웹훅을 aims_api에 전송 (X-API-Key 인증 포함)"""
    import httpx
    from config import get_settings

    webhook_map = {
        "ar-status-change": "/api/webhooks/ar-status-change",
        "cr-status-change": "/api/webhooks/cr-status-change",
    }
    path = webhook_map.get(event)
    if not path:
        return

    settings = get_settings()
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.AIMS_API_URL}{path}",
                json={
                    "customer_id": payload.get("customer_id", ""),
                    "file_id": payload.get("file_id", ""),
                    "status": payload.get("status", "pending"),
                },
                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                timeout=5.0,
            )
    except Exception as e:
        logger.warning(f"⚠️ SSE 웹훅 전송 실패 ({event}): {e}")


async def _step_detect_ar_crs_legacy(ctx: PipelineContext) -> None:
    """Legacy 경로: 기존 _detect_and_process_*() 함수 직접 호출 (fallback)"""
    try:
        ar_detection = await _detect_and_process_annual_report(
            doc_id=ctx.doc_id,
            full_text=ctx.full_text,
            original_name=ctx.original_name,
            user_id=ctx.user_id,
            files_collection=ctx.files_collection
        )
        if ar_detection.get("is_annual_report"):
            ctx.is_ar_detected = True
            logger.info(f"✅ AR 자동 감지 완료: doc_id={ctx.doc_id}, related_customer_id={ar_detection.get('related_customer_id')}")
    except Exception as ar_err:
        logger.error(f"❌ AR 감지 예외 (문서 처리 계속): doc_id={ctx.doc_id}, error={ar_err}", exc_info=True)

    if not ctx.is_ar_detected:
        try:
            crs_detection = await _detect_and_process_customer_review(
                doc_id=ctx.doc_id,
                full_text=ctx.full_text,
                original_name=ctx.original_name,
                user_id=ctx.user_id,
                files_collection=ctx.files_collection
            )
            if crs_detection.get("is_customer_review"):
                ctx.is_crs_detected = True
                logger.info(f"✅ CRS 자동 감지 완료: doc_id={ctx.doc_id}, related_customer_id={crs_detection.get('related_customer_id')}")
        except Exception as crs_err:
            logger.error(f"❌ CRS 감지 예외 (문서 처리 계속): doc_id={ctx.doc_id}, error={crs_err}", exc_info=True)


async def _generate_display_name(
    doc_id: str,
    text: str,
    original_name: str,
    user_id: str,
    summary_result: Dict[str, Any],
    files_collection: Any
) -> None:
    """
    displayName 자동 생성 (text/plain, 일반 문서 공통)

    1순위: summary_result에서 이미 생성된 title (추가 API 비용 없음)
    2순위: generate_title_only() 경량 호출
    """
    try:
        ai_title = summary_result.get("title", "") if summary_result else ""

        if not ai_title and text and len(text.strip()) >= 10:
            try:
                title_result = await OpenAIService.generate_title_only(
                    text=text,
                    owner_id=user_id,
                    document_id=doc_id
                )
                ai_title = title_result.get("title", "")
            except Exception as title_err:
                logger.warning(f"[DisplayName] generate_title_only 실패: {doc_id}, error={title_err}")

        if ai_title:
            display_name = sanitize_display_name(ai_title, original_name)
            if display_name:
                await update_file(doc_id, set_fields={"displayName": display_name})
                logger.info(f"[DisplayName] 자동 생성: {doc_id}, {original_name} → {display_name}")
            else:
                await update_file(doc_id, set_fields={"displayNameStatus": "failed"})
                logger.warning(f"[DisplayName] sanitize 실패: {doc_id}")
        else:
            await update_file(doc_id, set_fields={"displayNameStatus": "failed"})
            logger.warning(f"[DisplayName] 제목 생성 실패 (텍스트 부족 또는 API 에러): {doc_id}")
    except Exception as dn_err:
        logger.warning(f"[DisplayName] 자동 생성 예외 (문서 처리 계속): {doc_id}, error={dn_err}")


async def _step_route_by_mime(ctx: PipelineContext) -> Dict[str, Any]:
    """Step 4: MIME 타입별 분기 처리 (text/plain, unsupported, OCR, 텍스트 추출 완료)"""
    from workers.pipeline_metrics import pipeline_metrics

    # Case 1: text/plain - extract and save text
    if ctx.detected_mime == "text/plain":
        logger.info(f"Processing text/plain file: {ctx.doc_id}")

        # Progress: 60% - Starting text extraction
        await _notify_progress(ctx.doc_id, ctx.user_id, 60, "text", "텍스트 추출 중")

        text_content = await FileService.read_file_as_text(ctx.dest_path)

        # Progress: 80% - Saving text to database
        await _notify_progress(ctx.doc_id, ctx.user_id, 80, "text", "텍스트 저장 중")

        await update_file(ctx.doc_id, set_fields={"text.full_text": text_content})

        # 🔵 displayName 자동 생성 (text/plain)
        # text/plain은 메타 추출 시점에 full_text가 비어 summarize_text() 미호출 →
        # summary_result에 title 없음 → generate_title_only() 경량 호출로 생성
        await _generate_display_name(
            doc_id=ctx.doc_id,
            text=text_content,
            original_name=ctx.original_name,
            user_id=ctx.user_id,
            summary_result=ctx.summary_result,
            files_collection=ctx.files_collection
        )

        # Progress: 100% - text/plain processing complete (no OCR needed)
        await _notify_progress(ctx.doc_id, ctx.user_id, 100, "complete", "텍스트 파일 처리 완료")

        pipeline_metrics.record_success(ctx.metric_record)
        return {
            "exitCode": 0,
            "stderr": "",
            "document_id": ctx.doc_id
        }

    # Case 2: Unsupported MIME type → 파일 보관만 (AI 처리 스킵)
    if ctx.detected_mime in UNSUPPORTED_MIME_TYPES:
        logger.info(f"[UnsupportedFormat] 지원하지 않는 형식, 보관만: {ctx.detected_mime} for {ctx.doc_id}")

        await _notify_progress(ctx.doc_id, ctx.user_id, 60, "check", "파일 형식 확인 중")
        await _notify_progress(ctx.doc_id, ctx.user_id, 80, "update", "처리 상태 업데이트 중")

        await update_file(ctx.doc_id, set_fields={
            "processingSkipReason": "unsupported_format",
            "overallStatus": "completed",
            "status": "completed",
            "meta.mime": ctx.detected_mime,
        })

        await _notify_progress(ctx.doc_id, ctx.user_id, 100, "complete", "처리 완료 (보관)")
        await _notify_document_complete(ctx.doc_id, ctx.user_id)

        pipeline_metrics.record_success(ctx.metric_record)
        return {
            "result": "success",
            "document_id": ctx.doc_id,
            "status": "completed",
            "processingSkipReason": "unsupported_format",
            "mime": ctx.detected_mime,
            "filename": ctx.original_name
        }

    # Case 3: Check if OCR is needed (no text extracted)
    if not ctx.full_text or len(ctx.full_text.strip()) == 0:
        # 비변환 파일(이미지 등)은 conv_pdf_path가 불필요하므로 빈 문자열로 초기화
        conv_pdf_path = ""

        # 변환 가능한 포맷(HWP, DOC, PPT 등)이 텍스트 추출 실패한 경우
        # → 변환된 PDF가 존재하면 OCR 큐로 전달, 없으면 보관 처리
        if is_convertible_mime(ctx.detected_mime):
            # DB에서 변환된 PDF 경로 확인
            conv_doc = await query_file_one(
                {"_id": ctx.doc_id},
                {"upload.convPdfPath": 1}
            )
            conv_pdf_path = (conv_doc or {}).get("upload", {}).get("convPdfPath", "")

            if conv_pdf_path and os.path.exists(conv_pdf_path):
                # 변환된 PDF가 존재 → OCR 큐로 전달 (이미지만 있는 PPT/HWP 등)
                logger.info(f"[ConvertOCR] {ctx.detected_mime} 텍스트 없음, 변환 PDF를 OCR 큐로 전달: {ctx.doc_id}")
                # OCR 큐 전달 로직은 아래 Case 3 공통 코드로 fall-through
            else:
                logger.warning(f"[ConvertFailed] {ctx.detected_mime} 변환 실패, 변환 PDF 없음 → 보관 처리: {ctx.doc_id}")
                await update_file(ctx.doc_id, set_fields=_serialize_for_api({
                    "overallStatus": "conversion_pending",
                    "overallStatusUpdatedAt": datetime.utcnow(),
                    "status": "converting",
                    "meta.mime": ctx.detected_mime,
                    "progressStage": "conversion_queued",
                    "progress": 60,
                }), unset_fields={"processingSkipReason": ""})
                await _notify_progress(ctx.doc_id, ctx.user_id, 60, "conversion_queued", "PDF 변환 대기 중")
                pipeline_metrics.record_success(ctx.metric_record)
                return {
                    "result": "success",
                    "document_id": ctx.doc_id,
                    "status": "converting",
                    "overallStatus": "conversion_pending",
                    "mime": ctx.detected_mime,
                    "filename": ctx.original_name
                }

        # Progress: 60% - OCR needed
        await _notify_progress(ctx.doc_id, ctx.user_id, 60, "ocr", "OCR 처리 준비 중")
        logger.info(f"Queueing OCR for document: {ctx.doc_id}")

        queued_at = datetime.utcnow().isoformat()

        # 변환 가능 파일의 경우 변환된 PDF를 OCR 대상으로 사용 (원본 HWP/PPT는 OCR 불가)
        ocr_file_path = ctx.dest_path
        if is_convertible_mime(ctx.detected_mime) and conv_pdf_path and os.path.exists(conv_pdf_path):
            ocr_file_path = conv_pdf_path
            logger.info(f"[ConvertOCR] 변환 PDF 경로를 OCR 대상으로 사용: {conv_pdf_path}")

        # Queue to Redis
        await RedisService.add_to_stream(
            file_id=ctx.doc_id,
            file_path=ocr_file_path,
            doc_id=ctx.doc_id,
            owner_id=ctx.user_id,
            queued_at=queued_at,
            original_name=ctx.original_name
        )

        # Update MongoDB with queue status
        await update_file(ctx.doc_id, set_fields=_serialize_for_api({
            "ocr.status": "queued",
            "ocr.queued_at": queued_at,
            "overallStatus": "ocr_queued",
            "overallStatusUpdatedAt": datetime.utcnow(),
        }))

        # Progress: 70% - OCR queued
        await _notify_progress(ctx.doc_id, ctx.user_id, 70, "ocr", "OCR 대기열에 추가됨")

        # 메트릭: 성공 기록 (OCR는 별도 처리)
        pipeline_metrics.record_success(ctx.metric_record)

        return {
            "result": "success",
            "document_id": ctx.doc_id,
            "ocr": {
                "status": "queued",
                "queued_at": queued_at
            }
        }

    # Case 4: Text already extracted, notify complete
    logger.info(f"Document {ctx.doc_id} processed without OCR (text already extracted)")

    # 🔵 displayName 자동 생성 (AR/CRS가 아닌 일반 문서)
    if not ctx.is_ar_detected and not ctx.is_crs_detected:
        existing_doc = await query_file_one(
            {"_id": ctx.doc_id},
            {"displayName": 1}
        )
        if existing_doc and not existing_doc.get("displayName"):
            await _generate_display_name(
                doc_id=ctx.doc_id,
                text=ctx.full_text,
                original_name=ctx.original_name,
                user_id=ctx.user_id,
                summary_result=ctx.summary_result,
                files_collection=ctx.files_collection
            )

    # Progress: 90% - 텍스트 추출 완료, 임베딩 대기
    await _notify_progress(ctx.doc_id, ctx.user_id, 90, "embed_pending", "텍스트 추출 완료, 임베딩 대기")

    # overallStatus: embed_pending (텍스트 추출 완료, 임베딩 크론 대기)
    # status: completed (텍스트 추출 단계는 완료)
    await update_file(ctx.doc_id, set_fields=_serialize_for_api({
        "status": "completed",
        "overallStatus": "embed_pending",
        "overallStatusUpdatedAt": datetime.utcnow(),
    }))

    # Send completion notification
    await _notify_document_complete(ctx.doc_id, ctx.user_id)

    # 메트릭: 성공 기록
    pipeline_metrics.record_success(ctx.metric_record)

    return {
        "result": "success",
        "document_id": ctx.doc_id,
        "status": "completed",
        "meta": {
            "filename": ctx.meta_result.get("filename"),
            "extension": ctx.meta_result.get("extension"),
            "mime": ctx.meta_result.get("mime_type"),
            "size_bytes": str(ctx.meta_result.get("file_size", "")),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "meta_status": "ok",
            "exif": "{}",
            "pdf_pages": str(ctx.meta_result.get("num_pages", "")),
            "full_text": (ctx.full_text[:10000] + "...") if len(ctx.full_text) > 10000 else ctx.full_text
        }
    }


def _get_pipeline_engine() -> str:
    """파이프라인 엔진 설정 조회. 환경변수 PIPELINE_ENGINE으로 전환.

    Returns:
        "xpipe" → xPipe 파이프라인으로 처리
        "legacy" → 기존 document_pipeline으로 처리 (기본값)
    """
    return os.environ.get("PIPELINE_ENGINE", "legacy").lower()


async def process_document_pipeline(
    file_content: bytes,
    original_name: str,
    user_id: str,
    customer_id: Optional[str],
    source_path: Optional[str],
    mime_type: Optional[str] = None,
    existing_doc_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    실제 문서 처리 파이프라인 (워커에서 호출)

    PIPELINE_ENGINE 환경변수로 처리 엔진을 전환:
    - "xpipe": xPipe Pipeline + InsuranceAdapter로 처리
    - "legacy": 기존 document_pipeline 코드로 처리 (기본값)

    Args:
        file_content: 파일 내용 (bytes)
        original_name: 원본 파일명
        user_id: 사용자 ID
        customer_id: 고객 ID (선택)
        source_path: 원본 경로 (선택)
        mime_type: MIME 타입 (선택)
        existing_doc_id: 기존 문서 ID (큐잉 모드에서 미리 생성된 문서)

    Returns:
        처리 결과 dict
    """
    engine = _get_pipeline_engine()
    if engine == "xpipe":
        try:
            return await _process_via_xpipe(
                file_content, original_name, user_id, customer_id,
                source_path, mime_type, existing_doc_id,
            )
        except Exception as e:
            logger.error(f"❌ xPipe 처리 실패: {e}", exc_info=True)
            # 에러 상태 DB 갱신은 _process_via_xpipe 내부에서 처리
            raise

    return await _process_via_legacy(
        file_content, original_name, user_id, customer_id,
        source_path, mime_type, existing_doc_id,
    )


async def _process_via_xpipe(
    file_content: bytes,
    original_name: str,
    user_id: str,
    customer_id: Optional[str],
    source_path: Optional[str],
    mime_type: Optional[str] = None,
    existing_doc_id: Optional[str] = None,
) -> Dict[str, Any]:
    """xPipe Pipeline으로 문서 처리

    xPipe의 Pipeline.run()을 사용하여 전체 파이프라인을 실행하고,
    결과를 AIMS MongoDB 스키마에 매핑한다.
    """
    import tempfile
    from xpipe.pipeline import Pipeline, PipelineDefinition, StageConfig
    from xpipe.stages.ingest import IngestStage
    from xpipe.stages.convert import ConvertStage
    from xpipe.stages.extract import ExtractStage
    from xpipe.stages.classify import ClassifyStage
    from xpipe.stages.detect_special import DetectSpecialStage
    from xpipe.stages.complete import CompleteStage

    logger.info(f"🚀 [xPipe] 문서 처리 시작: {original_name} (user={user_id})")

    # 1. MongoDB에 문서 생성 (기존 로직 재사용)
    files_collection = MongoService.get_collection("files")
    if existing_doc_id:
        doc_id = existing_doc_id
    else:
        doc = {
            "ownerId": user_id,
            "originalName": original_name,
            "status": "processing",
            "overallStatus": "uploading",
            "progressStage": "upload",
            "createdAt": datetime.utcnow(),
        }
        api_result = await create_file(_serialize_for_api(doc))
        doc_id = api_result.get("data", {}).get("insertedId", "")
        if not doc_id:
            raise Exception("파일 생성 실패 (Internal API)")

    # 2. 파일을 임시 경로에 저장
    # original_name이 '고객사/계약자/피보험자/파일.pdf' 형태의 경로를 포함할 수 있으므로
    # basename만 사용하여 중간 디렉토리 미생성으로 인한 FileNotFoundError 방지
    tmp_dir = tempfile.mkdtemp()
    tmp_path = os.path.join(tmp_dir, os.path.basename(original_name) or "upload.pdf")
    with open(tmp_path, "wb") as f:
        f.write(file_content)

    # 3. 파일을 영구 저장소에 복사
    saved_name, dest_path = await FileService.save_file(
        file_content, original_name, user_id, source_path
    )
    await update_file(doc_id, set_fields={"upload.saveName": saved_name, "upload.destPath": dest_path})

    # 고객 연결
    if customer_id:
        await _connect_document_to_customer(customer_id, doc_id, user_id)

    await _notify_progress(doc_id, user_id, 20, "upload", "파일 업로드 완료")

    # overallStatus: extracting (파일 저장 완료, 텍스트 추출 시작)
    await update_file(doc_id, set_fields=_serialize_for_api({
        "overallStatus": "extracting", "overallStatusUpdatedAt": datetime.utcnow()
    }))

    # 4. MIME 타입 추론
    import mimetypes as mt
    detected_mime = mime_type or mt.guess_type(original_name or "")[0] or "application/octet-stream"

    # 5. xPipe Pipeline 조립
    definition = PipelineDefinition(
        name="aims-xpipe",
        stages=[
            StageConfig(name="extract"),
            StageConfig(name="classify"),
            StageConfig(name="detect_special"),
            StageConfig(name="complete"),
        ],
    )
    pipeline = Pipeline(definition)
    pipeline.register_stage("extract", ExtractStage)
    pipeline.register_stage("classify", ClassifyStage)
    pipeline.register_stage("detect_special", DetectSpecialStage)
    pipeline.register_stage("complete", CompleteStage)

    # 6. 어댑터 연결
    from insurance.adapter import InsuranceDomainAdapter
    adapter = InsuranceDomainAdapter()
    classification_config = await adapter.get_classification_config()

    # API 키
    from config import get_settings
    settings = get_settings()

    # 변환 PDF 경로 조회 (HWP/PPT 등의 OCR fallback용)
    conv_doc = await query_file_one(
        {"_id": doc_id},
        {"upload.convPdfPath": 1}
    )
    conv_pdf_path = (conv_doc or {}).get("upload", {}).get("convPdfPath", "")

    context = {
        "document_id": doc_id,
        "file_path": dest_path,
        "filename": original_name,
        "original_name": original_name,
        "mime_type": detected_mime,
        "mode": "real",
        "models": {"llm": "gpt-4.1-mini", "ocr": "upstage", "embedding": "text-embedding-3-small"},
        "needs_conversion": is_convertible_mime(detected_mime),
        "converted_pdf_path": conv_pdf_path,  # 변환 PDF 경로 (OCR fallback용)
        "_domain_adapter": adapter,
        "_classify_config": {
            "system_prompt": classification_config.extra.get("system_prompt", ""),
            "user_prompt": classification_config.prompt_template,
            "categories": [c.code for c in classification_config.categories],
            "valid_types": classification_config.valid_types,
        },
        "_api_keys": {
            "openai": settings.OPENAI_API_KEY,
            "upstage": settings.UPSTAGE_API_KEY,
        },
    }

    await _notify_progress(doc_id, user_id, 40, "processing", "텍스트 추출 중")

    # 7. 파이프라인 실행
    try:
        result = await pipeline.run(context)
    except Exception as e:
        logger.error(f"❌ [xPipe] 파이프라인 실행 실패: {original_name} doc_id={doc_id} — {e}", exc_info=True)
        await update_file(doc_id, set_fields={
            "status": "failed",
            "overallStatus": "error",
            "error.statusCode": 500,
            "error.statusMessage": str(e),
            "error.timestamp": datetime.utcnow().isoformat(),
        })
        raise

    # ── 텍스트 추출 불가 파일 처리 (에러 아님) ──
    # ExtractStage에서 unsupported_format 또는 text_extraction_failed 플래그가 설정된 경우
    if result.get("text_extraction_failed"):
        skip_reason = (
            result.get("_extraction_skip_reason")
            or ("unsupported_format" if result.get("unsupported_format") else "no_text_extractable")
        )

        # 손상/암호화 PDF: 에러 상태로 처리 (보관 완료가 아님)
        if skip_reason == "corrupted_pdf":
            user_message = result.get(
                "_user_error_message",
                "파일이 손상되어 처리할 수 없습니다."
            )
            logger.warning(
                f"[xPipe] 손상 PDF 감지 — 에러 처리: doc_id={doc_id}, "
                f"file={original_name}"
            )
            await update_file(doc_id, set_fields=_serialize_for_api({
                "status": "failed",
                "overallStatus": "error",
                "overallStatusUpdatedAt": datetime.utcnow(),
                "error.statusCode": 422,
                "error.statusMessage": user_message,
                "error.timestamp": datetime.utcnow().isoformat(),
                "processingSkipReason": skip_reason,
                "meta.mime": detected_mime,
                "meta.filename": original_name,
                "meta.extension": os.path.splitext(original_name or "")[1].lower(),
                "meta.size_bytes": len(file_content) if file_content else 0,
                "upload.originalName": original_name,
                "progressStage": "error",
                "progress": 0,
            }))
            await _notify_progress(doc_id, user_id, -1, "error", user_message)
            await _notify_document_complete(doc_id, user_id)

            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

            return {
                "result": "error",
                "doc_id": doc_id,
                "status": "failed",
                "overallStatus": "error",
                "engine": "xpipe",
                "error": user_message,
            }

        # 변환 대상 파일(HWP/DOC/PPT/XLS 등)은 PDF 변환 워커가 처리해야 하므로
        # conversion_pending 상태로 설정 (조기 completed 방지)
        if is_convertible_mime(detected_mime):
            logger.info(
                f"[xPipe] 텍스트 추출 불가 — 변환 대기: doc_id={doc_id}, "
                f"file={original_name}, reason={skip_reason}, mime={detected_mime}"
            )
            await update_file(doc_id, set_fields=_serialize_for_api({
                "status": "converting",
                "overallStatus": "conversion_pending",
                "overallStatusUpdatedAt": datetime.utcnow(),
                "meta.mime": detected_mime,
                "meta.filename": original_name,
                "meta.extension": os.path.splitext(original_name or "")[1].lower(),
                "meta.size_bytes": len(file_content) if file_content else 0,
                "upload.originalName": original_name,
                "progressStage": "conversion_queued",
                "progress": 60,
            }), unset_fields={"error": "", "processingSkipReason": ""})
            await _notify_progress(doc_id, user_id, 60, "conversion_queued", "PDF 변환 대기 중")

            # 임시 파일 정리
            try:
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

            return {
                "result": "success",
                "doc_id": doc_id,
                "status": "converting",
                "overallStatus": "conversion_pending",
                "engine": "xpipe",
                "mime": detected_mime,
                "filename": original_name,
            }

        # 비변환 대상(ZIP/AI/기타 보관 파일) → 보관 완료 처리
        # 보관 파일도 파일명 기반 분류 시도 (document_type이 None이 되는 것 방지)
        archive_doc_type = "unclassifiable"
        archive_confidence = 0.0
        archive_summary = ""
        archive_title = ""
        if original_name and OpenAIService._is_meaningful_filename(original_name):
            classify_text_for_archive = OpenAIService._sanitize_filename_for_prompt(original_name)
            try:
                sr = await OpenAIService.summarize_text(
                    classify_text_for_archive,
                    owner_id=user_id,
                    document_id=doc_id,
                    filename=original_name,
                    classification_config=classification_config,
                )
                archive_doc_type = sr.get("document_type") or "unclassifiable"
                archive_confidence = sr.get("confidence", 0.0)
                # 파일명 기반 분류에서는 summary/title을 저장하지 않음
                # summary는 full_text의 AI 요약이므로, full_text 없이 생성하면 안 됨
                logger.info(
                    f"[xPipe] 보관 파일 파일명 분류 완료: doc_id={doc_id}, "
                    f"type={archive_doc_type}, file={original_name}"
                )
            except Exception as archive_classify_err:
                logger.warning(
                    f"[xPipe] 보관 파일 파일명 분류 실패 (무시): doc_id={doc_id}, "
                    f"error={archive_classify_err}"
                )

        logger.info(
            f"[xPipe] 텍스트 추출 불가 — 보관 처리: doc_id={doc_id}, "
            f"file={original_name}, reason={skip_reason}, document_type={archive_doc_type}"
        )
        await update_file(doc_id, set_fields=_serialize_for_api({
            "status": "completed",
            "overallStatus": "completed",
            "overallStatusUpdatedAt": datetime.utcnow(),
            "processingSkipReason": skip_reason,
            "document_type": archive_doc_type,
            "document_type_auto": True,
            "meta.mime": detected_mime,
            "meta.meta_status": "done",
            "meta.confidence": archive_confidence,
            "meta.summary": archive_summary,
            "meta.title": archive_title,
            "meta.filename": original_name,
            "meta.extension": os.path.splitext(original_name or "")[1].lower(),
            "meta.size_bytes": len(file_content) if file_content else 0,
            "upload.originalName": original_name,
            "progressStage": "complete",
            "progress": 100,
        }), unset_fields={"error": ""})
        await _notify_progress(doc_id, user_id, 100, "complete", "처리 완료 (보관)")
        await _notify_document_complete(doc_id, user_id)

        # 임시 파일 정리
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

        return {
            "result": "success",
            "doc_id": doc_id,
            "status": "completed",
            "processingSkipReason": skip_reason,
            "engine": "xpipe",
            "mime": detected_mime,
            "filename": original_name,
        }

    # overallStatus: classifying (텍스트 추출 완료, AI 분류 중)
    await update_file(doc_id, set_fields=_serialize_for_api({
        "overallStatus": "classifying", "overallStatusUpdatedAt": datetime.utcnow()
    }))

    # 8. 결과를 AIMS MongoDB 스키마에 매핑
    extracted_text = result.get("extracted_text", result.get("text", ""))
    doc_type = result.get("document_type")
    confidence = result.get("classification_confidence", 0.0)
    detections = result.get("detections", [])

    # AR/CRS 감지 시 document_type 덮어쓰기 (ClassifyStage 결과보다 우선)
    for det in detections:
        det_type = det.get("doc_type") if isinstance(det, dict) else getattr(det, "doc_type", None)
        if det_type in ("annual_report", "customer_review"):
            doc_type = det_type
            logger.info(f"[xPipe] document_type 오버라이드: {result.get('document_type')} → {det_type}")
            break

    await _notify_progress(doc_id, user_id, 70, "classifying", "AI 분류 완료")

    # 8-1. AI 요약/제목 생성 (텍스트 → 파일명 fallback)
    summary_result = {}
    classify_text = ""
    used_filename_fallback = False
    if extracted_text and len(extracted_text.strip()) >= 10:
        classify_text = extracted_text
    elif original_name and OpenAIService._is_meaningful_filename(original_name):
        classify_text = OpenAIService._sanitize_filename_for_prompt(original_name)
        used_filename_fallback = True
        logger.info(f"[xPipe] full_text 부족, 파일명 fallback 분류: {original_name}")

    if classify_text:
        try:
            summary_result = await OpenAIService.summarize_text(
                classify_text,
                owner_id=user_id,
                document_id=doc_id,
                filename=original_name,
                classification_config=classification_config,
            )
            logger.info(f"[xPipe] AI 요약 생성 완료: {doc_id}")
        except Exception as summary_err:
            logger.warning(f"[xPipe] AI 요약 생성 실패 (무시): {doc_id}, error={summary_err}")
    elif not extracted_text or len(extracted_text.strip()) < 10:
        # 모든 분류 정보 부실 → unclassifiable
        summary_result = {"document_type": "unclassifiable", "confidence": 0.0}
        logger.info(f"[xPipe] 분류 정보 부실 → unclassifiable: {doc_id}")

    # 파일명 fallback인 경우 summary/title은 저장하지 않음
    # summary는 full_text의 AI 요약이므로, full_text 없이 생성하면 안 됨
    if used_filename_fallback:
        xpipe_summary = ""
        xpipe_title = ""
    else:
        xpipe_summary = summary_result.get("summary", "") if summary_result else ""
        xpipe_title = summary_result.get("title", "") if summary_result else ""

    # doc_type이 없으면 summary_result의 document_type으로 fallback
    if not doc_type and summary_result:
        doc_type = summary_result.get("document_type")
        if doc_type:
            confidence = summary_result.get("confidence", 0.0)

    # Meta 업데이트
    # 파일 메타데이터
    file_size = len(file_content) if file_content else 0
    if not file_size and dest_path:
        try:
            file_size = os.path.getsize(dest_path)
        except OSError:
            file_size = 0
    file_ext = os.path.splitext(original_name or "")[1].lower()

    meta_update = {
        "meta.full_text": extracted_text,
        "meta.length": len(extracted_text) if extracted_text else 0,
        "meta.mime": detected_mime,
        "meta.meta_status": "done",
        "meta.confidence": confidence or 0.0,
        "meta.size_bytes": file_size,
        "meta.summary": xpipe_summary,
        "meta.title": xpipe_title,
        "meta.filename": original_name,
        "meta.extension": file_ext,
        "document_type": doc_type or "general",
        "document_type_auto": True,
        "status": "completed",
        "overallStatus": "embed_pending",
        "overallStatusUpdatedAt": datetime.utcnow(),
        "progressStage": "complete",
        "progress": 90,
        "upload.originalName": original_name,
    }

    # xPipe extract 스테이지에서 OCR이 사용된 경우 ocr.* 필드를 DB에 기록
    # — 프론트엔드 뱃지 로직이 ocr.status === 'done'을 참조하므로 필수
    extract_data = result.get("stage_data", {}).get("extract", {})
    extract_output = extract_data.get("output", {})
    extract_method = extract_output.get("method", "")
    if "ocr" in extract_method:
        meta_update["ocr.status"] = "done"
        meta_update["ocr.full_text"] = extracted_text
        meta_update["ocr.done_at"] = datetime.utcnow().isoformat()
        meta_update["ocr.page_count"] = result.get("_ocr_pages", 1)
        # OCR confidence: ExtractStage가 provider로부터 받은 값 사용
        meta_update["ocr.confidence"] = extract_output.get("ocr_confidence", 0.0)

    await update_file(doc_id, set_fields=_serialize_for_api(meta_update), unset_fields={"error": ""})

    # 9. AR/CRS 감지 결과 처리 (HookResult)
    for det in detections:
        det_type = det.get("doc_type") if isinstance(det, dict) else getattr(det, "doc_type", None)
        if det_type in ("annual_report", "customer_review"):
            # resolve_entity + on_stage_complete + HookResult 실행
            from xpipe.adapter import Detection
            if isinstance(det, dict):
                detection_obj = Detection(
                    doc_type=det.get("doc_type", ""),
                    confidence=det.get("confidence", 1.0),
                    metadata=det.get("metadata", {}),
                )
            else:
                detection_obj = det

            related_customer_id = None
            try:
                entity_result = await adapter.resolve_entity(detection_obj, user_id)
                related_customer_id = entity_result.get("customer_id") if entity_result else None
            except Exception:
                pass

            display_name = ""
            try:
                display_name = await adapter.generate_display_name(
                    {"originalName": original_name}, detection_obj
                )
            except Exception:
                pass

            stage_name = "ar_detected" if det_type == "annual_report" else "crs_detected"
            hook_context = {
                "doc_id": doc_id,
                "detection": detection_obj,
                "related_customer_id": related_customer_id,
                "display_name": display_name,
                "user_id": user_id,
            }
            hook_results = await adapter.on_stage_complete(stage_name, {}, hook_context)

            # PipelineContext 호환 객체 생성 (HookResult 실행용)
            class _MinimalCtx:
                pass
            mini_ctx = _MinimalCtx()
            mini_ctx.doc_id = doc_id
            mini_ctx.files_collection = files_collection
            await _execute_hook_results(mini_ctx, hook_results)

    # 10. AR/CRS가 아닌 일반 문서의 displayName 자동 생성
    is_ar_or_crs = any(
        (det.get("doc_type") if isinstance(det, dict) else getattr(det, "doc_type", None))
        in ("annual_report", "customer_review")
        for det in detections
    )
    if not is_ar_or_crs:
        existing_doc = await query_file_one(
            {"_id": doc_id},
            {"displayName": 1}
        )
        if existing_doc and not existing_doc.get("displayName"):
            await _generate_display_name(
                doc_id=doc_id,
                text=extracted_text,
                original_name=original_name,
                user_id=user_id,
                summary_result=summary_result,
                files_collection=files_collection
            )

    # 11. 비PDF 파일의 PDF 변환 큐 등록 (브라우저 미리보기용)
    # PDF/이미지는 브라우저에서 직접 렌더링 가능 → not_required
    # HWP, Office 문서 등은 PDF 변환 필요 → pending + 큐 등록
    await _trigger_pdf_conversion_for_xpipe(
        doc_id, dest_path, original_name, detected_mime, files_collection
    )

    # 11. 완료 알림
    await _notify_progress(doc_id, user_id, 100, "complete", "처리 완료")
    await _notify_document_complete(doc_id, user_id)

    # 임시 파일 정리
    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass

    logger.info(f"✅ [xPipe] 문서 처리 완료: doc_id={doc_id}, type={doc_type}")

    return {
        "result": "success",
        "doc_id": doc_id,
        "document_type": doc_type,
        "engine": "xpipe",
    }


# _is_convertible_mime 삭제 — xpipe.stages.convert.is_convertible_mime 사용
# (파일 상단에서 services.pdf_conversion_text_service 경유로 import 됨)


def _is_preview_native(mime: str, filename: str) -> bool:
    """브라우저에서 직접 렌더링 가능한 형식인지 판단 (PDF, 이미지)"""
    if mime == "application/pdf":
        return True
    if mime.startswith("image/"):
        return True
    # 확장자 기반 보조 판단 (MIME 탐지 실패 대비)
    ext = os.path.splitext(filename or "")[1].lower()
    return ext in (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tif", ".tiff")


async def _trigger_pdf_conversion_for_xpipe(
    doc_id: str,
    dest_path: str,
    original_name: str,
    detected_mime: str,
    files_collection,
) -> None:
    """xPipe 처리 완료 후 비PDF 파일의 PDF 변환 큐 등록 (브라우저 미리보기용)

    PDF/이미지는 변환 불필요(not_required), HWP/Office 등은 큐 등록(pending).
    변환 큐 등록 실패가 전체 파이프라인을 중단시키지 않도록 격리.
    """
    try:
        # PDF, 이미지 → 브라우저에서 직접 렌더링 가능
        if _is_preview_native(detected_mime, original_name):
            await update_file(doc_id, set_fields={"upload.conversion_status": "not_required"})
            return

        # 변환 가능한 포맷인지 확인 (HWP, DOC, XLSX, PPTX 등)
        if not is_convertible_mime(detected_mime):
            # 지원하지 않는 형식 → not_required
            await update_file(doc_id, set_fields={"upload.conversion_status": "not_required"})
            return

        # 이미 변환된 PDF가 있으면 큐 등록 스킵 (재처리 시)
        existing = await query_file_one(
            {"_id": doc_id},
            {"upload.convPdfPath": 1}
        )
        existing_conv = (existing or {}).get("upload", {}).get("convPdfPath", "")
        if existing_conv and os.path.exists(existing_conv):
            await update_file(doc_id, set_fields={"upload.conversion_status": "completed"})
            logger.info(f"[xPipe] PDF 변환 이미 완료, 큐 스킵: {doc_id} ({existing_conv})")
            return

        # 변환 대상 → pending 상태 설정 + 큐 등록
        await update_file(doc_id, set_fields={"upload.conversion_status": "pending"})

        from services.pdf_conversion_queue_service import PdfConversionQueueService
        await PdfConversionQueueService.enqueue(
            job_type="preview_pdf",
            input_path=dest_path,
            original_name=os.path.basename(original_name or ""),
            caller="xpipe_pipeline",
            document_id=doc_id,
        )
        logger.info(f"[xPipe] PDF 변환 큐 등록: {doc_id} ({original_name})")

    except Exception as e:
        # 큐 등록 실패가 문서 처리 결과에 영향을 주지 않도록 격리
        # pending hang 방지: 실패 시 failed로 설정
        logger.error(f"[xPipe] PDF 변환 큐 등록 실패: {doc_id} - {e}", exc_info=True)
        try:
            await update_file(doc_id, set_fields={
                "upload.conversion_status": "failed",
                "upload.conversion_error": str(e),
            })
        except Exception:
            pass


async def _process_via_legacy(
    file_content: bytes,
    original_name: str,
    user_id: str,
    customer_id: Optional[str],
    source_path: Optional[str],
    mime_type: Optional[str] = None,
    existing_doc_id: Optional[str] = None,
) -> Dict[str, Any]:
    """기존 document_pipeline 코드로 처리 (legacy 경로)"""
    # 메트릭 기록 시작
    from workers.pipeline_metrics import pipeline_metrics
    metric_record = pipeline_metrics.record_start(
        doc_id=existing_doc_id or "pending",
        mime_type=mime_type or "",
        file_size=len(file_content),
    )

    ctx = PipelineContext(
        file_content=file_content,
        original_name=original_name,
        user_id=user_id,
        customer_id=customer_id,
        source_path=source_path,
        mime_type=mime_type,
        existing_doc_id=existing_doc_id,
        doc_id=existing_doc_id,
        metric_record=metric_record,
    )

    try:
        ctx.files_collection = MongoService.get_collection("files")

        # Step 1: Create document in MongoDB (기존 문서가 없는 경우에만)
        await _step_create_or_update_document(ctx)

        # Step 2: Save file to disk
        await _step_save_file(ctx)

        # Connect document to customer if customer_id provided
        if customer_id:
            await _connect_document_to_customer(customer_id, ctx.doc_id, user_id)
            ctx.customer_connected = True

        # Progress: 20% - Upload complete
        await _notify_progress(ctx.doc_id, user_id, 20, "upload", "파일 업로드 완료")

        # Step 3: Extract metadata (사전 추출된 텍스트가 있으면 재추출 스킵)
        meta_error_response = await _step_extract_metadata(ctx)
        if meta_error_response is not None:
            return meta_error_response

        # AI 요약 생성 + 분류
        # overallStatus: classifying (AI 분류 단계)
        await update_file(ctx.doc_id, set_fields=_serialize_for_api({
            "overallStatus": "classifying", "overallStatusUpdatedAt": datetime.utcnow()
        }))
        await _step_ai_summarize(ctx)

        # 메타데이터 DB 업데이트 (중복 해시 처리 + DuplicateKeyError 포함)
        await _step_update_meta_to_db(ctx)

        # AR/CRS 자동 감지
        await _step_detect_ar_crs(ctx)

        # Step 4: MIME 타입별 분기 처리
        return await _step_route_by_mime(ctx)

    except Exception as e:
        logger.error(f"Error in process_document_pipeline: {e}", exc_info=True)

        # 메트릭: 에러 기록
        await pipeline_metrics.record_error(metric_record, type(e).__name__)

        # Save error to MongoDB if we have a doc_id
        # cleanup_done=True면 이미 DuplicateKeyError 핸들러에서 레코드가 삭제되었으므로 스킵
        if ctx.doc_id and not ctx.cleanup_done:
            try:
                await update_file(ctx.doc_id, set_fields={
                    "status": "failed",
                    "overallStatus": "error",
                    "error.statusCode": 500,
                    "error.statusMessage": str(e),
                    "error.timestamp": datetime.utcnow().isoformat()
                })
            except Exception as save_error:
                logger.error(f"Failed to save error to MongoDB: {save_error}")

            # 고객 연결이 완료된 상태에서 에러 발생 시 고아 데이터 방지를 위해 cleanup
            if ctx.customer_connected:
                try:
                    await _cleanup_failed_document(ctx.doc_id, customer_id, ctx.dest_path)
                except Exception as cleanup_error:
                    logger.error(f"Failed to cleanup after error: {cleanup_error}")

        raise

"""
Customer Review Background Parsing Routes

문서 업로드 완료 후 자동으로 CR 파싱을 트리거하는 백그라운드 처리 API
(AR background.py 패턴 기반)
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import requests
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from services.cr_detector import extract_cr_metadata_from_first_page
from services.cr_parser import parse_customer_review
from services.cr_parser_table import parse_customer_review_table
from services.db_writer import _serialize_for_json, save_customer_review
from system_logger import send_error_log

from internal_api import (
    check_customer_ownership,
    get_customer,
    has_report,
    query_file_one,
    query_files,
    replace_customer_reviews,
    update_file_parsing_status,
)

# aims_api Internal API 설정
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://100.110.215.65:3010")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

logger = logging.getLogger(__name__)

router = APIRouter()


def _internal_headers():
    """Internal API 요청 헤더"""
    return {"x-api-key": INTERNAL_API_KEY, "Content-Type": "application/json"}


def get_cr_parser_setting() -> str:
    """
    aims_api Internal API에서 CR 파서 설정 조회 (동기 버전)
    기본값: 'regex'
    """
    try:
        resp = requests.get(
            f"{AIMS_API_URL}/api/internal/settings/ai-models",
            headers=_internal_headers(),
            timeout=5.0
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success") and data.get("data"):
                parser = data["data"].get("customerReview", {}).get("parser", "regex")
                logger.info(f"CR 파서 설정 조회 성공: {parser}")
                return parser
    except Exception as e:
        logger.warning(f"CR 파서 설정 조회 실패, 기본값 사용: {e}")
    return "regex"


class TriggerCRParsingRequest(BaseModel):
    """CR 백그라운드 파싱 트리거 요청"""
    customer_id: Optional[str] = None  # 특정 고객만 파싱 (선택)
    file_id: Optional[str] = None  # 특정 파일만 파싱 (선택)


class TriggerCRParsingResponse(BaseModel):
    """CR 백그라운드 파싱 트리거 응답"""
    success: bool
    message: str
    processing_count: int = 0
    skipped_count: int = 0


class RetryCRParsingRequest(BaseModel):
    """CR 파싱 재시도 요청"""
    file_id: str  # 재시도할 파일 ID


class RetryCRParsingResponse(BaseModel):
    """CR 파싱 재시도 응답"""
    success: bool
    message: str


def parse_single_cr_document(db, file_id: str, customer_id: str) -> dict:
    """
    단일 CR 문서를 파싱하는 함수

    Args:
        db: MongoDB database 객체
        file_id: 문서 ID (str)
        customer_id: 고객 ID (str)

    Returns:
        dict: {"success": bool, "message": str, "error": str (optional)}
    """
    try:
        # 1. 문서 조회 (Internal API 경유)
        doc = query_file_one({"_id": file_id})

        if not doc:
            return {"success": False, "error": f"문서를 찾을 수 없음: {file_id}"}

        if not doc.get("is_customer_review"):
            return {"success": False, "error": "CR 문서가 아님"}

        # 2. 파일 경로 확인
        file_path = doc.get("upload", {}).get("destPath")
        if not file_path:
            error_msg = "파일 경로 없음"
            update_file_parsing_status(str(doc["_id"]), "cr", "error", error=error_msg)
            return {"success": False, "error": error_msg}

        if not os.path.exists(file_path):
            error_msg = f"파일이 존재하지 않음: {file_path}"
            update_file_parsing_status(str(doc["_id"]), "cr", "error", error=error_msg)
            return {"success": False, "error": error_msg}

        # 2.5 중복 파싱 방지: 같은 source_file_id로 이미 CR이 있는지 확인 (Internal API 경유)
        if has_report(customer_id, file_id, "cr"):
            # 이미 파싱됨 → 상품명/displayName 누락 시 보정
            cr_meta = doc.get("cr_metadata") or {}
            needs_repair = not cr_meta.get("product_name")
            if needs_repair and file_path and os.path.exists(file_path):
                logger.info(f"🔧 [CR Parsing] 상품명 누락 보정: file_id={file_id}")
                repaired = extract_cr_metadata_from_first_page(file_path)
                repair_update = {"cr_parsing_status": "completed"}
                if repaired.get("product_name"):
                    cr_meta.update(repaired)
                    repair_update["cr_metadata"] = cr_meta
                    # displayName 보정
                    contractor = cr_meta.get("contractor_name", "")
                    product = repaired["product_name"]
                    issue = cr_meta.get("issue_date", "")
                    if contractor and issue:
                        import re as _re
                        safe_product = _re.sub(r'[\\/:*?"<>|]', '', product).strip()
                        if safe_product:
                            repair_update["displayName"] = f"{contractor}_CRS_{safe_product}_{issue}.pdf"
                    # customers.customer_reviews 상품명도 보정 (Internal API 경유: read-modify-write)
                    try:
                        customer_doc = get_customer(customer_id)
                        if customer_doc and customer_doc.get("customer_reviews"):
                            reviews = customer_doc["customer_reviews"]
                            file_oid = ObjectId(file_id)
                            for review in reviews:
                                if review.get("source_file_id") == file_oid:
                                    review["product_name"] = repaired["product_name"]
                                    break
                            replace_customer_reviews(customer_id, _serialize_for_json(reviews))
                    except Exception as repair_err:
                        logger.warning(f"⚠️ [CR Parsing] 상품명 보정 실패 (무시): {repair_err}")
                    logger.info(f"✅ [CR Parsing] 상품명 보정 완료: {repaired['product_name']}")
                api_kwargs = {}
                if "displayName" in repair_update:
                    api_kwargs["displayName"] = repair_update["displayName"]
                if "cr_metadata" in repair_update:
                    api_kwargs["cr_metadata"] = repair_update["cr_metadata"]
                update_file_parsing_status(str(doc["_id"]), "cr", "completed", **api_kwargs)
            else:
                update_file_parsing_status(str(doc["_id"]), "cr", "completed")
            return {"success": True, "message": "이미 파싱 완료됨", "skipped": True}

        # 3. CR 파서 설정 조회 및 파싱 실행
        parser_type = get_cr_parser_setting()
        logger.info(f"🔍 [CR Parsing] 파싱 시작: {file_path} (파서: {parser_type})")

        if parser_type == "pdfplumber_table":
            # 테이블 기반 일반화 파서 (pdfplumber)
            result = parse_customer_review_table(file_path)
        else:
            # 기존 정규식 파서 (regex)
            result = parse_customer_review(file_path)

        if "error" in result:
            logger.error(f"❌ [CR Parsing] 파싱 실패: {result['error']}")
            update_file_parsing_status(str(doc["_id"]), "cr", "error", error=result["error"])
            return {"success": False, "error": result["error"]}

        # 4. 1페이지 메타데이터 추출 (상품명, 발행일, 계약자, 피보험자 등)
        metadata = doc.get("cr_metadata", {})
        # 메타데이터가 없거나 핵심 필드가 누락된 경우 재추출
        needs_reextract = (
            not metadata or
            not metadata.get("death_beneficiary") or
            not metadata.get("fsr_name")
        )
        if needs_reextract:
            logger.info(f"📄 [CR Parsing] 메타데이터 재추출 필요: {file_path}")
            metadata = extract_cr_metadata_from_first_page(file_path)

        # 📎 파일명에서 날짜/상품명/증권번호만 추출 (🔴 고객명은 파일명에서 추출 절대 금지!)
        original_name = doc.get("upload", {}).get("originalName", "")
        from utils.filename_parser import parse_crs_filename
        fn_meta = parse_crs_filename(original_name)
        if fn_meta:
            if fn_meta.get("issue_date"):
                metadata["issue_date"] = fn_meta["issue_date"]
            if fn_meta.get("product_name"):
                metadata["product_name"] = fn_meta["product_name"]
            if fn_meta.get("policy_number"):
                metadata["policy_number"] = fn_meta["policy_number"]
            logger.info(f"📎 [CR Parsing] 파일명에서 날짜/상품/증권번호 적용: issue_date={fn_meta.get('issue_date')}")

            # 파일명의 policy_number를 contract_info에도 반영
            if fn_meta.get("policy_number"):
                if "contract_info" not in result:
                    result["contract_info"] = {}
                if not result["contract_info"].get("policy_number"):
                    result["contract_info"]["policy_number"] = fn_meta["policy_number"]

        # 5. MongoDB 저장
        logger.info("💾 [CR Parsing] DB 저장 중...")

        save_result = save_customer_review(
            db=db,
            customer_id=customer_id,
            report_data=result,
            metadata=metadata,
            source_file_id=file_id
        )

        if save_result["success"]:
            logger.info(f"✅ [CR Parsing] 파싱 완료: 증권번호={result.get('contract_info', {}).get('policy_number', 'N/A')}")
            cr_update = {
                "cr_parsing_status": "completed",
                "cr_parsing_completed_at": datetime.now(timezone.utc),
            }

            # 📄 CRS displayName 자동 생성/보정
            contractor = metadata.get("contractor_name", "")
            product = metadata.get("product_name", "")
            issue = metadata.get("issue_date", "")
            if contractor and issue:
                import re as _re
                safe_product = _re.sub(r'[\\/:*?"<>|]', '', product).strip() if product else ""
                if safe_product:
                    new_display = f"{contractor}_CRS_{safe_product}_{issue}.pdf"
                else:
                    new_display = f"{contractor}_CRS_{issue}.pdf"
                if doc.get("displayName") != new_display:
                    cr_update["displayName"] = new_display
                    logger.info(f"📄 [CR Parsing] displayName 생성: {new_display}")

            # 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
            # overallStatus는 주 파이프라인(doc_prep_main, full_pipeline)만 관리
            # CRS 스캐너는 cr_parsing_status만 관리
            api_kwargs = {}
            if "displayName" in cr_update:
                api_kwargs["displayName"] = cr_update["displayName"]
            completed_at = cr_update.get("cr_parsing_completed_at")
            if isinstance(completed_at, datetime):
                api_kwargs["completed_at"] = completed_at.isoformat()
            update_file_parsing_status(str(doc["_id"]), "cr", "completed", **api_kwargs)
            return {"success": True, "message": "파싱 완료"}
        else:
            error_msg = save_result.get("message", "DB 저장 실패")
            logger.error(f"❌ [CR Parsing] DB 저장 실패: {error_msg}")
            update_file_parsing_status(str(doc["_id"]), "cr", "error", error=error_msg)
            return {"success": False, "error": error_msg}

    except Exception as e:
        logger.error(f"❌ [CR Parsing] 예외 발생: {e}", exc_info=True)
        send_error_log("annual_report_api", f"CR Parsing 예외 발생: {e}", e)
        try:
            update_file_parsing_status(str(file_id), "cr", "error", error=str(e))
        except Exception as update_error:
            logger.error(f"❌ [CR Parsing] 상태 업데이트 실패: {update_error}")
        return {"success": False, "error": str(e)}


@router.post("/trigger-parsing", response_model=TriggerCRParsingResponse)
async def trigger_cr_parsing(
    request: TriggerCRParsingRequest,
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 CR 문서들을 즉시 파싱

    Args:
        request: TriggerCRParsingRequest (customer_id, file_id)
        user_id: 설계사 userId (x-user-id 헤더)
    """
    try:
        # userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # customer_id 유효성 및 소유권 검증 (제공된 경우만)
        if request.customer_id:
            try:
                customer_obj_id = ObjectId(request.customer_id)
            except InvalidId:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid customer_id format"
                )

            # customer 소유권 검증 (Internal API 경유)
            if not check_customer_ownership(str(customer_obj_id), user_id):
                raise HTTPException(
                    status_code=404,
                    detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
                )

        processing_count = 0
        skipped_count = 0

        if request.file_id:
            # 특정 파일만 파싱
            try:
                file_obj_id = ObjectId(request.file_id)
                file_doc = query_file_one({"_id": request.file_id})
                if file_doc:
                    # 이미 완료된 CR은 건너뜀
                    if file_doc.get("cr_parsing_status") == "completed":
                        logger.info(f"⏭️ [CR Trigger] 이미 완료된 CR 건너뛰기: file_id={request.file_id}")
                        skipped_count = 1
                    else:
                        customer_id = file_doc.get("customerId") or (ObjectId(request.customer_id) if request.customer_id else None)
                        if customer_id:
                            # 상태를 processing으로 업데이트
                            update_file_parsing_status(str(file_obj_id), "cr", "processing")
                            # 즉시 파싱 실행
                            result = parse_single_cr_document(db, str(file_obj_id), str(customer_id))
                            if result.get("success"):
                                processing_count = 1
                            else:
                                logger.warning(f"CR 파싱 실패: {result.get('error')}")
            except InvalidId:
                pass

        elif request.customer_id:
            # 해당 고객의 pending CR 문서들 파싱 (Internal API 경유)
            pending_docs = query_files({
                "customerId": request.customer_id,
                "is_customer_review": True,
                "cr_parsing_status": {"$in": ["pending", None]}
            }, limit=20)

            for doc in pending_docs:
                # 상태를 processing으로 업데이트
                update_file_parsing_status(str(doc["_id"]), "cr", "processing")
                # 즉시 파싱 실행
                result = parse_single_cr_document(db, str(doc["_id"]), request.customer_id)
                if result.get("success"):
                    if result.get("skipped"):
                        skipped_count += 1
                    else:
                        processing_count += 1
                else:
                    skipped_count += 1

        logger.info(f"✅ [CR Trigger] 완료: 처리={processing_count}, 건너뜀={skipped_count}")

        return TriggerCRParsingResponse(
            success=True,
            message=f"CR 파싱 완료: {processing_count}건 처리, {skipped_count}건 건너뜀",
            processing_count=processing_count,
            skipped_count=skipped_count
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [CR Trigger] 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"CR Trigger Parsing 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.post("/retry-parsing", response_model=RetryCRParsingResponse)
async def retry_cr_parsing(
    request: RetryCRParsingRequest,
    user_id: str = Header(None, alias="x-user-id")
):
    """
    파싱 실패한 CR 문서를 재시도

    Args:
        request: RetryCRParsingRequest (file_id)
        user_id: 설계사 userId (x-user-id 헤더)
    """
    try:
        # userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # file_id 유효성 검증
        try:
            file_obj_id = ObjectId(request.file_id)
        except InvalidId:
            raise HTTPException(
                status_code=400,
                detail="Invalid file_id format"
            )

        # 파일 조회 (Internal API 경유)
        file_doc = query_file_one({"_id": str(file_obj_id)})

        if not file_doc:
            raise HTTPException(
                status_code=404,
                detail="파일을 찾을 수 없습니다"
            )

        # CR 문서인지 확인
        if not file_doc.get("is_customer_review"):
            raise HTTPException(
                status_code=400,
                detail="CR 문서가 아닙니다"
            )

        # 현재 상태 확인
        current_status = file_doc.get("cr_parsing_status")
        if current_status == "processing":
            raise HTTPException(
                status_code=400,
                detail="이미 파싱 진행 중입니다"
            )

        if current_status == "completed":
            raise HTTPException(
                status_code=400,
                detail="이미 파싱이 완료된 문서입니다"
            )

        # 소유권 검증 (Internal API 경유)
        customer_id = file_doc.get("customerId")
        if customer_id:
            if not check_customer_ownership(str(customer_id), user_id):
                raise HTTPException(
                    status_code=403,
                    detail="파일에 접근 권한이 없습니다"
                )

        # 상태 초기화 후 즉시 파싱
        update_file_parsing_status(
            str(file_obj_id), "cr", "processing",
            error=None,
            extra_fields={"cr_parsing_retry_at": datetime.now(timezone.utc).isoformat()}
        )

        logger.info(f"🔄 [CR Retry] 파싱 재시도: file_id={request.file_id}")

        # 즉시 파싱 실행
        result = parse_single_cr_document(db, request.file_id, str(customer_id))

        if result.get("success"):
            return RetryCRParsingResponse(
                success=True,
                message="CR 파싱 재시도 완료"
            )
        else:
            return RetryCRParsingResponse(
                success=False,
                message=f"CR 파싱 실패: {result.get('error', '알 수 없는 오류')}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [CR Retry] 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"CR Retry Parsing 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

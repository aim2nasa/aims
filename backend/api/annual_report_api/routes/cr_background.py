"""
Customer Review Background Parsing Routes

문서 업로드 완료 후 자동으로 CR 파싱을 트리거하는 백그라운드 처리 API
(AR background.py 패턴 기반)
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from bson import ObjectId
from bson.errors import InvalidId

from services.cr_detector import extract_cr_metadata_from_first_page
from services.cr_parser import parse_customer_review
from services.db_writer import save_customer_review
from system_logger import send_error_log

logger = logging.getLogger(__name__)

router = APIRouter()


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
        # 1. 문서 조회
        doc = db["files"].find_one({"_id": ObjectId(file_id)})

        if not doc:
            return {"success": False, "error": f"문서를 찾을 수 없음: {file_id}"}

        if not doc.get("is_customer_review"):
            return {"success": False, "error": "CR 문서가 아님"}

        # 2. 파일 경로 확인
        file_path = doc.get("upload", {}).get("destPath")
        if not file_path:
            error_msg = "파일 경로 없음"
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "cr_parsing_status": "error",
                    "cr_parsing_error": error_msg
                }}
            )
            return {"success": False, "error": error_msg}

        import os
        if not os.path.exists(file_path):
            error_msg = f"파일이 존재하지 않음: {file_path}"
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "cr_parsing_status": "error",
                    "cr_parsing_error": error_msg
                }}
            )
            return {"success": False, "error": error_msg}

        # 2.5 중복 파싱 방지: 같은 source_file_id로 이미 CR이 있는지 확인
        existing_cr = db["customers"].find_one({
            "_id": ObjectId(customer_id),
            "customer_reviews.source_file_id": ObjectId(file_id)
        })
        if existing_cr:
            logger.info(f"⏭️ [CR Parsing] 이미 파싱 완료된 CR 건너뛰기: file_id={file_id}")
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {"cr_parsing_status": "completed"}}
            )
            return {"success": True, "message": "이미 파싱 완료됨", "skipped": True}

        # 3. CR 파싱 실행 (pdfplumber 기반 - 빠르고 비용 없음)
        logger.info(f"🔍 [CR Parsing] 파싱 시작: {file_path}")

        result = parse_customer_review(file_path)

        if "error" in result:
            logger.error(f"❌ [CR Parsing] 파싱 실패: {result['error']}")
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "cr_parsing_status": "error",
                    "cr_parsing_error": result["error"]
                }}
            )
            return {"success": False, "error": result["error"]}

        # 4. 1페이지 메타데이터 추출 (상품명, 발행일, 계약자, 피보험자 등)
        metadata = doc.get("cr_metadata", {})
        if not metadata:
            metadata = extract_cr_metadata_from_first_page(file_path)

        # 5. MongoDB 저장
        logger.info(f"💾 [CR Parsing] DB 저장 중...")

        save_result = save_customer_review(
            db=db,
            customer_id=customer_id,
            report_data=result,
            metadata=metadata,
            source_file_id=file_id
        )

        if save_result["success"]:
            logger.info(f"✅ [CR Parsing] 파싱 완료: 증권번호={result.get('contract_info', {}).get('policy_number', 'N/A')}")
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "cr_parsing_status": "completed",
                    "cr_parsing_completed_at": datetime.now(timezone.utc),
                    "overallStatus": "completed",
                    "overallStatusUpdatedAt": datetime.now(timezone.utc)
                }}
            )
            return {"success": True, "message": "파싱 완료"}
        else:
            error_msg = save_result.get("message", "DB 저장 실패")
            logger.error(f"❌ [CR Parsing] DB 저장 실패: {error_msg}")
            db["files"].update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "cr_parsing_status": "error",
                    "cr_parsing_error": error_msg
                }}
            )
            return {"success": False, "error": error_msg}

    except Exception as e:
        logger.error(f"❌ [CR Parsing] 예외 발생: {e}", exc_info=True)
        send_error_log("annual_report_api", f"CR Parsing 예외 발생: {e}", e)
        try:
            db["files"].update_one(
                {"_id": ObjectId(file_id)},
                {"$set": {
                    "cr_parsing_status": "error",
                    "cr_parsing_error": str(e)
                }}
            )
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

            customer = db.customers.find_one({
                "_id": customer_obj_id,
                "meta.created_by": user_id
            })

            if not customer:
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
                file_doc = db.files.find_one({"_id": file_obj_id})
                if file_doc:
                    # 이미 완료된 CR은 건너뜀
                    if file_doc.get("cr_parsing_status") == "completed":
                        logger.info(f"⏭️ [CR Trigger] 이미 완료된 CR 건너뛰기: file_id={request.file_id}")
                        skipped_count = 1
                    else:
                        customer_id = file_doc.get("customerId") or (ObjectId(request.customer_id) if request.customer_id else None)
                        if customer_id:
                            # 상태를 processing으로 업데이트
                            db.files.update_one(
                                {"_id": file_obj_id},
                                {"$set": {"cr_parsing_status": "processing"}}
                            )
                            # 즉시 파싱 실행
                            result = parse_single_cr_document(db, str(file_obj_id), str(customer_id))
                            if result.get("success"):
                                processing_count = 1
                            else:
                                logger.warning(f"CR 파싱 실패: {result.get('error')}")
            except InvalidId:
                pass

        elif request.customer_id:
            # 해당 고객의 pending CR 문서들 파싱
            pending_docs = list(db.files.find({
                "customerId": ObjectId(request.customer_id),
                "is_customer_review": True,
                "cr_parsing_status": {"$in": ["pending", None]}
            }).limit(20))

            for doc in pending_docs:
                # 상태를 processing으로 업데이트
                db.files.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"cr_parsing_status": "processing"}}
                )
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

        # 파일 조회
        file_doc = db["files"].find_one({"_id": file_obj_id})

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

        # 소유권 검증
        customer_id = file_doc.get("customerId")
        if customer_id:
            customer = db["customers"].find_one({
                "_id": customer_id,
                "meta.created_by": user_id
            })
            if not customer:
                raise HTTPException(
                    status_code=403,
                    detail="파일에 접근 권한이 없습니다"
                )

        # 상태 초기화 후 즉시 파싱
        db["files"].update_one(
            {"_id": file_obj_id},
            {
                "$set": {
                    "cr_parsing_status": "processing",
                    "cr_parsing_error": None,
                    "cr_parsing_retry_at": datetime.now(timezone.utc)
                }
            }
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

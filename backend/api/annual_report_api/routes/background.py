"""
Annual Report Background Parsing Routes

문서 업로드 완료 후 자동으로 AR 파싱을 트리거하는 백그라운드 처리 API
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel
from bson import ObjectId
from bson.errors import InvalidId

from services.detector import is_annual_report, extract_customer_info_from_first_page
from services.parser_factory import get_parser
from services.db_writer import save_annual_report
from utils.pdf_utils import find_contract_table_end_page
from config import settings
from system_logger import send_error_log
from internal_api import check_customer_ownership, has_report, update_file_parsing_status, query_file_one, query_files

logger = logging.getLogger(__name__)

router = APIRouter()


class TriggerParsingRequest(BaseModel):
    """AR 백그라운드 파싱 트리거 요청"""
    customer_id: Optional[str] = None  # 특정 고객만 파싱 (선택)
    file_id: Optional[str] = None  # 특정 파일만 파싱 (선택)


class TriggerParsingResponse(BaseModel):
    """AR 백그라운드 파싱 트리거 응답"""
    success: bool
    message: str
    processing_count: int = 0
    skipped_count: int = 0


def parse_single_ar_document(db, file_id: str, customer_id: str) -> dict:
    """
    단일 AR 문서를 파싱하는 함수 (큐 워커용)

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

        if not doc.get("is_annual_report"):
            return {"success": False, "error": "AR 문서가 아님"}

        # 2. 파일 경로 확인 (업로드 완료 대기)
        file_path = doc.get("upload", {}).get("destPath")
        if not file_path:
            # 🔧 파일 업로드가 아직 완료되지 않은 경우 - 대기 후 재조회
            import time
            max_wait_attempts = 5  # 최대 5번 대기 (총 10초)
            wait_interval = 2  # 2초 간격

            for attempt in range(max_wait_attempts):
                time.sleep(wait_interval)
                # 파일 재조회 (Internal API 경유)
                doc = query_file_one({"_id": file_id})
                if doc:
                    file_path = doc.get("upload", {}).get("destPath")
                    if file_path:
                        logger.info(f"✅ 파일 경로 대기 후 발견 (시도 {attempt + 1}): {file_path}")
                        break

            # 대기 후에도 파일 경로가 없으면 에러
            if not file_path:
                error_msg = "파일 경로 없음 (업로드 미완료)"
                update_file_parsing_status(file_id, "ar", "error", error=error_msg)
                return {"success": False, "error": error_msg}

        import os
        # file_path는 이미 절대 경로 (/data/files/users/...)
        if not os.path.exists(file_path):
            # 🔥 파일 존재하지 않음 → error 상태로 업데이트 (결과 보장)
            error_msg = f"파일이 존재하지 않음: {file_path}"
            update_file_parsing_status(str(doc["_id"]), "ar", "error", error=error_msg)
            return {"success": False, "error": error_msg}

        # 2.5 🍎 중복 파싱 방지: 같은 source_file_id로 이미 AR이 있는지 확인
        if has_report(customer_id, file_id, "ar"):
            logger.info(f"⏭️ [Queue Parsing] 이미 파싱 완료된 AR 건너뛰기: file_id={file_id}")
            # files 상태도 completed로 업데이트
            update_file_parsing_status(str(doc["_id"]), "ar", "completed")
            # 🔧 완료된 작업은 큐에서 삭제
            try:
                db["ar_parse_queue"].delete_one({"file_id": doc["_id"]})
            except Exception as e:
                logger.warning(f"큐 삭제 실패 (무시됨): {e}")
                send_error_log("annual_report_api", f"AR 큐 삭제 실패: {e}", e)
            return {"success": True, "message": "이미 파싱 완료됨", "skipped": True}

        # 3. AR 파싱 실행
        logger.info(f"🔍 [Queue Parsing] 파싱 시작: {file_path}")

        customer_name = doc.get("ar_metadata", {}).get("customer_name")

        # 🔧 end_page 계산 (2페이지만 OpenAI에 전달하기 위함)
        end_page_0indexed = find_contract_table_end_page(file_path)
        end_page = end_page_0indexed + 1  # 1-based로 변환
        logger.info(f"📄 [Queue Parsing] 계약 테이블 범위: 2~{end_page}페이지")

        parse_annual_report = get_parser()  # 설정에 따라 파서 선택
        result = parse_annual_report(file_path, customer_name=customer_name, end_page=end_page)

        if "error" in result:
            logger.error(f"❌ [Queue Parsing] 파싱 실패: {result['error']}")
            update_file_parsing_status(str(doc["_id"]), "ar", "error", error=result["error"])
            return {"success": False, "error": result["error"]}

        # 4. MongoDB 저장
        logger.info(f"💾 [Queue Parsing] DB 저장 중...")
        metadata = doc.get("ar_metadata", {})

        # 🔴 PDF 1페이지에서 메타데이터 추출 (Source of Truth)
        # customer_name, issue_date, fsr_name, report_title 모두 PDF 텍스트 파싱으로만 추출!
        extracted = extract_customer_info_from_first_page(file_path)
        logger.info(f"📝 [Queue Parsing] PDF 1페이지 추출 결과: {extracted}")

        # customer_name: PDF 추출 > ar_metadata > OpenAI 결과
        parsed_customer_name = extracted.get("customer_name") or metadata.get("customer_name") or result.get("고객명")
        if extracted.get("customer_name"):
            metadata["customer_name"] = extracted["customer_name"]

        # issue_date: PDF 추출 (유일한 Source of Truth)
        if extracted.get("issue_date"):
            metadata["issue_date"] = extracted["issue_date"]

        # fsr_name: PDF 추출
        if extracted.get("fsr_name"):
            metadata["fsr_name"] = extracted["fsr_name"]

        # report_title: PDF 추출
        if extracted.get("report_title"):
            metadata["report_title"] = extracted["report_title"]

        # ⭐ AR 파싱은 항상 파일을 업로드한 고객(customer_id 파라미터)에게 저장
        # customer_name은 AR 데이터 내에서 식별용으로만 사용
        logger.info(f"📝 [Queue Parsing] AR 파싱을 고객에게 저장: {customer_id} (AR 소유자: {parsed_customer_name or '알 수 없음'})")

        save_result = save_annual_report(
            db=db,
            customer_id=customer_id,
            report_data=result,
            metadata=metadata,
            source_file_id=file_id
        )

        if save_result["success"]:
            logger.info(f"✅ [Queue Parsing] 파싱 완료: {result.get('metadata', {}).get('issue_date', 'unknown')}")
            update_fields = {
                "ar_parsing_status": "completed",
                "ar_parsing_completed_at": datetime.now(timezone.utc),
            }
            # customer_id가 있으면 customerId도 업데이트
            if customer_id:
                update_fields["customerId"] = ObjectId(customer_id)

            # 📄 displayName 자동 생성/보정
            if parsed_customer_name and metadata.get("issue_date"):
                new_display = f"{parsed_customer_name}_AR_{metadata['issue_date']}.pdf"
                if doc.get("displayName") != new_display:
                    update_fields["displayName"] = new_display
                    logger.info(f"📄 [Queue Parsing] displayName 생성: {new_display}")

            # 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
            # overallStatus는 주 파이프라인(doc_prep_main, full_pipeline)만 관리
            # AR 스캐너는 ar_parsing_status만 관리
            api_kwargs = {}
            if "customerId" in update_fields:
                api_kwargs["customerId"] = str(update_fields["customerId"])
            if "displayName" in update_fields:
                api_kwargs["displayName"] = update_fields["displayName"]
            completed_at = update_fields.get("ar_parsing_completed_at")
            if isinstance(completed_at, datetime):
                api_kwargs["completed_at"] = completed_at.isoformat()
            update_file_parsing_status(str(doc["_id"]), "ar", "completed", **api_kwargs)

            # 🔧 완료된 작업은 큐에서 삭제
            try:
                db["ar_parse_queue"].delete_one({"file_id": doc["_id"]})
                logger.info(f"🗑️ ar_parse_queue에서 완료 작업 삭제: file_id={doc['_id']}")
            except Exception as queue_delete_error:
                logger.warning(f"⚠️ ar_parse_queue 삭제 실패 (무시): {queue_delete_error}")

            return {"success": True, "message": "파싱 완료"}
        else:
            error_msg = save_result.get("message", "DB 저장 실패")
            logger.error(f"❌ [Queue Parsing] DB 저장 실패: {error_msg}")
            update_file_parsing_status(str(doc["_id"]), "ar", "error", error=error_msg)
            return {"success": False, "error": error_msg}

    except Exception as e:
        logger.error(f"❌ [Queue Parsing] 예외 발생: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Queue Parsing 예외 발생: {e}", e)
        try:
            update_file_parsing_status(str(file_id), "ar", "error", error=str(e))
        except Exception as update_error:
            logger.error(f"❌ [Queue Parsing] 상태 업데이트 실패: {update_error}")
        return {"success": False, "error": str(e)}


def process_ar_documents_background(db, customer_id: Optional[str] = None, specific_file_id: Optional[str] = None):
    """
    백그라운드에서 AR 문서들을 파싱하는 함수

    Args:
        db: MongoDB database 객체
        customer_id: 고객 ID (선택 - 지정하지 않으면 모든 고객의 AR 문서 파싱)
        specific_file_id: 특정 파일만 파싱 (선택)
    """
    try:
        logger.info(f"🚀 [BG Parsing] 시작: customer_id={customer_id}, file_id={specific_file_id}")

        # 1. AR 문서 조회 (파싱 대기 상태 또는 실패 상태)
        query = {
            "is_annual_report": True,
            "$or": [
                {"ar_parsing_status": {"$exists": False}},
                {"ar_parsing_status": "pending"},
                {"ar_parsing_status": "error"}
            ]
        }

        # 특정 고객의 문서만 파싱
        if customer_id:
            query["customer_relation.customer_id"] = customer_id

        # 특정 파일만 파싱
        if specific_file_id:
            query["_id"] = specific_file_id
            # 특정 파일 지정 시 파싱 상태 필터 및 customer 필터 제거 (강제 재파싱 가능)
            query.pop("$or", None)
            query.pop("customer_relation.customer_id", None)  # 🔧 파일 ID로 직접 조회 시 customer 필터 불필요

        ar_documents = query_files(query, sort={"upload.uploaded_at": -1}, limit=100)

        logger.info(f"📄 [BG Parsing] AR 문서 {len(ar_documents)}개 발견")

        # 2. 각 AR 문서에 대해 발행일 확인 및 파싱
        processing_count = 0
        skipped_count = 0

        for doc in ar_documents:
            try:
                # 문서의 customer_id 가져오기 (customer_relation 안에 중첩되어 있을 수 있음)
                # ⭐ 1. 먼저 문서에서 가져오기
                doc_customer_id = doc.get("customerId") or doc.get("customer_id") or doc.get("customer_relation", {}).get("customer_id")
                # ⭐ 2. 문서에 없으면 파라미터로 전달된 customer_id 사용
                if not doc_customer_id and customer_id:
                    doc_customer_id = customer_id
                    logger.info(f"📝 [BG Parsing] 파라미터 customer_id 사용: {customer_id}")
                    # 문서에 customerId 업데이트
                    current_status = doc.get("ar_parsing_status", "pending")
                    update_file_parsing_status(str(doc["_id"]), "ar", current_status, customerId=customer_id)
                if not doc_customer_id:
                    logger.warning(f"⚠️  [BG Parsing] customer_id 없음: {doc.get('_id')}")
                    skipped_count += 1
                    continue

                # 발행일 추출 및 중복 체크는 주석 처리 (ar_metadata가 없을 수 있음)
                # issue_date = doc.get("ar_metadata", {}).get("issue_date")
                # if not issue_date:
                #     logger.warning(f"⚠️  [BG Parsing] 발행일 없음: {doc.get('_id')}")
                #     skipped_count += 1
                #     continue
                #
                # # 3. annual_reports 컬렉션에서 동일 발행일 존재 여부 확인
                # existing_report = db["annual_reports"].find_one({
                #     "customer_id": doc_customer_id if isinstance(doc_customer_id, ObjectId) else ObjectId(doc_customer_id),
                #     "issue_date": issue_date
                # })
                #
                # if existing_report:
                #     logger.info(f"⏭️  [BG Parsing] 이미 파싱됨: issue_date={issue_date}")
                #     # AR 파싱 상태 업데이트
                #     db["files"].update_one(
                #         {"_id": doc["_id"]},
                #         {"$set": {"ar_parsing_status": "completed"}}
                #     )
                #     skipped_count += 1
                #     continue

                # 4. 파싱 필요 - 상태 업데이트
                update_file_parsing_status(str(doc["_id"]), "ar", "processing", started_at_current_date=True)

                # 5. PDF 파일 경로 가져오기
                file_path = doc.get("upload", {}).get("destPath")
                if not file_path:
                    logger.error(f"❌ [BG Parsing] 파일 경로 없음: {doc.get('_id')}")
                    update_file_parsing_status(str(doc["_id"]), "ar", "error", error="파일 경로 없음")
                    skipped_count += 1
                    continue

                # 6. AR 파싱 수행
                logger.info(f"🔍 [BG Parsing] 파싱 시작: {file_path}")

                # 고객명 가져오기
                customer_name = doc.get("ar_metadata", {}).get("customer_name")

                # 🔧 end_page 계산 (2페이지만 OpenAI에 전달하기 위함)
                end_page_0indexed = find_contract_table_end_page(file_path)
                end_page = end_page_0indexed + 1  # 1-based로 변환
                logger.info(f"📄 [BG Parsing] 계약 테이블 범위: 2~{end_page}페이지")

                # 파싱 실행 (설정에 따라 파서 선택)
                parse_annual_report = get_parser()
                result = parse_annual_report(file_path, customer_name=customer_name, end_page=end_page)

                if "error" in result:
                    logger.error(f"❌ [BG Parsing] 파싱 실패: {result['error']}")
                    update_file_parsing_status(str(doc["_id"]), "ar", "error", error=result["error"])
                    skipped_count += 1
                    continue

                # 7. MongoDB 저장
                logger.info(f"💾 [BG Parsing] DB 저장 중...")
                metadata = doc.get("ar_metadata", {})

                # 🔴 PDF 1페이지에서 메타데이터 추출 (Source of Truth)
                # customer_name, issue_date, fsr_name, report_title 모두 PDF 텍스트 파싱으로만 추출!
                extracted = extract_customer_info_from_first_page(file_path)
                logger.info(f"📝 [BG Parsing] PDF 1페이지 추출 결과: {extracted}")

                # customer_name: PDF 추출 > ar_metadata > OpenAI 결과
                parsed_customer_name = extracted.get("customer_name") or metadata.get("customer_name") or result.get("고객명")
                if extracted.get("customer_name"):
                    metadata["customer_name"] = extracted["customer_name"]

                # issue_date: PDF 추출 (유일한 Source of Truth)
                if extracted.get("issue_date"):
                    metadata["issue_date"] = extracted["issue_date"]

                # fsr_name: PDF 추출
                if extracted.get("fsr_name"):
                    metadata["fsr_name"] = extracted["fsr_name"]

                # report_title: PDF 추출
                if extracted.get("report_title"):
                    metadata["report_title"] = extracted["report_title"]

                # ⭐ AR 파싱은 항상 파일을 업로드한 고객(doc_customer_id)에게 저장
                # customer_name은 AR 데이터 내에서 식별용으로만 사용
                logger.info(f"📝 [BG Parsing] AR 파싱을 고객에게 저장: {doc_customer_id} (AR 소유자: {parsed_customer_name or '알 수 없음'})")

                save_result = save_annual_report(
                    db=db,
                    customer_id=str(doc_customer_id),
                    report_data=result,
                    metadata=metadata,
                    source_file_id=str(doc["_id"])
                )

                if save_result["success"]:
                    logger.info(f"✅ [BG Parsing] 파싱 완료: {result.get('metadata', {}).get('issue_date', 'unknown')}")
                    bg_update = {
                        "ar_parsing_status": "completed",
                        "ar_parsing_completed_at": datetime.now(timezone.utc),
                    }

                    # 📄 displayName 자동 생성/보정
                    if parsed_customer_name and metadata.get("issue_date"):
                        new_display = f"{parsed_customer_name}_AR_{metadata['issue_date']}.pdf"
                        if doc.get("displayName") != new_display:
                            bg_update["displayName"] = new_display
                            logger.info(f"📄 [BG Parsing] displayName 생성: {new_display}")

                    # 🔴 overallStatus는 건드리지 않음 (관할권 분리 원칙)
                    # overallStatus는 주 파이프라인(doc_prep_main, full_pipeline)만 관리
                    # AR 스캐너는 ar_parsing_status만 관리
                    api_kwargs = {}
                    if "displayName" in bg_update:
                        api_kwargs["displayName"] = bg_update["displayName"]
                    completed_at = bg_update.get("ar_parsing_completed_at")
                    if isinstance(completed_at, datetime):
                        api_kwargs["completed_at"] = completed_at.isoformat()
                    update_file_parsing_status(str(doc["_id"]), "ar", "completed", **api_kwargs)

                    processing_count += 1
                else:
                    logger.error(f"❌ [BG Parsing] DB 저장 실패: {save_result.get('message')}")
                    update_file_parsing_status(str(doc["_id"]), "ar", "error", error=save_result.get("message", "DB 저장 실패"))
                    skipped_count += 1

            except Exception as e:
                logger.error(f"❌ [BG Parsing] 문서 처리 실패: {doc.get('_id')}, {e}", exc_info=True)
                send_error_log("annual_report_api", f"BG Parsing 문서 처리 실패: {doc.get('_id')}, {e}", e)
                try:
                    update_file_parsing_status(str(doc["_id"]), "ar", "error", error=str(e))
                except Exception as update_error:
                    logger.error(f"❌ [BG Parsing] 상태 업데이트 실패: {update_error}")
                skipped_count += 1
                continue

        logger.info(f"🎉 [BG Parsing] 완료: 처리={processing_count}, 건너뜀={skipped_count}")

    except Exception as e:
        logger.error(f"❌ [BG Parsing] 전체 실패: {e}", exc_info=True)
        send_error_log("annual_report_api", f"BG Parsing 전체 실패: {e}", e)


@router.post("/trigger-parsing", response_model=TriggerParsingResponse)
async def trigger_ar_parsing(
    request: TriggerParsingRequest,
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 AR 문서들을 백그라운드에서 파싱하도록 트리거

    - n8n 워크플로우 완료 후 호출됨
    - 발행일 기준으로 중복 체크
    - 미파싱 문서만 순차 처리

    Args:
        request: TriggerParsingRequest (customer_id, file_id)
        background_tasks: FastAPI BackgroundTasks
        user_id: 설계사 userId (x-user-id 헤더)
    """
    try:
        # ⭐ userId 검증 (사용자 계정 기능)
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # ⭐ customer_id 유효성 및 소유권 검증 (제공된 경우만)
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

        # 🔧 큐 시스템으로 통합 (Rate limit 방지)
        from main import queue_manager

        enqueued_count = 0

        if request.file_id:
            # 특정 파일만 큐에 추가
            try:
                file_obj_id = ObjectId(request.file_id)
                file_doc = query_file_one({"_id": request.file_id})
                if file_doc:
                    # 🔧 이미 완료된 AR은 큐에 추가하지 않음
                    if file_doc.get("ar_parsing_status") == "completed":
                        logger.info(f"⏭️ [Trigger] 이미 완료된 AR 건너뛰기: file_id={request.file_id}")
                    else:
                        customer_id = file_doc.get("customerId") or (ObjectId(request.customer_id) if request.customer_id else None)
                        if customer_id:
                            queue_manager.enqueue(file_obj_id, customer_id, {"trigger": True, "user_id": user_id})
                            enqueued_count = 1
            except InvalidId:
                pass
        elif request.customer_id:
            # 해당 고객의 pending AR 문서들을 큐에 추가 (Internal API 경유)
            pending_docs = query_files({
                "customerId": request.customer_id,
                "is_annual_report": True,
                "ar_parsing_status": {"$in": ["pending", None]}
            }, limit=20)

            for doc in pending_docs:
                # 이미 큐에 있는지 확인
                existing = db.ar_parse_queue.find_one({"file_id": doc["_id"]})
                if not existing:
                    queue_manager.enqueue(doc["_id"], ObjectId(request.customer_id), {"trigger": True, "user_id": user_id})
                    enqueued_count += 1

        logger.info(f"✅ [Trigger] 큐에 {enqueued_count}건 등록: user_id={user_id}, customer_id={request.customer_id or 'ALL'}")

        return TriggerParsingResponse(
            success=True,
            message=f"AR 파싱 작업 {enqueued_count}건이 큐에 등록되었습니다."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Trigger] 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Trigger Parsing 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


class RetryParsingRequest(BaseModel):
    """AR 파싱 재시도 요청"""
    file_id: str  # 재시도할 파일 ID


class RetryParsingResponse(BaseModel):
    """AR 파싱 재시도 응답"""
    success: bool
    message: str


@router.post("/retry-parsing", response_model=RetryParsingResponse)
async def retry_ar_parsing(
    request: RetryParsingRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Header(None, alias="x-user-id")
):
    """
    파싱 실패한 AR 문서를 재시도

    - ar_parsing_status: error 인 문서만 재시도 가능
    - ar_parsing_status를 초기화하고 백그라운드 파싱 트리거

    Args:
        request: RetryParsingRequest (file_id)
        background_tasks: FastAPI BackgroundTasks
        user_id: 설계사 userId (x-user-id 헤더)
    """
    try:
        # ⭐ userId 검증
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

        # AR 문서인지 확인
        if not file_doc.get("is_annual_report"):
            raise HTTPException(
                status_code=400,
                detail="AR 문서가 아닙니다"
            )

        # 현재 상태 확인
        current_status = file_doc.get("ar_parsing_status")
        if current_status == "processing":
            raise HTTPException(
                status_code=400,
                detail="이미 파싱 진행 중입니다"
            )

        # 🔧 이미 완료된 AR은 재시도하지 않음
        if current_status == "completed":
            raise HTTPException(
                status_code=400,
                detail="이미 파싱이 완료된 문서입니다"
            )

        # ⭐ 소유권 검증: customerId로 고객 찾고, 그 고객의 created_by 확인 (Internal API 경유)
        customer_id = file_doc.get("customerId")
        if customer_id:
            if not check_customer_ownership(str(customer_id), user_id):
                raise HTTPException(
                    status_code=403,
                    detail="파일에 접근 권한이 없습니다"
                )

        # ar_parsing_status를 초기화 (재파싱 가능하도록)
        update_file_parsing_status(
            str(file_obj_id), "ar", "pending",
            error=None,
            extra_fields={"ar_parsing_retry_at": datetime.now(timezone.utc).isoformat()}
        )

        logger.info(f"🔄 [Retry] AR 파싱 재시도 준비: file_id={request.file_id}, user_id={user_id}")

        # 🔧 큐 시스템으로 통합 (Rate limit 방지)
        from main import queue_manager

        # 기존 큐에서 해당 파일 제거 (중복 방지)
        queue_manager.queue.delete_one({"file_id": file_obj_id})

        # 큐에 새로 추가 (순차 처리 보장)
        queue_manager.enqueue(
            file_id=file_obj_id,
            customer_id=customer_id,
            metadata={"retry": True, "user_id": user_id}
        )

        logger.info(f"✅ [Retry] 큐에 재시도 작업 등록: file_id={request.file_id}")

        return RetryParsingResponse(
            success=True,
            message="AR 파싱 재시도가 시작되었습니다."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Retry] 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Retry Parsing 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

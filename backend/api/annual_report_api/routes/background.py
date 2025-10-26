"""
Annual Report Background Parsing Routes

문서 업로드 완료 후 자동으로 AR 파싱을 트리거하는 백그라운드 처리 API
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from bson import ObjectId

from services.detector import is_annual_report
from services.parser import parse_annual_report
from services.db_writer import save_annual_report
from config import settings

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
            query["customer_relation.customer_id"] = ObjectId(customer_id)

        # 특정 파일만 파싱
        if specific_file_id:
            query["_id"] = ObjectId(specific_file_id)
            # 특정 파일 지정 시 파싱 상태 필터 제거 (강제 재파싱 가능)
            query.pop("$or", None)

        ar_documents = list(db["files"].find(query).sort("upload.uploaded_at", -1))

        logger.info(f"📄 [BG Parsing] AR 문서 {len(ar_documents)}개 발견")

        # 2. 각 AR 문서에 대해 발행일 확인 및 파싱
        processing_count = 0
        skipped_count = 0

        for doc in ar_documents:
            try:
                # 문서의 customer_id 가져오기 (customer_relation 안에 중첩되어 있을 수 있음)
                doc_customer_id = doc.get("customer_id") or doc.get("customer_relation", {}).get("customer_id")
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
                db["files"].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {
                        "ar_parsing_status": "processing",
                        "ar_parsing_started_at": {"$currentDate": True}
                    }}
                )

                # 5. PDF 파일 경로 가져오기
                file_path = doc.get("upload", {}).get("destPath")
                if not file_path:
                    logger.error(f"❌ [BG Parsing] 파일 경로 없음: {doc.get('_id')}")
                    db["files"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {
                            "ar_parsing_status": "error",
                            "ar_parsing_error": "파일 경로 없음"
                        }}
                    )
                    skipped_count += 1
                    continue

                # 6. AR 파싱 수행
                logger.info(f"🔍 [BG Parsing] 파싱 시작: {file_path}")

                # 고객명 가져오기
                customer_name = doc.get("ar_metadata", {}).get("customer_name")

                # 파싱 실행
                result = parse_annual_report(file_path, customer_name=customer_name)

                if "error" in result:
                    logger.error(f"❌ [BG Parsing] 파싱 실패: {result['error']}")
                    db["files"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {
                            "ar_parsing_status": "error",
                            "ar_parsing_error": result["error"]
                        }}
                    )
                    skipped_count += 1
                    continue

                # 7. MongoDB 저장
                logger.info(f"💾 [BG Parsing] DB 저장 중...")
                metadata = doc.get("ar_metadata", {})
                save_result = save_annual_report(
                    db=db,
                    customer_id=str(doc_customer_id),
                    report_data=result,
                    metadata=metadata,
                    source_file_id=str(doc["_id"])
                )

                if save_result["success"]:
                    logger.info(f"✅ [BG Parsing] 파싱 완료: {result.get('metadata', {}).get('issue_date', 'unknown')}")
                    db["files"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {
                            "ar_parsing_status": "completed",
                            "ar_parsing_completed_at": {"$currentDate": True}
                        }}
                    )
                    processing_count += 1
                else:
                    logger.error(f"❌ [BG Parsing] DB 저장 실패: {save_result.get('message')}")
                    db["files"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {
                            "ar_parsing_status": "error",
                            "ar_parsing_error": save_result.get("message", "DB 저장 실패")
                        }}
                    )
                    skipped_count += 1

            except Exception as e:
                logger.error(f"❌ [BG Parsing] 문서 처리 실패: {doc.get('_id')}, {e}", exc_info=True)
                try:
                    db["files"].update_one(
                        {"_id": doc["_id"]},
                        {"$set": {
                            "ar_parsing_status": "error",
                            "ar_parsing_error": str(e)
                        }}
                    )
                except Exception as update_error:
                    logger.error(f"❌ [BG Parsing] 상태 업데이트 실패: {update_error}")
                skipped_count += 1
                continue

        logger.info(f"🎉 [BG Parsing] 완료: 처리={processing_count}, 건너뜀={skipped_count}")

    except Exception as e:
        logger.error(f"❌ [BG Parsing] 전체 실패: {e}", exc_info=True)


@router.post("/trigger-parsing", response_model=TriggerParsingResponse)
async def trigger_ar_parsing(
    request: TriggerParsingRequest,
    background_tasks: BackgroundTasks
):
    """
    고객의 AR 문서들을 백그라운드에서 파싱하도록 트리거

    - n8n 워크플로우 완료 후 호출됨
    - 발행일 기준으로 중복 체크
    - 미파싱 문서만 순차 처리
    """
    try:
        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # customer_id 검증 (제공된 경우만)
        if request.customer_id:
            try:
                ObjectId(request.customer_id)
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail=f"잘못된 ObjectId 형식: {request.customer_id}"
                )

        # 백그라운드 작업 등록
        background_tasks.add_task(
            process_ar_documents_background,
            db,
            request.customer_id,
            request.file_id
        )

        logger.info(f"✅ [Trigger] 백그라운드 파싱 작업 등록: customer_id={request.customer_id or 'ALL'}")

        return TriggerParsingResponse(
            success=True,
            message="AR 백그라운드 파싱이 시작되었습니다."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [Trigger] 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

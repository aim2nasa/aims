"""
Annual Report 조회 API 라우터
GET /customers/{customer_id}/annual-reports - Annual Reports 조회
DELETE /customers/{customer_id}/annual-reports - Annual Reports 삭제
"""
from fastapi import APIRouter, HTTPException, Path, Query, Body, Header
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from bson import ObjectId
from bson.errors import InvalidId
import logging

from services.db_writer import get_annual_reports, delete_annual_reports, cleanup_duplicate_annual_reports

logger = logging.getLogger(__name__)

router = APIRouter()


# Response 모델
class AnnualReportSummary(BaseModel):
    """Annual Report 요약 정보"""
    customer_name: Optional[str] = None
    issue_date: Optional[str] = None
    uploaded_at: Optional[str] = None
    parsed_at: Optional[str] = None
    total_contracts: int = 0
    total_monthly_premium: int = 0
    source_file_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "customer_name": "안영미",
                "issue_date": "2025-08-27T00:00:00",
                "uploaded_at": "2025-10-16T10:30:00",
                "parsed_at": "2025-10-16T10:30:25",
                "total_contracts": 10,
                "total_monthly_premium": 14102137,
                "source_file_id": "507f1f77bcf86cd799439011"
            }
        }


class AnnualReportsResponse(BaseModel):
    """Annual Reports 조회 응답"""
    success: bool
    data: List[Dict[str, Any]]
    count: int
    total: int
    message: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "data": [
                    {
                        "customer_name": "안영미",
                        "issue_date": "2025-08-27",
                        "total_contracts": 10,
                        "total_monthly_premium": 14102137,
                        "contracts": [{"순번": 1, "보험상품": "..."}]
                    }
                ],
                "count": 1,
                "total": 1
            }
        }


@router.get(
    "/customers/{customer_id}/annual-reports",
    response_model=AnnualReportsResponse
)
async def get_customer_annual_reports(
    customer_id: str = Path(..., description="고객 ObjectId"),
    limit: int = Query(10, ge=1, le=100, description="최대 조회 개수"),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 Annual Reports 조회 (최신순)

    Args:
        customer_id: 고객 ObjectId
        limit: 최대 조회 개수 (기본 10, 최대 100)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        AnnualReportsResponse: {
            "success": true,
            "data": [...],
            "count": 조회된 개수,
            "total": 전체 개수
        }

    Raises:
        HTTPException 400: userId 또는 customer_id가 유효하지 않을 때
        HTTPException 403: 고객 접근 권한이 없을 때
        HTTPException 404: 고객을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 Annual Reports 조회 요청: customer_id={customer_id}, user_id={user_id}, limit={limit}")

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

        # ⭐ customer_id 유효성 및 소유권 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        customer = db.customers.find_one({
            "_id": customer_obj_id,
            "meta.created_by": user_id
        })

        if not customer:
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        # Annual Reports 조회
        result = get_annual_reports(
            db=db,
            customer_id=customer_id,
            limit=limit
        )

        if not result["success"]:
            if "찾을 수 없습니다" in result.get("message", ""):
                raise HTTPException(
                    status_code=404,
                    detail=result["message"]
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=result.get("message", "조회 실패")
                )

        logger.info(
            f"✅ Annual Reports 조회 완료: {result['count']}건 (전체 {result['total']}건)"
        )

        return AnnualReportsResponse(
            success=True,
            data=result["data"],
            count=result["count"],
            total=result["total"]
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"❌ Annual Reports 조회 API 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.get(
    "/customers/{customer_id}/annual-reports/latest",
    response_model=Dict[str, Any]
)
async def get_latest_annual_report(
    customer_id: str = Path(..., description="고객 ObjectId"),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 최신 Annual Report 조회

    Args:
        customer_id: 고객 ObjectId
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        dict: 최신 Annual Report 데이터

    Raises:
        HTTPException 400: userId 또는 customer_id가 유효하지 않을 때
        HTTPException 404: 고객 또는 Annual Report가 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 최신 Annual Report 조회: customer_id={customer_id}, user_id={user_id}")

    try:
        # ⭐ userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # ⭐ customer 소유권 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        customer = db.customers.find_one({
            "_id": customer_obj_id,
            "meta.created_by": user_id
        })

        if not customer:
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        # 최신 1건만 조회
        result = get_annual_reports(
            db=db,
            customer_id=customer_id,
            limit=1
        )

        if not result["success"]:
            raise HTTPException(
                status_code=500,
                detail=result.get("message", "조회 실패")
            )

        if result["count"] == 0:
            raise HTTPException(
                status_code=404,
                detail="Annual Report가 없습니다"
            )

        latest_report = result["data"][0]

        logger.info(
            f"✅ 최신 Annual Report 조회 완료: "
            f"{latest_report.get('customer_name')} - "
            f"{latest_report.get('issue_date')}"
        )

        return {
            "success": True,
            "data": latest_report
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 최신 Annual Report 조회 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


class DeleteAnnualReportsRequest(BaseModel):
    """Annual Reports 삭제 요청"""
    indices: List[int] = Field(..., description="삭제할 리포트 인덱스 리스트 (최신순 기준)")

    class Config:
        json_schema_extra = {
            "example": {
                "indices": [0, 2, 5]
            }
        }


class DeleteAnnualReportsResponse(BaseModel):
    """Annual Reports 삭제 응답"""
    success: bool
    message: str
    deleted_count: int


@router.delete(
    "/customers/{customer_id}/annual-reports",
    response_model=DeleteAnnualReportsResponse
)
async def delete_customer_annual_reports(
    customer_id: str = Path(..., description="고객 ObjectId"),
    request: DeleteAnnualReportsRequest = Body(...),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 Annual Reports 삭제 (복수 선택 가능)

    Args:
        customer_id: 고객 ObjectId
        request: 삭제 요청 (indices 배열)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        DeleteAnnualReportsResponse: {
            "success": true,
            "message": "N건의 Annual Report가 삭제되었습니다",
            "deleted_count": N
        }

    Raises:
        HTTPException 400: userId 또는 요청이 유효하지 않을 때
        HTTPException 404: 고객을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"🗑️  Annual Reports 삭제 요청: customer_id={customer_id}, user_id={user_id}, indices={request.indices}")

    try:
        # ⭐ userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # 유효성 검증
        if not request.indices:
            raise HTTPException(
                status_code=400,
                detail="삭제할 항목을 선택해주세요"
            )

        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # ⭐ customer 소유권 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        customer = db.customers.find_one({
            "_id": customer_obj_id,
            "meta.created_by": user_id
        })

        if not customer:
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        # 삭제 실행
        result = delete_annual_reports(
            db=db,
            customer_id=customer_id,
            report_indices=request.indices
        )

        if not result["success"]:
            if "찾을 수 없습니다" in result.get("message", ""):
                raise HTTPException(
                    status_code=404,
                    detail=result["message"]
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=result.get("message", "삭제 실패")
                )

        logger.info(f"✅ Annual Reports 삭제 완료: {result['deleted_count']}건")

        return DeleteAnnualReportsResponse(
            success=True,
            message=result["message"],
            deleted_count=result["deleted_count"]
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"❌ Annual Reports 삭제 API 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


class CleanupDuplicatesRequest(BaseModel):
    """중복 Annual Reports 정리 요청"""
    issue_date: str = Field(..., description="발행일 (YYYY-MM-DD 또는 ISO 형식)")
    reference_linked_at: str = Field(..., description="기준 연결일 (ISO 8601 형식)")
    customer_name: Optional[str] = Field(None, description="AR 고객명 (중복 판단에 사용)")

    class Config:
        json_schema_extra = {
            "example": {
                "issue_date": "2025-08-29",
                "reference_linked_at": "2025-11-03T06:25:33Z",
                "customer_name": "홍길동"
            }
        }


class CleanupDuplicatesResponse(BaseModel):
    """중복 Annual Reports 정리 응답"""
    success: bool
    message: str
    deleted_count: int
    kept_report: Optional[Dict[str, Any]] = None


@router.post(
    "/customers/{customer_id}/annual-reports/cleanup-duplicates",
    response_model=CleanupDuplicatesResponse
)
async def cleanup_duplicate_reports(
    customer_id: str = Path(..., description="고객 ObjectId"),
    request: CleanupDuplicatesRequest = Body(...),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    동일 발행일의 중복 Annual Report 정리

    문서 탭의 연결일(linked_at)과 가장 가까운 파싱일시(parsed_at)를 가진
    Annual Report만 남기고 나머지 동일 발행일 AR 삭제

    Args:
        customer_id: 고객 ObjectId
        request: 정리 요청 (issue_date, reference_linked_at)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        CleanupDuplicatesResponse: {
            "success": true,
            "message": "N개의 중복 Annual Report가 삭제되었습니다",
            "deleted_count": N,
            "kept_report": { ... }
        }

    Raises:
        HTTPException 400: userId 또는 요청이 유효하지 않을 때
        HTTPException 404: 고객을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(
        f"🧹 중복 Annual Reports 정리 요청: "
        f"customer_id={customer_id}, user_id={user_id}, "
        f"issue_date={request.issue_date}, customer_name={request.customer_name}, reference={request.reference_linked_at}"
    )

    try:
        # ⭐ userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # ⭐ customer 소유권 검증
        try:
            customer_obj_id = ObjectId(customer_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        customer = db.customers.find_one({
            "_id": customer_obj_id,
            "meta.created_by": user_id
        })

        if not customer:
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        # 중복 정리 실행
        result = cleanup_duplicate_annual_reports(
            db=db,
            customer_id=customer_id,
            issue_date=request.issue_date,
            reference_linked_at=request.reference_linked_at,
            customer_name=request.customer_name
        )

        if not result["success"] and result.get("deleted_count", 0) == 0:
            # 중복이 없는 경우는 200 OK 반환 (정상 케이스)
            if "중복" in result.get("message", ""):
                logger.info(f"✅ 중복 없음 (정상): {result['message']}")
                return CleanupDuplicatesResponse(
                    success=True,
                    message=result["message"],
                    deleted_count=0
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=result.get("message", "정리 실패")
                )

        logger.info(f"✅ 중복 Annual Reports 정리 완료: {result['deleted_count']}건")

        return CleanupDuplicatesResponse(
            success=True,
            message=result["message"],
            deleted_count=result["deleted_count"],
            kept_report=result.get("kept_report")
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"❌ 중복 정리 API 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

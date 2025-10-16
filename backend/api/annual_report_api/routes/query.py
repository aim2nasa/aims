"""
Annual Report 조회 API 라우터
GET /customers/{customer_id}/annual-reports - Annual Reports 조회
"""
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import logging

from services.db_writer import get_annual_reports

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
    limit: int = Query(10, ge=1, le=100, description="최대 조회 개수")
):
    """
    고객의 Annual Reports 조회 (최신순)

    Args:
        customer_id: 고객 ObjectId
        limit: 최대 조회 개수 (기본 10, 최대 100)

    Returns:
        AnnualReportsResponse: {
            "success": true,
            "data": [...],
            "count": 조회된 개수,
            "total": 전체 개수
        }

    Raises:
        HTTPException 400: customer_id가 유효하지 않을 때
        HTTPException 404: 고객을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 Annual Reports 조회 요청: customer_id={customer_id}, limit={limit}")

    try:
        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
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
    customer_id: str = Path(..., description="고객 ObjectId")
):
    """
    고객의 최신 Annual Report 조회

    Args:
        customer_id: 고객 ObjectId

    Returns:
        dict: 최신 Annual Report 데이터

    Raises:
        HTTPException 404: Annual Report가 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 최신 Annual Report 조회: customer_id={customer_id}")

    try:
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
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

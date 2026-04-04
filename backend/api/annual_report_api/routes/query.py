"""
Annual Report 조회 API 라우터
GET /customers/{customer_id}/annual-reports - Annual Reports 조회
DELETE /customers/{customer_id}/annual-reports - Annual Reports 삭제
"""
import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Header, HTTPException, Path, Query
from pydantic import BaseModel, Field
from services.db_writer import cleanup_duplicate_annual_reports, delete_annual_reports, get_annual_reports
from system_logger import send_error_log

from internal_api import check_customer_ownership, get_customer, register_annual_report

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
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        if not check_customer_ownership(customer_id, user_id):
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
        send_error_log("annual_report_api", f"Annual Reports 조회 API 오류: {e}", e)
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
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        if not check_customer_ownership(customer_id, user_id):
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
        send_error_log("annual_report_api", f"최신 Annual Report 조회 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


class ReportIdentifier(BaseModel):
    """AR 고유 식별자 (source_file_id 또는 issue_date+customer_name)"""
    source_file_id: Optional[str] = None
    issue_date: Optional[str] = None
    customer_name: Optional[str] = None


class DeleteAnnualReportsRequest(BaseModel):
    """Annual Reports 삭제 요청 (identifiers 우선, indices는 하위 호환)"""
    identifiers: Optional[List[ReportIdentifier]] = Field(None, description="삭제할 리포트 식별자 리스트")
    indices: Optional[List[int]] = Field(None, description="(하위 호환) 삭제할 리포트 인덱스 리스트")

    class Config:
        json_schema_extra = {
            "example": {
                "identifiers": [{"source_file_id": "abc123"}, {"issue_date": "2024-01-01", "customer_name": "홍길동"}]
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
    logger.info(f"🗑️  Annual Reports 삭제 요청: customer_id={customer_id}, user_id={user_id}, identifiers={request.identifiers}, indices={request.indices}")

    try:
        # ⭐ userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # 유효성 검증: identifiers 또는 indices 중 하나 필수
        if not request.identifiers and not request.indices:
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
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        if not check_customer_ownership(customer_id, user_id):
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        # 삭제 실행: identifiers 우선, 없으면 indices 사용 (하위 호환)
        if request.identifiers:
            identifier_dicts = [ident.model_dump(exclude_none=True) for ident in request.identifiers]
            result = delete_annual_reports(
                db=db,
                customer_id=customer_id,
                report_identifiers=identifier_dicts
            )
        else:
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
        send_error_log("annual_report_api", f"Annual Reports 삭제 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


class RegisterARContractsRequest(BaseModel):
    """AR 보험계약 등록 요청"""
    issue_date: str = Field(..., description="등록할 AR의 발행일 (YYYY-MM-DD 또는 ISO 형식)")
    customer_name: Optional[str] = Field(None, description="AR의 고객명 (발행일과 함께 식별용)")

    class Config:
        json_schema_extra = {
            "example": {
                "issue_date": "2025-08-29",
                "customer_name": "홍길동"
            }
        }


class RegisterARContractsResponse(BaseModel):
    """AR 보험계약 등록 응답"""
    success: bool
    message: str
    registered_at: Optional[str] = None
    duplicate: bool = False


@router.post(
    "/customers/{customer_id}/ar-contracts",
    response_model=RegisterARContractsResponse
)
async def register_ar_contracts(
    customer_id: str = Path(..., description="고객 ObjectId"),
    request: RegisterARContractsRequest = Body(...),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    AR 보험계약 등록 (수동)

    Annual Report의 계약 정보를 보험계약 탭에 등록합니다.
    registered_at 필드를 설정하여 등록 여부를 표시합니다.

    Args:
        customer_id: 고객 ObjectId
        request: 등록 요청 (issue_date, customer_name)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        RegisterARContractsResponse: {
            "success": true,
            "message": "보험계약이 등록되었습니다",
            "registered_at": "2026-01-13T12:00:00Z"
        }

    Raises:
        HTTPException 400: userId 또는 요청이 유효하지 않을 때
        HTTPException 404: 고객 또는 AR을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    from datetime import datetime

    logger.info(f"📋 AR 보험계약 등록 요청: customer_id={customer_id}, user_id={user_id}, issue_date={request.issue_date}")

    try:
        # userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # customer_id 유효성 검증
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        # customer 소유권 검증 (Internal API 경유)
        if not check_customer_ownership(customer_id, user_id):
            raise HTTPException(
                status_code=404,
                detail="고객을 찾을 수 없거나 접근 권한이 없습니다"
            )

        from main import db
        if db is None:
            raise HTTPException(status_code=500, detail="데이터베이스 연결 오류")

        # annual_reports 배열에서 해당 AR 찾기 (Internal API 경유)
        customer = get_customer(customer_id)
        if not customer:
            logger.error(f"소유권 확인 통과 후 고객 문서 없음: {customer_id}")
            raise HTTPException(status_code=500, detail="고객 데이터 일관성 오류")
        annual_reports = customer.get("annual_reports", [])
        target_issue_date = request.issue_date.split('T')[0]  # YYYY-MM-DD만 비교

        found_index = None
        for idx, ar in enumerate(annual_reports):
            ar_issue_date = ar.get("issue_date")
            ar_customer_name = ar.get("customer_name", "")

            # issue_date 정규화
            if ar_issue_date:
                if isinstance(ar_issue_date, datetime):
                    ar_issue_date_str = ar_issue_date.strftime("%Y-%m-%d")
                elif isinstance(ar_issue_date, str):
                    ar_issue_date_str = ar_issue_date.split('T')[0]
                else:
                    ar_issue_date_str = None
            else:
                ar_issue_date_str = None

            # issue_date와 customer_name 모두 일치하는지 확인
            if ar_issue_date_str == target_issue_date:
                # customer_name이 제공된 경우 추가 검증
                if request.customer_name:
                    if ar_customer_name == request.customer_name:
                        found_index = idx
                        break
                else:
                    # customer_name이 없으면 issue_date만으로 매칭
                    found_index = idx
                    break

        if found_index is None:
            raise HTTPException(
                status_code=404,
                detail=f"발행일 {target_issue_date}의 Annual Report를 찾을 수 없습니다"
            )

        # Internal API 경유 등록 (duplicate 체크 포함)
        api_result = register_annual_report(customer_id, target_issue_date)

        if not api_result.get("success"):
            raise HTTPException(status_code=500, detail="등록 실패: Internal API 호출 오류")

        data = api_result.get("data", {})
        if data.get("duplicate"):
            return RegisterARContractsResponse(
                success=True,
                message="이미 보험계약 탭에 등록된 Annual Report입니다",
                registered_at=data.get("registered_at", ""),
                duplicate=True
            )

        logger.info(f"✅ AR 보험계약 등록 완료: customer_id={customer_id}, issue_date={target_issue_date}")
        return RegisterARContractsResponse(
            success=True,
            message="보험계약이 등록되었습니다",
            registered_at=data.get("registered_at", "")
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ 유효성 검증 실패: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ AR 보험계약 등록 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"AR 보험계약 등록 API 오류: {e}", e)
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")


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
        if not ObjectId.is_valid(customer_id):
            raise HTTPException(status_code=400, detail="Invalid customer_id format")

        if not check_customer_ownership(customer_id, user_id):
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
        send_error_log("annual_report_api", f"중복 정리 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

"""
Customer Review Service API 라우터
POST /customer-review/check - CR 판정 + 메타데이터 추출
POST /customer-review/parse - CR 파싱 (동기)
GET /customers/{customer_id}/customer-reviews - Customer Reviews 조회
DELETE /customers/{customer_id}/customer-reviews - Customer Reviews 삭제
"""
from fastapi import APIRouter, HTTPException, Path, Query, Body, Header, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from bson import ObjectId
from bson.errors import InvalidId
import logging
import os
import tempfile

from services.cr_detector import is_customer_review, extract_cr_metadata_from_first_page
from services.cr_parser import parse_customer_review
from services.cr_parser_table import parse_customer_review_table
from services.db_writer import get_customer_reviews, delete_customer_reviews, save_customer_review
from system_logger import send_error_log
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()

# aims_api 설정 조회 URL
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://100.110.215.65:3010")


async def get_cr_parser_setting() -> str:
    """
    aims_api에서 CR 파서 설정 조회
    기본값: 'regex'
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AIMS_API_URL}/api/settings/ai-models")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    return data["data"].get("customerReview", {}).get("parser", "regex")
    except Exception as e:
        logger.warning(f"CR 파서 설정 조회 실패, 기본값 사용: {e}")
    return "regex"


# ================================================================================
# Request/Response 모델
# ================================================================================

class CustomerReviewCheckResponse(BaseModel):
    """Customer Review 판정 응답"""
    is_customer_review: bool
    confidence: float
    reason: str
    matched_keywords: List[str]
    metadata: Optional[Dict[str, str]] = None  # 1페이지 메타데이터

    class Config:
        json_schema_extra = {
            "example": {
                "is_customer_review": True,
                "confidence": 0.9,
                "reason": "키워드 매칭: 2/2 필수, 5/7 선택",
                "matched_keywords": ["Customer Review Service", "메트라이프", "변액", "적립금", "투자수익률"],
                "metadata": {
                    "product_name": "무) 실버플랜 변액유니버셜V보험(일시납)",
                    "issue_date": "2025-09-09",
                    "contractor_name": "고영자",
                    "insured_name": "유진호",
                    "fsr_name": "송유미"
                }
            }
        }


class CustomerReviewParseRequest(BaseModel):
    """Customer Review 파싱 요청 (PDF 경로 기반)"""
    pdf_path: str = Field(..., description="PDF 파일 경로")
    customer_id: str = Field(..., description="고객 ObjectId")
    source_file_id: Optional[str] = Field(None, description="원본 파일 ID")
    end_page: int = Field(4, description="마지막 페이지 번호 (보통 4)")

    class Config:
        json_schema_extra = {
            "example": {
                "pdf_path": "/tmp/customer_review.pdf",
                "customer_id": "507f1f77bcf86cd799439011",
                "source_file_id": "507f1f77bcf86cd799439012",
                "end_page": 4
            }
        }


class CustomerReviewParseResponse(BaseModel):
    """Customer Review 파싱 응답"""
    success: bool
    message: str
    summary: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Customer Review 파싱 및 저장 완료",
                "summary": {
                    "policy_number": "0011423761",
                    "product_name": "무) 실버플랜 변액유니버셜V보험",
                    "contractor_name": "고영자",
                    "total_accumulated_amount": 19336631,
                    "fund_count": 2
                }
            }
        }


class CustomerReviewsResponse(BaseModel):
    """Customer Reviews 조회 응답"""
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
                        "product_name": "무) 실버플랜 변액유니버셜V보험",
                        "issue_date": "2025-09-09",
                        "contractor_name": "고영자",
                        "insured_name": "유진호",
                        "total_accumulated_amount": 19336631,
                        "fund_count": 2,
                        "status": "completed"
                    }
                ],
                "count": 1,
                "total": 1
            }
        }


class DeleteCustomerReviewsRequest(BaseModel):
    """Customer Reviews 삭제 요청"""
    indices: List[int] = Field(..., description="삭제할 리뷰 인덱스 리스트 (최신순 기준)")

    class Config:
        json_schema_extra = {
            "example": {
                "indices": [0, 2, 5]
            }
        }


class DeleteCustomerReviewsResponse(BaseModel):
    """Customer Reviews 삭제 응답"""
    success: bool
    message: str
    deleted_count: int


# ================================================================================
# API 엔드포인트
# ================================================================================

@router.post(
    "/customer-review/check",
    response_model=CustomerReviewCheckResponse
)
async def check_customer_review(
    file: UploadFile = File(..., description="PDF 파일"),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    PDF가 Customer Review Service 문서인지 판정하고 메타데이터 추출

    Args:
        file: PDF 파일
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        CustomerReviewCheckResponse: {
            "is_customer_review": true/false,
            "confidence": 0.0~1.0,
            "reason": "...",
            "matched_keywords": [...],
            "metadata": {...}  // is_customer_review=true인 경우에만
        }
    """
    logger.info(f"📥 Customer Review 판정 요청: file={file.filename}, user_id={user_id}")

    temp_path = None
    try:
        # userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # 파일 유효성 검증
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="PDF 파일만 업로드 가능합니다"
            )

        # 임시 파일 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            temp_path = temp_file.name
            content = await file.read()
            temp_file.write(content)

        # Customer Review 판정
        result = is_customer_review(temp_path)

        # CR인 경우 메타데이터 추출
        metadata = None
        if result["is_customer_review"]:
            metadata = extract_cr_metadata_from_first_page(temp_path)

        logger.info(
            f"✅ Customer Review 판정 완료: "
            f"is_cr={result['is_customer_review']}, confidence={result['confidence']}"
        )

        return CustomerReviewCheckResponse(
            is_customer_review=result["is_customer_review"],
            confidence=result["confidence"],
            reason=result["reason"],
            matched_keywords=result["matched_keywords"],
            metadata=metadata
        )

    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"❌ 파일을 찾을 수 없습니다: {e}")
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"❌ Customer Review 판정 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Review 판정 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )
    finally:
        # 임시 파일 정리
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception as e:
                logger.warning(f"임시 파일 삭제 실패: {e}")


@router.post(
    "/customer-review/parse",
    response_model=CustomerReviewParseResponse
)
async def parse_customer_review_api(
    request: CustomerReviewParseRequest = Body(...),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    Customer Review PDF 파싱 및 DB 저장 (동기 처리)

    Args:
        request: 파싱 요청 (pdf_path, customer_id, source_file_id, end_page)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        CustomerReviewParseResponse: {
            "success": true/false,
            "message": "...",
            "summary": {...}  // 성공 시
        }
    """
    logger.info(
        f"📥 Customer Review 파싱 요청: "
        f"pdf_path={request.pdf_path}, customer_id={request.customer_id}, user_id={user_id}"
    )

    try:
        # userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # PDF 파일 존재 확인
        if not os.path.exists(request.pdf_path):
            raise HTTPException(
                status_code=404,
                detail=f"PDF 파일을 찾을 수 없습니다: {request.pdf_path}"
            )

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # customer 소유권 검증
        try:
            customer_obj_id = ObjectId(request.customer_id)
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

        # 1. 1페이지 메타데이터 추출 (AI 불사용)
        metadata = extract_cr_metadata_from_first_page(request.pdf_path)

        # 2. 파서 설정 조회
        parser_type = await get_cr_parser_setting()
        logger.info(f"📊 CR 파서 타입: {parser_type}")

        # 3. 파서 타입에 따라 파싱 실행
        if parser_type == "pdfplumber_table":
            # 테이블 기반 일반화 파서 (pdfplumber)
            parsed_data = parse_customer_review_table(
                pdf_path=request.pdf_path,
                end_page=request.end_page
            )
        else:
            # 기존 정규식 파서 (regex)
            parsed_data = parse_customer_review(
                pdf_path=request.pdf_path,
                end_page=request.end_page
            )

        # 파싱 실패 체크
        if "error" in parsed_data:
            logger.error(f"❌ Customer Review 파싱 실패: {parsed_data['error']}")
            return CustomerReviewParseResponse(
                success=False,
                message="파싱 실패",
                error=parsed_data["error"]
            )

        # 3. DB 저장
        save_result = save_customer_review(
            db=db,
            customer_id=request.customer_id,
            report_data=parsed_data,
            metadata=metadata,
            source_file_id=request.source_file_id
        )

        if not save_result["success"]:
            logger.error(f"❌ Customer Review 저장 실패: {save_result['message']}")
            return CustomerReviewParseResponse(
                success=False,
                message=save_result["message"],
                error=save_result.get("message")
            )

        logger.info(f"✅ Customer Review 파싱 및 저장 완료: {save_result['summary']}")

        return CustomerReviewParseResponse(
            success=True,
            message="Customer Review 파싱 및 저장 완료",
            summary=save_result["summary"]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Customer Review 파싱 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Review 파싱 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.get(
    "/customers/{customer_id}/customer-reviews",
    response_model=CustomerReviewsResponse
)
async def get_customer_reviews_api(
    customer_id: str = Path(..., description="고객 ObjectId"),
    limit: int = Query(10, ge=1, le=100, description="최대 조회 개수"),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 Customer Reviews 조회 (최신순)

    Args:
        customer_id: 고객 ObjectId
        limit: 최대 조회 개수 (기본 10, 최대 100)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        CustomerReviewsResponse: {
            "success": true,
            "data": [...],
            "count": 조회된 개수,
            "total": 전체 개수
        }
    """
    logger.info(f"📥 Customer Reviews 조회 요청: customer_id={customer_id}, user_id={user_id}, limit={limit}")

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

        # customer_id 유효성 및 소유권 검증
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

        # Customer Reviews 조회
        result = get_customer_reviews(
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
            f"✅ Customer Reviews 조회 완료: {result['count']}건 (전체 {result['total']}건)"
        )

        return CustomerReviewsResponse(
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
        logger.error(f"❌ Customer Reviews 조회 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Reviews 조회 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.delete(
    "/customers/{customer_id}/customer-reviews",
    response_model=DeleteCustomerReviewsResponse
)
async def delete_customer_reviews_api(
    customer_id: str = Path(..., description="고객 ObjectId"),
    request: DeleteCustomerReviewsRequest = Body(...),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    고객의 Customer Reviews 삭제 (복수 선택 가능)

    Args:
        customer_id: 고객 ObjectId
        request: 삭제 요청 (indices 배열)
        user_id: 설계사 userId (x-user-id 헤더)

    Returns:
        DeleteCustomerReviewsResponse: {
            "success": true,
            "message": "N건의 Customer Review가 삭제되었습니다",
            "deleted_count": N
        }
    """
    logger.info(f"🗑️  Customer Reviews 삭제 요청: customer_id={customer_id}, user_id={user_id}, indices={request.indices}")

    try:
        # userId 검증
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

        # customer 소유권 검증
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
        result = delete_customer_reviews(
            db=db,
            customer_id=customer_id,
            review_indices=request.indices
        )

        if not result["success"]:
            if "찾을 수 없습니다" in result.get("message", ""):
                raise HTTPException(
                    status_code=404,
                    detail=result["message"]
                )
            # "삭제할 항목이 없습니다"는 성공으로 처리 (0건 삭제)
            elif "삭제할 항목이 없" in result.get("message", ""):
                logger.info(f"ℹ️  삭제할 항목 없음 (이미 삭제되었거나 존재하지 않음)")
                return DeleteCustomerReviewsResponse(
                    success=True,
                    message="삭제할 항목이 없습니다 (이미 삭제되었거나 존재하지 않음)",
                    deleted_count=0
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=result.get("message", "삭제 실패")
                )

        logger.info(f"✅ Customer Reviews 삭제 완료: {result['deleted_count']}건")

        return DeleteCustomerReviewsResponse(
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
        logger.error(f"❌ Customer Reviews 삭제 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Customer Reviews 삭제 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )

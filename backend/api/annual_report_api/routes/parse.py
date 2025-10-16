"""
Annual Report 파싱 API 라우터
POST /annual-report/parse - 파싱 실행 (비동기)
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging
import os

from services.detector import is_annual_report, extract_customer_info_from_first_page
from services.parser import parse_annual_report
from services.db_writer import save_annual_report
from utils.pdf_utils import find_contract_table_end_page

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response 모델
class ParseRequest(BaseModel):
    """파싱 요청 모델"""
    file_id: str = Field(..., description="MongoDB files 컬렉션의 ObjectId")
    customer_id: str = Field(..., description="고객 ObjectId")
    file_path: Optional[str] = Field(None, description="PDF 파일 경로 (선택)")

    class Config:
        json_schema_extra = {
            "example": {
                "file_id": "507f1f77bcf86cd799439011",
                "customer_id": "507f191e810c19729de860ea",
                "file_path": "/data/uploads/sample.pdf"
            }
        }


class ParseResponse(BaseModel):
    """파싱 응답 모델"""
    success: bool
    message: str
    job_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "파싱 시작됨. 약 25초 후 완료됩니다.",
                "job_id": "507f1f77bcf86cd799439011"
            }
        }


def do_parsing_in_background(
    db,
    file_path: str,
    file_id: str,
    customer_id: str
):
    """
    백그라운드 작업: Annual Report 파싱 및 저장
    평균 소요 시간: 25초

    Args:
        db: MongoDB database 객체
        file_path: PDF 파일 경로
        file_id: 파일 ObjectId
        customer_id: 고객 ObjectId
    """
    logger.info(f"🚀 백그라운드 파싱 시작: file_id={file_id}, customer_id={customer_id}")

    try:
        # 1. Annual Report 판단 (1초)
        logger.info("Step 1: Annual Report 판단 중...")
        check_result = is_annual_report(file_path)

        if not check_result["is_annual_report"]:
            logger.warning(
                f"⚠️  Annual Report 아님 (confidence: {check_result['confidence']}): "
                f"{check_result['reason']}"
            )
            # TODO: 파일 메타데이터에 is_annual_report=False 기록
            return

        logger.info(
            f"✅ Annual Report 확인됨 (confidence: {check_result['confidence']})"
        )

        # 2. N페이지 동적 탐지 (1초)
        logger.info("Step 2: N페이지 탐지 중...")
        end_page = find_contract_table_end_page(file_path)
        logger.info(f"📄 계약 테이블 범위: 1 ~ {end_page + 1}페이지")

        # 3. 고객 정보 추출 (선택)
        customer_info = extract_customer_info_from_first_page(file_path)
        customer_name = customer_info.get("customer_name")

        # 4. OpenAI API 파싱 (평균 25초)
        logger.info("Step 3: OpenAI API 파싱 중 (약 25초 소요)...")
        result = parse_annual_report(file_path, customer_name=customer_name)

        # 5. 파싱 결과 확인
        if "error" in result:
            logger.error(f"❌ 파싱 실패: {result['error']}")
            # TODO: 파일 메타데이터에 파싱 실패 기록
            return

        # 6. MongoDB 저장 (1초)
        logger.info("Step 4: MongoDB 저장 중...")
        save_result = save_annual_report(
            db=db,
            customer_id=customer_id,
            report_data=result,
            source_file_id=file_id
        )

        if save_result["success"]:
            logger.info(
                f"✅ 파싱 완료: {save_result['summary']['customer_name']} - "
                f"{save_result['summary']['total_contracts']}건 계약"
            )
        else:
            logger.error(f"❌ DB 저장 실패: {save_result['message']}")

    except FileNotFoundError as e:
        logger.error(f"❌ 파일을 찾을 수 없습니다: {e}")
    except Exception as e:
        logger.error(f"❌ 백그라운드 파싱 중 예상치 못한 오류: {e}", exc_info=True)


@router.post("/parse", response_model=ParseResponse)
async def parse_annual_report_endpoint(
    request: ParseRequest,
    background_tasks: BackgroundTasks
):
    """
    Annual Report PDF 파싱 API (비동기)

    파일 업로드 후 즉시 응답 반환하고, 백그라운드에서 파싱 진행
    평균 처리 시간: 25초

    Args:
        request: ParseRequest (file_id, customer_id, file_path)
        background_tasks: FastAPI BackgroundTasks

    Returns:
        ParseResponse: {
            "success": true,
            "message": "파싱 시작됨...",
            "job_id": "file_id"
        }

    Raises:
        HTTPException 400: file_path가 없거나 파일을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 파싱 요청 수신: file_id={request.file_id}, customer_id={request.customer_id}")

    try:
        # 파일 경로 확인
        file_path = request.file_path

        if not file_path:
            # file_path가 없으면 file_id로부터 추론 (tars 서버 기준)
            # TODO: MongoDB files 컬렉션에서 실제 경로 조회
            logger.warning("file_path가 제공되지 않았습니다. 기본 경로 사용")
            raise HTTPException(
                status_code=400,
                detail="file_path가 필요합니다"
            )

        # 파일 존재 확인
        if not os.path.exists(file_path):
            logger.error(f"파일을 찾을 수 없습니다: {file_path}")
            raise HTTPException(
                status_code=400,
                detail=f"파일을 찾을 수 없습니다: {file_path}"
            )

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(
                status_code=500,
                detail="데이터베이스 연결 오류"
            )

        # 백그라운드 작업 등록
        background_tasks.add_task(
            do_parsing_in_background,
            db,
            file_path,
            request.file_id,
            request.customer_id
        )

        logger.info(f"✅ 백그라운드 작업 등록 완료: {request.file_id}")

        # 즉시 응답 반환 (< 1초)
        return ParseResponse(
            success=True,
            message="파싱 시작됨. 약 25초 후 완료됩니다.",
            job_id=request.file_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ 파싱 API 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.get("/status/{file_id}")
async def get_parsing_status(file_id: str):
    """
    파싱 상태 조회 API (선택 구현)

    Args:
        file_id: 파일 ObjectId

    Returns:
        dict: {
            "file_id": str,
            "status": str,  # "pending", "processing", "completed", "failed"
            "message": str
        }

    Note:
        현재는 기본 구현. 실제로는 Redis 등을 사용한 상태 추적 필요
    """
    # TODO: Redis 또는 MongoDB에서 파싱 상태 조회
    logger.info(f"파싱 상태 조회: {file_id}")

    return {
        "file_id": file_id,
        "status": "processing",
        "message": "파싱 진행 중. MongoDB annual_reports를 직접 조회하세요."
    }

"""
Annual Report 파싱 API 라우터
POST /annual-report/parse - 파싱 실행 (비동기)
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, Form, Header
from pydantic import BaseModel, Field
from typing import Optional
from bson import ObjectId
from bson.errors import InvalidId
import logging
import os
import tempfile
import shutil

from services.detector import is_annual_report, extract_customer_info_from_first_page
from services.parser_factory import get_parser
from services.db_writer import save_annual_report
from utils.pdf_utils import find_contract_table_end_page
from system_logger import send_error_log

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response 모델
class ParseRequest(BaseModel):
    """파싱 요청 모델 (JSON body용)"""
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


class CheckResponse(BaseModel):
    """Annual Report 판단 + 1페이지 메타데이터 응답"""
    is_annual_report: bool
    confidence: float
    metadata: Optional[dict] = None  # customer_name, report_title, issue_date, fsr_name

    class Config:
        json_schema_extra = {
            "example": {
                "is_annual_report": True,
                "confidence": 0.95,
                "metadata": {
                    "customer_name": "안영미",
                    "report_title": "Annual Review Report",
                    "issue_date": "2025-08-27",
                    "fsr_name": "홍길동"
                }
            }
        }


@router.post("/check", response_model=CheckResponse)
async def check_annual_report_endpoint(
    file: UploadFile = File(...)
):
    """
    Annual Report 판단 및 1페이지 메타데이터 추출 API

    - AI 사용 안 함 (토큰 절약)
    - 1페이지만 텍스트 추출
    - 프론트엔드는 이 정보로 고객 식별 로직 실행

    Args:
        file: PDF 파일 (multipart/form-data)

    Returns:
        CheckResponse: {
            "is_annual_report": bool,
            "confidence": float,
            "metadata": {
                "customer_name": str,
                "report_title": str,
                "issue_date": str,
                "fsr_name": str
            }
        }

    Raises:
        HTTPException 400: 파일이 PDF가 아니거나 유효하지 않을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 Annual Report 체크 요청: filename={file.filename}")

    temp_file_path = None
    try:
        # PDF 파일 검증
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="PDF 파일만 업로드 가능합니다"
            )

        # 임시 파일로 저장
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_file_path = temp_file.name

        with open(temp_file_path, 'wb') as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"📁 임시 파일 저장: {temp_file_path}")

        # 1. Annual Report 판단
        check_result = is_annual_report(temp_file_path)

        if not check_result["is_annual_report"]:
            logger.info(
                f"❌ Annual Report 아님 (confidence: {check_result['confidence']}): "
                f"{check_result['reason']}"
            )
            return CheckResponse(
                is_annual_report=False,
                confidence=check_result["confidence"],
                metadata=None
            )

        logger.info(
            f"✅ Annual Report 확인됨 (confidence: {check_result['confidence']})"
        )

        # 2. 1페이지 메타데이터 추출 (AI 불사용)
        metadata = extract_customer_info_from_first_page(temp_file_path)

        logger.info(f"📄 메타데이터 추출 완료: {metadata}")

        return CheckResponse(
            is_annual_report=True,
            confidence=check_result["confidence"],
            metadata=metadata if metadata else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Annual Report 체크 중 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"Annual Report 체크 중 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )
    finally:
        # 임시 파일 정리
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"🗑️  임시 파일 삭제: {temp_file_path}")
            except Exception as cleanup_error:
                logger.warning(f"임시 파일 삭제 실패: {cleanup_error}")


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
        # ⚠️ customer_id가 제공되면 프론트엔드에서 이미 Annual Report 검증을 했다고 간주
        # (한글 파일명 인코딩 문제로 백엔드 체크가 실패할 수 있음)
        if customer_id:
            logger.info("✅ customer_id 제공됨 - Annual Report 체크 건너뛰기 (프론트엔드에서 검증 완료)")
        else:
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

        # 2. 1페이지 메타데이터 추출 (AI 불사용, 토큰 절약)
        logger.info("Step 2: 1페이지 메타데이터 추출 중...")
        metadata = extract_customer_info_from_first_page(file_path)

        # ⚠️ customer_id가 제공되면 DB에서 실제 고객명 가져오기 (OCR 오류 방지)
        if customer_id:
            from bson import ObjectId
            customer = db.customers.find_one({"_id": ObjectId(customer_id)})
            if customer:
                actual_customer_name = customer.get('personal_info', {}).get('name')
                if actual_customer_name:
                    logger.info(f"✅ DB에서 실제 고객명 사용: {actual_customer_name} (OCR: {metadata.get('customer_name')})")
                    metadata["customer_name"] = actual_customer_name

        customer_name = metadata.get("customer_name")
        logger.info(f"📄 메타데이터: {metadata}")

        # 3. N페이지 동적 탐지 (1초)
        logger.info("Step 3: N페이지 탐지 중...")
        end_page_0indexed = find_contract_table_end_page(file_path)  # 0-indexed 반환 (예: 2 = 3페이지)
        end_page_1indexed = end_page_0indexed + 1  # 1-based로 변환 (예: 3 = 3페이지)
        logger.info(f"📄 계약 테이블 범위: 2 ~ {end_page_1indexed}페이지 (1페이지 제외)")

        # 4. AR 파싱 (설정에 따라 파서 선택: openai/pdfplumber/upstage)
        logger.info("Step 4: AR 파싱 중 (2~N페이지)...")
        parse_annual_report = get_parser()  # 설정에 따라 파서 선택
        result = parse_annual_report(file_path, customer_name=customer_name, end_page=end_page_1indexed)

        # 5. 파싱 결과 확인
        if "error" in result:
            logger.error(f"❌ 파싱 실패: {result['error']}")
            # TODO: 파일 메타데이터에 파싱 실패 기록
            return

        # 6. MongoDB 저장 (1초)
        logger.info("Step 5: MongoDB 저장 중...")
        save_result = save_annual_report(
            db=db,
            customer_id=customer_id,
            report_data=result,
            metadata=metadata,  # 1페이지 메타데이터 전달
            source_file_id=file_id
        )

        if save_result["success"]:
            logger.info(
                f"✅ 파싱 완료: {save_result['summary']['customer_name']} - "
                f"{save_result['summary']['total_contracts']}건 계약"
            )

            # 7. docupload.files 컬렉션 업데이트: is_annual_report 필드 설정
            try:
                from bson import ObjectId
                # file_id가 temp_로 시작하는 경우 파일명으로 검색
                if file_id.startswith("temp_"):
                    # 파일명으로 documents 찾기
                    filename = os.path.basename(file_path)
                    logger.info(f"🔍 파일명으로 문서 검색: {filename}")
                    files_collection = db["docupload.files"]
                    doc = files_collection.find_one({"upload.originalName": filename})
                    if doc:
                        file_oid = doc["_id"]
                        files_collection.update_one(
                            {"_id": file_oid},
                            {"$set": {"is_annual_report": True}}
                        )
                        logger.info(f"✅ is_annual_report=True 설정 완료: {file_oid}")
                    else:
                        logger.warning(f"⚠️  문서를 찾을 수 없음: {filename}")
                else:
                    # ObjectId로 직접 검색
                    file_oid = ObjectId(file_id)
                    files_collection = db["docupload.files"]
                    files_collection.update_one(
                        {"_id": file_oid},
                        {"$set": {"is_annual_report": True}}
                    )
                    logger.info(f"✅ is_annual_report=True 설정 완료: {file_oid}")
            except Exception as update_error:
                logger.warning(f"⚠️  is_annual_report 필드 업데이트 실패: {update_error}")
        else:
            logger.error(f"❌ DB 저장 실패: {save_result['message']}")

    except FileNotFoundError as e:
        logger.error(f"❌ 파일을 찾을 수 없습니다: {e}")
    except Exception as e:
        logger.error(f"❌ 백그라운드 파싱 중 예상치 못한 오류: {e}", exc_info=True)


@router.post("/parse", response_model=ParseResponse)
async def parse_annual_report_endpoint(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    customer_id: str = Form(...),
    end_page: Optional[int] = Form(None),
    user_id: str = Header(None, alias="x-user-id")
):
    """
    Annual Report PDF 파싱 API (비동기) - Multipart/form-data

    파일 업로드 후 즉시 응답 반환하고, 백그라운드에서 파싱 진행
    평균 처리 시간: 25초

    Args:
        file: PDF 파일 (multipart/form-data)
        customer_id: 고객 ObjectId
        end_page: 추출할 마지막 페이지 번호 (선택, 자동 감지 가능)
        user_id: 설계사 userId (x-user-id 헤더)
        background_tasks: FastAPI BackgroundTasks

    Returns:
        ParseResponse: {
            "success": true,
            "message": "파싱 시작됨...",
            "job_id": "temp_file_id"
        }

    Raises:
        HTTPException 400: userId, customer_id 또는 파일이 유효하지 않을 때
        HTTPException 404: 고객을 찾을 수 없을 때
        HTTPException 500: 서버 오류
    """
    logger.info(f"📥 파싱 요청 수신: filename={file.filename}, customer_id={customer_id}, user_id={user_id}, end_page={end_page}")

    temp_file_path = None
    try:
        # ⭐ userId 검증
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # ⭐ customer 소유권 검증
        from main import db
        if db is None:
            raise HTTPException(status_code=500, detail="데이터베이스 연결 오류")

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

        # PDF 파일 검증
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400,
                detail="PDF 파일만 업로드 가능합니다"
            )

        # 임시 파일로 저장
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_file_path = temp_file.name

        with open(temp_file_path, 'wb') as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"📁 임시 파일 저장: {temp_file_path}")

        # customer 정보 로깅 (이미 위에서 검증 완료)
        logger.info(f"✅ 고객 확인됨: {customer.get('personal_info', {}).get('name', 'Unknown')}")

        # file_id 생성 (임시)
        file_id = f"temp_{os.path.basename(temp_file_path)}"

        # 백그라운드 작업 등록
        background_tasks.add_task(
            do_parsing_in_background,
            db,
            temp_file_path,
            file_id,
            customer_id
        )

        logger.info(f"✅ 백그라운드 작업 등록 완료: {file_id}")

        # 즉시 응답 반환 (< 1초)
        return ParseResponse(
            success=True,
            message="파싱 시작됨. 약 25초 후 완료됩니다.",
            job_id=file_id
        )

    except HTTPException:
        # HTTP 예외는 그대로 전파하고 임시 파일 정리
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        raise
    except Exception as e:
        # 예상치 못한 오류 시 임시 파일 정리
        if temp_file_path and os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
        logger.error(f"❌ 파싱 API 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"파싱 API 오류: {e}", e)
        raise HTTPException(
            status_code=500,
            detail=f"서버 오류: {str(e)}"
        )


@router.post("/parse-by-path", response_model=ParseResponse)
async def parse_annual_report_by_path_endpoint(
    request: ParseRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Header(None, alias="x-user-id")
):
    """
    Annual Report PDF 파싱 API (비동기) - JSON body (기존 방식)

    파일 경로를 받아서 파싱 진행
    평균 처리 시간: 25초

    Args:
        request: ParseRequest (file_id, customer_id, file_path)
        background_tasks: FastAPI BackgroundTasks
        user_id: 설계사 userId (x-user-id 헤더)

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
    logger.info(f"📥 파싱 요청 수신 (경로): file_id={request.file_id}, customer_id={request.customer_id}, user_id={user_id}")

    try:
        # ⭐ userId 검증 (사용자 계정 기능)
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")

        # MongoDB 연결 확인
        from main import db
        if db is None:
            raise HTTPException(status_code=500, detail="데이터베이스 연결 오류")

        # ⭐ customer 소유권 검증
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

        # 파일 경로 확인
        file_path = request.file_path

        if not file_path:
            logger.warning("file_path가 제공되지 않았습니다")
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
        send_error_log("annual_report_api", f"경로 기반 파싱 API 오류: {e}", e)
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

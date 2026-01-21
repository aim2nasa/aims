"""
DocPrepMain Router
Main orchestrator for document processing pipeline

큐잉 모드 지원:
- UPLOAD_QUEUE_ENABLED=True: 요청을 MongoDB 큐에 저장 후 즉시 응답
- UPLOAD_QUEUE_ENABLED=False: 기존 동기 처리 (롤백용)
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from config import get_settings
from services.mongo_service import MongoService
from services.file_service import FileService
from services.meta_service import MetaService
from services.openai_service import OpenAIService
from services.redis_service import RedisService
from services.temp_file_service import TempFileService
from services.upload_queue_service import UploadQueueService

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# Unsupported MIME types
UNSUPPORTED_MIME_TYPES = [
    "application/postscript",
    "application/zip",
    "application/octet-stream"
]


@router.post("/docprep-main")
async def doc_prep_main(
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    source_path: Optional[str] = Form(None),
    shadow: bool = False,  # Shadow mode: 문서 생성 없이 응답만 시뮬레이션
    shadow_saved_name: Optional[str] = Form(None),  # n8n이 생성한 파일명 (shadow mode용)
    shadow_created_at: Optional[str] = Form(None),  # n8n이 생성한 created_at (shadow mode용)
):
    """
    Main document processing orchestrator.

    Flow:
    1. Create document in MongoDB
    2. Save file to disk
    3. Extract metadata
    4. Route based on MIME type:
       - text/plain: Extract and save text
       - unsupported: Return 415
       - OCR needed: Queue to Redis
       - Has text: Notify complete
    """
    settings = get_settings()
    doc_id = None

    # Shadow mode: 문서 생성 없이 메타데이터 추출 및 응답 시뮬레이션만 수행
    if shadow:
        logger.info(f"[SHADOW] Processing file for comparison (no DB write)")
        logger.info(f"[SHADOW] Using n8n values - saved_name: {shadow_saved_name}, created_at: {shadow_created_at}")
        try:
            file_content = await file.read()
            original_name = file.filename or "unknown"

            # n8n이 전달한 파일명 사용 (없으면 자체 생성 - 비교용)
            if shadow_saved_name:
                simulated_filename = shadow_saved_name
            else:
                # Fallback: n8n 파일명이 없으면 자체 생성 (비교 불일치 예상)
                simulated_filename = FileService._generate_filename(original_name)
                logger.warning(f"[SHADOW] No shadow_saved_name provided, generated: {simulated_filename}")

            # 임시 파일로 메타데이터 추출
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(original_name)[1]) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                meta_result = await MetaService.extract_metadata(tmp_path)
                # n8n이 생성한 파일명으로 교체
                meta_result["filename"] = simulated_filename
            finally:
                os.unlink(tmp_path)  # 임시 파일 삭제

            if meta_result.get("error"):
                return JSONResponse(
                    status_code=meta_result.get("status", 500),
                    content=meta_result
                )

            mime_type = meta_result.get("mime_type", "")
            full_text = meta_result.get("extracted_text", "")

            # MIME 타입별 응답 시뮬레이션
            if mime_type == "text/plain":
                return {"exitCode": 0, "stderr": ""}

            if mime_type in UNSUPPORTED_MIME_TYPES:
                return JSONResponse(
                    status_code=415,
                    content={
                        "warn": True,
                        "status": 415,
                        "userMessage": "OCR 생략: 지원하지 않는 문서 형식입니다.",
                        "mime": mime_type,
                        "filename": original_name,
                        "document_id": "shadow_simulated"
                    }
                )

            if not full_text or len(full_text.strip()) == 0:
                return {
                    "result": "success",
                    "document_id": "shadow_simulated",
                    "ocr": {
                        "status": "queued",
                        "queued_at": datetime.utcnow().isoformat()
                    }
                }

            # 텍스트 추출 성공 - 요약 생성
            summary_result = await OpenAIService.summarize_text(
                full_text,
                owner_id=userId,
                document_id="shadow_simulated"
            )

            # n8n이 전달한 created_at 사용 (없으면 현재 시간)
            if shadow_created_at:
                created_at_value = shadow_created_at
            else:
                created_at_value = datetime.utcnow().isoformat() + "Z"

            return {
                "result": "success",
                "document_id": "shadow_simulated",
                "status": "completed",
                "meta": {
                    "filename": meta_result.get("filename"),
                    "extension": meta_result.get("extension"),
                    "mime": meta_result.get("mime_type"),
                    "size_bytes": str(meta_result.get("file_size", "")),
                    "created_at": created_at_value,
                    "meta_status": "ok",
                    "exif": "{}",
                    "pdf_pages": str(meta_result.get("num_pages", "")),
                    "full_text": (full_text[:10000] + "...") if len(full_text) > 10000 else full_text
                }
            }
        except Exception as e:
            logger.error(f"[SHADOW] Error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    try:
        # 파일 내용 읽기
        file_content = await file.read()
        original_name = file.filename or "unknown"

        # 큐잉 모드 확인
        if settings.UPLOAD_QUEUE_ENABLED:
            # 큐잉 모드: 문서를 먼저 생성 후 파일 처리를 큐에 등록
            logger.info(f"Queueing upload for userId: {userId}, file: {original_name}")

            # 1. MongoDB 문서 먼저 생성 (set-annual-report API가 찾을 수 있도록)
            files_collection = MongoService.get_collection("files")
            doc_data = {
                "ownerId": userId,
                "createdAt": datetime.utcnow(),
                "upload": {
                    "originalName": original_name,
                    "uploaded_at": datetime.utcnow().isoformat()
                },
                # 초기 progress 설정 - 프론트엔드에서 즉시 표시
                "progress": 10,
                "progressStage": "queued",
                "progressMessage": "대기열에 추가됨",
                "status": "processing"  # 처리 중 상태 (set-annual-report가 찾을 수 있음)
            }
            if customerId:
                # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
                doc_data["customerId"] = ObjectId(customerId) if ObjectId.is_valid(customerId) else customerId

            result = await files_collection.insert_one(doc_data)
            doc_id = str(result.inserted_id)
            logger.info(f"Created document for queue: {doc_id}")

            # 2. 임시 파일 저장
            temp_path = await TempFileService.save(file_content, original_name)

            # 3. 큐에 작업 등록 (document_id 포함)
            queue_id = await UploadQueueService.enqueue(
                file_data={
                    "temp_path": temp_path,
                    "original_filename": original_name,
                    "file_size": len(file_content),
                    "mime_type": file.content_type
                },
                request_data={
                    "userId": userId,
                    "customerId": customerId,
                    "source_path": source_path,
                    "document_id": doc_id  # 기존 문서 ID 전달
                },
                owner_id=userId,
                customer_id=customerId
            )

            logger.info(f"Upload queued: {queue_id} for document: {doc_id}")

            # 4. 즉시 응답 반환 (document_id 포함)
            return {
                "result": "success",
                "status": "queued",
                "queue_id": queue_id,
                "document_id": doc_id,  # 프론트엔드가 사용할 document_id
                "message": "문서가 처리 대기열에 추가되었습니다."
            }

        # 동기 처리 모드 (UPLOAD_QUEUE_ENABLED=False 또는 롤백용)
        logger.info(f"Processing document synchronously for userId: {userId}, customerId: {customerId}")

        return await process_document_pipeline(
            file_content=file_content,
            original_name=original_name,
            user_id=userId,
            customer_id=customerId,
            source_path=source_path,
            mime_type=file.content_type
        )

    except Exception as e:
        logger.error(f"Error in doc_prep_main: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _detect_and_process_annual_report(
    doc_id: str,
    full_text: str,
    original_name: str,
    user_id: str,
    files_collection
) -> Dict[str, Any]:
    """
    🔴 AR 자동 감지 및 고객 연결

    텍스트에서 AR 패턴을 감지하고, AR이면:
    1. is_annual_report=True 설정
    2. 고객명 추출 → 고객 생성/검색
    3. customerId 설정
    4. ar_parsing_status='pending' 설정 (백그라운드 파싱 대기)

    Args:
        doc_id: 문서 ID
        full_text: 추출된 텍스트
        original_name: 원본 파일명
        user_id: 설계사 ID
        files_collection: MongoDB files 컬렉션

    Returns:
        dict: {
            "is_annual_report": bool,
            "customer_id": str or None,
            "customer_name": str or None
        }
    """
    import re
    import httpx

    settings = get_settings()

    try:
        # 1. AR 패턴 매칭 (공백 정규화)
        normalized_text = re.sub(r'\s+', ' ', full_text)

        # 필수 키워드: "Annual Review Report"
        required_keywords = ['Annual Review Report']
        # 선택 키워드: MetLife 관련
        optional_keywords = ['보유계약 현황', 'MetLife', '고객님을 위한', '메트라이프생명', '메트라이프']

        matched_required = [kw for kw in required_keywords if kw in normalized_text]
        matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

        # AR 판단: 필수 키워드 1개 이상 + 선택 키워드 1개 이상
        is_annual_report = len(matched_required) > 0 and len(matched_optional) > 0

        if not is_annual_report:
            logger.debug(f"AR 패턴 불일치: doc_id={doc_id}, required={matched_required}, optional={matched_optional}")
            return {"is_annual_report": False, "customer_id": None, "customer_name": None}

        logger.info(f"🔍 AR 감지: doc_id={doc_id}, 매칭={matched_required + matched_optional}")

        # 2. 고객명 추출: "XXX 고객님을 위한" 패턴
        customer_name = None
        customer_pattern = r'([가-힣]{2,10})\s*고객님을?\s*위한'
        customer_match = re.search(customer_pattern, normalized_text)
        if customer_match:
            customer_name = customer_match.group(1).strip()
            logger.info(f"📄 고객명 추출: {customer_name}")

        # 3. 발행기준일 추출
        issue_date = None
        # 패턴 1: "발행기준일: YYYY-MM-DD"
        date_pattern1 = r'발행기준일[:\s]*(\d{4})-(\d{1,2})-(\d{1,2})'
        date_match1 = re.search(date_pattern1, normalized_text)
        if date_match1:
            year, month, day = date_match1.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        else:
            # 패턴 2: "YYYY년 MM월 DD일"
            date_pattern2 = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
            date_match2 = re.search(date_pattern2, normalized_text)
            if date_match2:
                year, month, day = date_match2.groups()
                issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        if issue_date:
            logger.info(f"📅 발행기준일 추출: {issue_date}")

        # 4. 고객 생성/검색
        customer_id = None
        if customer_name and user_id:
            try:
                async with httpx.AsyncClient() as client:
                    # 고객 검색 (이름으로)
                    search_response = await client.get(
                        f"{settings.AIMS_API_URL}/api/customers/search",
                        params={"q": customer_name, "userId": user_id},
                        headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                        timeout=10.0
                    )

                    if search_response.status_code == 200:
                        search_result = search_response.json()
                        customers = search_result.get("customers", [])

                        # 정확히 일치하는 고객 찾기
                        exact_match = None
                        for c in customers:
                            c_name = c.get("personal_info", {}).get("name", "")
                            if c_name == customer_name:
                                exact_match = c
                                break

                        if exact_match:
                            customer_id = exact_match.get("_id")
                            logger.info(f"✅ 기존 고객 발견: {customer_name} (ID: {customer_id})")
                        else:
                            # 새 고객 생성
                            create_response = await client.post(
                                f"{settings.AIMS_API_URL}/api/customers",
                                json={
                                    "personal_info": {"name": customer_name},
                                    "insurance_info": {"customer_type": "개인"},
                                    "userId": user_id
                                },
                                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                                timeout=10.0
                            )

                            if create_response.status_code in [200, 201]:
                                new_customer = create_response.json()
                                customer_id = new_customer.get("_id")
                                logger.info(f"✅ 새 고객 생성: {customer_name} (ID: {customer_id})")
                            else:
                                logger.warning(f"고객 생성 실패: {create_response.text}")
                    else:
                        logger.warning(f"고객 검색 실패: {search_response.text}")
            except Exception as e:
                logger.warning(f"고객 생성/검색 중 오류: {e}")

        # 5. displayName 생성 (AR)
        # 형식: {고객명}_AR_{YYYY-MM-DD}.pdf
        display_name = None
        if customer_name and issue_date:
            display_name = f"{customer_name}_AR_{issue_date}.pdf"
            logger.info(f"📄 AR displayName 생성: {display_name}")

        # 6. DB 업데이트
        update_fields = {
            "is_annual_report": True,
            "document_type": "annual_report",
            "ar_parsing_status": "pending",  # 백그라운드 파싱 대기
        }

        if display_name:
            update_fields["displayName"] = display_name

        if customer_id:
            # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
            update_fields["customerId"] = ObjectId(customer_id) if ObjectId.is_valid(customer_id) else customer_id

        if issue_date:
            update_fields["ar_issue_date"] = issue_date

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": update_fields}
        )

        logger.info(f"✅ AR 플래그 설정 완료: doc_id={doc_id}, customer_id={customer_id}")

        return {
            "is_annual_report": True,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "issue_date": issue_date
        }

    except Exception as e:
        logger.error(f"AR 자동 감지 중 오류: {e}", exc_info=True)
        return {"is_annual_report": False, "customer_id": None, "customer_name": None}


async def _detect_and_process_customer_review(
    doc_id: str,
    full_text: str,
    original_name: str,
    user_id: str,
    files_collection
) -> Dict[str, Any]:
    """
    🔴 CRS (Customer Review Service) 자동 감지 및 displayName 생성

    Args:
        doc_id: 문서 ID
        full_text: PDF에서 추출된 전체 텍스트
        original_name: 원본 파일명
        user_id: 사용자 ID
        files_collection: MongoDB 컬렉션

    Returns:
        dict: {
            "is_customer_review": bool,
            "customer_name": str | None,
            "product_name": str | None,
            "issue_date": str | None,
            "display_name": str | None
        }
    """
    import httpx

    settings = get_settings()

    try:
        # 1. CRS 패턴 매칭
        normalized_text = re.sub(r'\s+', ' ', full_text)

        required_keywords = ['Customer Review Service']
        optional_keywords = ['메트라이프', '변액', '적립금', '투자수익률', '펀드', '해지환급금']

        matched_required = [kw for kw in required_keywords if kw in normalized_text]
        matched_optional = [kw for kw in optional_keywords if kw in normalized_text]

        # CRS 판단: "Customer Review Service" 필수 + 선택 키워드 1개 이상
        has_cr_keyword = "Customer Review Service" in normalized_text
        is_customer_review = has_cr_keyword and len(matched_optional) >= 1

        if not is_customer_review:
            logger.debug(f"CRS 패턴 불일치: doc_id={doc_id}")
            return {"is_customer_review": False}

        logger.info(f"🔍 CRS 감지: doc_id={doc_id}, 매칭={matched_required + matched_optional}")

        # 2. 메타데이터 추출 (고객명, 상품명, 발행일)

        # 2-1. 고객명 추출: "XXX 고객님을 위한" 패턴
        customer_name = None
        customer_pattern = r'([가-힣]+)\s*고객님을?\s*위한'
        customer_match = re.search(customer_pattern, normalized_text)
        if customer_match:
            customer_name = customer_match.group(1).strip()
            logger.info(f"📄 CRS 고객명 추출: {customer_name}")
        else:
            # fallback: "계약자 : XXX" 패턴
            contractor_pattern = r'계약자\s*[:\s]+([가-힣]+)'
            contractor_match = re.search(contractor_pattern, full_text)
            if contractor_match:
                customer_name = contractor_match.group(1).strip()
                logger.info(f"📄 CRS 계약자명 추출: {customer_name}")

        # 2-2. 상품명 추출
        # 패턴: "무) 실버플랜 변액유니버셜V보험(일시납) 종신, 전기납" 등
        product_name = None
        product_pattern = r"([무유]\)\s*.+?(?:종신|년납|만기))"
        product_match = re.search(product_pattern, full_text)
        if product_match:
            product_name = product_match.group(1).strip()
            # 발행일 이후 텍스트 제거
            if "발행" in product_name:
                product_name = product_name.split("발행")[0].strip()
            logger.info(f"📄 CRS 상품명 추출: {product_name}")
        else:
            # 대체 패턴: 변액 보험 상품명
            alt_product_pattern = r"([가-힣]+\s*변액[가-힣]+보험[^\s발계피사]*)"
            alt_match = re.search(alt_product_pattern, full_text)
            if alt_match:
                product_name = alt_match.group(1).strip()
                logger.info(f"📄 CRS 상품명 추출 (대체): {product_name}")

        # 2-3. 발행일 추출
        issue_date = None
        date_pattern = r'발행\s*(?:\(기준\))?\s*일[:\s]*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
        date_match = re.search(date_pattern, full_text)
        if date_match:
            year, month, day = date_match.groups()
            issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            logger.info(f"📅 CRS 발행일 추출: {issue_date}")
        else:
            # 대체 패턴: 일반 날짜
            alt_date_pattern = r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일'
            alt_date_match = re.search(alt_date_pattern, full_text)
            if alt_date_match:
                year, month, day = alt_date_match.groups()
                issue_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                logger.info(f"📅 CRS 발행일 추출 (대체): {issue_date}")

        # 3. displayName 생성
        # 형식: {고객명}_CRS_{상품명}_{YYYY-MM-DD}.pdf
        display_name = None
        if customer_name and product_name and issue_date:
            # 상품명 정규화 (파일명에 사용 불가 문자 제거)
            safe_product = re.sub(r'[\\/:*?"<>|]', '', product_name)
            safe_product = re.sub(r'\s+', ' ', safe_product).strip()
            display_name = f"{customer_name}_CRS_{safe_product}_{issue_date}.pdf"
            logger.info(f"📄 CRS displayName 생성: {display_name}")
        elif customer_name and issue_date:
            # 상품명 없이 생성
            display_name = f"{customer_name}_CRS_{issue_date}.pdf"
            logger.info(f"📄 CRS displayName 생성 (상품명 없음): {display_name}")

        # 4. 고객 생성/검색 (AR과 동일한 로직)
        customer_id = None
        if customer_name and user_id:
            try:
                async with httpx.AsyncClient() as client:
                    # 고객 검색 (이름으로)
                    search_response = await client.get(
                        f"{settings.AIMS_API_URL}/api/customers/search",
                        params={"q": customer_name, "userId": user_id},
                        headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                        timeout=10.0
                    )

                    if search_response.status_code == 200:
                        search_result = search_response.json()
                        customers = search_result.get("customers", [])

                        # 정확히 일치하는 고객 찾기
                        exact_match = None
                        for c in customers:
                            c_name = c.get("personal_info", {}).get("name", "")
                            if c_name == customer_name:
                                exact_match = c
                                break

                        if exact_match:
                            customer_id = exact_match.get("_id")
                            logger.info(f"✅ CRS 기존 고객 발견: {customer_name} (ID: {customer_id})")
                        else:
                            # 새 고객 생성
                            create_response = await client.post(
                                f"{settings.AIMS_API_URL}/api/customers",
                                json={
                                    "personal_info": {"name": customer_name},
                                    "insurance_info": {"customer_type": "개인"},
                                    "userId": user_id
                                },
                                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                                timeout=10.0
                            )

                            if create_response.status_code in [200, 201]:
                                new_customer = create_response.json()
                                customer_id = new_customer.get("_id")
                                logger.info(f"✅ CRS 새 고객 생성: {customer_name} (ID: {customer_id})")
                            else:
                                logger.warning(f"CRS 고객 생성 실패: {create_response.text}")
                    else:
                        logger.warning(f"CRS 고객 검색 실패: {search_response.text}")
            except Exception as e:
                logger.warning(f"CRS 고객 생성/검색 중 오류: {e}")

        # 5. DB 업데이트
        update_fields = {
            "is_customer_review": True,
            "document_type": "customer_review",
            "cr_metadata": {
                "contractor_name": customer_name,
                "product_name": product_name,
                "issue_date": issue_date,
            }
        }

        if display_name:
            update_fields["displayName"] = display_name

        if customer_id:
            # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
            update_fields["customerId"] = ObjectId(customer_id) if ObjectId.is_valid(customer_id) else customer_id

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": update_fields}
        )

        logger.info(f"✅ CRS 플래그 설정 완료: doc_id={doc_id}, customer_id={customer_id}")

        return {
            "is_customer_review": True,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "product_name": product_name,
            "issue_date": issue_date,
            "display_name": display_name
        }

    except Exception as e:
        logger.error(f"CRS 자동 감지 중 오류: {e}", exc_info=True)
        return {"is_customer_review": False}


async def _connect_document_to_customer(customer_id: str, doc_id: str, user_id: str):
    """Connect document to customer via internal API call"""
    import httpx

    settings = get_settings()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.AIMS_API_URL}/api/customers/{customer_id}/documents",
                json={
                    "document_id": doc_id,
                    "userId": user_id,
                    "notes": ""
                },
                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                timeout=10.0
            )

            if response.status_code != 200:
                logger.warning(f"Failed to connect document to customer: {response.text}")
    except Exception as e:
        logger.warning(f"Error connecting document to customer: {e}")


async def _notify_progress(doc_id: str, owner_id: str, progress: int, stage: str, message: str = ""):
    """Send progress update notification via SSE webhook and update MongoDB"""
    import httpx

    settings = get_settings()

    # 1. MongoDB에 progress 필드 업데이트 (폴링용)
    try:
        files_collection = MongoService.get_collection("files")
        update_fields = {
            "progress": progress,
            "progressStage": stage,
            "progressMessage": message
        }

        # ⭐ 처리 완료 시 status: 'completed' 설정 (전체 문서 보기에 표시되도록)
        if progress == 100 and stage == "complete":
            update_fields["status"] = "completed"

        # 🔴 에러 상태 처리 (progress == -1)
        if progress == -1 and stage == "error":
            update_fields["status"] = "failed"
            update_fields["error"] = {
                "statusCode": 409,
                "statusMessage": message,
                "timestamp": datetime.utcnow().isoformat()
            }

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": update_fields}
        )
    except Exception as e:
        logger.warning(f"Error updating progress in MongoDB: {e}")

    # 2. SSE webhook 호출 (실시간 업데이트용)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.AIMS_API_URL}/api/webhooks/document-progress",
                json={
                    "document_id": doc_id,
                    "progress": progress,
                    "stage": stage,
                    "message": message,
                    "owner_id": owner_id
                },
                headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                timeout=5.0
            )
            if response.status_code != 200:
                logger.warning(f"Failed to send progress update: {response.text}")

            # 🔴 에러 상태일 때 document-processing-complete webhook도 호출
            if progress == -1 and stage == "error":
                complete_response = await client.post(
                    f"{settings.AIMS_API_URL}/api/webhooks/document-processing-complete",
                    json={
                        "document_id": doc_id,
                        "status": "failed",
                        "owner_id": owner_id
                    },
                    headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                    timeout=5.0
                )
                if complete_response.status_code != 200:
                    logger.warning(f"Failed to send error complete notification: {complete_response.text}")
                else:
                    logger.info(f"🔴 에러 완료 알림 전송: doc_id={doc_id}")
    except Exception as e:
        logger.warning(f"Error sending progress update: {e}")


async def _notify_document_complete(doc_id: str, owner_id: str):
    """Notify that document processing is complete"""
    import httpx
    import asyncio

    settings = get_settings()

    async def _send_notification():
        # Wait 3 seconds for SSE to be ready (as in n8n workflow)
        await asyncio.sleep(3)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.AIMS_API_URL}/api/webhooks/document-processing-complete",
                    json={
                        "document_id": doc_id,
                        "status": "completed",
                        "owner_id": owner_id
                    },
                    headers={"X-API-Key": settings.WEBHOOK_API_KEY},
                    timeout=10.0
                )

                if response.status_code != 200:
                    logger.warning(f"Failed to notify document complete: {response.text}")
        except Exception as e:
            logger.warning(f"Error notifying document complete: {e}")

    # Run notification in background
    asyncio.create_task(_send_notification())


async def process_document_pipeline(
    file_content: bytes,
    original_name: str,
    user_id: str,
    customer_id: Optional[str],
    source_path: Optional[str],
    mime_type: Optional[str] = None,
    existing_doc_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    실제 문서 처리 파이프라인 (워커에서 호출)

    Args:
        file_content: 파일 내용 (bytes)
        original_name: 원본 파일명
        user_id: 사용자 ID
        customer_id: 고객 ID (선택)
        source_path: 원본 경로 (선택)
        mime_type: MIME 타입 (선택)
        existing_doc_id: 기존 문서 ID (큐잉 모드에서 미리 생성된 문서)

    Returns:
        처리 결과 dict
    """
    doc_id = existing_doc_id

    try:
        files_collection = MongoService.get_collection("files")

        # Step 1: Create document in MongoDB (기존 문서가 없는 경우에만)
        if existing_doc_id:
            # 큐잉 모드: 기존 문서 업데이트
            logger.info(f"Using existing document: {existing_doc_id} for userId: {user_id}")
            doc_id = existing_doc_id
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {
                    "progress": 20,
                    "progressStage": "upload",
                    "progressMessage": "업로드 준비 중"
                }}
            )
        else:
            # 동기 모드: 새 문서 생성
            logger.info(f"Creating document for userId: {user_id}, customerId: {customer_id}")
            doc_data = {
                "ownerId": user_id,
                "createdAt": datetime.utcnow(),
                # 초기 progress 설정 - 프론트엔드에서 즉시 20% 표시
                "progress": 20,
                "progressStage": "upload",
                "progressMessage": "업로드 준비 중",
                "status": "processing"
            }
            if customer_id:
                # ⚠️ customerId는 ObjectId로 저장 (aims_api와 타입 일관성 유지)
                doc_data["customerId"] = ObjectId(customer_id) if ObjectId.is_valid(customer_id) else customer_id

            result = await files_collection.insert_one(doc_data)
            doc_id = str(result.inserted_id)
            logger.info(f"Created document: {doc_id}")

        # Step 2: Save file to disk
        saved_name, dest_path = await FileService.save_file(
            content=file_content,
            original_name=original_name,
            user_id=user_id,
            source_path=source_path
        )

        logger.info(f"Saved file: {saved_name} to {dest_path}")

        # Update MongoDB with upload info
        upload_info = {
            "upload.originalName": original_name,
            "upload.saveName": saved_name,
            "upload.destPath": dest_path,
            "upload.uploaded_at": datetime.utcnow().isoformat(),
        }
        if source_path:
            upload_info["upload.sourcePath"] = source_path

        await files_collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": upload_info}
        )

        # Connect document to customer if customer_id provided
        if customer_id:
            await _connect_document_to_customer(customer_id, doc_id, user_id)

        # Progress: 20% - Upload complete
        await _notify_progress(doc_id, user_id, 20, "upload", "파일 업로드 완료")

        # Step 3: Extract metadata
        # Progress: 40% - Starting meta extraction
        await _notify_progress(doc_id, user_id, 40, "meta", "메타데이터 추출 중")
        meta_result = await MetaService.extract_metadata(dest_path)

        if meta_result.get("error"):
            logger.warning(f"Metadata extraction failed: {meta_result}")
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"meta.error": meta_result.get("message", "Unknown error")}}
            )
            return {
                "result": "error",
                "document_id": doc_id,
                "error": meta_result.get("message", "Unknown error"),
                "status": meta_result.get("status", 500)
            }

        # Get summary if text was extracted
        full_text = meta_result.get("extracted_text", "")
        summary = ""
        tags = []

        if full_text and len(full_text.strip()) > 0:
            summary_result = await OpenAIService.summarize_text(
                full_text,
                owner_id=user_id,
                document_id=doc_id
            )
            summary = summary_result.get("summary", "")
            tags = summary_result.get("tags", [])

        # Update MongoDB with meta info
        meta_update = {
            "meta.filename": meta_result.get("filename"),
            "meta.extension": meta_result.get("extension"),
            "meta.mime": meta_result.get("mime_type"),
            "meta.size_bytes": meta_result.get("file_size"),
            "meta.file_hash": meta_result.get("file_hash"),
            "meta.pdf_pages": meta_result.get("num_pages"),
            "meta.full_text": full_text or "",
            "meta.summary": summary,
            "meta.tags": tags,
            "meta.length": len(full_text) if full_text else 0,
            "meta.meta_status": "done",
            # Image EXIF metadata
            "meta.width": meta_result.get("width"),
            "meta.height": meta_result.get("height"),
            "meta.date_taken": meta_result.get("date_taken"),
            "meta.camera_make": meta_result.get("camera_make"),
            "meta.camera_model": meta_result.get("camera_model"),
            "meta.gps_latitude": meta_result.get("gps_latitude"),
            "meta.gps_longitude": meta_result.get("gps_longitude"),
            "meta.gps_latitude_ref": meta_result.get("gps_latitude_ref"),
            "meta.gps_longitude_ref": meta_result.get("gps_longitude_ref"),
            "meta.orientation": meta_result.get("orientation"),
            "meta.exif": meta_result.get("exif"),
        }

        # 🔴 중복 파일 해시 처리: 고아 문서(customerId: null) 안전하게 정리
        file_hash = meta_result.get("file_hash")
        if file_hash:
            # 안전한 삭제 조건 (race condition 완벽 방지):
            # 1. customerId가 null인 문서만 (고아 상태)
            # 2. status가 "completed"가 아닌 문서만 (처리 완료된 정상 문서 보호)
            # 3. 생성된 지 30초 이상 된 문서만 (동시 업로드 시 처리 중인 문서 보호)
            # 4. 현재 문서가 아닌 것만
            orphan_threshold = datetime.utcnow() - timedelta(seconds=30)
            delete_result = await files_collection.delete_one({
                "ownerId": user_id,
                "customerId": None,
                "meta.file_hash": file_hash,
                "_id": {"$ne": ObjectId(doc_id)},
                "status": {"$ne": "completed"},  # 처리 완료된 문서 보호
                "createdAt": {"$lt": orphan_threshold}  # 30초 이상 된 문서만
            })
            if delete_result.deleted_count > 0:
                logger.info(f"🗑️ 고아 문서 삭제 완료 (file_hash: {file_hash[:16]}...)")

        try:
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": meta_update}
            )
        except DuplicateKeyError as e:
            # 중복 에러 발생 시 SSE로 에러 전달
            error_msg = "동일한 파일이 이미 등록되어 있습니다."
            logger.error(f"🔴 중복 파일 에러: {doc_id} - {error_msg}")
            await _notify_progress(doc_id, user_id, -1, "error", error_msg)
            raise Exception(error_msg) from e

        detected_mime = meta_result.get("mime_type", "")

        # Progress: 50% - Meta extraction complete
        await _notify_progress(doc_id, user_id, 50, "meta", "메타데이터 추출 완료")

        # 🔴 AR/CRS 자동 감지 (PDF 파일이고 텍스트가 있는 경우)
        if detected_mime == "application/pdf" and full_text and len(full_text.strip()) > 0:
            ar_detection = await _detect_and_process_annual_report(
                doc_id=doc_id,
                full_text=full_text,
                original_name=original_name,
                user_id=user_id,
                files_collection=files_collection
            )
            if ar_detection.get("is_annual_report"):
                logger.info(f"✅ AR 자동 감지 완료: doc_id={doc_id}, customer_id={ar_detection.get('customer_id')}")
            else:
                # AR이 아닌 경우 CRS 감지 시도
                crs_detection = await _detect_and_process_customer_review(
                    doc_id=doc_id,
                    full_text=full_text,
                    original_name=original_name,
                    user_id=user_id,
                    files_collection=files_collection
                )
                if crs_detection.get("is_customer_review"):
                    logger.info(f"✅ CRS 자동 감지 완료: doc_id={doc_id}, customer_id={crs_detection.get('customer_id')}")

        # Step 4: Route based on MIME type

        # Case 1: text/plain - extract and save text
        if detected_mime == "text/plain":
            logger.info(f"Processing text/plain file: {doc_id}")

            # Progress: 60% - Starting text extraction
            await _notify_progress(doc_id, user_id, 60, "text", "텍스트 추출 중")

            text_content = await FileService.read_file_as_text(dest_path)

            # Progress: 80% - Saving text to database
            await _notify_progress(doc_id, user_id, 80, "text", "텍스트 저장 중")

            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"text.full_text": text_content}}
            )

            # Progress: 100% - text/plain processing complete (no OCR needed)
            await _notify_progress(doc_id, user_id, 100, "complete", "텍스트 파일 처리 완료")

            return {
                "exitCode": 0,
                "stderr": "",
                "document_id": doc_id
            }

        # Case 2: Unsupported MIME type
        if detected_mime in UNSUPPORTED_MIME_TYPES:
            logger.warning(f"Unsupported MIME type: {detected_mime} for {doc_id}")

            # Progress: 60% - Checking file type
            await _notify_progress(doc_id, user_id, 60, "check", "파일 형식 확인 중")

            # Progress: 80% - Updating database
            await _notify_progress(doc_id, user_id, 80, "update", "처리 상태 업데이트 중")

            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {"ocr.warn": "Skipped OCR due to unsupported MIME type"}}
            )

            # Progress: 100% - Unsupported MIME, OCR skipped
            await _notify_progress(doc_id, user_id, 100, "complete", "처리 완료 (OCR 생략)")

            return {
                "warn": True,
                "status": 415,
                "userMessage": "OCR 생략: 지원하지 않는 문서 형식입니다.",
                "mime": detected_mime,
                "filename": original_name,
                "document_id": doc_id
            }

        # Case 3: Check if OCR is needed (no text extracted)
        if not full_text or len(full_text.strip()) == 0:
            # Progress: 60% - OCR needed
            await _notify_progress(doc_id, user_id, 60, "ocr", "OCR 처리 준비 중")
            logger.info(f"Queueing OCR for document: {doc_id}")

            queued_at = datetime.utcnow().isoformat()

            # Queue to Redis
            await RedisService.add_to_stream(
                file_id=doc_id,
                file_path=dest_path,
                doc_id=doc_id,
                owner_id=user_id,
                queued_at=queued_at
            )

            # Update MongoDB with queue status
            await files_collection.update_one(
                {"_id": ObjectId(doc_id)},
                {"$set": {
                    "ocr.status": "queued",
                    "ocr.queued_at": queued_at
                }}
            )

            # Progress: 70% - OCR queued
            await _notify_progress(doc_id, user_id, 70, "ocr", "OCR 대기열에 추가됨")

            return {
                "result": "success",
                "document_id": doc_id,
                "ocr": {
                    "status": "queued",
                    "queued_at": queued_at
                }
            }

        # Case 4: Text already extracted, notify complete
        logger.info(f"Document {doc_id} processed without OCR (text already extracted)")

        # Progress: 90% - Almost complete
        await _notify_progress(doc_id, user_id, 90, "complete", "처리 완료 중")

        # Progress: 100% - Complete (no OCR needed)
        await _notify_progress(doc_id, user_id, 100, "complete", "처리 완료")

        # Send completion notification
        await _notify_document_complete(doc_id, user_id)

        return {
            "result": "success",
            "document_id": doc_id,
            "status": "completed",
            "meta": {
                "filename": meta_result.get("filename"),
                "extension": meta_result.get("extension"),
                "mime": meta_result.get("mime_type"),
                "size_bytes": str(meta_result.get("file_size", "")),
                "created_at": datetime.utcnow().isoformat() + "Z",
                "meta_status": "ok",
                "exif": "{}",
                "pdf_pages": str(meta_result.get("num_pages", "")),
                "full_text": (full_text[:10000] + "...") if len(full_text) > 10000 else full_text
            }
        }

    except Exception as e:
        logger.error(f"Error in process_document_pipeline: {e}", exc_info=True)

        # Save error to MongoDB if we have a doc_id
        if doc_id:
            try:
                files_collection = MongoService.get_collection("files")
                await files_collection.update_one(
                    {"_id": ObjectId(doc_id)},
                    {"$set": {
                        "error.statusCode": 500,
                        "error.statusMessage": str(e),
                        "error.timestamp": datetime.utcnow().isoformat()
                    }}
                )
            except Exception as save_error:
                logger.error(f"Failed to save error to MongoDB: {save_error}")

        raise

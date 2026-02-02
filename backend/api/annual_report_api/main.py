"""
Annual Report API - FastAPI 애플리케이션
보험 고객의 Annual Report PDF 파싱 및 조회 API
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import logging
import asyncio
import re
from datetime import datetime, timezone

from config import settings
from services.queue_manager import ARParseQueueManager
from system_logger import send_error_log

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI 앱 초기화
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Annual Report PDF 파싱 및 조회 API"
)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB 클라이언트 (전역)
mongo_client: MongoClient = None
db = None
queue_manager: ARParseQueueManager = None

# 백그라운드 태스크 실행 중 플래그
background_task_running = False


def parse_rate_limit_wait_time(error_message: str) -> float:
    """
    Rate limit 에러 메시지에서 대기 시간 파싱
    예: "Please try again in 34.386s" → 34.386
    """
    match = re.search(r'try again in (\d+\.?\d*)s', error_message, re.IGNORECASE)
    if match:
        return float(match.group(1))
    return 0


async def scan_pending_ar_documents(log_always: bool = False):
    """
    AR 파싱이 필요한 문서를 찾아 큐에 추가

    🔴 100% 신뢰 설계:
    - 조건: is_annual_report=true AND overallStatus=completed AND ar_parsing_status != completed
    - Frontend trigger 실패해도 Backend가 반드시 처리
    - customerId가 없으면 스킵 (고객 연결 필요)

    Args:
        log_always: True면 0건이어도 로그 출력 (30초마다 heartbeat용)

    Returns:
        tuple: (enqueued_count, found_count, skipped_count)
    """
    try:
        from bson import ObjectId

        # 🔴 단순하고 확실한 조건:
        # 1. is_annual_report: true - AR로 식별됨
        # 2. overallStatus: completed - 문서 처리 완료
        # 3. ar_parsing_status != completed - 아직 파싱 안됨
        # 4. customerId 존재 - 고객 연결됨
        pending_docs = list(db["files"].find({
            "is_annual_report": True,
            "overallStatus": "completed",
            "ar_parsing_status": {"$ne": "completed"},
            "customerId": {"$exists": True, "$ne": None}
        }).limit(10))

        found_count = len(pending_docs)
        enqueued_count = 0
        skipped_count = 0

        for doc in pending_docs:
            file_id = doc["_id"]
            customer_id = doc.get("customerId")
            filename = doc.get("upload", {}).get("originalName", "unknown")
            current_status = doc.get("ar_parsing_status", "unknown")

            # customerId 유효성 검사
            if not customer_id:
                skipped_count += 1
                continue

            # 큐에 이미 있는지 확인
            existing = db["ar_parse_queue"].find_one({"file_id": file_id})
            if existing:
                skipped_count += 1
                continue

            # 큐에 추가
            success = queue_manager.enqueue(file_id, customer_id, {
                "filename": filename,
                "auto_enqueued": True,
                "previous_status": current_status
            })

            if success:
                enqueued_count += 1
                logger.info(f"📥 AR 자동 큐 등록: {filename} (status: {current_status})")
            else:
                skipped_count += 1

        # 결과 로깅
        if found_count > 0:
            logger.info(f"🔍 AR 스캔: 발견={found_count}, 등록={enqueued_count}, 스킵={skipped_count}")
        elif log_always:
            logger.info(f"💓 AR 워커 정상 (파싱 대기 파일 없음)")

        return (enqueued_count, found_count, skipped_count)

    except Exception as e:
        logger.error(f"❌ AR 스캔 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"AR 스캔 오류: {e}", e)
        return (0, 0, 0)


async def scan_and_process_pending_cr_documents(log_always: bool = False):
    """
    CRS 파싱이 필요한 문서를 찾아 즉시 파싱 처리

    AR과 달리 큐 없이 직접 처리 (OpenAI 불필요, regex/pdfplumber만 사용)

    조건: is_customer_review=true AND overallStatus=completed
          AND cr_parsing_status != completed AND customerId 존재

    Args:
        log_always: True면 0건이어도 로그 출력 (heartbeat용)

    Returns:
        tuple: (processed_count, found_count, skipped_count)
    """
    try:
        from bson import ObjectId
        from routes.cr_background import parse_single_cr_document

        pending_docs = list(db["files"].find({
            "is_customer_review": True,
            "overallStatus": "completed",
            "cr_parsing_status": {"$nin": ["completed", "processing"]},
            "customerId": {"$exists": True, "$ne": None}
        }).limit(10))

        found_count = len(pending_docs)
        processed_count = 0
        skipped_count = 0

        for doc in pending_docs:
            file_id = doc["_id"]
            customer_id = doc.get("customerId")
            filename = doc.get("upload", {}).get("originalName", "unknown")

            if not customer_id:
                skipped_count += 1
                continue

            # 상태를 processing으로 업데이트
            db["files"].update_one(
                {"_id": file_id},
                {"$set": {"cr_parsing_status": "processing"}}
            )

            logger.info(f"📄 CRS 파싱 시작: {filename} (file_id={file_id})")

            try:
                result = await asyncio.to_thread(
                    parse_single_cr_document,
                    db,
                    str(file_id),
                    str(customer_id)
                )

                if result and result.get("success"):
                    if result.get("skipped"):
                        skipped_count += 1
                        logger.info(f"⏭️ CRS 이미 파싱됨: {filename}")
                    else:
                        processed_count += 1
                        logger.info(f"✅ CRS 파싱 완료: {filename}")
                else:
                    skipped_count += 1
                    error_msg = result.get("error", "Unknown error") if result else "Parsing failed"
                    logger.warning(f"⚠️ CRS 파싱 실패: {filename}, error={error_msg}")

            except Exception as parse_error:
                skipped_count += 1
                logger.error(f"❌ CRS 파싱 예외: {filename}, error={parse_error}", exc_info=True)
                db["files"].update_one(
                    {"_id": file_id},
                    {"$set": {
                        "cr_parsing_status": "error",
                        "cr_parsing_error": str(parse_error)
                    }}
                )

        if found_count > 0:
            logger.info(f"🔍 CRS 스캔: 발견={found_count}, 처리={processed_count}, 스킵={skipped_count}")
        elif log_always:
            logger.info(f"💓 CRS 워커 정상 (파싱 대기 파일 없음)")

        return (processed_count, found_count, skipped_count)

    except Exception as e:
        logger.error(f"❌ CRS 스캔 오류: {e}", exc_info=True)
        send_error_log("annual_report_api", f"CRS 스캔 오류: {e}", e)
        return (0, 0, 0)


async def queue_worker():
    """큐 기반 AR 파싱 워커 (1초마다 폴링, 3초마다 스캔)"""
    global background_task_running
    from routes.background import parse_single_ar_document
    import time

    # 서버 시작 후 3초 대기 (서버 완전 시작 대기)
    await asyncio.sleep(3)

    background_task_running = True
    logger.info("🔄 AR+CRS 파싱 워커 시작 (3초마다 pending 스캔)")

    # 시작 시 좀비 작업 복구 (5분 타임아웃)
    reset_count = await asyncio.to_thread(queue_manager.reset_stale_processing_tasks, 300)
    if reset_count > 0:
        logger.info(f"🔧 좀비 작업 {reset_count}건 복구 완료")

    # 시작 시 pending AR 문서 스캔
    enqueued, found, skipped = await scan_pending_ar_documents(log_always=True)
    if enqueued > 0:
        logger.info(f"📥 시작 시 {enqueued}건 AR 문서 큐 등록")

    # 시작 시 pending CRS 문서 스캔 및 처리
    cr_processed, cr_found, cr_skipped = await scan_and_process_pending_cr_documents(log_always=True)
    if cr_processed > 0:
        logger.info(f"📥 시작 시 {cr_processed}건 CRS 문서 파싱 완료")

    last_scan_time = time.time()
    last_heartbeat_time = time.time()
    SCAN_INTERVAL = 3  # 3초마다 스캔 (기존 5초에서 단축)
    HEARTBEAT_INTERVAL = 30  # 30초마다 heartbeat 로그

    while background_task_running:
        try:
            current_time = time.time()

            # 3초마다 pending AR + CRS 문서 스캔
            if current_time - last_scan_time >= SCAN_INTERVAL:
                # 30초마다는 heartbeat 로그 포함
                log_heartbeat = (current_time - last_heartbeat_time >= HEARTBEAT_INTERVAL)
                await scan_pending_ar_documents(log_always=log_heartbeat)
                # CRS 스캔 및 즉시 처리 (큐 불필요 - OpenAI 미사용)
                await scan_and_process_pending_cr_documents(log_always=log_heartbeat)
                last_scan_time = current_time
                if log_heartbeat:
                    last_heartbeat_time = current_time

            # 큐에서 작업 하나 가져오기
            task = await asyncio.to_thread(queue_manager.dequeue)

            if task:
                task_id = task["_id"]
                file_id = task["file_id"]
                customer_id = task["customer_id"]

                logger.info(f"📄 큐에서 작업 가져옴: file_id={file_id}, retry={task['retry_count']}")

                try:
                    # AR 파싱 실행
                    result = await asyncio.to_thread(
                        parse_single_ar_document,
                        db,
                        str(file_id),
                        str(customer_id)
                    )

                    if result and result.get("success"):
                        # 성공: 큐에서 삭제 (background.py에서 이미 삭제했을 수 있으므로 무시)
                        try:
                            await asyncio.to_thread(
                                lambda: queue_manager.queue.delete_one({"_id": task_id})
                            )
                        except Exception:
                            pass  # 이미 삭제됨
                        logger.info(f"✅ AR 파싱 완료: file_id={file_id}")
                    else:
                        # 실패: 재시도 (retry=True)
                        error_msg = result.get("error", "Unknown error") if result else "Parsing failed"
                        retry_count = task["retry_count"] + 1  # 다음 재시도 횟수

                        # files 컬렉션에 retry_count 저장 (UI 표시용)
                        db["files"].update_one(
                            {"_id": file_id},
                            {"$set": {"ar_retry_count": retry_count}}
                        )

                        # Rate limit 에러인 경우 OpenAI가 알려준 시간만큼 대기
                        if "rate_limit" in error_msg.lower() or "429" in error_msg:
                            wait_time = parse_rate_limit_wait_time(error_msg)
                            if wait_time > 0:
                                logger.info(f"⏳ Rate limit 감지, {wait_time + 5:.1f}초 대기 후 재시도...")
                                await asyncio.sleep(wait_time + 5)  # 여유분 5초 추가

                        await asyncio.to_thread(
                            queue_manager.mark_failed,
                            task_id,
                            error_msg,
                            retry=True
                        )
                        logger.warning(f"⚠️  AR 파싱 실패 ({retry_count}/3 재시도): file_id={file_id}, error={error_msg}")

                except Exception as parse_error:
                    error_str = str(parse_error)

                    # Rate limit 에러인 경우 OpenAI가 알려준 시간만큼 대기
                    if "rate_limit" in error_str.lower() or "429" in error_str:
                        wait_time = parse_rate_limit_wait_time(error_str)
                        if wait_time > 0:
                            logger.info(f"⏳ Rate limit 감지, {wait_time + 5:.1f}초 대기 후 재시도...")
                            await asyncio.sleep(wait_time + 5)

                    # 예외 발생: 재시도
                    await asyncio.to_thread(
                        queue_manager.mark_failed,
                        task_id,
                        error_str,
                        retry=True
                    )
                    logger.error(f"❌ AR 파싱 예외: file_id={file_id}, error={parse_error}", exc_info=True)
                    send_error_log("annual_report_api", f"AR 파싱 예외: {parse_error}", parse_error, {"file_id": str(file_id)})

                # 작업 처리 후 즉시 다음 작업 확인 (딜레이 없음)
            else:
                # 큐가 비어있으면 1초 대기
                await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"❌ 워커 루프 오류: {e}", exc_info=True)
            send_error_log("annual_report_api", f"워커 루프 오류: {e}", e)
            await asyncio.sleep(1)  # 오류 발생 시 1초 대기 후 재시도

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행"""
    global mongo_client, db, queue_manager

    try:
        # MongoDB 연결
        logger.info(f"Connecting to MongoDB: {settings.MONGO_URI}")
        mongo_client = MongoClient(settings.MONGO_URI)

        # 연결 테스트
        mongo_client.admin.command('ping')

        db = mongo_client[settings.DB_NAME]
        logger.info(f"✅ MongoDB 연결 성공: {settings.DB_NAME}")

        # OpenAI API 키 확인
        if not settings.OPENAI_API_KEY:
            logger.warning("⚠️  OPENAI_API_KEY가 설정되지 않았습니다!")
        else:
            logger.info("✅ OPENAI_API_KEY 설정 확인")

        # 큐 관리자 초기화
        queue_manager = ARParseQueueManager(db)
        logger.info("✅ AR 파싱 큐 관리자 초기화 완료")

        # 큐 통계 출력
        stats = queue_manager.get_stats()
        logger.info(f"📊 큐 통계: pending={stats['pending']}, processing={stats['processing']}, "
                   f"completed={stats['completed']}, failed={stats['failed']}")

        # 🔧 불일치 데이터 정리: files.ar_parsing_status=completed인데 ar_parse_queue에 남아있는 경우 삭제
        try:
            from bson import ObjectId
            # processing/pending 상태인 큐 항목 확인
            inconsistent_count = 0
            for q in db["ar_parse_queue"].find({"status": {"$in": ["pending", "processing"]}}):
                file_doc = db["files"].find_one({"_id": q["file_id"]})
                if file_doc and file_doc.get("ar_parsing_status") == "completed":
                    # 불일치 발견 → 큐에서 삭제
                    db["ar_parse_queue"].delete_one({"_id": q["_id"]})
                    inconsistent_count += 1
            if inconsistent_count > 0:
                logger.info(f"🔧 불일치 데이터 {inconsistent_count}건 큐에서 삭제 완료")

            # 🗑️ 기존 completed 레코드도 정리
            cleanup_result = db["ar_parse_queue"].delete_many({"status": "completed"})
            if cleanup_result.deleted_count > 0:
                logger.info(f"🗑️ 완료된 큐 레코드 {cleanup_result.deleted_count}건 정리 완료")
        except Exception as e:
            logger.warning(f"⚠️ 큐 정리 중 오류 (무시): {e}")

        # 백그라운드 큐 워커 시작
        asyncio.create_task(queue_worker())

    except ConnectionFailure as e:
        logger.error(f"❌ MongoDB 연결 실패: {e}")
        send_error_log("annual_report_api", f"MongoDB 연결 실패: {e}", e)
        raise
    except Exception as e:
        logger.error(f"❌ 시작 오류: {e}")
        send_error_log("annual_report_api", f"시작 오류: {e}", e)
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 실행"""
    global mongo_client, background_task_running

    # 백그라운드 태스크 종료
    background_task_running = False
    logger.info("🛑 백그라운드 AR 자동 처리 종료")

    if mongo_client:
        logger.info("Closing MongoDB connection...")
        mongo_client.close()
        logger.info("✅ MongoDB 연결 종료")

@app.get("/")
async def root():
    """API 기본 정보"""
    return {
        "name": settings.API_TITLE,
        "version": settings.API_VERSION,
        "status": "running",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "parse": "/annual-report/parse (POST)",
            "query": "/customers/{customer_id}/annual-reports (GET)",
            "cr_check": "/customer-review/check (POST)",
            "cr_parse": "/customer-review/parse (POST)",
            "cr_query": "/customers/{customer_id}/customer-reviews (GET)"
        }
    }

@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트"""
    try:
        # MongoDB 연결 확인
        if mongo_client:
            mongo_client.admin.command('ping')
            db_status = "connected"
        else:
            db_status = "not_initialized"

        # OpenAI API 키 확인
        openai_status = "configured" if settings.OPENAI_API_KEY else "not_configured"

        return {
            "status": "healthy",
            "database": db_status,
            "openai": openai_status,
            "version": settings.API_VERSION_INFO.get("fullVersion"),
            "versionInfo": settings.API_VERSION_INFO
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        send_error_log("annual_report_api", f"Health check 실패: {e}", e)
        return {
            "status": "unhealthy",
            "error": str(e),
            "version": settings.API_VERSION_INFO.get("fullVersion")
        }

# 라우터 등록
from routes import parse, query, background, cr_routes, cr_background

app.include_router(
    parse.router,
    prefix="/annual-report",
    tags=["Annual Report - Parse"]
)

app.include_router(
    query.router,
    tags=["Annual Report - Query"]
)

app.include_router(
    background.router,
    prefix="/ar-background",
    tags=["Annual Report - Background"]
)

app.include_router(
    cr_routes.router,
    tags=["Customer Review Service"]
)

app.include_router(
    cr_background.router,
    prefix="/cr-background",
    tags=["Customer Review - Background"]
)

if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting {settings.API_TITLE} on {settings.API_HOST}:{settings.API_PORT}")
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False  # 운영 모드
    )

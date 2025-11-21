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

from config import settings
from services.queue_manager import ARParseQueueManager

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

async def queue_worker():
    """큐 기반 AR 파싱 워커 (1초마다 폴링)"""
    global background_task_running
    from routes.background import parse_single_ar_document

    # 서버 시작 후 3초 대기 (서버 완전 시작 대기)
    await asyncio.sleep(3)

    background_task_running = True
    logger.info("🔄 큐 기반 AR 파싱 워커 시작 (1초 폴링)")

    # 시작 시 좀비 작업 복구 (5분 타임아웃)
    reset_count = await asyncio.to_thread(queue_manager.reset_stale_processing_tasks, 300)
    if reset_count > 0:
        logger.info(f"🔧 좀비 작업 {reset_count}건 복구 완료")

    while background_task_running:
        try:
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
                        # 성공: completed 상태로 변경
                        await asyncio.to_thread(queue_manager.mark_completed, task_id)
                        logger.info(f"✅ AR 파싱 완료: file_id={file_id}")
                    else:
                        # 실패: 재시도 (retry=True)
                        error_msg = result.get("error", "Unknown error") if result else "Parsing failed"
                        await asyncio.to_thread(
                            queue_manager.mark_failed,
                            task_id,
                            error_msg,
                            retry=True
                        )
                        logger.warning(f"⚠️  AR 파싱 실패 (재시도 예약): file_id={file_id}, error={error_msg}")

                except Exception as parse_error:
                    # 예외 발생: 재시도
                    await asyncio.to_thread(
                        queue_manager.mark_failed,
                        task_id,
                        str(parse_error),
                        retry=True
                    )
                    logger.error(f"❌ AR 파싱 예외: file_id={file_id}, error={parse_error}", exc_info=True)

                # 작업 처리 후 즉시 다음 작업 확인 (딜레이 없음)
            else:
                # 큐가 비어있으면 1초 대기
                await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"❌ 워커 루프 오류: {e}", exc_info=True)
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

        # 백그라운드 큐 워커 시작
        asyncio.create_task(queue_worker())

    except ConnectionFailure as e:
        logger.error(f"❌ MongoDB 연결 실패: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ 시작 오류: {e}")
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
            "query": "/customers/{customer_id}/annual-reports (GET)"
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
            "version": settings.API_VERSION
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

# 라우터 등록
from routes import parse, query, background

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

if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting {settings.API_TITLE} on {settings.API_HOST}:{settings.API_PORT}")
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=False  # 운영 모드
    )

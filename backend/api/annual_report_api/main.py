"""
Annual Report API - FastAPI 애플리케이션
보험 고객의 Annual Report PDF 파싱 및 조회 API
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import logging

from config import settings

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

@app.on_event("startup")
async def startup_event():
    """애플리케이션 시작 시 실행"""
    global mongo_client, db

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

    except ConnectionFailure as e:
        logger.error(f"❌ MongoDB 연결 실패: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ 시작 오류: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """애플리케이션 종료 시 실행"""
    global mongo_client

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
        reload=True  # 개발 모드
    )

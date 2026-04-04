"""
Document Pipeline API
FastAPI replacement for n8n workflows

컬렉션 스키마 계약: @aims/shared-schema (backend/shared/schema/)
- files → COLLECTIONS.FILES
- customers → COLLECTIONS.CUSTOMERS
"""
import asyncio
import logging
import shutil
import time
from contextlib import asynccontextmanager

import httpx
from config import get_settings
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import (
    doc_display_name_router,
    doc_meta_router,
    doc_ocr_router,
    doc_prep_main_router,
    doc_summary_router,
    doc_upload_router,
    shadow_router,
    smart_search_router,
)
from services.mongo_service import MongoService
from services.upload_queue_service import UploadQueueService
from workers.error_logger import error_logger
from workers.ocr_worker import ocr_worker
from workers.pdf_conversion_worker import pdf_conversion_worker
from workers.pipeline_metrics import pipeline_metrics
from workers.upload_worker import upload_worker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


# Background task references (prevent GC of asyncio tasks)
_background_tasks = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    settings = get_settings()

    # Startup
    logger.info("Starting Document Pipeline API...")
    await MongoService.connect()
    logger.info("MongoDB connected")

    # Start Upload Worker (if queue enabled)
    if settings.UPLOAD_QUEUE_ENABLED:
        task = asyncio.create_task(upload_worker.start())
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
        logger.info(f"Upload Worker started: {upload_worker.worker_id}")
    else:
        logger.info("Upload Queue disabled, skipping worker startup")

    # Start PDF Conversion Worker
    if settings.PDF_CONV_QUEUE_ENABLED:
        task = asyncio.create_task(pdf_conversion_worker.start())
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
        logger.info(f"PDF Conversion Worker started: {pdf_conversion_worker.worker_id}")

    # Start OCR Worker (Redis stream consumer)
    task = asyncio.create_task(ocr_worker.start())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    logger.info("OCR Worker started")

    yield

    # Shutdown
    logger.info("Shutting down Document Pipeline API...")

    # Signal all workers to stop
    if settings.UPLOAD_QUEUE_ENABLED:
        upload_worker.stop()
    if settings.PDF_CONV_QUEUE_ENABLED:
        pdf_conversion_worker.stop()
    await ocr_worker.stop()

    # Cancel and await all background tasks (graceful shutdown)
    tasks_snapshot = list(_background_tasks)
    for task in tasks_snapshot:
        task.cancel()
    if tasks_snapshot:
        await asyncio.gather(*tasks_snapshot, return_exceptions=True)
    logger.info("All workers stopped")

    await MongoService.disconnect()
    logger.info("MongoDB disconnected")


app = FastAPI(
    title="Document Pipeline API",
    description="FastAPI replacement for n8n document processing workflows",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aims.giize.com",
        "https://localhost:5177",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unhandled exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    # Log to error logger
    await error_logger.log_error(
        error_type="UNHANDLED_EXCEPTION",
        message=str(exc),
        details={"path": str(request.url)},
        workflow="document_pipeline"
    )

    return JSONResponse(
        status_code=500,
        content={
            "result": "error",
            "code": "INTERNAL_ERROR",
            "message": "An internal error occurred"
        }
    )


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    import os
    return {
        "status": "healthy",
        "service": "document_pipeline",
        "version": "1.0.0",
        "pipeline_engine": os.environ.get("PIPELINE_ENGINE", "legacy"),
    }


# Deep health check (의존성 전체 검증)
@app.get("/health/deep")
async def health_check_deep():
    """
    Deep Health Check — 의존성 전체 검증.

    aims_health_monitor가 60초 간격으로 호출.
    하나라도 critical 실패하면 HTTP 503 반환.
    """
    start = time.time()
    settings = get_settings()
    checks = {}
    healthy = True

    # 1. MongoDB: ping + 실제 쿼리
    try:
        t = time.time()
        db = MongoService.get_db()
        await db.command("ping")
        await db["files"].find_one({}, max_time_ms=3000)
        checks["mongodb"] = {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
    except Exception as e:
        checks["mongodb"] = {"status": "error", "error": str(e)}
        healthy = False

    # 2. pdf_converter: GET /health
    try:
        t = time.time()
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.PDF_CONVERTER_URL}/health")
        if resp.status_code == 200:
            checks["pdf_converter"] = {"status": "ok", "latency_ms": round((time.time() - t) * 1000)}
        else:
            checks["pdf_converter"] = {"status": "error", "error": "HTTP %d" % resp.status_code}
            healthy = False
    except Exception as e:
        checks["pdf_converter"] = {"status": "error", "error": str(e)}
        healthy = False

    # 3. 디스크 공간 (1GB 미만 시 unhealthy)
    try:
        disk = shutil.disk_usage(settings.FILE_BASE_PATH)
        free_gb = disk.free / (1024 ** 3)
        checks["disk"] = {
            "status": "ok" if free_gb > 1.0 else "error",
            "free_gb": round(free_gb, 2),
            "usage_percent": round(disk.used / disk.total * 100, 1),
        }
        if free_gb <= 1.0:
            healthy = False
    except Exception as e:
        checks["disk"] = {"status": "error", "error": str(e)}

    # 4. Upload Worker 상태
    if settings.UPLOAD_QUEUE_ENABLED:
        status = upload_worker.get_status()
        worker_ok = status.get("running", False)
        checks["upload_worker"] = {
            "status": "ok" if worker_ok else "error",
            "active_tasks": status.get("active_tasks", 0),
        }
        if not worker_ok:
            healthy = False

    # 5. 큐 적체 (warning 수준, 200 유지)
    if settings.UPLOAD_QUEUE_ENABLED:
        try:
            qs = await UploadQueueService.get_queue_stats()
            pending = qs.get("pending", 0)
            checks["queue"] = {
                "status": "ok" if pending <= 50 else "warning",
                "pending": pending,
                "processing": qs.get("processing", 0),
                "failed": qs.get("failed", 0),
            }
        except Exception as e:
            checks["queue"] = {"status": "error", "error": str(e)}

    # 6. PDF 변환 큐 상태
    if settings.PDF_CONV_QUEUE_ENABLED:
        from services.pdf_conversion_queue_service import PdfConversionQueueService
        try:
            pcs = pdf_conversion_worker.get_status()
            pq_stats = await PdfConversionQueueService.get_queue_stats()
            checks["pdf_conversion_worker"] = {
                "status": "ok" if pcs.get("running", False) else "error",
                "current_job": pcs.get("current_job_id"),
            }
            checks["pdf_conversion_queue"] = {
                "status": "ok" if pq_stats.get("pending", 0) <= 20 else "warning",
                "pending": pq_stats.get("pending", 0),
                "processing": pq_stats.get("processing", 0),
                "failed": pq_stats.get("failed", 0),
            }
            if not pcs.get("running", False):
                healthy = False
        except Exception as e:
            checks["pdf_conversion"] = {"status": "error", "error": str(e)}

    # 7. 처리 메트릭
    metrics = pipeline_metrics.get_summary()

    total_ms = round((time.time() - start) * 1000)
    result = {
        "status": "healthy" if healthy else "unhealthy",
        "checks": checks,
        "metrics": metrics,
        "totalLatency": total_ms,
        "version": "1.0.0",
    }

    if not healthy:
        return JSONResponse(status_code=503, content=result)
    return result


# Queue status endpoint
@app.get("/queue/status")
async def get_queue_status():
    """업로드 큐 상태 조회"""
    settings = get_settings()

    if not settings.UPLOAD_QUEUE_ENABLED:
        return {
            "enabled": False,
            "message": "Upload queue is disabled"
        }

    worker_status = upload_worker.get_status()
    queue_stats = await UploadQueueService.get_queue_stats()

    return {
        "enabled": True,
        "worker": worker_status,
        "queue": queue_stats
    }


# Mount routers with /webhook prefix for n8n compatibility
app.include_router(doc_upload_router, prefix="/webhook", tags=["Document Upload"])
app.include_router(doc_summary_router, prefix="/webhook", tags=["Document Summary"])
app.include_router(doc_ocr_router, prefix="/webhook", tags=["Document OCR"])
app.include_router(doc_meta_router, prefix="/webhook", tags=["Document Metadata"])
app.include_router(smart_search_router, prefix="/webhook", tags=["Smart Search"])
app.include_router(doc_prep_main_router, prefix="/webhook", tags=["Document Prep Main"])

app.include_router(doc_display_name_router, prefix="/webhook", tags=["Document Display Name"])

# Shadow Mode router - n8n과 FastAPI 동시 호출 비교
app.include_router(shadow_router, prefix="/shadow", tags=["Shadow Mode"])


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )

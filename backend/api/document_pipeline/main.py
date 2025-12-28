"""
Document Pipeline API
FastAPI replacement for n8n workflows
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import get_settings
from services.mongo_service import MongoService
from routers import doc_upload_router, doc_summary_router, doc_ocr_router, doc_meta_router, smart_search_router, doc_prep_main_router, shadow_router
from workers.error_logger import error_logger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    # Startup
    logger.info("Starting Document Pipeline API...")
    await MongoService.connect()
    logger.info("MongoDB connected")
    yield
    # Shutdown
    logger.info("Shutting down Document Pipeline API...")
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
    allow_origins=["*"],
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
    return {
        "status": "healthy",
        "service": "document_pipeline",
        "version": "1.0.0"
    }


# Mount routers with /webhook prefix for n8n compatibility
app.include_router(doc_upload_router, prefix="/webhook", tags=["Document Upload"])
app.include_router(doc_summary_router, prefix="/webhook", tags=["Document Summary"])
app.include_router(doc_ocr_router, prefix="/webhook", tags=["Document OCR"])
app.include_router(doc_meta_router, prefix="/webhook", tags=["Document Metadata"])
app.include_router(smart_search_router, prefix="/webhook", tags=["Smart Search"])
app.include_router(doc_prep_main_router, prefix="/webhook", tags=["Document Prep Main"])

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

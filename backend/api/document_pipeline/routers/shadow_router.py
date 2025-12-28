"""
Shadow Mode Router
- /shadow/* 엔드포인트
- n8n과 FastAPI 동시 호출 후 비교
- n8n 응답 반환
"""
import logging
from typing import Optional
from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse

from middleware.shadow_mode import shadow_call, ShadowMode

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/docupload")
async def shadow_docupload(
    request: Request,
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    customerName: Optional[str] = Form(None),
    source: Optional[str] = Form("web")
):
    """Shadow mode for document upload"""
    try:
        form_data = {
            "userId": userId,
            "customerId": customerId or "",
            "customerName": customerName or "",
            "source": source
        }

        # Read file content
        file_content = await file.read()
        files = {
            "file": (file.filename, file_content, file.content_type)
        }

        result = await shadow_call(
            workflow="docupload",
            request_data=form_data,
            files=files
        )

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow docupload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/docsummary")
async def shadow_docsummary(request: Request):
    """Shadow mode for document summary"""
    try:
        body = await request.json()
        result = await shadow_call(
            workflow="docsummary",
            request_data=body
        )
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow docsummary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dococr")
async def shadow_dococr(request: Request):
    """Shadow mode for document OCR"""
    try:
        body = await request.json()
        result = await shadow_call(
            workflow="dococr",
            request_data=body
        )
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow dococr error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/docmeta")
async def shadow_docmeta(request: Request):
    """Shadow mode for document metadata"""
    try:
        body = await request.json()
        result = await shadow_call(
            workflow="docmeta",
            request_data=body
        )
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow docmeta error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/smart-search")
async def shadow_smart_search(request: Request):
    """Shadow mode for smart search"""
    try:
        body = await request.json()
        result = await shadow_call(
            workflow="smart-search",
            request_data=body
        )
        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow smart-search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/docprep-main")
async def shadow_docprep_main(
    request: Request,
    file: UploadFile = File(...),
    userId: str = Form(...),
    customerId: Optional[str] = Form(None),
    customerName: Optional[str] = Form(None),
    source: Optional[str] = Form("web")
):
    """Shadow mode for docprep-main (full pipeline)"""
    try:
        form_data = {
            "userId": userId,
            "customerId": customerId or "",
            "customerName": customerName or "",
            "source": source
        }

        file_content = await file.read()
        files = {
            "file": (file.filename, file_content, file.content_type)
        }

        result = await shadow_call(
            workflow="docprep-main",
            request_data=form_data,
            files=files
        )

        return JSONResponse(content=result)

    except Exception as e:
        logger.error(f"Shadow docprep-main error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Shadow Mode 제어 엔드포인트
@router.get("/status")
async def shadow_status():
    """Get shadow mode status"""
    return {
        "enabled": ShadowMode.enabled,
        "auto_fix": ShadowMode.auto_fix
    }


@router.post("/enable")
async def shadow_enable():
    """Enable shadow mode"""
    ShadowMode.enable()
    return {"status": "enabled"}


@router.post("/disable")
async def shadow_disable():
    """Disable shadow mode"""
    ShadowMode.disable()
    return {"status": "disabled"}


@router.post("/auto-fix/{enabled}")
async def shadow_auto_fix(enabled: bool):
    """Enable/disable auto-fix with Claude"""
    ShadowMode.set_auto_fix(enabled)
    return {"auto_fix": enabled}

"""
Shadow Mode Router
- /shadow/* 엔드포인트
- n8n과 FastAPI 동시 호출 후 비교
- n8n 응답 반환
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse

from middleware.shadow_mode import shadow_call, ShadowMode
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)

# 전환 판단 기준
SWITCH_CRITERIA = {
    "min_calls": 100,           # 최소 호출 수
    "match_rate_threshold": 99.0,  # Match Rate 기준 (%)
    "error_rate_threshold": 1.0,   # Error Rate 기준 (%)
    "observation_days": 7,      # 관측 기간 (일)
}

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


@router.get("/stats")
async def shadow_stats(days: int = Query(default=7, ge=1, le=90)):
    """
    Shadow Mode 통계 및 전환 판단 지표

    Returns:
        - summary: 전체 통계
        - by_workflow: 워크플로우별 통계
        - recent_mismatches: 최근 불일치 목록
        - switch_readiness: 전환 준비 상태
    """
    try:
        since = datetime.utcnow() - timedelta(days=days)

        # 호출 통계 집계
        calls_collection = MongoService.get_collection("shadow_calls")

        # 전체 통계
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": "$result",
                "count": {"$sum": 1}
            }}
        ]

        result_counts = {}
        async for doc in calls_collection.aggregate(pipeline):
            result_counts[doc["_id"]] = doc["count"]

        total_calls = sum(result_counts.values())
        match_count = result_counts.get("match", 0)
        mismatch_count = result_counts.get("mismatch", 0)
        error_count = result_counts.get("error", 0)

        match_rate = (match_count / total_calls * 100) if total_calls > 0 else 0
        mismatch_rate = (mismatch_count / total_calls * 100) if total_calls > 0 else 0
        error_rate = (error_count / total_calls * 100) if total_calls > 0 else 0

        # 워크플로우별 통계
        workflow_pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": {"workflow": "$workflow", "result": "$result"},
                "count": {"$sum": 1}
            }}
        ]

        workflow_stats = {}
        async for doc in calls_collection.aggregate(workflow_pipeline):
            wf = doc["_id"]["workflow"]
            result = doc["_id"]["result"]
            if wf not in workflow_stats:
                workflow_stats[wf] = {"match": 0, "mismatch": 0, "error": 0, "total": 0}
            workflow_stats[wf][result] = doc["count"]
            workflow_stats[wf]["total"] += doc["count"]

        # Match rate 계산
        for wf, stats in workflow_stats.items():
            if stats["total"] > 0:
                stats["match_rate"] = round(stats["match"] / stats["total"] * 100, 2)
            else:
                stats["match_rate"] = 0

        # 최근 불일치 목록
        mismatches_collection = MongoService.get_collection("shadow_mismatches")
        recent_mismatches = []
        cursor = mismatches_collection.find(
            {"timestamp": {"$gte": since}}
        ).sort("timestamp", -1).limit(10)

        async for doc in cursor:
            recent_mismatches.append({
                "id": str(doc["_id"]),
                "workflow": doc["workflow"],
                "timestamp": doc["timestamp"].isoformat(),
                "diff_count": len(doc.get("diffs", [])),
                "status": doc.get("status", "open"),
                "has_analysis": doc.get("analysis") is not None
            })

        # 전환 준비 상태 판단
        criteria = SWITCH_CRITERIA
        checks = {
            "min_calls": {
                "required": criteria["min_calls"],
                "actual": total_calls,
                "passed": total_calls >= criteria["min_calls"]
            },
            "match_rate": {
                "required": f">= {criteria['match_rate_threshold']}%",
                "actual": f"{round(match_rate, 2)}%",
                "passed": match_rate >= criteria["match_rate_threshold"]
            },
            "error_rate": {
                "required": f"<= {criteria['error_rate_threshold']}%",
                "actual": f"{round(error_rate, 2)}%",
                "passed": error_rate <= criteria["error_rate_threshold"]
            },
            "observation_days": {
                "required": criteria["observation_days"],
                "actual": days,
                "passed": days >= criteria["observation_days"]
            }
        }

        all_passed = all(c["passed"] for c in checks.values())

        return {
            "period": {
                "days": days,
                "since": since.isoformat(),
                "until": datetime.utcnow().isoformat()
            },
            "summary": {
                "total_calls": total_calls,
                "match": match_count,
                "mismatch": mismatch_count,
                "error": error_count,
                "match_rate": round(match_rate, 2),
                "mismatch_rate": round(mismatch_rate, 2),
                "error_rate": round(error_rate, 2)
            },
            "by_workflow": workflow_stats,
            "recent_mismatches": recent_mismatches,
            "switch_readiness": {
                "ready": all_passed,
                "criteria": criteria,
                "checks": checks,
                "recommendation": "FastAPI 전환 가능" if all_passed else "추가 검증 필요"
            }
        }

    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mismatches")
async def get_mismatches(
    workflow: Optional[str] = None,
    status: Optional[str] = Query(default=None, regex="^(open|resolved|ignored)$"),
    limit: int = Query(default=20, ge=1, le=100)
):
    """최근 불일치 목록 조회"""
    try:
        collection = MongoService.get_collection("shadow_mismatches")

        query = {}
        if workflow:
            query["workflow"] = workflow
        if status:
            query["status"] = status

        cursor = collection.find(query).sort("timestamp", -1).limit(limit)

        mismatches = []
        async for doc in cursor:
            mismatches.append({
                "id": str(doc["_id"]),
                "workflow": doc["workflow"],
                "timestamp": doc["timestamp"].isoformat(),
                "diffs": doc.get("diffs", []),
                "status": doc.get("status", "open"),
                "analysis": doc.get("analysis"),
                "resolution": doc.get("resolution")
            })

        return {"count": len(mismatches), "mismatches": mismatches}

    except Exception as e:
        logger.error(f"Mismatches error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mismatches/{mismatch_id}/resolve")
async def resolve_mismatch(mismatch_id: str, resolution: str = Form(...)):
    """불일치 해결 처리"""
    try:
        from bson import ObjectId
        collection = MongoService.get_collection("shadow_mismatches")

        result = await collection.update_one(
            {"_id": ObjectId(mismatch_id)},
            {"$set": {
                "status": "resolved",
                "resolution": resolution,
                "resolved_at": datetime.utcnow()
            }}
        )

        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Mismatch not found")

        return {"status": "resolved", "mismatch_id": mismatch_id}

    except Exception as e:
        logger.error(f"Resolve error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

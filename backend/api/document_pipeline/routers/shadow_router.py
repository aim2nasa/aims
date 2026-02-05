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

from middleware.shadow_mode import shadow_call, ShadowMode, ServiceMode
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
            workflow="smartsearch",  # n8n과 FastAPI 모두 하이픈 없이 사용
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
    source: Optional[str] = Form("web"),
    batchId: Optional[str] = Form(None)  # 🔴 업로드 묶음 ID (현재 세션 진행률 추적)
):
    """Shadow mode for docprep-main (full pipeline)"""
    try:
        form_data = {
            "userId": userId,
            "customerId": customerId or "",
            "customerName": customerName or "",
            "source": source,
            "batchId": batchId or ""  # 🔴 batchId 전달
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
        "enabled": ShadowMode.enabled
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


# ==================== 서비스 모드 제어 API ====================

@router.get("/service-mode")
async def get_service_mode():
    """
    현재 서비스 모드 조회

    Returns:
        - mode: 현재 서비스 모드 (n8n, fastapi, shadow)
        - shadow_enabled: Shadow Mode 활성화 상태
        - description: 모드 설명
    """
    mode = ShadowMode.get_mode()
    descriptions = {
        ServiceMode.N8N: "n8n만 사용 (현재 운영 모드)",
        ServiceMode.FASTAPI: "FastAPI만 사용 (전환 완료 모드)",
        ServiceMode.SHADOW: "n8n + FastAPI 병렬 비교 모드"
    }
    return {
        "mode": mode.value,
        "shadow_enabled": ShadowMode.enabled,
        "description": descriptions.get(mode, "알 수 없음"),
        "available_modes": [m.value for m in ServiceMode]
    }


@router.post("/service-mode")
async def set_service_mode(request: Request):
    """
    서비스 모드 변경

    Request Body:
        - mode: "n8n" | "fastapi" | "shadow"

    Returns:
        - previous_mode: 이전 모드
        - current_mode: 변경된 현재 모드
        - shadow_enabled: Shadow Mode 활성화 상태
    """
    try:
        body = await request.json()
        mode_str = body.get("mode", "").lower()

        # 모드 유효성 검사
        mode_map = {
            "n8n": ServiceMode.N8N,
            "fastapi": ServiceMode.FASTAPI,
            "shadow": ServiceMode.SHADOW
        }

        if mode_str not in mode_map:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid mode: {mode_str}. Must be one of: n8n, fastapi, shadow"
            )

        previous_mode = ShadowMode.get_mode()
        new_mode = mode_map[mode_str]

        # 모드 변경
        ShadowMode.set_mode(new_mode)

        # 모드 변경 로깅
        await _log_mode_change(previous_mode.value, new_mode.value)

        logger.info(f"Service mode changed: {previous_mode.value} -> {new_mode.value}")

        return {
            "previous_mode": previous_mode.value,
            "current_mode": new_mode.value,
            "shadow_enabled": ShadowMode.enabled,
            "message": f"서비스 모드가 {new_mode.value}로 변경되었습니다."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set service mode error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _log_mode_change(previous_mode: str, new_mode: str):
    """서비스 모드 변경 이력 로깅"""
    try:
        collection = MongoService.get_collection("service_mode_history")
        await collection.insert_one({
            "previous_mode": previous_mode,
            "new_mode": new_mode,
            "timestamp": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"Failed to log mode change: {e}")


# ==================== 성능 메트릭 API ====================

@router.get("/metrics")
async def get_metrics(days: int = Query(default=7, ge=1, le=90)):
    """
    성능 메트릭 통계 조회

    Args:
        days: 조회 기간 (일)

    Returns:
        - period: 조회 기간
        - summary: 전체 요약 (평균 응답시간, 호출수, 에러율)
        - by_workflow: 워크플로우별 통계
        - comparison: n8n vs FastAPI 비교
    """
    try:
        since = datetime.utcnow() - timedelta(days=days)
        collection = MongoService.get_collection("shadow_metrics")

        # 전체 통계
        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": None,
                "count": {"$sum": 1},
                "n8n_avg_ms": {"$avg": "$n8n_response_time_ms"},
                "fastapi_avg_ms": {"$avg": "$fastapi_response_time_ms"},
                "n8n_success": {"$sum": {"$cond": [{"$eq": ["$n8n_status", "success"]}, 1, 0]}},
                "n8n_error": {"$sum": {"$cond": [{"$eq": ["$n8n_status", "error"]}, 1, 0]}},
                "fastapi_success": {"$sum": {"$cond": [{"$eq": ["$fastapi_status", "success"]}, 1, 0]}},
                "fastapi_error": {"$sum": {"$cond": [{"$eq": ["$fastapi_status", "error"]}, 1, 0]}}
            }}
        ]

        summary = None
        async for doc in collection.aggregate(pipeline):
            total = doc["count"]
            summary = {
                "total_calls": total,
                "n8n": {
                    "avg_response_time_ms": round(doc["n8n_avg_ms"] or 0, 1),
                    "success_count": doc["n8n_success"],
                    "error_count": doc["n8n_error"],
                    "error_rate": round(doc["n8n_error"] / total * 100, 2) if total > 0 else 0
                },
                "fastapi": {
                    "avg_response_time_ms": round(doc["fastapi_avg_ms"] or 0, 1),
                    "success_count": doc["fastapi_success"],
                    "error_count": doc["fastapi_error"],
                    "error_rate": round(doc["fastapi_error"] / total * 100, 2) if total > 0 else 0
                }
            }

        if not summary:
            summary = {
                "total_calls": 0,
                "n8n": {"avg_response_time_ms": 0, "success_count": 0, "error_count": 0, "error_rate": 0},
                "fastapi": {"avg_response_time_ms": 0, "success_count": 0, "error_count": 0, "error_rate": 0}
            }

        # 워크플로우별 통계
        workflow_pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": "$workflow",
                "count": {"$sum": 1},
                "n8n_avg_ms": {"$avg": "$n8n_response_time_ms"},
                "fastapi_avg_ms": {"$avg": "$fastapi_response_time_ms"},
                "n8n_max_ms": {"$max": "$n8n_response_time_ms"},
                "fastapi_max_ms": {"$max": "$fastapi_response_time_ms"}
            }}
        ]

        by_workflow = {}
        async for doc in collection.aggregate(workflow_pipeline):
            wf = doc["_id"]
            by_workflow[wf] = {
                "call_count": doc["count"],
                "n8n_avg_ms": round(doc["n8n_avg_ms"] or 0, 1),
                "fastapi_avg_ms": round(doc["fastapi_avg_ms"] or 0, 1),
                "n8n_max_ms": doc["n8n_max_ms"] or 0,
                "fastapi_max_ms": doc["fastapi_max_ms"] or 0,
                "improvement_pct": _calc_improvement(doc["n8n_avg_ms"], doc["fastapi_avg_ms"])
            }

        # 성능 비교 계산
        comparison = None
        if summary["total_calls"] > 0:
            n8n_avg = summary["n8n"]["avg_response_time_ms"]
            fastapi_avg = summary["fastapi"]["avg_response_time_ms"]
            comparison = {
                "faster_service": "fastapi" if fastapi_avg < n8n_avg else "n8n",
                "improvement_pct": _calc_improvement(n8n_avg, fastapi_avg),
                "n8n_avg_ms": n8n_avg,
                "fastapi_avg_ms": fastapi_avg
            }

        return {
            "period": {
                "days": days,
                "since": since.isoformat(),
                "until": datetime.utcnow().isoformat()
            },
            "current_mode": ShadowMode.get_mode().value,
            "summary": summary,
            "by_workflow": by_workflow,
            "comparison": comparison
        }

    except Exception as e:
        logger.error(f"Metrics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _calc_improvement(n8n_ms: Optional[float], fastapi_ms: Optional[float]) -> float:
    """n8n 대비 FastAPI 성능 개선율 (%) - 양수면 FastAPI가 빠름"""
    if not n8n_ms or not fastapi_ms or n8n_ms == 0:
        return 0
    return round((n8n_ms - fastapi_ms) / n8n_ms * 100, 1)


@router.get("/metrics/realtime")
async def get_realtime_metrics(limit: int = Query(default=100, ge=10, le=500)):
    """
    실시간 성능 메트릭 (최근 N건)

    Args:
        limit: 조회할 최근 데이터 수 (기본 100건)

    Returns:
        - data: 최근 메트릭 데이터 배열
        - stats: 실시간 통계
    """
    try:
        collection = MongoService.get_collection("shadow_metrics")

        cursor = collection.find({}).sort("timestamp", -1).limit(limit)

        data = []
        n8n_times = []
        fastapi_times = []

        async for doc in cursor:
            record = {
                "timestamp": doc["timestamp"].isoformat(),
                "workflow": doc["workflow"],
                "n8n_ms": doc.get("n8n_response_time_ms"),
                "fastapi_ms": doc.get("fastapi_response_time_ms"),
                "n8n_status": doc.get("n8n_status"),
                "fastapi_status": doc.get("fastapi_status"),
                "service_mode": doc.get("service_mode", "shadow")
            }
            data.append(record)

            if doc.get("n8n_response_time_ms"):
                n8n_times.append(doc["n8n_response_time_ms"])
            if doc.get("fastapi_response_time_ms"):
                fastapi_times.append(doc["fastapi_response_time_ms"])

        # 실시간 통계 계산
        stats = {
            "count": len(data),
            "n8n": {
                "avg_ms": round(sum(n8n_times) / len(n8n_times), 1) if n8n_times else 0,
                "min_ms": min(n8n_times) if n8n_times else 0,
                "max_ms": max(n8n_times) if n8n_times else 0
            },
            "fastapi": {
                "avg_ms": round(sum(fastapi_times) / len(fastapi_times), 1) if fastapi_times else 0,
                "min_ms": min(fastapi_times) if fastapi_times else 0,
                "max_ms": max(fastapi_times) if fastapi_times else 0
            }
        }

        return {
            "current_mode": ShadowMode.get_mode().value,
            "data": data,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"Realtime metrics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/history")
async def get_metrics_history(
    days: int = Query(default=7, ge=1, le=30),
    interval: str = Query(default="hour", regex="^(hour|day)$")
):
    """
    시간별/일별 성능 메트릭 히스토리 (차트용)

    Args:
        days: 조회 기간 (일)
        interval: 집계 단위 (hour 또는 day)

    Returns:
        - data: 시간별/일별 집계 데이터
    """
    try:
        since = datetime.utcnow() - timedelta(days=days)
        collection = MongoService.get_collection("shadow_metrics")

        # 시간별 또는 일별 집계
        if interval == "hour":
            date_format = {
                "year": {"$year": "$timestamp"},
                "month": {"$month": "$timestamp"},
                "day": {"$dayOfMonth": "$timestamp"},
                "hour": {"$hour": "$timestamp"}
            }
        else:  # day
            date_format = {
                "year": {"$year": "$timestamp"},
                "month": {"$month": "$timestamp"},
                "day": {"$dayOfMonth": "$timestamp"}
            }

        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": date_format,
                "count": {"$sum": 1},
                "n8n_avg_ms": {"$avg": "$n8n_response_time_ms"},
                "fastapi_avg_ms": {"$avg": "$fastapi_response_time_ms"}
            }},
            {"$sort": {"_id": 1}}
        ]

        data = []
        async for doc in collection.aggregate(pipeline):
            id_parts = doc["_id"]
            if interval == "hour":
                time_label = f"{id_parts['year']}-{id_parts['month']:02d}-{id_parts['day']:02d} {id_parts['hour']:02d}:00"
            else:
                time_label = f"{id_parts['year']}-{id_parts['month']:02d}-{id_parts['day']:02d}"

            data.append({
                "time": time_label,
                "count": doc["count"],
                "n8n_avg_ms": round(doc["n8n_avg_ms"] or 0, 1),
                "fastapi_avg_ms": round(doc["fastapi_avg_ms"] or 0, 1)
            })

        return {
            "period": {"days": days, "interval": interval},
            "current_mode": ShadowMode.get_mode().value,
            "data": data
        }

    except Exception as e:
        logger.error(f"Metrics history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def shadow_stats(days: int = Query(default=7, ge=1, le=90)):
    """
    Shadow Mode 통계 및 전환 판단 지표

    Returns:
        - shadow_mode: Shadow Mode 활성화 상태 및 진단 정보
        - summary: 전체 통계
        - by_workflow: 워크플로우별 통계
        - recent_mismatches: 최근 불일치 목록
        - switch_readiness: 전환 준비 상태
    """
    try:
        since = datetime.utcnow() - timedelta(days=days)

        # 호출 통계 집계
        calls_collection = MongoService.get_collection("shadow_calls")

        # 전체 기간 첫 호출/마지막 호출 시간 조회
        first_call_doc = await calls_collection.find_one(
            {},
            sort=[("timestamp", 1)]
        )
        last_call_doc = await calls_collection.find_one(
            {},
            sort=[("timestamp", -1)]
        )

        first_call_time = first_call_doc["timestamp"].isoformat() if first_call_doc else None
        last_call_time = last_call_doc["timestamp"].isoformat() if last_call_doc else None

        # 전체 호출 수 (기간 무관)
        total_calls_all_time = await calls_collection.count_documents({})

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

        # 상태 해석 메시지 생성
        enabled = ShadowMode.enabled
        if total_calls_all_time == 0:
            if enabled:
                status_interpretation = "Shadow Mode 활성화됨 - 아직 호출 없음 (문서 업로드 경로가 /shadow/* 엔드포인트를 사용하는지 확인 필요)"
            else:
                status_interpretation = "Shadow Mode 비활성화됨 - 비교 기능이 꺼져 있음"
        else:
            if enabled:
                if total_calls == 0:
                    status_interpretation = f"Shadow Mode 활성화됨 - 선택 기간({days}일) 내 호출 없음 (전체: {total_calls_all_time}건)"
                elif mismatch_count == 0 and error_count == 0:
                    status_interpretation = f"Shadow Mode 활성화됨 - 완벽한 상태 (100% Match, {total_calls}건 호출)"
                else:
                    status_interpretation = f"Shadow Mode 활성화됨 - 검증 진행 중 ({mismatch_count} mismatch, {error_count} errors)"
            else:
                status_interpretation = f"Shadow Mode 비활성화됨 - 과거 데이터 {total_calls_all_time}건 존재"

        return {
            "shadow_mode": {
                "enabled": enabled,
                "first_call_time": first_call_time,
                "last_call_time": last_call_time,
                "total_calls_all_time": total_calls_all_time,
                "status_interpretation": status_interpretation
            },
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


@router.delete("/mismatches/resolved")
async def delete_resolved_mismatches():
    """해결된 불일치 기록 모두 삭제"""
    try:
        collection = MongoService.get_collection("shadow_mismatches")

        result = await collection.delete_many({"status": "resolved"})

        logger.info(f"Deleted {result.deleted_count} resolved mismatches")

        return {
            "deleted_count": result.deleted_count,
            "message": f"{result.deleted_count}건의 resolved 기록이 삭제되었습니다."
        }

    except Exception as e:
        logger.error(f"Delete resolved error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/stats/reset")
async def reset_shadow_stats():
    """Shadow Mode 통계 초기화 (모든 호출 기록 삭제)"""
    try:
        calls_collection = MongoService.get_collection("shadow_calls")
        mismatches_collection = MongoService.get_collection("shadow_mismatches")
        errors_collection = MongoService.get_collection("shadow_errors")

        calls_result = await calls_collection.delete_many({})
        mismatches_result = await mismatches_collection.delete_many({})
        errors_result = await errors_collection.delete_many({})

        total_deleted = calls_result.deleted_count + mismatches_result.deleted_count + errors_result.deleted_count

        logger.info(f"Reset shadow stats: {calls_result.deleted_count} calls, {mismatches_result.deleted_count} mismatches, {errors_result.deleted_count} errors")

        return {
            "deleted": {
                "calls": calls_result.deleted_count,
                "mismatches": mismatches_result.deleted_count,
                "errors": errors_result.deleted_count
            },
            "total_deleted": total_deleted,
            "message": f"통계가 초기화되었습니다. (호출: {calls_result.deleted_count}, 불일치: {mismatches_result.deleted_count}, 오류: {errors_result.deleted_count})"
        }

    except Exception as e:
        logger.error(f"Reset stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/services-status")
async def get_services_status():
    """
    n8n과 FastAPI 서비스 상태 확인
    """
    import httpx
    from datetime import datetime

    async def check_service(name: str, url: str, timeout: float = 5.0):
        """개별 서비스 상태 확인"""
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                start = datetime.now()
                response = await client.get(url)
                latency_ms = (datetime.now() - start).total_seconds() * 1000

                if response.status_code == 200:
                    return {
                        "name": name,
                        "status": "healthy",
                        "latency_ms": round(latency_ms, 1),
                        "details": response.json() if response.headers.get("content-type", "").startswith("application/json") else {"raw": response.text[:100]}
                    }
                else:
                    return {
                        "name": name,
                        "status": "unhealthy",
                        "error": f"HTTP {response.status_code}",
                        "latency_ms": round(latency_ms, 1)
                    }
        except httpx.TimeoutException:
            return {
                "name": name,
                "status": "timeout",
                "error": "Connection timeout"
            }
        except Exception as e:
            return {
                "name": name,
                "status": "error",
                "error": str(e)
            }

    # 각 서비스 상태 확인 (병렬 실행)
    import asyncio
    n8n_status, fastapi_status = await asyncio.gather(
        check_service("n8n", "http://localhost:5678/healthz"),
        check_service("FastAPI (document_pipeline)", "http://localhost:8100/health")
    )

    return {
        "timestamp": datetime.now().isoformat(),
        "services": [n8n_status, fastapi_status]
    }

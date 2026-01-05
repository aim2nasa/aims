"""
Shadow Mode Middleware
- n8n과 FastAPI 동시 호출 (Shadow Mode)
- 서비스 모드 전환 지원 (n8n / fastapi / shadow)
- 성능 메트릭 수집
"""
import asyncio
import httpx
import logging
import time
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional

from config import get_settings
from contracts.dynamic_fields import compare_responses
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)
settings = get_settings()

N8N_BASE = "https://n8nd.giize.com/webhook"
FASTAPI_BASE = "http://localhost:8100/webhook"


class ServiceMode(Enum):
    """서비스 모드"""
    N8N = "n8n"           # n8n만 사용 (현재 운영)
    FASTAPI = "fastapi"   # FastAPI만 사용 (전환 후)
    SHADOW = "shadow"     # 병렬 비교 모드


class ShadowMode:
    """Shadow Mode 및 서비스 모드 관리 클래스"""

    enabled: bool = True
    service_mode: ServiceMode = ServiceMode.SHADOW

    @classmethod
    def enable(cls):
        cls.enabled = True
        cls.service_mode = ServiceMode.SHADOW
        logger.info("Shadow Mode enabled")

    @classmethod
    def disable(cls):
        cls.enabled = False
        logger.info("Shadow Mode disabled")

    @classmethod
    def set_mode(cls, mode: ServiceMode):
        """서비스 모드 변경"""
        cls.service_mode = mode
        cls.enabled = (mode == ServiceMode.SHADOW)
        logger.info(f"Service mode changed to: {mode.value}")

    @classmethod
    def get_mode(cls) -> ServiceMode:
        """현재 서비스 모드 조회"""
        return cls.service_mode

    @classmethod
    def get_status(cls) -> dict:
        """현재 상태 조회"""
        return {
            "enabled": cls.enabled,
            "service_mode": cls.service_mode.value
        }


def _safe_json(response: httpx.Response) -> dict:
    """안전하게 JSON 파싱, 빈 응답은 빈 dict 반환"""
    try:
        text = response.text.strip()
        if not text:
            return {"_empty_response": True, "_status_code": response.status_code}
        return response.json()
    except Exception:
        return {"_parse_error": True, "_raw": response.text[:500], "_status_code": response.status_code}


async def _call_n8n(
    client: httpx.AsyncClient,
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> tuple[dict, int, str]:
    """n8n 호출 (응답, 소요시간ms, 상태)"""
    start = time.time()
    try:
        if files:
            response = await client.post(
                f"{N8N_BASE}/{workflow}",
                data=request_data,
                files=files
            )
        else:
            response = await client.post(
                f"{N8N_BASE}/{workflow}",
                json=request_data
            )
        elapsed_ms = int((time.time() - start) * 1000)
        return _safe_json(response), elapsed_ms, "success"
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        logger.error(f"n8n call failed: {e}")
        return {"_error": str(e)}, elapsed_ms, "error"


async def _call_fastapi(
    client: httpx.AsyncClient,
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None,
    shadow: bool = False
) -> tuple[dict, int, str]:
    """FastAPI 호출 (응답, 소요시간ms, 상태)"""
    start = time.time()
    try:
        url = f"{FASTAPI_BASE}/{workflow}"
        if shadow:
            url += "?shadow=true"

        if files:
            response = await client.post(url, data=request_data, files=files)
        else:
            response = await client.post(url, json=request_data)

        elapsed_ms = int((time.time() - start) * 1000)
        return _safe_json(response), elapsed_ms, "success"
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        logger.error(f"FastAPI call failed: {e}")
        return {"_error": str(e)}, elapsed_ms, "error"


async def shadow_call(
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> dict:
    """
    서비스 모드에 따라 호출 라우팅

    Args:
        workflow: 워크플로우 이름 (예: "docprep-main")
        request_data: form data 또는 json data
        files: 파일 업로드용

    Returns:
        서비스 응답
    """
    mode = ShadowMode.service_mode

    async with httpx.AsyncClient(timeout=60.0) as client:
        if mode == ServiceMode.N8N:
            # n8n만 호출
            response, elapsed_ms, status = await _call_n8n(
                client, workflow, request_data, files
            )
            await _log_metrics(workflow, elapsed_ms, None, status, None)
            return response

        elif mode == ServiceMode.FASTAPI:
            # FastAPI만 호출 (운영 모드, shadow=false)
            response, elapsed_ms, status = await _call_fastapi(
                client, workflow, request_data, files, shadow=False
            )
            await _log_metrics(workflow, None, elapsed_ms, None, status)
            return response

        else:  # SHADOW mode
            return await _shadow_call_internal(
                client, workflow, request_data, files
            )


async def _shadow_call_internal(
    client: httpx.AsyncClient,
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> dict:
    """Shadow mode: 병렬 호출 및 비교"""
    try:
        # 병렬 호출
        n8n_task = asyncio.create_task(
            _call_n8n(client, workflow, request_data, files)
        )
        fastapi_task = asyncio.create_task(
            _call_fastapi(client, workflow, request_data, files, shadow=True)
        )

        # 병렬 실행
        results = await asyncio.gather(n8n_task, fastapi_task, return_exceptions=True)

        # n8n 결과
        if isinstance(results[0], Exception):
            n8n_response, n8n_time, n8n_status = {"_error": str(results[0])}, 0, "error"
        else:
            n8n_response, n8n_time, n8n_status = results[0]

        # FastAPI 결과
        if isinstance(results[1], Exception):
            fastapi_response, fastapi_time, fastapi_status = {"_error": str(results[1])}, 0, "error"
        else:
            fastapi_response, fastapi_time, fastapi_status = results[1]

        # 메트릭 로깅
        await _log_metrics(
            workflow, n8n_time, fastapi_time, n8n_status, fastapi_status
        )

        # n8n 실패 시 FastAPI fallback
        if n8n_status == "error":
            logger.warning(f"n8n failed, using FastAPI response for {workflow}")
            if fastapi_status == "success":
                return fastapi_response
            raise Exception(f"Both n8n and FastAPI failed for {workflow}")

        # 비교 (FastAPI가 성공한 경우만)
        if fastapi_status == "success":
            is_match, diffs = compare_responses(workflow, n8n_response, fastapi_response)

            if not is_match:
                await _handle_mismatch(
                    workflow=workflow,
                    request_data=request_data,
                    n8n_response=n8n_response,
                    fastapi_response=fastapi_response,
                    diffs=diffs
                )
                await _log_call(workflow, "mismatch", len(diffs))
            else:
                logger.debug(f"[SHADOW MATCH] {workflow}")
                await _log_call(workflow, "match", 0)
        else:
            await _log_fastapi_error(workflow, request_data, str(fastapi_response.get("_error", "unknown")))
            await _log_call(workflow, "error", 0)

        return n8n_response

    except Exception as e:
        logger.error(f"Shadow call error: {e}")
        raise


async def _log_metrics(
    workflow: str,
    n8n_time_ms: Optional[int],
    fastapi_time_ms: Optional[int],
    n8n_status: Optional[str],
    fastapi_status: Optional[str]
):
    """성능 메트릭 로깅"""
    try:
        collection = MongoService.get_collection("shadow_metrics")
        await collection.insert_one({
            "workflow": workflow,
            "timestamp": datetime.utcnow(),
            "n8n_response_time_ms": n8n_time_ms,
            "fastapi_response_time_ms": fastapi_time_ms,
            "n8n_status": n8n_status,
            "fastapi_status": fastapi_status,
            "service_mode": ShadowMode.service_mode.value
        })
    except Exception as e:
        logger.error(f"Failed to log metrics: {e}")


async def _handle_mismatch(
    workflow: str,
    request_data: dict,
    n8n_response: dict,
    fastapi_response: dict,
    diffs: list
):
    """불일치 처리 - DB에 기록 (aims-admin에서 확인)"""
    logger.warning(f"[SHADOW MISMATCH] {workflow}: {len(diffs)} differences")

    mismatch_id = await _log_mismatch(
        workflow=workflow,
        request_data=request_data,
        n8n_response=n8n_response,
        fastapi_response=fastapi_response,
        diffs=diffs
    )

    logger.info(f"[SHADOW] Mismatch saved: {mismatch_id} - Check /shadow/mismatches")


async def _log_mismatch(
    workflow: str,
    request_data: dict,
    n8n_response: dict,
    fastapi_response: dict,
    diffs: list
) -> str:
    """불일치 MongoDB 로깅"""
    try:
        collection = MongoService.get_collection("shadow_mismatches")

        doc = {
            "workflow": workflow,
            "timestamp": datetime.utcnow(),
            "request_data": _sanitize_for_mongo(request_data),
            "n8n_response": _sanitize_for_mongo(n8n_response),
            "fastapi_response": _sanitize_for_mongo(fastapi_response),
            "diffs": diffs,
            "status": "open",
            "analysis": None,
            "resolution": None
        }

        result = await collection.insert_one(doc)
        logger.info(f"Mismatch logged: {result.inserted_id}")
        return str(result.inserted_id)

    except Exception as e:
        logger.error(f"Failed to log mismatch: {e}")
        return ""


async def _log_call(workflow: str, result: str, diff_count: int):
    """모든 Shadow 호출 로깅 (통계용)"""
    try:
        collection = MongoService.get_collection("shadow_calls")
        await collection.insert_one({
            "workflow": workflow,
            "result": result,  # "match", "mismatch", "error"
            "diff_count": diff_count,
            "timestamp": datetime.utcnow()
        })
    except Exception as e:
        logger.error(f"Failed to log call: {e}")


async def _log_fastapi_error(workflow: str, request_data: dict, error: str):
    """FastAPI 오류 로깅"""
    try:
        collection = MongoService.get_collection("shadow_errors")

        await collection.insert_one({
            "workflow": workflow,
            "timestamp": datetime.utcnow(),
            "request_data": _sanitize_for_mongo(request_data),
            "error": error,
            "status": "open"
        })

    except Exception as e:
        logger.error(f"Failed to log error: {e}")


def _sanitize_for_mongo(data: Any) -> Any:
    """MongoDB 저장을 위한 데이터 정제"""
    if isinstance(data, dict):
        return {k: _sanitize_for_mongo(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_sanitize_for_mongo(v) for v in data]
    elif isinstance(data, bytes):
        return f"<bytes:{len(data)}>"
    elif hasattr(data, 'read'):  # File-like object
        return f"<file>"
    else:
        return data

"""
Shadow Mode Middleware
- n8n과 FastAPI 동시 호출
- n8n 응답 반환, FastAPI 응답은 비교 로깅
"""
import asyncio
import httpx
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from functools import wraps

from config import get_settings
from contracts.dynamic_fields import compare_responses, normalize_response
from services.anthropic_service import AnthropicService
from services.mongo_service import MongoService

logger = logging.getLogger(__name__)
settings = get_settings()

N8N_BASE = "https://n8nd.giize.com/webhook"
FASTAPI_BASE = "http://localhost:8100/webhook"


class ShadowMode:
    """Shadow Mode 관리 클래스"""

    enabled: bool = True
    auto_fix: bool = False  # Claude 자동 수정 활성화 여부

    @classmethod
    def enable(cls):
        cls.enabled = True
        logger.info("Shadow Mode enabled")

    @classmethod
    def disable(cls):
        cls.enabled = False
        logger.info("Shadow Mode disabled")

    @classmethod
    def set_auto_fix(cls, value: bool):
        cls.auto_fix = value
        logger.info(f"Shadow Mode auto_fix: {value}")


def _safe_json(response: httpx.Response) -> dict:
    """안전하게 JSON 파싱, 빈 응답은 빈 dict 반환"""
    try:
        text = response.text.strip()
        if not text:
            return {"_empty_response": True, "_status_code": response.status_code}
        return response.json()
    except Exception:
        return {"_parse_error": True, "_raw": response.text[:500], "_status_code": response.status_code}


async def shadow_call(
    workflow: str,
    request_data: dict,
    files: Optional[dict] = None
) -> dict:
    """
    n8n과 FastAPI 동시 호출, 결과 비교

    Args:
        workflow: 워크플로우 이름 (예: "docprep-main")
        request_data: form data 또는 json data
        files: 파일 업로드용

    Returns:
        n8n 응답 (운영 응답)
    """
    if not ShadowMode.enabled:
        # Shadow mode 비활성화 시 n8n만 호출
        async with httpx.AsyncClient(timeout=60.0) as client:
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
            return _safe_json(response)

    # Shadow mode: 병렬 호출
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # 병렬 호출 준비
            if files:
                n8n_coro = client.post(
                    f"{N8N_BASE}/{workflow}",
                    data=request_data,
                    files=files
                )
                fastapi_coro = client.post(
                    f"{FASTAPI_BASE}/{workflow}",
                    data=request_data,
                    files=files
                )
            else:
                n8n_coro = client.post(
                    f"{N8N_BASE}/{workflow}",
                    json=request_data
                )
                fastapi_coro = client.post(
                    f"{FASTAPI_BASE}/{workflow}",
                    json=request_data
                )

            # 병렬 실행
            results = await asyncio.gather(
                n8n_coro, fastapi_coro,
                return_exceptions=True
            )

            n8n_result = results[0]
            fastapi_result = results[1]

            # n8n 응답 추출
            if isinstance(n8n_result, Exception):
                logger.error(f"n8n call failed: {n8n_result}")
                # n8n 실패 시 FastAPI 응답 반환 (fallback)
                if not isinstance(fastapi_result, Exception):
                    return _safe_json(fastapi_result)
                raise n8n_result

            n8n_response = _safe_json(n8n_result)

            # FastAPI 응답 추출 및 비교
            if not isinstance(fastapi_result, Exception):
                fastapi_response = _safe_json(fastapi_result)

                # 비교
                is_match, diffs = compare_responses(
                    workflow, n8n_response, fastapi_response
                )

                if not is_match:
                    await _handle_mismatch(
                        workflow=workflow,
                        request_data=request_data,
                        n8n_response=n8n_response,
                        fastapi_response=fastapi_response,
                        diffs=diffs
                    )
                else:
                    logger.debug(f"[SHADOW MATCH] {workflow}")

            else:
                logger.warning(f"FastAPI call failed: {fastapi_result}")
                await _log_fastapi_error(workflow, request_data, str(fastapi_result))

            return n8n_response

        except Exception as e:
            logger.error(f"Shadow call error: {e}")
            raise


async def _handle_mismatch(
    workflow: str,
    request_data: dict,
    n8n_response: dict,
    fastapi_response: dict,
    diffs: list
):
    """불일치 처리"""
    logger.warning(f"[SHADOW MISMATCH] {workflow}: {len(diffs)} differences")

    # MongoDB에 로깅
    mismatch_id = await _log_mismatch(
        workflow=workflow,
        request_data=request_data,
        n8n_response=n8n_response,
        fastapi_response=fastapi_response,
        diffs=diffs
    )

    # 자동 수정 활성화 시 Claude 분석
    if ShadowMode.auto_fix:
        try:
            analysis = await AnthropicService.analyze_mismatch(
                workflow=workflow,
                n8n_response=n8n_response,
                fastapi_response=fastapi_response,
                diffs=diffs
            )

            # 분석 결과 저장
            await _update_mismatch_analysis(mismatch_id, analysis)

            logger.info(f"[SHADOW AUTO-FIX] Analysis complete: {analysis.get('cause', 'N/A')}")

        except Exception as e:
            logger.error(f"Auto-fix analysis failed: {e}")


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


async def _update_mismatch_analysis(mismatch_id: str, analysis: dict):
    """불일치 분석 결과 업데이트"""
    try:
        from bson import ObjectId
        collection = MongoService.get_collection("shadow_mismatches")

        await collection.update_one(
            {"_id": ObjectId(mismatch_id)},
            {"$set": {
                "analysis": analysis,
                "analyzed_at": datetime.utcnow()
            }}
        )

    except Exception as e:
        logger.error(f"Failed to update analysis: {e}")


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


# Type hint for _sanitize_for_mongo
from typing import Any

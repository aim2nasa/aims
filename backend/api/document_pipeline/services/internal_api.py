"""
Internal API 클라이언트 — aims_api 경유 데이터 CRUD

document_pipeline에서 files/customers 컬렉션에 직접 접근하지 않고
aims_api의 내부 API를 경유하여 데이터를 조회/변경한다.
"""
import logging
from datetime import datetime

import httpx
from bson import ObjectId
from config import get_settings

logger = logging.getLogger(__name__)


# Internal API 응답 필수 필드 (@aims/shared-schema 참조)
# @see backend/shared/schema/internal-api.ts INTERNAL_API_REQUIRED_FIELDS
_REQUIRED_FIELDS = {
    "files/create": ["insertedId"],
    "files/update": ["modifiedCount"],
    "files/delete": ["deletedCount"],
    "files/delete-by-filter": ["deletedCount"],
    "files/count": ["count"],
    "customers/name": ["name"],
    "customers/batch-names": ["names"],
    "customers/resolve-exact": ["customerId", "customerName"],
    "customers/ownership": ["exists"],
    "credit/check": ["allowed", "reason"],
}


def _validate_response(data: dict, endpoint: str) -> bool:
    """Internal API 응답의 필수 필드 존재 여부 검증. 누락 시 경고 로그."""
    required = _REQUIRED_FIELDS.get(endpoint)
    if not required or not data:
        return True
    missing = [f for f in required if f not in data]
    if missing:
        logger.warning(f"[InternalAPI] 응답 필수 필드 누락 ({endpoint}): {missing}")
        return False
    return True


def _serialize_for_api(obj):
    """MongoDB 문서를 JSON 직렬화 가능하도록 변환 (Internal API 전송용)"""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _serialize_for_api(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_for_api(item) for item in obj]
    if isinstance(obj, bytes):
        return None  # bytes는 JSON 직렬화 불가 — 무시
    return obj


async def get_customer_name(customer_id: str) -> str | None:
    """단건 고객명 조회. 실패 시 None 반환."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.AIMS_API_URL}/api/internal/customers/{customer_id}/name",
                headers={"x-api-key": settings.INTERNAL_API_KEY}
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    _validate_response(data["data"], "customers/name")
                    return data["data"].get("name")
    except Exception as e:
        logger.warning(f"[InternalAPI] 고객명 조회 실패 ({customer_id}): {e}")
    return None


# =========================================================================
# Phase 4: Write 전환 함수 — files CRUD + customers pull-document
# =========================================================================

async def create_file(document: dict) -> dict:
    """POST /internal/files — 새 파일 문서 생성. 반환: {"success": bool, "data": {"insertedId": str}}"""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{settings.AIMS_API_URL}/api/internal/files",
                json={"document": document},
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                result = resp.json()
                _validate_response(result.get("data", {}), "files/create")
                return result
            logger.warning(f"[InternalAPI] 파일 생성 실패: {resp.status_code} {resp.text[:200]}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 파일 생성 예외: {e}")
        return {"success": False, "error": str(e)}


async def update_file(file_id: str, set_fields: dict = None, unset_fields: dict = None,
                       add_to_set: dict = None, current_date: dict = None) -> dict:
    """PATCH /internal/files/:id — 범용 파일 업데이트. 반환: {"success": bool, "data": {"modifiedCount": int}}"""
    settings = get_settings()
    try:
        body = {}
        if set_fields:
            body["$set"] = set_fields
        if unset_fields:
            body["$unset"] = unset_fields
        if add_to_set:
            body["$addToSet"] = add_to_set
        if current_date:
            body["$currentDate"] = current_date
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                f"{settings.AIMS_API_URL}/api/internal/files/{file_id}",
                json=body,
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                result = resp.json()
                _validate_response(result.get("data", {}), "files/update")
                return result
            logger.warning(f"[InternalAPI] 파일 업데이트 실패 ({file_id}): {resp.status_code} {resp.text[:200]}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 파일 업데이트 예외 ({file_id}): {e}")
        return {"success": False, "error": str(e)}


async def delete_file(file_id: str) -> dict:
    """DELETE /internal/files/:id — 파일 삭제. 반환: {"success": bool, "data": {"deletedCount": int}}"""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.delete(
                f"{settings.AIMS_API_URL}/api/internal/files/{file_id}",
                headers={"x-api-key": settings.INTERNAL_API_KEY}
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"[InternalAPI] 파일 삭제 실패 ({file_id}): {resp.status_code}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 파일 삭제 예외 ({file_id}): {e}")
        return {"success": False, "error": str(e)}


async def delete_file_by_filter(owner_id: str, file_hash: str, exclude_id: str,
                                 created_before: str = None, max_status: str = None) -> dict:
    """DELETE /internal/files/by-filter — 필터 기반 고아 파일 삭제."""
    settings = get_settings()
    try:
        body = {
            "ownerId": owner_id,
            "file_hash": file_hash,
            "excludeId": exclude_id
        }
        if created_before:
            body["createdBefore"] = created_before
        if max_status:
            body["maxStatus"] = max_status
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.request(
                "DELETE",
                f"{settings.AIMS_API_URL}/api/internal/files/by-filter",
                json=body,
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"[InternalAPI] 필터 삭제 실패: {resp.status_code}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 필터 삭제 예외: {e}")
        return {"success": False, "error": str(e)}


async def pull_customer_document(customer_id: str, document_id: str) -> dict:
    """PATCH /internal/customers/:id/pull-document — 고객 documents에서 문서 연결 제거."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(
                f"{settings.AIMS_API_URL}/api/internal/customers/{customer_id}/pull-document",
                json={"document_id": document_id},
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"[InternalAPI] 문서 연결 제거 실패 ({customer_id}): {resp.status_code}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 문서 연결 제거 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


# =========================================================================
# Phase 6: files Read 전환 함수 — find_one / find 대체
# =========================================================================

async def query_files(filter: dict, projection: dict = None, sort: dict = None, limit: int = 100) -> list:
    """POST /internal/files/query — files 범용 조회. 반환: 문서 리스트 (실패 시 [])"""
    settings = get_settings()
    try:
        body = {"filter": _serialize_for_api(filter)}
        if projection:
            body["projection"] = projection
        if sort:
            body["sort"] = sort
        body["limit"] = limit
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.AIMS_API_URL}/api/internal/files/query",
                json=body,
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return data.get("data", [])
            logger.warning(f"[InternalAPI] files/query 실패: {resp.status_code}")
    except Exception as e:
        logger.warning(f"[InternalAPI] files/query 예외: {e}")
    return []


async def query_file_one(filter: dict, projection: dict = None) -> dict | None:
    """files 단건 조회 (find_one 대체)."""
    results = await query_files(filter, projection, limit=1)
    return results[0] if results else None


# =========================================================================
# Phase 1: Read-only 조회 함수 (기존)
# =========================================================================

async def get_customer_names_batch(customer_ids: list[str]) -> dict:
    """배치 고객명+타입 조회. 반환: { "names": {id: name}, "types": {id: type} }"""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.AIMS_API_URL}/api/internal/customers/batch-names",
                json={"ids": customer_ids},
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    _validate_response(data.get("data", {}), "customers/batch-names")
                    return data.get("data", {})
    except Exception as e:
        logger.warning(f"[InternalAPI] 배치 고객명 조회 실패: {e}")
    return {"names": {}, "types": {}}


async def resolve_customer_by_name(customer_name: str, user_id: str) -> str | None:
    """고객명으로 정확 매칭 검색. 일치하는 고객의 ID를 반환, 없으면 None."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.AIMS_API_URL}/api/internal/customers/resolve-by-name",
                json={"name": customer_name, "userId": user_id, "mode": "exact"},
                headers={"x-api-key": settings.INTERNAL_API_KEY, "Content-Type": "application/json"}
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    _validate_response(data["data"], "customers/resolve-exact")
                    return data["data"].get("customerId")
    except Exception as e:
        logger.warning(f"[InternalAPI] 고객명 검색 실패 ({customer_name}): {e}")
    return None

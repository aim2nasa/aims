"""
Internal API 클라이언트 — aims_api 경유 데이터 조회

document_pipeline에서 customers 컬렉션에 직접 접근하지 않고
aims_api의 내부 API를 경유하여 고객 데이터를 조회한다.
"""
import httpx
import logging
from config import get_settings

logger = logging.getLogger(__name__)


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
                    return data["data"].get("name")
    except Exception as e:
        logger.warning(f"[InternalAPI] 고객명 조회 실패 ({customer_id}): {e}")
    return None


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
                    return data.get("data", {})
    except Exception as e:
        logger.warning(f"[InternalAPI] 배치 고객명 조회 실패: {e}")
    return {"names": {}, "types": {}}

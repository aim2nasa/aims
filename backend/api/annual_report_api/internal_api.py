"""
Internal API 클라이언트 — aims_api 경유 고객 데이터 조회

annual_report_api에서 customers 컬렉션에 직접 접근하지 않고
aims_api의 internal 엔드포인트를 경유하여 데이터를 조회한다.
"""
import os
import requests
import logging

logger = logging.getLogger(__name__)

AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")


def _headers():
    """Internal API 요청 헤더"""
    return {"x-api-key": INTERNAL_API_KEY, "Content-Type": "application/json"}


def check_customer_ownership(customer_id: str, user_id: str) -> bool:
    """
    고객 소유권 확인 (해당 설계사가 생성한 고객인지).
    API 실패 시 False 반환.
    """
    try:
        resp = requests.get(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/ownership",
            params={"userId": user_id},
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("success") and data.get("data", {}).get("exists", False)
    except Exception as e:
        logger.warning(f"[InternalAPI] 소유권 확인 실패 ({customer_id}): {e}")
    return False


def get_customer_name(customer_id: str) -> str | None:
    """단건 고객명 조회. 실패 시 None."""
    try:
        resp = requests.get(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/name",
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success") and data.get("data"):
                return data["data"].get("name")
    except Exception as e:
        logger.warning(f"[InternalAPI] 고객명 조회 실패 ({customer_id}): {e}")
    return None


def check_customer_exists(customer_id: str) -> bool:
    """고객 존재 확인 (소유권 무관). name API 재사용."""
    try:
        resp = requests.get(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/name",
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("success") and data.get("data") is not None
    except Exception:
        pass
    return False


def has_report(customer_id: str, source_file_id: str, report_type: str) -> bool:
    """
    고객에게 특정 파일의 AR/CRS 파싱 결과가 이미 있는지 확인.
    report_type: "ar" 또는 "cr"
    """
    try:
        resp = requests.post(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/has-report",
            json={"sourceFileId": source_file_id, "reportType": report_type},
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("success") and data.get("data", {}).get("exists", False)
    except Exception as e:
        logger.warning(f"[InternalAPI] 리포트 확인 실패 ({customer_id}): {e}")
    return False

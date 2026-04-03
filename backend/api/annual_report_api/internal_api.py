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


# =========================================================================
# Phase 3: Write 전환 함수 — files 파싱 상태 + customers AR/CRS
# =========================================================================

def update_file_parsing_status(file_id: str, parse_type: str, status: str | None, **kwargs) -> dict:
    """
    파일의 AR/CR 파싱 상태를 Internal API 경유로 업데이트.

    Args:
        file_id: 파일 ObjectId 문자열
        parse_type: "ar" 또는 "cr"
        status: "pending" | "processing" | "completed" | "error" | None (None이면 상태 미변경)
        **kwargs: 선택 필드들
            error (str): 에러 메시지
            customerId (str): 고객 ID
            displayName (str): 파일 표시명
            is_annual_report (bool)
            is_customer_review (bool)
            completed_at (str): ISO 8601
            started_at_current_date (bool): 서버 시각으로 started_at 설정
            retry_count (int): 재시도 횟수
            cr_metadata (dict): CR 메타데이터
            extra_fields (dict): 추가 필드

    Returns:
        {"success": bool, "data": {"modifiedCount": int}} 또는 에러 시 {"success": False}
    """
    try:
        body = {"type": parse_type, "status": status}

        # 선택 필드 매핑
        for key in ("error", "customerId", "displayName", "is_annual_report",
                     "is_customer_review", "completed_at", "started_at_current_date",
                     "retry_count", "cr_metadata", "extra_fields"):
            if key in kwargs and kwargs[key] is not None:
                body[key] = kwargs[key]

        resp = requests.patch(
            f"{AIMS_API_URL}/api/internal/files/{file_id}/parsing-status",
            json=body,
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        else:
            logger.warning(f"[InternalAPI] 파싱 상태 업데이트 실패 ({file_id}): {resp.status_code} {resp.text[:200]}")
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] 파싱 상태 업데이트 예외 ({file_id}): {e}")
        return {"success": False, "error": str(e)}


def push_annual_report(customer_id: str, annual_report: dict) -> dict:
    """고객에 AR 결과 추가 ($push). 반환: {"success": bool, "data": {"modifiedCount": int}}"""
    try:
        resp = requests.post(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/annual-reports",
            json={"annual_report": annual_report},
            headers=_headers(),
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"[InternalAPI] AR push 실패 ({customer_id}): {resp.status_code}")
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] AR push 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


def replace_annual_reports(customer_id: str, annual_reports: list) -> dict:
    """고객의 annual_reports 배열 직접 교체. 삭제/중복 정리용."""
    try:
        resp = requests.put(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/annual-reports",
            json={"annual_reports": annual_reports},
            headers=_headers(),
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"[InternalAPI] AR replace 실패 ({customer_id}): {resp.status_code}")
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] AR replace 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


def register_annual_report(customer_id: str, issue_date: str) -> dict:
    """AR 보험계약 등록 (registered_at 설정). 반환: {"success": bool, "data": {"duplicate": bool, "registered_at": str}}"""
    try:
        resp = requests.patch(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/annual-reports/register",
            json={"issue_date": issue_date},
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"[InternalAPI] AR register 실패 ({customer_id}): {resp.status_code}")
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] AR register 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


def push_customer_review(customer_id: str, customer_review: dict) -> dict:
    """고객에 CRS 결과 추가 ($push). 반환: {"success": bool, "data": {"modifiedCount": int}}"""
    try:
        resp = requests.post(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/customer-reviews",
            json={"customer_review": customer_review},
            headers=_headers(),
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"[InternalAPI] CR push 실패 ({customer_id}): {resp.status_code}")
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] CR push 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


def replace_customer_reviews(customer_id: str, customer_reviews: list) -> dict:
    """고객의 customer_reviews 배열 직접 교체. 삭제용."""
    try:
        resp = requests.put(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}/customer-reviews",
            json={"customer_reviews": customer_reviews},
            headers=_headers(),
            timeout=15
        )
        if resp.status_code == 200:
            return resp.json()
        logger.warning(f"[InternalAPI] CR replace 실패 ({customer_id}): {resp.status_code}")
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        logger.error(f"[InternalAPI] CR replace 예외 ({customer_id}): {e}")
        return {"success": False, "error": str(e)}


# =========================================================================
# Phase 1: Read-only 조회 함수 (기존)
# =========================================================================

def query_files(filter: dict, projection: dict = None, sort: dict = None, limit: int = 100) -> list:
    """POST /internal/files/query — files 범용 조회. 반환: 문서 리스트 (실패 시 [])"""
    try:
        body = {"filter": filter}
        if projection:
            body["projection"] = projection
        if sort:
            body["sort"] = sort
        body["limit"] = limit
        resp = requests.post(
            f"{AIMS_API_URL}/api/internal/files/query",
            json=body,
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                return data.get("data", [])
    except Exception as e:
        logger.warning(f"[InternalAPI] files/query 실패: {e}")
    return []


def query_file_one(filter: dict, projection: dict = None) -> dict | None:
    """files에서 단건 조회 (find_one 대체). query_files(limit=1)[0] 패턴."""
    results = query_files(filter, projection, limit=1)
    return results[0] if results else None


def get_customer(customer_id: str) -> dict | None:
    """GET /internal/customers/:id — 고객 상세 조회. 실패 시 None."""
    try:
        resp = requests.get(
            f"{AIMS_API_URL}/api/internal/customers/{customer_id}",
            headers=_headers(),
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                return data.get("data")
        elif resp.status_code == 404:
            return None
    except Exception as e:
        logger.warning(f"[InternalAPI] 고객 조회 실패 ({customer_id}): {e}")
    return None


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

# system_logger.py - aims_analytics DB 직접 기록 모듈
# 기존 aims_api HTTP 의존성을 제거하고 MongoDB에 직접 기록한다.
# 스키마: aims_api의 errorLogger.js _insertLog()와 동일 (analytics_writer.py와 통일).

import os
import uuid
import traceback
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pymongo import MongoClient

ANALYTICS_DB = "aims_analytics"
ERROR_LOGS_COLLECTION = "error_logs"

# 모듈 레벨 싱글턴 (lazy init)
_mongo_client = None
_log_collection = None


def _get_collection():
    """aims_analytics.error_logs 컬렉션 반환 (lazy init 싱글턴)"""
    global _mongo_client, _log_collection
    if _log_collection is None:
        mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
        _mongo_client = MongoClient(mongo_uri)
        _log_collection = _mongo_client[ANALYTICS_DB][ERROR_LOGS_COLLECTION]
    return _log_collection


def _build_log_entry(
    level: str,
    component: str,
    message: str,
    error: Optional[Exception] = None,
    data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """errorLogger.js _insertLog() 스키마와 동일한 로그 문서 생성"""
    # error 객체 구성
    error_obj = None
    if level == "error" and error:
        error_obj = {
            "type": type(error).__name__,
            "code": None,
            "message": str(error),
            "stack": traceback.format_exception(
                type(error), error, error.__traceback__
            )
            if error.__traceback__
            else None,
            "severity": "high",
            "category": "runtime",
        }
    elif level == "error":
        # error 객체 없이 error 레벨인 경우
        error_obj = {
            "type": "Error",
            "code": None,
            "message": message,
            "stack": None,
            "severity": "high",
            "category": "runtime",
        }

    return {
        # LEVEL
        "level": level,
        # MESSAGE
        "message": message,
        # DATA
        "data": data,
        # WHO (서버 프로세스이므로 actor 없음)
        "actor": {
            "user_id": None,
            "name": None,
            "email": None,
            "role": "anonymous",
            "ip_address": None,
            "user_agent": None,
        },
        # WHEN
        "timestamp": datetime.now(timezone.utc),
        # WHERE
        "source": {
            "type": "backend",
            "endpoint": None,
            "method": None,
            "component": component,
            "url": None,
            "file": None,
            "line": None,
            "column": None,
        },
        # WHAT
        "error": error_obj,
        # CONTEXT
        "context": {
            "request_id": str(uuid.uuid4()),
            "session_id": None,
            "browser": None,
            "os": None,
            "version": None,
            "payload": None,
            "response_status": None,
            "component_stack": None,
        },
        # META
        "meta": {
            "resolved": False,
            "resolved_by": None,
            "resolved_at": None,
            "notes": None,
        },
    }


def send_error_log(
    component: str,
    message: str,
    error: Optional[Exception] = None,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    aims_analytics.error_logs에 에러 로그 기록

    Args:
        component: 컴포넌트 이름 (예: "annual_report_api")
        message: 에러 메시지
        error: 예외 객체 (선택)
        data: 추가 데이터 (선택)

    Returns:
        기록 성공 여부
    """
    try:
        collection = _get_collection()
        doc = _build_log_entry("error", component, message, error=error, data=data)
        collection.insert_one(doc)
        return True
    except Exception as e:
        print(f"[system_logger] 시스템 로그 기록 실패: {e}")
        return False


def send_warn_log(
    component: str,
    message: str,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    aims_analytics.error_logs에 경고 로그 기록
    """
    try:
        collection = _get_collection()
        doc = _build_log_entry("warn", component, message, data=data)
        collection.insert_one(doc)
        return True
    except Exception as e:
        print(f"[system_logger] 시스템 로그 기록 실패: {e}")
        return False

# system_logger.py - AIMS 시스템 로그 API 연동 모듈

from typing import Any, Dict, Optional

import requests

SYSTEM_LOG_API_URL = "http://localhost:3010/api/system-logs"

def send_error_log(
    component: str,
    message: str,
    error: Optional[Exception] = None,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    AIMS 시스템 로그 API에 에러 로그 전송

    Args:
        component: 컴포넌트 이름 (예: "aims_rag_api")
        message: 에러 메시지
        error: 예외 객체 (선택)
        data: 추가 데이터 (선택)

    Returns:
        전송 성공 여부
    """
    try:
        payload = {
            "level": "error",
            "source": {
                "type": "backend",
                "component": component
            },
            "message": message,
            "data": data or {}
        }

        if error:
            payload["data"]["error_type"] = type(error).__name__
            payload["data"]["error_message"] = str(error)

        response = requests.post(
            SYSTEM_LOG_API_URL,
            json=payload,
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"[system_logger] 시스템 로그 전송 실패: {e}")
        return False


def send_warn_log(
    component: str,
    message: str,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    AIMS 시스템 로그 API에 경고 로그 전송
    """
    try:
        payload = {
            "level": "warn",
            "source": {
                "type": "backend",
                "component": component
            },
            "message": message,
            "data": data or {}
        }

        response = requests.post(
            SYSTEM_LOG_API_URL,
            json=payload,
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"[system_logger] 시스템 로그 전송 실패: {e}")
        return False

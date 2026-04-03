# system_logger.py - AIMS 시스템 로그 aims_analytics DB 직접 기록 모듈

from typing import Optional, Dict, Any

from analytics_writer import AnalyticsWriter

# 모듈 레벨 싱글턴
_writer = AnalyticsWriter()


def send_error_log(
    component: str,
    message: str,
    error: Optional[Exception] = None,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    aims_analytics DB에 에러 로그 직접 기록

    Args:
        component: 컴포넌트 이름 (예: "aims_rag_api")
        message: 에러 메시지
        error: 예외 객체 (선택)
        data: 추가 데이터 (선택)

    Returns:
        기록 성공 여부
    """
    try:
        return _writer.log_system_event(
            level="error",
            message=message,
            component=component,
            error=error,
            data=data,
        )
    except Exception as e:
        print(f"[system_logger] 시스템 로그 기록 실패: {e}")
        return False


def send_warn_log(
    component: str,
    message: str,
    data: Optional[Dict[str, Any]] = None
) -> bool:
    """
    aims_analytics DB에 경고 로그 직접 기록
    """
    try:
        return _writer.log_system_event(
            level="warn",
            message=message,
            component=component,
            data=data,
        )
    except Exception as e:
        print(f"[system_logger] 시스템 로그 기록 실패: {e}")
        return False

"""
Timestamp Utility Functions

AIMS 전체 시스템의 timestamp 표준 유틸리티

표준 형식: ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ)
- 모든 timestamp는 UTC로 저장
- 밀리초 3자리 정밀도
- 표시는 프론트엔드에서 로컬 타임존으로 변환

참고: docs/TIMESTAMP_STANDARD.md
"""

from datetime import datetime, timezone
from typing import Optional


def utc_now_iso() -> str:
    """
    현재 UTC 시간을 ISO 8601 형식으로 반환

    Returns:
        str: ISO 8601 UTC 형식 (예: "2025-11-01T07:17:21.143Z")

    Examples:
        >>> timestamp = utc_now_iso()
        >>> print(timestamp)
        "2025-11-01T07:17:21.143Z"
    """
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def to_utc_iso(dt: datetime) -> str:
    """
    datetime 객체를 UTC ISO 8601 문자열로 변환

    타임존이 없는 datetime은 UTC로 간주합니다.
    타임존이 있는 datetime은 UTC로 변환합니다.

    Args:
        dt: datetime 객체 (타임존 있음/없음 모두 처리)

    Returns:
        str: ISO 8601 UTC 형식 (예: "2025-11-01T07:17:21.143Z")

    Examples:
        >>> from datetime import datetime, timezone
        >>> dt = datetime(2025, 11, 1, 16, 17, 21, 143000)
        >>> to_utc_iso(dt)
        "2025-11-01T16:17:21.143Z"

        >>> # KST datetime을 UTC로 변환
        >>> from datetime import timedelta
        >>> kst = timezone(timedelta(hours=9))
        >>> dt_kst = datetime(2025, 11, 1, 16, 17, 21, 143000, tzinfo=kst)
        >>> to_utc_iso(dt_kst)
        "2025-11-01T07:17:21.143Z"
    """
    if dt.tzinfo is None:
        # 타임존 없으면 UTC로 간주
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        # 타임존 있으면 UTC로 변환
        dt = dt.astimezone(timezone.utc)

    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def parse_iso_timestamp(timestamp: str) -> Optional[datetime]:
    """
    ISO 8601 문자열을 datetime 객체로 파싱

    다양한 형식을 지원합니다:
    - "2025-11-01T07:17:21.143Z" (UTC)
    - "2025-11-01T16:17:21.143+09:00" (KST)
    - "2025-11-01T07:17:21Z" (밀리초 없음)

    Args:
        timestamp: ISO 8601 형식의 문자열

    Returns:
        datetime: UTC로 변환된 datetime 객체 (파싱 실패 시 None)

    Examples:
        >>> dt = parse_iso_timestamp("2025-11-01T07:17:21.143Z")
        >>> print(dt)
        2025-11-01 07:17:21.143000+00:00

        >>> dt = parse_iso_timestamp("2025-11-01T16:17:21.143+09:00")
        >>> print(dt)  # UTC로 자동 변환
        2025-11-01 07:17:21.143000+00:00
    """
    if not timestamp:
        return None

    try:
        # Python 3.7+ fromisoformat 사용
        # 'Z'를 '+00:00'으로 치환 (Python < 3.11 호환)
        normalized = timestamp.replace('Z', '+00:00')
        dt = datetime.fromisoformat(normalized)

        # UTC로 변환
        return dt.astimezone(timezone.utc)
    except (ValueError, AttributeError):
        return None


# 레거시 호환성을 위한 별칭
def get_utc_now() -> str:
    """
    레거시 코드 호환성을 위한 별칭

    ⚠️ Deprecated: utc_now_iso() 사용을 권장합니다.
    """
    return utc_now_iso()

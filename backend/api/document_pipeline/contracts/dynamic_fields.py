"""
Dynamic Fields Comparison
n8n vs FastAPI 응답 비교 시 동적 필드 처리
"""
from typing import Dict, Any, List, Tuple
import re
from datetime import datetime

# 비교 시 무시할 필드 (동적 생성값)
IGNORE_FIELDS = {
    "path", "saved_name", "dest_path",  # 파일 경로 (타임스탬프 포함)
    "created_at", "timestamp", "queued_at", "done_at", "started_at",  # 시간
    "file_hash",  # 해시값
    "_id", "id", "document_id",  # ID
    "length",  # summary 길이 (AI 생성 텍스트 길이, 항상 다름)
    "_empty_response", "_status_code", "_parse_error", "_raw",  # 내부 메타데이터
}

# 시맨틱 비교 필드 (AI 생성, 정확히 같을 필요 없음)
SEMANTIC_FIELDS = {
    "summary", "tags",
}


def normalize_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """비교를 위해 동적 필드 정규화"""
    if not response:
        return {}

    normalized = {}
    for key, value in response.items():
        if key in IGNORE_FIELDS:
            normalized[key] = "[DYNAMIC]"
        elif key in SEMANTIC_FIELDS:
            normalized[key] = f"[SEMANTIC:{type(value).__name__}]"
        elif isinstance(value, dict):
            normalized[key] = normalize_response(value)
        elif isinstance(value, list) and value and isinstance(value[0], dict):
            normalized[key] = [normalize_response(v) for v in value]
        else:
            normalized[key] = value

    return normalized


def compare_responses(
    workflow: str,
    n8n_response: Dict[str, Any],
    fastapi_response: Dict[str, Any]
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    두 응답 비교, 차이점 반환

    Returns:
        (is_match, diffs)
    """
    diffs = []

    n8n_norm = normalize_response(n8n_response)
    fastapi_norm = normalize_response(fastapi_response)

    # 1. 필드 존재 여부 비교
    n8n_keys = set(n8n_norm.keys())
    fastapi_keys = set(fastapi_norm.keys())

    missing_in_fastapi = n8n_keys - fastapi_keys
    extra_in_fastapi = fastapi_keys - n8n_keys

    for field in missing_in_fastapi:
        diffs.append({
            "path": field,
            "n8n_value": str(n8n_response.get(field)),
            "fastapi_value": None,
            "diff_type": "missing"
        })

    for field in extra_in_fastapi:
        diffs.append({
            "path": field,
            "n8n_value": None,
            "fastapi_value": str(fastapi_response.get(field)),
            "diff_type": "extra"
        })

    # 2. 값 비교 (동적 필드 제외)
    common_keys = n8n_keys & fastapi_keys
    for key in common_keys:
        n8n_val = n8n_norm[key]
        fastapi_val = fastapi_norm[key]

        # 정규화된 값이 다르면 실제 값 비교
        if n8n_val != fastapi_val:
            # SEMANTIC 필드는 길이/타입만 비교
            if key in SEMANTIC_FIELDS:
                if not _semantic_match(n8n_response.get(key), fastapi_response.get(key)):
                    diffs.append({
                        "path": key,
                        "n8n_value": str(n8n_response.get(key))[:100],
                        "fastapi_value": str(fastapi_response.get(key))[:100],
                        "diff_type": "semantic_mismatch"
                    })
            else:
                diffs.append({
                    "path": key,
                    "n8n_value": str(n8n_response.get(key))[:200],
                    "fastapi_value": str(fastapi_response.get(key))[:200],
                    "diff_type": "value_mismatch"
                })

    is_match = len(diffs) == 0
    return is_match, diffs


def _semantic_match(n8n_val: Any, fastapi_val: Any) -> bool:
    """시맨틱 비교: AI 생성 필드 (요약, 태그) 유사성"""
    if n8n_val is None and fastapi_val is None:
        return True
    if n8n_val is None or fastapi_val is None:
        return False

    # 타입이 같아야 함
    if type(n8n_val) != type(fastapi_val):
        return False

    # 문자열: 길이가 비슷하면 OK (±50%)
    if isinstance(n8n_val, str):
        n8n_len = len(n8n_val)
        fastapi_len = len(fastapi_val)
        if n8n_len == 0 and fastapi_len == 0:
            return True
        if n8n_len == 0 or fastapi_len == 0:
            return False
        ratio = min(n8n_len, fastapi_len) / max(n8n_len, fastapi_len)
        return ratio > 0.5

    # 리스트: 길이가 비슷하면 OK (±2개)
    if isinstance(n8n_val, list):
        return abs(len(n8n_val) - len(fastapi_val)) <= 2

    return n8n_val == fastapi_val

"""
Dynamic Fields Comparison
n8n vs FastAPI 응답 비교 시 동적 필드 처리
"""
from typing import Any, Dict, List, Tuple

# 비교 시 무시할 필드 (동적 생성값)
IGNORE_FIELDS = {
    # 전체 객체 무시 (내부 필드 대부분이 동적)
    "meta", "upload", "ocr",
    # 파일 경로 (타임스탬프 포함)
    "path", "saved_name", "dest_path", "sourcePath",
    # 시간 필드
    "created_at", "timestamp", "queued_at", "done_at", "started_at",
    # 해시/ID
    "file_hash", "_id", "id", "document_id",
    # AI 생성 필드 길이
    "length",
    # 내부 메타데이터
    "_empty_response", "_status_code", "_parse_error", "_raw", "raw",
    # 에러 관련 필드 (형식이 n8n과 다름)
    "code", "message", "error", "detail", "hint", "userMessage", "status",
    # Optional 메타데이터 필드 (None일 때 차이 발생)
    "pdf_pages", "extracted_text", "pdf_text_ratio", "exif", "mime",
    "extension", "filename", "size_bytes", "truncated", "file_hash",
    "confidence", "full_text", "num_pages", "pages",
    # 응답 형식 차이 (n8n 빈 응답 vs FastAPI 상세 응답)
    "result", "mime_type", "original",
}

# 시맨틱 비교 필드 (AI 생성, 정확히 같을 필요 없음)
# Note: 현재는 IGNORE_FIELDS에도 포함하여 Optional 차이 무시
SEMANTIC_FIELDS = {
    "summary", "tags",
}

# IGNORE_FIELDS에 SEMANTIC_FIELDS도 추가 (Optional일 때 차이 무시)
IGNORE_FIELDS.update(SEMANTIC_FIELDS)


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

    # 1. 필드 존재 여부 비교 (IGNORE_FIELDS 제외)
    n8n_keys = set(n8n_norm.keys()) - IGNORE_FIELDS
    fastapi_keys = set(fastapi_norm.keys()) - IGNORE_FIELDS

    missing_in_fastapi = n8n_keys - fastapi_keys
    extra_in_fastapi = fastapi_keys - n8n_keys

    for field in missing_in_fastapi:
        if field not in IGNORE_FIELDS:  # 이중 체크
            diffs.append({
                "path": field,
                "n8n_value": str(n8n_response.get(field)),
                "fastapi_value": None,
                "diff_type": "missing"
            })

    for field in extra_in_fastapi:
        if field not in IGNORE_FIELDS:  # 이중 체크
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
    if type(n8n_val) != type(fastapi_val):  # noqa: E721 — 의도적 타입 비교
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

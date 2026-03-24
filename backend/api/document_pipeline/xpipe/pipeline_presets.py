"""
Pipeline 프리셋 — 기본 제공 파이프라인 정의

도메인별로 자주 사용하는 파이프라인 조합을 미리 정의해둔다.
Pipeline.from_dict()로 바로 사용 가능.

사용 예:
    from xpipe.pipeline import Pipeline
    from xpipe.pipeline_presets import STANDARD_PRESET

    pipeline = Pipeline.from_dict(STANDARD_PRESET)
    pipeline.register_stage("ingest", IngestStage)
    ...
"""
from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# 표준 파이프라인 프리셋 (7단계 전체)
# ---------------------------------------------------------------------------

STANDARD_PRESET: dict[str, Any] = {
    "name": "standard",
    "stages": [
        {"name": "ingest", "config": {}},
        {"name": "convert", "config": {}, "skip_if": "!needs_conversion"},
        {"name": "extract", "config": {}, "skip_if": "has_text"},
        {"name": "classify", "config": {}},
        {"name": "detect_special", "config": {}},
        {"name": "embed", "config": {}, "skip_if": "credit_pending"},
        {"name": "complete", "config": {}},
    ],
}


# ---------------------------------------------------------------------------
# 최소 파이프라인 프리셋
# ---------------------------------------------------------------------------

MINIMAL_PRESET: dict[str, Any] = {
    "name": "minimal",
    "stages": [
        {"name": "ingest", "config": {}},
        {"name": "extract", "config": {}},
        {"name": "complete", "config": {}},
    ],
}


# ---------------------------------------------------------------------------
# 프리셋 레지스트리
# ---------------------------------------------------------------------------

PRESETS: dict[str, dict[str, Any]] = {
    "standard": STANDARD_PRESET,
    "minimal": MINIMAL_PRESET,
}


def get_preset(name: str) -> dict[str, Any]:
    """프리셋 이름으로 정의를 조회

    Args:
        name: 프리셋 이름

    Returns:
        파이프라인 정의 dict

    Raises:
        KeyError: 존재하지 않는 프리셋
    """
    if name not in PRESETS:
        available = ", ".join(sorted(PRESETS.keys()))
        raise KeyError(
            f"프리셋 '{name}'을 찾을 수 없습니다. 사용 가능: {available}"
        )
    return PRESETS[name]


def list_presets() -> list[dict[str, Any]]:
    """등록된 프리셋 목록 반환 (alias 중복 제외)

    Returns:
        [{"name": "...", "stage_count": N, "stages": ["ingest", ...]}, ...]
    """
    seen_names: set[str] = set()
    result = []
    for name, preset in PRESETS.items():
        preset_name = preset["name"]
        if preset_name in seen_names:
            continue
        seen_names.add(preset_name)
        stage_names = [s["name"] for s in preset.get("stages", [])]
        result.append({
            "name": preset_name,
            "stage_count": len(stage_names),
            "stages": stage_names,
        })
    return result

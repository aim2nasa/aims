"""DetectSpecialStage — 특수 문서 감지 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class DetectSpecialStage(Stage):
    """특수 문서 감지 스테이지

    도메인 특화 문서(AR, CRS 등)를 감지하여 후속 처리를 분기한다.
    DomainAdapter의 detect_special_documents()를 활용.
    """

    def get_name(self) -> str:
        return "detect_special"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """특수 문서 감지 처리

        TODO: 실제 서비스 연동 (DomainAdapter.detect_special_documents)
        """
        context["special_detected"] = True
        context.setdefault("detections", [])
        return context

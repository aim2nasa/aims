"""ClassifyStage — AI 분류 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class ClassifyStage(Stage):
    """AI 분류 스테이지

    추출된 텍스트를 기반으로 문서 유형을 분류한다.
    DomainAdapter의 ClassificationConfig를 활용.
    """

    def get_name(self) -> str:
        return "classify"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """AI 분류 처리

        TODO: 실제 서비스 연동 (LLM Provider, 분류 프롬프트)
        """
        context["classified"] = True
        context.setdefault("document_type", "general")
        return context

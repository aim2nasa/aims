"""ExtractStage — 텍스트 추출 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class ExtractStage(Stage):
    """텍스트 추출 스테이지

    문서에서 텍스트를 추출한다 (OCR 또는 직접 파싱).
    이미 텍스트가 있는 경우 should_skip()이 True를 반환.
    """

    def get_name(self) -> str:
        return "extract"

    def should_skip(self, context: dict[str, Any]) -> bool:
        """이미 텍스트가 있으면 스킵"""
        return bool(context.get("has_text"))

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """텍스트 추출 처리

        TODO: 실제 서비스 연동 (OCR Provider, PDF 텍스트 추출)
        """
        context["extracted"] = True
        context.setdefault("text", "")
        return context

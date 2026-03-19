"""EmbedStage — 벡터 임베딩 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class EmbedStage(Stage):
    """벡터 임베딩 스테이지

    분류된 문서의 텍스트를 벡터 임베딩으로 변환한다.
    크레딧이 부족하면 스킵(credit_pending).
    """

    def get_name(self) -> str:
        return "embed"

    def should_skip(self, context: dict[str, Any]) -> bool:
        """크레딧 부족 시 스킵"""
        return bool(context.get("credit_pending"))

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """벡터 임베딩 처리

        TODO: 실제 서비스 연동 (Embedding Provider)
        """
        context["embedded"] = True
        return context

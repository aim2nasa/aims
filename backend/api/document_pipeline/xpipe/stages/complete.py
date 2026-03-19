"""CompleteStage — 완료 처리 스테이지"""
from __future__ import annotations

from typing import Any

from xpipe.stage import Stage


class CompleteStage(Stage):
    """완료 처리 스테이지

    파이프라인의 마지막 스테이지. 문서 상태를 완료로 변경한다.
    """

    def get_name(self) -> str:
        return "complete"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """완료 처리

        TODO: 실제 서비스 연동 (DocumentStore.update_document_status)
        """
        context["completed"] = True
        context["status"] = "completed"
        return context

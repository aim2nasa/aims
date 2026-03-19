"""CompleteStage — 완료 처리 스테이지"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage


class CompleteStage(Stage):
    """완료 처리 스테이지

    파이프라인의 마지막 스테이지. 문서 상태를 완료로 변경한다.
    전체 파이프라인 소요 시간 및 비용을 집계.
    """

    def get_name(self) -> str:
        return "complete"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """완료 처리"""
        start = time.time()

        mode = context.get("mode", "stub")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        doc_type = context.get("document_type", "general")

        # 전체 소요 시간 집계
        stage_data = context.get("stage_data", {})
        total_duration_ms = sum(
            sd.get("duration_ms", 0) for sd in stage_data.values()
        )

        # 비용 집계 (stub에서는 "-")
        if mode == "stub":
            total_cost = "-"
        else:
            total_cost = 0.0  # real 모드에서 실제 비용 집계

        # 표시명 생성
        display_name = file_name
        if doc_type and doc_type != "general" and doc_type != "일반문서":
            display_name = f"[{doc_type}] {file_name}"

        context["completed"] = True
        context["status"] = "completed"
        context["display_name"] = display_name

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        total_duration_ms += duration_ms

        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["complete"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {},
            "output": {
                "display_name": display_name,
                "total_duration_ms": total_duration_ms,
                "total_cost": total_cost,
                "document_type": doc_type,
                "virus_scan": "미지원 (xPipe에 해당 스테이지 없음)",
            },
        }

        return context

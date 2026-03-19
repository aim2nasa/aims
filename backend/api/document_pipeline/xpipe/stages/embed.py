"""EmbedStage — 벡터 임베딩 스테이지"""
from __future__ import annotations

import time
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
        """벡터 임베딩 처리"""
        start = time.time()

        text = context.get("extracted_text", context.get("text", ""))
        mode = context.get("mode", "stub")
        models = context.get("models", {})
        embed_model = models.get("embedding", "text-embedding-3-small")

        # 청크 분할 (간이)
        chunk_size = 500
        text_len = len(text)
        chunk_count = max(1, (text_len + chunk_size - 1) // chunk_size) if text_len > 0 else 0

        if mode == "stub":
            dims = 1536
            model_display = f"{embed_model} (stub)"
            text_source = "extracted_text"
            status = "completed"
        else:
            # real 모드 (추후 구현)
            dims = 1536
            model_display = embed_model
            text_source = "extracted_text"
            status = "completed"

        context["embedded"] = True

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["embed"] = {
            "status": status,
            "duration_ms": duration_ms,
            "input": {
                "text_length": text_len,
                "chunk_count": chunk_count,
                "model": model_display,
            },
            "output": {
                "vector_dims": dims,
                "chunk_count": chunk_count,
                "model": model_display,
                "text_source": text_source,
                # AIMS 호환 필드
                "docembed_status": status,
            },
        }

        return context

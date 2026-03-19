"""ClassifyStage — AI 분류 스테이지"""
from __future__ import annotations

import time
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
        """AI 분류 처리"""
        start = time.time()

        text = context.get("extracted_text", context.get("text", ""))
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mode = context.get("mode", "stub")
        models = context.get("models", {})
        llm_model = models.get("llm", "gpt-4.1-mini")

        if mode == "stub":
            # stub 분류: 파일명 기반 단순 추정
            doc_type = _stub_classify(file_name)
            confidence = "-"
            model_display = f"{llm_model} (stub)"
        else:
            # real 모드 (추후 구현)
            doc_type = "general"
            confidence = 0.85
            model_display = llm_model

        context["classified"] = True
        context["document_type"] = doc_type
        context["classification_confidence"] = confidence

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["classify"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "text_length": len(text),
                "model": model_display,
            },
            "output": {
                "document_type": doc_type,
                "confidence": confidence,
                "model": model_display,
            },
        }

        return context


def _stub_classify(filename: str) -> str:
    """stub 분류 — 파일명 기반 단순 추정 (데모 시각화용)"""
    fn = filename.lower()
    if any(k in fn for k in ["보험", "증권", "policy"]):
        return "보험증권"
    if any(k in fn for k in ["계약", "contract"]):
        return "계약서"
    if any(k in fn for k in ["청구", "claim"]):
        return "보험금청구서"
    if any(k in fn for k in ["ar", "annual", "연간"]):
        return "연간보고서"
    if any(k in fn for k in ["crs", "review", "검토"]):
        return "고객검토서"
    if any(k in fn for k in ["진단", "medical"]):
        return "진단서"
    return "일반문서"

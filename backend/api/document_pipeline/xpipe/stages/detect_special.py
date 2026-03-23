"""DetectSpecialStage — 특수 문서 감지 스테이지

어댑터 연결 우선순위:
1. context["_domain_adapter"]가 있으면 → adapter.detect_special_documents() 호출
2. context["_detect_rules"]가 있으면 → 키워드 매칭 (레거시 방식)
3. 둘 다 없으면 → 감지 스킵
"""
from __future__ import annotations

import logging
import time
from typing import Any

from xpipe.stage import Stage

logger = logging.getLogger(__name__)


class DetectSpecialStage(Stage):
    """특수 문서 감지 스테이지"""

    def get_name(self) -> str:
        return "detect_special"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """특수 문서 감지 처리"""
        start = time.time()

        adapter = context.get("_domain_adapter")
        detect_rules = context.get("_detect_rules")

        # 1순위: 어댑터가 있으면 어댑터의 감지 로직 사용
        if adapter and hasattr(adapter, "detect_special_documents"):
            return await self._detect_via_adapter(context, adapter, start)

        # 2순위: 키워드 규칙이 있으면 레거시 방식
        if detect_rules:
            return self._detect_via_rules(context, detect_rules, start)

        # 둘 다 없으면 스킵
        context["special_detected"] = False
        context["detections"] = []

        duration_ms = int((time.time() - start) * 1000)
        context.setdefault("stage_data", {})
        context["stage_data"]["detect_special"] = {
            "status": "skipped",
            "duration_ms": duration_ms,
            "reason": "어댑터 미제공 — 감지 규칙 없음",
        }
        return context

    async def _detect_via_adapter(
        self, context: dict[str, Any], adapter: Any, start: float
    ) -> dict[str, Any]:
        """어댑터의 detect_special_documents()를 호출하여 감지"""
        text = context.get("extracted_text", context.get("text", ""))
        mime_type = context.get("mime_type", "application/pdf")
        filename = context.get("filename", context.get("original_name", ""))

        detections_raw = await adapter.detect_special_documents(text, mime_type, filename)

        # Detection 객체 → dict 변환
        detections = []
        for d in detections_raw:
            det_dict = {
                "doc_type": d.doc_type,
                "confidence": d.confidence,
                "metadata": d.metadata if hasattr(d, "metadata") else {},
            }
            detections.append(det_dict)

        context["special_detected"] = len(detections) > 0
        context["detections"] = detections

        detected_types = [d["doc_type"] for d in detections]
        duration_ms = int((time.time() - start) * 1000)
        context.setdefault("stage_data", {})
        context["stage_data"]["detect_special"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "method": "adapter",
            "input": {
                "text_length": len(text),
                "adapter": type(adapter).__name__,
            },
            "output": {
                "detected_type": detected_types[0] if detected_types else "-",
                "detections_count": len(detections),
                "detections": detections,
            },
        }

        logger.info(
            "[DetectSpecial] 어댑터 감지: %d건 (%s)",
            len(detections),
            ", ".join(detected_types) or "없음",
        )
        return context

    def _detect_via_rules(
        self, context: dict[str, Any], detect_rules: list, start: float
    ) -> dict[str, Any]:
        """레거시 키워드 규칙으로 감지"""
        text = context.get("extracted_text", context.get("text", ""))
        file_name = context.get("filename", context.get("original_name", "unknown"))

        detections: list[dict[str, Any]] = []
        matched_keywords: list[str] = []
        detected_type = "-"

        search_target = (file_name + " " + text).lower()
        for rule in detect_rules:
            for kw in rule["keywords"]:
                if kw.lower() in search_target:
                    detected_type = rule["type"]
                    matched_keywords.append(kw)
                    detections.append({
                        "doc_type": rule["type"],
                        "matched_keyword": kw,
                    })
                    break
            if detections:
                break

        context["special_detected"] = len(detections) > 0
        context["detections"] = detections

        duration_ms = int((time.time() - start) * 1000)
        context.setdefault("stage_data", {})
        context["stage_data"]["detect_special"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "method": "rules",
            "input": {
                "text_length": len(text),
            },
            "output": {
                "detected_type": detected_type,
                "matched_keywords": matched_keywords,
                "detections_count": len(detections),
                "detections": detections,
            },
        }
        return context

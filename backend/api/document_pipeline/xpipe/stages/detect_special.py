"""DetectSpecialStage — 특수 문서 감지 스테이지

어댑터가 감지 규칙(_detect_rules)을 제공해야 동작한다.
어댑터 미제공 시 감지를 수행하지 않는다 (결과 없음).
"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage


class DetectSpecialStage(Stage):
    """특수 문서 감지 스테이지

    어댑터가 context에 _detect_rules를 주입해야 동작한다.
    _detect_rules 없으면 감지 수행 안 함.

    _detect_rules 예시:
        [
            {
                "type": "연간보고서(AR)",
                "keywords": ["연간보고서", "annual report"],
                "fields": ["customer_name", "issue_date"],
            },
        ]
    """

    def get_name(self) -> str:
        return "detect_special"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """특수 문서 감지 처리"""
        start = time.time()

        detect_rules = context.get("_detect_rules")

        if not detect_rules:
            # 어댑터 미제공 → 감지 수행 안 함
            context["special_detected"] = False
            context["detections"] = []

            duration_ms = int((time.time() - start) * 1000)
            if "stage_data" not in context:
                context["stage_data"] = {}
            context["stage_data"]["detect_special"] = {
                "status": "skipped",
                "duration_ms": duration_ms,
                "reason": "어댑터 미제공 — 감지 규칙 없음",
            }
            return context

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

        context["special_detected"] = True
        context["detections"] = detections

        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["detect_special"] = {
            "status": "completed",
            "duration_ms": duration_ms,
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

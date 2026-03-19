"""DetectSpecialStage — 특수 문서 감지 스테이지"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage


# 특수 문서 감지 키워드 (데모용)
_DETECTION_RULES: list[dict[str, Any]] = [
    {
        "type": "연간보고서(AR)",
        "keywords": ["연간보고서", "annual report", "연간 보고", "AR"],
        "fields": ["customer_name", "issue_date"],
    },
    {
        "type": "고객검토서(CRS)",
        "keywords": ["고객검토서", "customer review", "CRS", "검토서"],
        "fields": ["customer_name", "issue_date"],
    },
    {
        "type": "진단서",
        "keywords": ["진단서", "진단명", "diagnosis", "medical"],
        "fields": ["patient_name", "diagnosis_date"],
    },
]


class DetectSpecialStage(Stage):
    """특수 문서 감지 스테이지

    도메인 특화 문서(AR, CRS 등)를 감지하여 후속 처리를 분기한다.
    """

    def get_name(self) -> str:
        return "detect_special"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """특수 문서 감지 처리"""
        start = time.time()

        text = context.get("extracted_text", context.get("text", ""))
        mime = context.get("mime_type", "")
        mode = context.get("mode", "stub")
        file_name = context.get("filename", context.get("original_name", "unknown"))

        detections: list[dict[str, Any]] = []
        matched_keywords: list[str] = []
        detected_type = "-"
        customer_name = "-"
        issue_date = "-"

        if mode == "stub":
            # stub: 파일명 + 텍스트 키워드 기반 감지
            search_target = (file_name + " " + text).lower()
            for rule in _DETECTION_RULES:
                for kw in rule["keywords"]:
                    if kw.lower() in search_target:
                        detected_type = rule["type"]
                        matched_keywords.append(kw)
                        detections.append({
                            "doc_type": rule["type"],
                            "matched_keyword": kw,
                            "customer_name": "[고객명] (stub)",
                            "issue_date": "2026-01-01 (stub)",
                        })
                        customer_name = "[고객명] (stub)"
                        issue_date = "2026-01-01 (stub)"
                        break
                if detections:
                    break
        else:
            # real 모드 (추후 DomainAdapter 연동)
            pass

        context["special_detected"] = True
        context["detections"] = detections

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["detect_special"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "text_length": len(text),
                "mime_type": mime,
            },
            "output": {
                "detected_type": detected_type,
                "matched_keywords": matched_keywords,
                "customer_name": customer_name,
                "issue_date": issue_date,
                "detections_count": len(detections),
                "detections": detections,
            },
        }

        return context

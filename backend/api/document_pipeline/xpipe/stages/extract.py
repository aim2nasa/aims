"""ExtractStage — 텍스트 추출 스테이지"""
from __future__ import annotations

import time
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
        """텍스트 추출 처리"""
        start = time.time()

        file_path = context.get("file_path", "")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mime = context.get("mime_type", "")
        mode = context.get("mode", "stub")

        # 추출 방식 결정: MIME 타입에 따라 분기
        is_image = mime.startswith("image/") if mime else False
        is_text = mime.startswith("text/") if mime else False
        is_pdf = mime == "application/pdf" or mime.startswith("application/pdf")
        models = context.get("models", {})
        ocr_model_name = models.get("ocr", "paddleocr")

        if mode == "stub":
            if is_text:
                # 텍스트 파일: 직접 읽기
                method = "direct_read"
                ocr_model = "-"
                text = (
                    f"[stub] {file_name}에서 직접 읽은 시뮬레이션 텍스트입니다.\n\n"
                    f"텍스트 파일은 변환/OCR 없이 직접 읽습니다.\n"
                    f"파일: {file_name}\nMIME: {mime}\n"
                )
            elif is_image:
                # 이미지: OCR
                method = "ocr"
                ocr_model = f"{ocr_model_name} (stub)"
                text = (
                    f"[stub] {file_name}에서 OCR로 추출된 시뮬레이션 텍스트입니다.\n\n"
                    f"OCR 모델: {ocr_model_name}\n"
                    f"이미지 파일에서 텍스트를 인식합니다.\n"
                    f"파일: {file_name}\nMIME: {mime}\n"
                )
            else:
                # PDF 등: pdfplumber
                method = "pdfplumber"
                ocr_model = "-"
                text = (
                    f"[stub] {file_name}에서 추출된 시뮬레이션 텍스트입니다.\n\n"
                    f"이 텍스트는 stub 모드에서 생성된 것으로, 실제 문서 내용이 아닙니다.\n"
                    f"실제 모드(real)에서는 pdfplumber를 사용하여 텍스트를 추출합니다.\n\n"
                    f"파일: {file_name}\nMIME: {mime}\n경로: {file_path}\n"
                )
        else:
            # real 모드: 실제 추출 (추후 구현)
            if is_text:
                method = "direct_read"
                ocr_model = "-"
                text = f"[real-placeholder] 직접 읽은 텍스트 ({file_name})"
            elif is_image:
                method = "ocr"
                ocr_model = ocr_model_name
                text = f"[real-placeholder] OCR로 추출될 텍스트 ({file_name})"
            else:
                method = "pdfplumber"
                ocr_model = "-"
                text = f"[real-placeholder] pdfplumber로 추출될 텍스트 ({file_name})"

        context["extracted_text"] = text
        context["text"] = text
        context["has_text"] = bool(text.strip())
        context["extracted"] = True

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}

        # AIMS 호환 메타 정보
        text_preview = text[:500] if text else ""
        context["stage_data"]["extract"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "file_path": file_path,
                "mime_type": mime,
                "method": method,
            },
            "output": {
                "text_length": len(text),
                "text_preview": text_preview,
                "full_text": text,
                "method": method,
                "ocr_model": ocr_model,
                # AIMS 호환 필드
                "meta_status": "completed",
                "has_text": bool(text.strip()),
            },
        }

        return context

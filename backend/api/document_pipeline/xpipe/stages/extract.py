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

    @staticmethod
    def _read_text_file(file_path: str, file_name: str, mime: str) -> str:
        """텍스트 파일을 실제로 읽어서 내용을 반환한다.

        읽기 실패 시 메타 정보만 반환.
        """
        import os

        if not file_path or not os.path.exists(file_path):
            return (
                f"텍스트 파일을 찾을 수 없습니다.\n\n"
                f"파일: {file_name}\n"
                f"경로: {file_path}\n"
            )

        # 여러 인코딩 시도
        for encoding in ("utf-8", "cp949", "euc-kr", "latin-1"):
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    content = f.read()
                return content
            except (UnicodeDecodeError, UnicodeError):
                continue
            except Exception as exc:
                return (
                    f"텍스트 파일 읽기 실패: {exc}\n\n"
                    f"파일: {file_name}\n"
                    f"MIME: {mime}\n"
                )

        # 모든 인코딩 실패
        return (
            f"텍스트 파일 인코딩을 인식할 수 없습니다.\n\n"
            f"파일: {file_name}\n"
            f"MIME: {mime}\n"
        )

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """텍스트 추출 처리"""
        start = time.time()

        file_path = context.get("file_path", "")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mime = context.get("mime_type", "")
        mode = context.get("mode", "stub")

        # 추출 방식 결정: MIME + 확장자에 따라 분기
        import os
        ext = os.path.splitext(file_name)[1].lower() if file_name else ""
        TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml", ".ini", ".cfg", ".conf", ".py", ".js", ".ts", ".html", ".css"}
        is_image = mime.startswith("image/") if mime else False
        is_text = (mime.startswith("text/") if mime else False) or ext in TEXT_EXTENSIONS
        is_pdf = mime == "application/pdf" or mime.startswith("application/pdf")
        models = context.get("models", {})
        ocr_model_name = models.get("ocr", "paddleocr")

        if mode == "stub":
            if is_text:
                # 텍스트 파일: 실제로 파일을 읽는다
                method = "direct_read"
                ocr_model = "-"
                text = self._read_text_file(file_path, file_name, mime)
            elif is_image:
                # 이미지: stub에서는 OCR 불가
                method = "ocr"
                ocr_model = f"{ocr_model_name} (stub)"
                text = (
                    f"OCR은 real 모드에서 가능합니다.\n\n"
                    f"파일: {file_name}\n"
                    f"MIME: {mime}\n"
                    f"OCR 모델: {ocr_model_name}\n"
                )
            elif is_pdf:
                # PDF: stub에서는 텍스트 추출 불가
                method = "pdfplumber"
                ocr_model = "-"
                text = (
                    f"PDF 텍스트 추출은 real 모드에서 가능합니다.\n\n"
                    f"파일: {file_name}\n"
                    f"MIME: {mime}\n"
                )
            else:
                # xlsx, doc, hwp 등: 변환 후 추출 필요
                method = "pdfplumber"
                ocr_model = "-"
                text = (
                    f"PDF 변환 후 텍스트 추출은 real 모드에서 가능합니다.\n\n"
                    f"파일: {file_name}\n"
                    f"MIME: {mime}\n"
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

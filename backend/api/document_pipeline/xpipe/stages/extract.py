"""ExtractStage — 텍스트 추출 스테이지"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage


# LibreOffice로 변환 가능한 확장자
CONVERTIBLE_EXTENSIONS = {".hwp", ".doc", ".docx", ".pptx", ".ppt", ".xls", ".xlsx"}

# 직접 읽기 가능한 텍스트 파일 확장자
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml",
    ".ini", ".cfg", ".conf", ".py", ".js", ".ts", ".html", ".css",
}


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

        읽기 실패 시 빈 문자열을 반환한다.
        에러 메시지를 텍스트로 반환하면 AI가 문서 내용으로 오인하기 때문.
        """
        import os
        import logging as _logging

        _logger = _logging.getLogger(__name__)

        if not file_path or not os.path.exists(file_path):
            _logger.warning("텍스트 파일을 찾을 수 없습니다: %s (경로: %s)", file_name, file_path)
            return ""

        # 여러 인코딩 시도
        for encoding in ("utf-8", "cp949", "euc-kr", "latin-1"):
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    content = f.read()
                return content
            except (UnicodeDecodeError, UnicodeError):
                continue
            except Exception as exc:
                _logger.warning("텍스트 파일 읽기 실패: %s — %s", file_name, exc)
                return ""

        # 모든 인코딩 실패
        _logger.warning("텍스트 파일 인코딩을 인식할 수 없습니다: %s (MIME: %s)", file_name, mime)
        return ""

    @staticmethod
    def _read_pdf_file(file_path: str, file_name: str) -> str:
        """PDF 파일에서 pdfplumber로 텍스트를 추출한다."""
        import os

        if not file_path or not os.path.exists(file_path):
            return ""

        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
            return "\n".join(text_parts)
        except ImportError:
            return ""
        except Exception:
            return ""

    @staticmethod
    def _convert_and_extract(file_path: str, file_name: str) -> str:
        """LibreOffice로 PDF 변환 후 pdfplumber로 텍스트 추출

        변환/추출 실패 시 빈 문자열을 반환한다.
        에러 메시지를 텍스트로 반환하면 AI가 문서 내용으로 오인하기 때문.
        """
        import subprocess
        import tempfile
        import os
        import logging as _logging

        _logger = _logging.getLogger(__name__)

        import shutil
        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            _logger.warning("LibreOffice 미설치 — 텍스트 추출 불가: %s", file_name)
            return ""

        with tempfile.TemporaryDirectory() as tmp:
            try:
                result = subprocess.run(
                    [soffice, "--headless", "--convert-to", "pdf", "--outdir", tmp, file_path],
                    capture_output=True, timeout=60,
                )
            except subprocess.TimeoutExpired:
                _logger.warning("LibreOffice 변환 시간 초과 (60초): %s", file_name)
                return ""
            except Exception as e:
                _logger.warning("LibreOffice 실행 실패: %s — %s", file_name, e)
                return ""

            # 변환된 PDF 찾기
            pdf_files = [f for f in os.listdir(tmp) if f.endswith(".pdf")]
            if not pdf_files:
                _logger.warning("LibreOffice PDF 변환 실패: %s", file_name)
                return ""

            pdf_path = os.path.join(tmp, pdf_files[0])
            # pdfplumber로 텍스트 추출
            try:
                import pdfplumber
                text_parts = []
                with pdfplumber.open(pdf_path) as pdf:
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            text_parts.append(t)
                if not text_parts:
                    _logger.warning("변환 성공, 텍스트 없음: %s", file_name)
                    return ""
                return "\n".join(text_parts)
            except ImportError:
                _logger.warning("pdfplumber 미설치 — 텍스트 추출 불가: %s", file_name)
                return ""
            except Exception as e:
                _logger.warning("PDF 텍스트 추출 실패: %s — %s", file_name, e)
                return ""

    async def _try_ocr(
        self,
        context: dict[str, Any],
        file_path: str,
        file_name: str,
        mime: str,
        ocr_model_name: str,
    ) -> tuple[str, str]:
        """OCR Provider를 통해 이미지에서 텍스트 추출을 시도한다.

        Returns:
            (추출 텍스트, 실제 사용된 provider 이름)
        """
        mode = context.get("mode", "stub")

        if mode == "stub":
            return (
                f"OCR 필요 — 시뮬레이션 모드에서는 OCR을 실행하지 않습니다.\n\n"
                f"파일: {file_name}\n"
                f"MIME: {mime}\n"
                f"OCR 모델: {ocr_model_name}\n"
            ), ocr_model_name

        # ProviderRegistry가 있으면 Registry를 통해 호출 (API 키는 Registry 내부에서 관리)
        registry = context.get("_provider_registry")
        if registry is not None:
            provider = registry.get("ocr")
            actual_name = provider.get_name()
            result = await registry.call_with_fallback("ocr", "process", file_path)
            context["_ocr_pages"] = result.get("pages", 1)
            return result.get("text", ""), actual_name

        # Registry 없음 → 직접 Provider 생성 (API 키 필수)
        api_key = context.get("_api_keys", {}).get("upstage", "")
        if not api_key:
            raise RuntimeError(
                f"OCR 실행 불가: UPSTAGE_API_KEY가 설정되지 않았습니다. "
                f"환경변수로 제공하거나 context['_api_keys']에 주입하세요. "
                f"(파일: {file_name})"
            )
        from xpipe.providers_builtin import UpstageOCRProvider
        provider = UpstageOCRProvider(api_key=api_key)
        result = await provider.process(file_path)
        context["_ocr_pages"] = result.get("pages", 1)
        return result.get("text", ""), provider.get_name()

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
        is_image = mime.startswith("image/") if mime else False
        is_text = (mime.startswith("text/") if mime else False) or ext in TEXT_EXTENSIONS
        is_pdf = mime == "application/pdf" or mime.startswith("application/pdf")
        is_convertible = ext in CONVERTIBLE_EXTENSIONS
        models = context.get("models", {})
        ocr_model_name = models.get("ocr", "upstage")

        if is_text:
            # 텍스트 파일: 실제로 파일을 읽는다 (모드 무관)
            method = "direct_read"
            ocr_model = "-"
            text = self._read_text_file(file_path, file_name, mime)
        elif is_image:
            # 이미지: OCR Provider로 처리
            method = "ocr"
            text, ocr_model = await self._try_ocr(context, file_path, file_name, mime, ocr_model_name)
        elif is_pdf:
            # PDF: pdfplumber로 텍스트 추출 시도
            method = "pdfplumber"
            ocr_model = "-"
            text = self._read_pdf_file(file_path, file_name)
            if not text and mode == "real":
                # 스캔 PDF → OCR 폴백 시도
                method = "pdfplumber+ocr_fallback"
                text, ocr_model = await self._try_ocr(context, file_path, file_name, mime, ocr_model_name)
            elif not text:
                # stub 모드: 스캔 PDF는 OCR 불가 — 빈 텍스트 허용 (시뮬레이션)
                text = ""
        elif is_convertible:
            # HWP/DOC/PPTX/XLS: ConvertStage에서 변환된 PDF가 있으면 사용, 없으면 직접 변환
            method = "libreoffice+pdfplumber"
            ocr_model = "-"
            converted = context.get("converted_pdf_path", "")
            if converted and os.path.exists(converted):
                text = self._read_pdf_file(converted, file_name)
            else:
                text = self._convert_and_extract(file_path, file_name)
        else:
            # 알 수 없는 형식 — 에러 메시지를 텍스트로 저장하지 않음
            method = "unknown"
            ocr_model = "-"
            text = ""

        # 텍스트 추출 결과 검증 — real 모드에서 빈 텍스트는 에러 (가짜 성공 금지)
        if mode != "stub" and (not text or not text.strip()):
            raise RuntimeError(
                f"텍스트 추출 실패: 추출된 텍스트가 없습니다. "
                f"(파일: {file_name}, 방식: {method})"
            )

        context["extracted_text"] = text
        context["text"] = text
        context["has_text"] = True
        context["extracted"] = True

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}

        # 표준 메타 필드
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
                # 호환 필드
                "meta_status": "completed",
                "has_text": bool(text.strip()),
            },
        }

        return context

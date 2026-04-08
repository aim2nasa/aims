"""ExtractStage — 텍스트 추출 스테이지"""
from __future__ import annotations

import logging
import time
from typing import Any

from xpipe.stage import Stage

logger = logging.getLogger(__name__)


def _collect_element_text(text_el, tspan_tag: str) -> list[str]:
    """<text> 요소에서 text/tail을 포함한 모든 텍스트 조각을 수집한다."""
    parts: list[str] = []
    if text_el.text and text_el.text.strip():
        parts.append(text_el.text.strip())
    for child in text_el:
        if child.tag == tspan_tag:
            if child.text and child.text.strip():
                parts.append(child.text.strip())
            if child.tail and child.tail.strip():
                parts.append(child.tail.strip())
    return parts


# LibreOffice로 변환 가능한 확장자
CONVERTIBLE_EXTENSIONS = {".hwp", ".doc", ".docx", ".pptx", ".ppt", ".xls", ".xlsx"}

# 직접 읽기 가능한 텍스트 파일 확장자
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".log", ".json", ".xml", ".yaml", ".yml",
    ".ini", ".cfg", ".conf", ".py", ".js", ".ts", ".html", ".css",
}

# Upstage API 미지원 이미지 확장자 — PNG 변환 후 OCR
# GIF/WebP: Pillow, SVG: cairosvg
UPSTAGE_UNSUPPORTED_IMAGE_EXTS = {".gif", ".webp", ".svg"}

# 텍스트 추출이 원천적으로 불가능한 파일 확장자
# (아카이브, 디자인 도구 등 — 보관만 가능)
UNSUPPORTED_EXTENSIONS = {
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".ai", ".psd", ".sketch", ".fig",
}

# 텍스트 추출 불가 MIME 타입
# doc_prep_main.py의 UNSUPPORTED_MIME_TYPES와 동일 범위를 유지할 것
UNSUPPORTED_MIME_TYPES = {
    "application/zip",
    "application/x-zip-compressed",      # Windows 환경 MIME 변형
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
    "application/postscript",            # .ai 파일
    "application/octet-stream",          # 감지 불가 바이너리
}


class CorruptedPDFError(Exception):
    """PDF 파일이 손상되어 파싱할 수 없음"""
    pass


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
        """PDF 파일에서 pdfplumber로 텍스트를 추출한다.

        pdfplumber.open() 자체가 실패하면 CorruptedPDFError를 raise한다.
        개별 페이지 추출 실패는 해당 페이지만 스킵하고 나머지를 반환한다.
        """
        import os

        if not file_path or not os.path.exists(file_path):
            return ""

        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(page_text)
                    except Exception as page_exc:
                        logger.warning(
                            "[ExtractStage] PDF 페이지 추출 실패 (스킵): %s page %d — %s",
                            file_name, page.page_number, page_exc
                        )
            return "\n".join(text_parts)
        except ImportError:
            return ""
        except Exception as exc:
            logger.warning("[ExtractStage] PDF 파싱 실패 (손상 의심): %s — %s", file_name, exc)
            raise CorruptedPDFError(file_name) from exc

    @staticmethod
    def _extract_svg_text(file_path: str, file_name: str) -> str:
        """SVG 파일에서 <text>/<tspan> 요소의 텍스트를 직접 추출한다.

        SVG는 XML이므로 OCR 없이 텍스트를 파싱할 수 있다.
        서버에 폰트가 없으면 OCR 시 한글이 □로 깨지므로,
        이 방식을 우선 시도한다.

        파싱 실패 시 빈 문자열을 반환한다 (에러 아님, fallback으로 OCR 시도).
        """
        import os
        import xml.etree.ElementTree as ET

        if not file_path or not os.path.exists(file_path):
            return ""

        try:
            # XXE 방지: DOCTYPE/ENTITY 포함 시 파싱 거부
            # (외부 의존성 추가 없이 안전하게 처리)
            with open(file_path, "r", encoding="utf-8") as f:
                raw = f.read(10000)  # 앞부분만 확인
            if "<!DOCTYPE" in raw.upper() or "<!ENTITY" in raw.upper():
                logger.warning(
                    "[ExtractStage] SVG에 DOCTYPE/ENTITY 감지 — XXE 방지로 파싱 스킵: %s",
                    file_name,
                )
                return ""

            tree = ET.parse(file_path)
            root = tree.getroot()

            # namespace 감지: SVG 표준은 namespace 있음, 비표준은 없을 수 있음
            ns = "{http://www.w3.org/2000/svg}"
            has_ns = ns in root.tag
            text_tag = f"{ns}text" if has_ns else "text"
            tspan_tag = f"{ns}tspan" if has_ns else "tspan"

            lines: list[str] = []

            for text_el in root.iter(text_tag):
                # <text> 자체의 텍스트 + 하위 <tspan> text/tail 모두 수집
                parts = _collect_element_text(text_el, tspan_tag)
                combined = " ".join(parts)
                if combined.strip():
                    lines.append(combined.strip())

            return "\n".join(lines)
        except Exception as exc:
            logger.debug(
                "[ExtractStage] SVG 텍스트 파싱 실패 (OCR fallback 예정): %s — %s",
                file_name, exc,
            )
            return ""

    @staticmethod
    def _is_garbled_text(text: str) -> bool:
        """OCR 결과 텍스트가 깨졌는지(판독 불가) 감지한다.

        비공백 문자 중 □(U+25A1) 또는 REPLACEMENT CHARACTER(U+FFFD) 비율이
        30%를 초과하면 깨진 텍스트로 판단한다.
        텍스트가 10자 미만이면 False를 반환한다 (다른 로직에서 처리).
        """
        non_space = [ch for ch in text if not ch.isspace()]
        if len(non_space) < 10:
            return False

        garbled_count = sum(1 for ch in non_space if ch in ("\u25a1", "\ufffd"))
        ratio = garbled_count / len(non_space)
        return ratio > 0.30

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
                _logger.warning("[ExtractStage] 변환 PDF 텍스트 추출 실패 (손상 의심): %s — %s", file_name, e)
                raise CorruptedPDFError(file_name) from e

    @staticmethod
    def _convert_image_to_png(file_path: str, file_name: str) -> str | None:
        """GIF/WebP/SVG 이미지를 PNG로 변환 (Upstage OCR용)

        GIF/WebP: Pillow (애니메이션은 첫 프레임만 추출)
        SVG: cairosvg (벡터 → 래스터 변환)
        변환 실패 시 None 반환.

        Returns:
            변환된 PNG 임시파일 경로 또는 None
        """
        import os
        import tempfile
        import logging as _logging

        _logger = _logging.getLogger(__name__)
        ext = os.path.splitext(file_name)[1].lower()

        # SVG: cairosvg로 변환
        if ext == ".svg":
            try:
                import cairosvg

                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                tmp.close()
                try:
                    cairosvg.svg2png(url=file_path, write_to=tmp.name)
                    return tmp.name
                except Exception:
                    try:
                        os.unlink(tmp.name)
                    except OSError:
                        pass
                    raise
            except ImportError:
                _logger.warning("[ExtractStage] cairosvg 미설치 — SVG 변환 불가: %s", file_name)
                return None
            except Exception as exc:
                _logger.warning("[ExtractStage] SVG 변환 실패: %s — %s", file_name, exc)
                return None

        # GIF/WebP: Pillow로 변환
        try:
            from PIL import Image

            with Image.open(file_path) as img:
                # 애니메이션인 경우 첫 프레임 선택
                img.seek(0)
                # RGBA로 변환 (투명도 보존, 팔레트 모드 대응)
                converted = img.convert("RGBA")

                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                try:
                    converted.save(tmp, format="PNG")
                    tmp.close()
                    return tmp.name
                except Exception:
                    tmp.close()
                    try:
                        os.unlink(tmp.name)
                    except OSError:
                        pass
                    raise
        except ImportError:
            _logger.warning("[ExtractStage] Pillow 미설치 — 이미지 변환 불가: %s", file_name)
            return None
        except Exception as exc:
            _logger.warning("[ExtractStage] 이미지 변환 실패: %s — %s", file_name, exc)
            return None

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
            context["_ocr_confidence"] = result.get("confidence", 0.0)
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
        context["_ocr_confidence"] = result.get("confidence", 0.0)
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

        # ── 미지원 파일 형식 조기 감지 ──
        # 아카이브/디자인 도구 등 텍스트 추출이 원천적으로 불가능한 파일은
        # RuntimeError 대신 플래그를 설정하여 호출자가 보관 처리할 수 있게 한다.
        if ext in UNSUPPORTED_EXTENSIONS or mime in UNSUPPORTED_MIME_TYPES:
            logger.info(
                "[ExtractStage] 미지원 파일 형식 — 보관 전용: %s (ext=%s, mime=%s)",
                file_name, ext, mime,
            )
            context["unsupported_format"] = True
            context["text_extraction_failed"] = True
            context["extracted_text"] = ""
            context["text"] = ""
            context["has_text"] = False
            context["extracted"] = True

            duration_ms = int((time.time() - start) * 1000)
            if "stage_data" not in context:
                context["stage_data"] = {}
            context["stage_data"]["extract"] = {
                "status": "completed",
                "duration_ms": duration_ms,
                "input": {"file_path": file_path, "mime_type": mime, "method": "unsupported_format"},
                "output": {
                    "text_length": 0,
                    "text_preview": "",
                    "full_text": "",
                    "method": "unsupported_format",
                    "ocr_model": "-",
                    "ocr_confidence": 0.0,
                    "meta_status": "completed",
                    "has_text": False,
                    "skip_reason": "unsupported_format",
                },
            }
            return context

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
            ocr_path = file_path
            converted_tmp = None

            if ext in UPSTAGE_UNSUPPORTED_IMAGE_EXTS:
                # SVG: 텍스트 직접 추출 우선 시도 (폰트 없으면 OCR에서 한글 깨짐)
                if ext == ".svg":
                    svg_text = self._extract_svg_text(file_path, file_name)
                    if svg_text and svg_text.strip():
                        text = svg_text
                        method = "svg_text_parse"
                        ocr_model = "-"
                        logger.info(
                            "[ExtractStage] SVG 텍스트 직접 추출 성공: %s (%d자)",
                            file_name, len(text),
                        )
                        # OCR 스킵 — 아래 _try_ocr 블록을 건너뛰기 위해 조기 완료
                        context["extracted_text"] = text
                        context["text"] = text
                        context["has_text"] = True
                        context["extracted"] = True

                        duration_ms = int((time.time() - start) * 1000)
                        if "stage_data" not in context:
                            context["stage_data"] = {}
                        context["stage_data"]["extract"] = {
                            "status": "completed",
                            "duration_ms": duration_ms,
                            "input": {"file_path": file_path, "mime_type": mime, "method": method},
                            "output": {
                                "text_length": len(text),
                                "text_preview": text[:500],
                                "full_text": text,
                                "method": method,
                                "ocr_model": "-",
                                "ocr_confidence": 0.0,
                                "meta_status": "completed",
                                "has_text": True,
                                "original_format": ext,
                            },
                        }
                        return context
                    else:
                        logger.info(
                            "[ExtractStage] SVG 텍스트 없음, PNG 변환 + OCR fallback: %s",
                            file_name,
                        )

                converted_tmp = self._convert_image_to_png(file_path, file_name)
                if converted_tmp:
                    ocr_path = converted_tmp
                    method = "image_convert+ocr"
                    logger.info(
                        "[ExtractStage] 이미지 변환 완료: %s (%s → PNG)", file_name, ext
                    )
                else:
                    # 변환 실패 → 보관 처리
                    context["text_extraction_failed"] = True
                    context["_extraction_skip_reason"] = "image_conversion_failed"
                    context["_user_error_message"] = (
                        f"이미지 변환에 실패했습니다 ({ext.upper().lstrip('.')} → PNG). "
                        "다른 형식(JPG, PNG)으로 변환 후 다시 업로드해 주세요."
                    )
                    text = ""
                    ocr_model = "-"
                    context["extracted_text"] = text
                    context["text"] = text
                    context["has_text"] = False
                    context["extracted"] = True

                    duration_ms = int((time.time() - start) * 1000)
                    if "stage_data" not in context:
                        context["stage_data"] = {}
                    context["stage_data"]["extract"] = {
                        "status": "completed",
                        "duration_ms": duration_ms,
                        "input": {"file_path": file_path, "mime_type": mime, "method": "image_conversion_failed"},
                        "output": {
                            "text_length": 0,
                            "text_preview": "",
                            "full_text": "",
                            "method": "image_conversion_failed",
                            "ocr_model": "-",
                            "ocr_confidence": 0.0,
                            "meta_status": "completed",
                            "has_text": False,
                            "skip_reason": "image_conversion_failed",
                        },
                    }
                    return context

            try:
                text, ocr_model = await self._try_ocr(context, ocr_path, file_name, mime, ocr_model_name)
            finally:
                # 변환 임시 파일 정리
                if converted_tmp:
                    try:
                        os.unlink(converted_tmp)
                    except OSError:
                        pass

            # 깨진 텍스트 감지 (폰트 미설치 등으로 □ 문자 다수 포함)
            if self._is_garbled_text(text):
                logger.warning(
                    "[ExtractStage] OCR 결과 판독 불가 (깨진 텍스트 감지): %s", file_name
                )
                text = ""
                context["text_extraction_failed"] = True
                context["_extraction_skip_reason"] = "garbled_ocr_text"
                context["_user_error_message"] = (
                    "OCR 결과가 판독 불가합니다. "
                    "원본 파일의 글꼴이 지원되지 않을 수 있습니다."
                )
                method = method + "+garbled"
        elif is_pdf:
            # PDF: pdfplumber로 텍스트 추출 시도
            method = "pdfplumber"
            ocr_model = "-"
            try:
                text = self._read_pdf_file(file_path, file_name)
            except CorruptedPDFError as cpf:
                # 손상/암호화 PDF: OCR 호출 스킵, 에러 상태로 전환
                text = ""
                context["text_extraction_failed"] = True
                context["_extraction_skip_reason"] = "corrupted_pdf"
                # 암호화 PDF 구분
                original_exc = str(cpf.__cause__) if cpf.__cause__ else ""
                if "encrypt" in original_exc.lower() or "password" in original_exc.lower():
                    context["_user_error_message"] = (
                        "비밀번호로 보호된 파일입니다. "
                        "비밀번호를 해제한 후 다시 업로드해 주세요."
                    )
                else:
                    context["_user_error_message"] = (
                        "파일이 손상되어 내용을 읽을 수 없습니다. "
                        "원본 파일을 확인하신 후 다시 업로드해 주세요."
                    )
            else:
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
            try:
                if converted and os.path.exists(converted):
                    text = self._read_pdf_file(converted, file_name)
                else:
                    text = self._convert_and_extract(file_path, file_name)
            except CorruptedPDFError:
                # 변환 산출 PDF 손상: OCR 호출 스킵, 에러 상태로 전환
                text = ""
                context["text_extraction_failed"] = True
                context["_extraction_skip_reason"] = "corrupted_pdf"
                context["_user_error_message"] = (
                    "파일이 손상되어 내용을 읽을 수 없습니다. "
                    "원본 파일을 확인하신 후 다시 업로드해 주세요."
                )
            # 텍스트 추출 실패 시 변환된 PDF를 OCR fallback (이미지만 포함된 PPT/HWP 등)
            if not text and not context.get("text_extraction_failed") and mode == "real" and converted and os.path.exists(converted):
                method = "libreoffice+ocr_fallback"
                try:
                    text, ocr_model = await self._try_ocr(context, converted, file_name, "application/pdf", ocr_model_name)
                except Exception as e:
                    logger.warning("[ExtractStage] 변환 파일 OCR fallback 예외 (빈 텍스트로 계속): %s — %s", file_name, e)
                    text, ocr_model = "", "-"
        else:
            # 알 수 없는 형식 — 에러 메시지를 텍스트로 저장하지 않음
            method = "unknown"
            ocr_model = "-"
            text = ""

        # 텍스트 추출 결과 검증 — real 모드에서 빈 텍스트 처리
        # RuntimeError 대신 플래그를 설정하여 호출자가 보관 처리할 수 있게 한다.
        # 이미 garbled 등으로 실패 사유가 설정된 경우 덮어쓰지 않음
        if mode != "stub" and (not text or not text.strip()) and not context.get("text_extraction_failed"):
            if is_convertible and method == "libreoffice+ocr_fallback":
                # 변환 파일 OCR fallback 실패 — 원본은 보관되므로 빈 텍스트로 처리
                logger.warning(
                    "[ExtractStage] 변환 파일 OCR fallback 실패 (빈 텍스트), 보관 처리로 전환: %s", file_name
                )
            else:
                logger.warning(
                    "[ExtractStage] 텍스트 추출 실패 (0자), 보관 처리로 전환: %s (방식: %s)", file_name, method
                )

            # 추출 실패 사유 결정
            if is_convertible:
                skip_reason = "conversion_failed"
            else:
                skip_reason = "no_text_extractable"

            text = ""
            context["text_extraction_failed"] = True
            context["_extraction_skip_reason"] = skip_reason

        context["extracted_text"] = text
        context["text"] = text
        context["has_text"] = bool(text and text.strip())
        context["extracted"] = True

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}

        # 표준 메타 필드
        text_preview = text[:500] if text else ""
        output_data = {
            "text_length": len(text),
            "text_preview": text_preview,
            "full_text": text,
            "method": method,
            "ocr_model": ocr_model,
            "ocr_confidence": context.get("_ocr_confidence", 0.0),
            # 호환 필드
            "meta_status": "completed",
            "has_text": bool(text.strip()),
        }
        # 이미지 변환을 거친 경우 원본 포맷 기록
        if method == "image_convert+ocr":
            output_data["original_format"] = ext

        context["stage_data"]["extract"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "file_path": file_path,
                "mime_type": mime,
                "method": method,
            },
            "output": output_data,
        }

        return context

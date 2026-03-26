"""ConvertStage — PDF 변환 스테이지"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage

# PDF 변환이 필요한 MIME 타입 목록 (정확 매칭)
# 사이트 무관 파이프라인 코어 판단 — 이 MIME은 PDF 변환 대상인가?
CONVERTIBLE_MIMES: set[str] = {
    # Excel
    "application/vnd.ms-excel",                                          # XLS
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", # XLSX
    # Word
    "application/msword",                                                # DOC
    "application/vnd.ms-word",                                           # DOC 변형
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    # PowerPoint
    "application/vnd.ms-powerpoint",                                     # PPT
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # PPTX
    # HWP (한글)
    "application/x-hwp",                                                 # HWP
    "application/haansofthwp",                                           # HWP 변형
    "application/vnd.hancom.hwp",                                        # 한컴 HWP
    "application/vnd.hancom.hwpx",                                       # 한컴 HWPX
    # RTF
    "application/rtf",                                                   # RTF
    # OpenDocument (레거시 호환)
    "application/vnd.oasis.opendocument.text",                           # ODT
    "application/vnd.oasis.opendocument.spreadsheet",                    # ODS
    "application/vnd.oasis.opendocument.presentation",                   # ODP
}


def is_convertible_mime(mime_type: str) -> bool:
    """MIME 타입이 PDF 변환 대상인지 판단 (정확 매칭)

    Args:
        mime_type: 파일의 MIME 타입

    Returns:
        True면 PDF 변환이 필요함
    """
    return mime_type in CONVERTIBLE_MIMES


class ConvertStage(Stage):
    """PDF 변환 스테이지

    xlsx, doc, hwp 등 비-PDF 문서를 PDF로 변환한다.
    PDF, 이미지, 텍스트 파일은 변환 불필요 → should_skip()이 True 반환.
    """

    def get_name(self) -> str:
        return "convert"

    def should_skip(self, context: dict[str, Any]) -> bool:
        """변환이 필요하지 않은 파일은 스킵"""
        return not context.get("needs_conversion", False)

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """PDF 변환 처리"""
        import os
        start = time.time()

        file_path = context.get("file_path", "")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mime = context.get("mime_type", "")
        mode = context.get("mode", "stub")

        if mode == "stub":
            # stub: 변환 시뮬레이션 (실제 파일 생성 안 함)
            converted_path = file_path.rsplit(".", 1)[0] + ".pdf" if "." in file_path else file_path + ".pdf"
            method = "libreoffice (stub)"
            output_size = context.get("file_size", 0)
            status_detail = "시뮬레이션 변환 완료"
        else:
            # real 모드: LibreOffice 실제 호출
            converter_url = context.get("_converter_url", "")
            converted_path, method, output_size, status_detail = self._convert_real(
                file_path, file_name, converter_url=converter_url
            )

        # 변환 성공 여부 판단
        import os as _os
        if mode == "stub":
            # stub: 파일 존재 검사 없이 성공으로 간주
            conversion_ok = converted_path != file_path
        else:
            conversion_ok = (
                converted_path != file_path
                and _os.path.exists(converted_path)
                and _os.path.getsize(converted_path) > 0
            )

        context["original_file_path"] = file_path
        if conversion_ok:
            context["file_path"] = converted_path
            context["converted_pdf_path"] = converted_path
            context["converted"] = True
            context["original_mime_type"] = mime
            context["mime_type"] = "application/pdf"
        else:
            # 변환 실패: 원본 유지
            context["converted"] = False
            context["conversion_failed"] = True
            context["conversion_error"] = status_detail

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["convert"] = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "file_path": file_path,
                "file_name": file_name,
                "mime_type": mime,
            },
            "output": {
                "converted_path": converted_path,
                "method": method,
                "output_mime_type": "application/pdf",
                "output_size": output_size,
                "status": status_detail,
            },
        }

        return context

    @staticmethod
    def _convert_real(file_path: str, file_name: str, converter_url: str = "") -> tuple[str, str, int, str]:
        """PDF 변환 — pdf_converter 서비스 우선, fallback으로 soffice 직접 호출.

        pdf_converter 서비스를 사용하여 HWP/XLS/PPTX 등을 PDF로 변환.

        Args:
            converter_url: 변환 서비스 URL. 빈 문자열이면 기본값 사용.

        Returns:
            (converted_path, method, output_size, status_detail)
        """
        import os

        out_dir = os.path.dirname(file_path) or "."
        base = os.path.splitext(os.path.basename(file_path))[0]
        converted_path = os.path.join(out_dir, base + ".pdf")

        # 1차: pdf_converter 서비스
        result = ConvertStage._try_pdf_converter_service(file_path, converted_path, converter_url=converter_url)
        if result:
            return result

        # 2차: soffice 직접 호출 (fallback)
        result = ConvertStage._try_soffice_direct(file_path, converted_path, out_dir)
        if result:
            return result

        return file_path, "none", 0, "PDF 변환 수단 없음 (pdf_converter 서비스 미실행, soffice 미설치)"

    _DEFAULT_CONVERTER_URL = "http://localhost:8005/convert"

    @staticmethod
    def _try_pdf_converter_service(
        file_path: str, converted_path: str, converter_url: str = ""
    ) -> tuple[str, str, int, str] | None:
        """pdf_converter 서비스로 변환 시도

        Args:
            converter_url: 변환 서비스 URL. 빈 문자열이면 기본값 사용.
        """
        import os
        url = converter_url or ConvertStage._DEFAULT_CONVERTER_URL
        try:
            import httpx
            with open(file_path, "rb") as f:
                resp = httpx.post(
                    url,
                    files={"file": (os.path.basename(file_path), f)},
                    timeout=120.0,
                )
            if resp.status_code == 200 and len(resp.content) > 0:
                with open(converted_path, "wb") as out:
                    out.write(resp.content)
                return converted_path, "pdf_converter", os.path.getsize(converted_path), "변환 완료"
        except Exception:
            pass
        return None

    @staticmethod
    def _try_soffice_direct(
        file_path: str, converted_path: str, out_dir: str
    ) -> tuple[str, str, int, str] | None:
        """soffice 직접 호출로 변환 시도 (fallback)"""
        import subprocess
        import shutil
        import os

        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            return None

        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", out_dir, file_path],
                capture_output=True, timeout=60,
            )
        except Exception:
            return None

        if os.path.exists(converted_path) and os.path.getsize(converted_path) > 0:
            return converted_path, "soffice", os.path.getsize(converted_path), "변환 완료"
        return None


# 하위 호환 alias — 기존 코드에서 needs_conversion()을 import하는 곳이 있음
needs_conversion = is_convertible_mime

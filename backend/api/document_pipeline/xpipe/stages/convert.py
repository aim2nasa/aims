"""ConvertStage — PDF 변환 스테이지"""
from __future__ import annotations

import time
from typing import Any

from xpipe.stage import Stage

# PDF 변환이 필요한 MIME 타입 접두사 목록
_CONVERTIBLE_MIME_PREFIXES = (
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument",
    "application/msword",
    "application/vnd.ms-word",
    "application/x-hwp",
    "application/haansofthwp",
    "application/rtf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml",
    "application/vnd.hancom",
)


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
            converted_path, method, output_size, status_detail = self._convert_real(
                file_path, file_name
            )

        # 변환 후 file_path를 변환된 PDF 경로로 갱신
        context["original_file_path"] = file_path
        context["file_path"] = converted_path
        context["converted_pdf_path"] = converted_path  # 프리뷰용
        context["converted"] = True
        # 변환 후 MIME 타입을 PDF로 갱신
        context["original_mime_type"] = mime
        context["mime_type"] = "application/pdf"

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
    def _convert_real(file_path: str, file_name: str) -> tuple[str, str, int, str]:
        """LibreOffice로 실제 PDF 변환. 변환된 PDF를 원본 옆에 보존.

        Returns:
            (converted_path, method, output_size, status_detail)
        """
        import subprocess
        import os

        soffice_paths = [
            "C:/Program Files/LibreOffice/program/soffice.exe",  # Windows
            "/usr/bin/soffice",  # Linux
            "/usr/bin/libreoffice",  # Linux alt
        ]
        soffice = None
        for p in soffice_paths:
            if os.path.exists(p):
                soffice = p
                break

        if not soffice:
            # LibreOffice 미설치 → 원본 경로 그대로 (변환 실패)
            return file_path, "libreoffice (미설치)", 0, "LibreOffice 미설치"

        # 원본 파일과 같은 디렉토리에 PDF 생성
        out_dir = os.path.dirname(file_path) or "."
        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", out_dir, file_path],
                capture_output=True, timeout=60,
            )
        except subprocess.TimeoutExpired:
            return file_path, "libreoffice", 0, "변환 시간 초과 (60초)"
        except Exception as e:
            return file_path, "libreoffice", 0, f"변환 실패: {e}"

        # 변환된 PDF 찾기
        base = os.path.splitext(os.path.basename(file_path))[0]
        converted_path = os.path.join(out_dir, base + ".pdf")
        if not os.path.exists(converted_path):
            return file_path, "libreoffice", 0, "PDF 파일 생성 실패"

        output_size = os.path.getsize(converted_path)
        return converted_path, "libreoffice", output_size, "변환 완료"


def needs_conversion(mime_type: str) -> bool:
    """주어진 MIME 타입이 PDF 변환이 필요한지 판단

    Args:
        mime_type: 파일의 MIME 타입

    Returns:
        True면 PDF 변환이 필요함
    """
    if not mime_type:
        return False
    return any(mime_type.startswith(prefix) for prefix in _CONVERTIBLE_MIME_PREFIXES)

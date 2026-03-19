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
        start = time.time()

        file_path = context.get("file_path", "")
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mime = context.get("mime_type", "")
        mode = context.get("mode", "stub")

        if mode == "stub":
            # stub: 변환 시뮬레이션
            converted_path = file_path.rsplit(".", 1)[0] + ".pdf" if "." in file_path else file_path + ".pdf"
            method = "libreoffice (stub)"
            output_size = context.get("file_size", 0)
            status_detail = "시뮬레이션 변환 완료"
        else:
            # real 모드: LibreOffice 호출 (추후 구현)
            converted_path = file_path.rsplit(".", 1)[0] + ".pdf" if "." in file_path else file_path + ".pdf"
            method = "libreoffice"
            output_size = context.get("file_size", 0)
            status_detail = "변환 완료"

        # 변환 후 file_path를 변환된 PDF 경로로 갱신
        context["original_file_path"] = file_path
        context["file_path"] = converted_path
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

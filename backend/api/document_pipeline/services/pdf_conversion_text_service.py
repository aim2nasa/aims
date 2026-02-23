"""
PDF Conversion Text Extraction Service

직접 파서가 없는 문서 형식(HWP, DOC, PPT, ODT 등)을
pdf_converter(:8005)로 PDF 변환 후 PyMuPDF로 텍스트 추출.

n8n 시절 enhanced_file_analyzer.js의 extractHwpText() 기능을
FastAPI document_pipeline으로 이식.
"""
import logging
import os
from typing import Optional

import httpx
import fitz  # PyMuPDF

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# PDF 변환을 통해 텍스트 추출이 가능한 MIME 타입 목록
# MetaService에 직접 파서가 없는 형식들
CONVERTIBLE_MIMES = {
    "application/x-hwp",                                    # HWP (한글)
    "application/msword",                                   # DOC (구형 Word)
    "application/vnd.ms-powerpoint",                        # PPT (구형 PowerPoint)
    "application/vnd.oasis.opendocument.text",              # ODT
    "application/vnd.oasis.opendocument.spreadsheet",       # ODS
    "application/vnd.oasis.opendocument.presentation",      # ODP
    "application/rtf",                                      # RTF
}


def is_convertible_mime(mime_type: str) -> bool:
    """MIME 타입이 PDF 변환 텍스트 추출 대상인지 확인"""
    return mime_type in CONVERTIBLE_MIMES


async def convert_and_extract_text(
    file_path: str,
    timeout: float = 120.0,
) -> Optional[str]:
    """
    파일을 pdf_converter로 변환 후 텍스트 추출.

    Args:
        file_path: 원본 파일 경로
        timeout: 변환 타임아웃 (초)

    Returns:
        추출된 텍스트 또는 None (변환/추출 실패 시)
    """
    if not os.path.exists(file_path):
        logger.error(f"[PDF변환텍스트] 파일 없음: {file_path}")
        return None

    filename = os.path.basename(file_path)
    convert_url = f"{settings.PDF_CONVERTER_URL}/convert"

    try:
        # 1. pdf_converter로 파일 전송 → PDF 수신
        logger.info(f"[PDF변환텍스트] 변환 시작: {filename}")

        async with httpx.AsyncClient(timeout=timeout) as client:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "application/octet-stream")}
                response = await client.post(convert_url, files=files)

            if response.status_code != 200:
                logger.warning(
                    f"[PDF변환텍스트] 변환 실패 ({response.status_code}): {filename}"
                )
                return None

            pdf_bytes = response.content

            if not pdf_bytes or len(pdf_bytes) == 0:
                logger.warning(f"[PDF변환텍스트] 빈 PDF 수신: {filename}")
                return None

        # 2. PyMuPDF로 변환된 PDF에서 텍스트 추출
        text = _extract_text_from_pdf_bytes(pdf_bytes)

        if text and text.strip():
            logger.info(
                f"[PDF변환텍스트] 텍스트 추출 성공: {filename} "
                f"({len(text)} chars)"
            )
            return text
        else:
            logger.warning(f"[PDF변환텍스트] 텍스트 없음 (스캔 문서?): {filename}")
            return None

    except httpx.TimeoutException:
        logger.error(f"[PDF변환텍스트] 변환 타임아웃: {filename}")
        return None
    except httpx.ConnectError:
        logger.error(
            f"[PDF변환텍스트] pdf_converter 연결 실패 "
            f"({settings.PDF_CONVERTER_URL}): {filename}"
        )
        return None
    except Exception as e:
        logger.error(f"[PDF변환텍스트] 예외: {filename} - {e}")
        return None


def _extract_text_from_pdf_bytes(pdf_bytes: bytes) -> Optional[str]:
    """PyMuPDF로 PDF 바이트에서 텍스트 추출"""
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())
        finally:
            doc.close()

        full_text = "\n".join(text_parts)
        return full_text if full_text.strip() else None

    except Exception as e:
        logger.error(f"[PDF변환텍스트] PyMuPDF 추출 실패: {e}")
        return None

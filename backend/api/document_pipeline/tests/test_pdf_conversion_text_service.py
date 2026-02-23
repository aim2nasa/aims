"""
PDF 변환 텍스트 추출 서비스 테스트

n8n→FastAPI 마이그레이션 시 누락된 HWP/DOC/PPT 등의 텍스트 추출 기능 복원 검증.
이 테스트가 실패하면 해당 형식의 문서가 OCR 큐로 잘못 전송될 수 있음 (불필요한 AI 비용).

@since 2026-02-23
@issue HWP/DOC/PPT 등 변환 가능 파일이 OCR 대신 PDF 변환 후 텍스트 추출되어야 함
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from services.pdf_conversion_text_service import (
    is_convertible_mime,
    convert_and_extract_text,
    CONVERTIBLE_MIMES,
    _extract_text_from_pdf_bytes,
)


# ========================================
# CONVERTIBLE_MIMES 분류 테스트
# ========================================

class TestConvertibleMimeClassification:
    """변환 가능 MIME 타입 분류 검증"""

    @pytest.mark.parametrize("mime,expected", [
        # 반드시 변환 대상이어야 하는 형식
        ("application/x-hwp", True),
        ("application/msword", True),
        ("application/vnd.ms-powerpoint", True),
        ("application/vnd.oasis.opendocument.text", True),
        ("application/vnd.oasis.opendocument.spreadsheet", True),
        ("application/vnd.oasis.opendocument.presentation", True),
        ("application/rtf", True),
        # 직접 파서가 있으므로 변환 불필요
        ("application/pdf", False),
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", False),
        ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", False),
        ("application/vnd.ms-excel", False),
        ("application/vnd.openxmlformats-officedocument.presentationml.presentation", False),
        # 이미지/텍스트 - 변환 대상 아님
        ("image/jpeg", False),
        ("image/png", False),
        ("text/plain", False),
        ("text/html", False),
        # 지원 불가 형식
        ("application/zip", False),
        ("application/octet-stream", False),
    ])
    def test_mime_classification(self, mime, expected):
        """각 MIME 타입이 올바르게 분류되는지 검증"""
        assert is_convertible_mime(mime) == expected, (
            f"MIME '{mime}' should {'be' if expected else 'NOT be'} convertible"
        )

    def test_hwp_must_be_convertible(self):
        """[회귀] HWP는 반드시 변환 대상이어야 함 (OCR 아님!)"""
        assert "application/x-hwp" in CONVERTIBLE_MIMES

    def test_doc_must_be_convertible(self):
        """[회귀] DOC(구형 Word)는 반드시 변환 대상이어야 함"""
        assert "application/msword" in CONVERTIBLE_MIMES

    def test_ppt_must_be_convertible(self):
        """[회귀] PPT(구형 PowerPoint)는 반드시 변환 대상이어야 함"""
        assert "application/vnd.ms-powerpoint" in CONVERTIBLE_MIMES

    def test_all_convertible_mimes_count(self):
        """변환 대상 MIME 목록이 7개여야 함"""
        assert len(CONVERTIBLE_MIMES) == 7


# ========================================
# PDF 변환 텍스트 추출 테스트
# ========================================

class TestConvertAndExtractText:
    """PDF 변환 후 텍스트 추출 검증 (pdf_converter mocked)"""

    @pytest.mark.asyncio
    async def test_successful_conversion_and_extraction(self, tmp_path):
        """정상 변환 + 텍스트 추출"""
        # 더미 HWP 파일 생성
        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        # PDF 변환 응답 mock (PDF 바이트 반환)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"fake pdf bytes"

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            # PyMuPDF 텍스트 추출 mock
            with patch(
                "services.pdf_conversion_text_service._extract_text_from_pdf_bytes"
            ) as mock_extract:
                mock_extract.return_value = "HWP에서 추출된 텍스트입니다."

                result = await convert_and_extract_text(str(hwp_file))

                assert result == "HWP에서 추출된 텍스트입니다."
                mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_file_not_found(self):
        """존재하지 않는 파일"""
        result = await convert_and_extract_text("/nonexistent/file.hwp")
        assert result is None

    @pytest.mark.asyncio
    async def test_converter_returns_error(self, tmp_path):
        """pdf_converter가 에러 반환"""
        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.content = b"Internal Server Error"

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            result = await convert_and_extract_text(str(hwp_file))
            assert result is None

    @pytest.mark.asyncio
    async def test_converter_timeout(self, tmp_path):
        """pdf_converter 타임아웃"""
        import httpx

        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.TimeoutException("timeout")
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            result = await convert_and_extract_text(str(hwp_file))
            assert result is None

    @pytest.mark.asyncio
    async def test_converter_connection_error(self, tmp_path):
        """pdf_converter 연결 실패"""
        import httpx

        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.ConnectError("connection refused")
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            result = await convert_and_extract_text(str(hwp_file))
            assert result is None

    @pytest.mark.asyncio
    async def test_empty_pdf_response(self, tmp_path):
        """빈 PDF 응답"""
        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b""

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            result = await convert_and_extract_text(str(hwp_file))
            assert result is None

    @pytest.mark.asyncio
    async def test_scanned_pdf_no_text(self, tmp_path):
        """변환된 PDF에 텍스트가 없는 경우 (스캔 문서 → OCR fallback)"""
        hwp_file = tmp_path / "test.hwp"
        hwp_file.write_bytes(b"fake hwp content")

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"pdf with no text"

        with patch("services.pdf_conversion_text_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__.return_value = mock_client
            mock_client.__aexit__.return_value = None
            mock_client_cls.return_value = mock_client

            with patch(
                "services.pdf_conversion_text_service._extract_text_from_pdf_bytes"
            ) as mock_extract:
                mock_extract.return_value = None  # 텍스트 없음

                result = await convert_and_extract_text(str(hwp_file))
                assert result is None


# ========================================
# PyMuPDF 텍스트 추출 테스트
# ========================================

class TestExtractTextFromPdfBytes:
    """PyMuPDF PDF 바이트 텍스트 추출 검증"""

    def test_valid_pdf_with_text(self):
        """텍스트가 포함된 PDF에서 추출"""
        import fitz
        doc = fitz.open()
        page = doc.new_page()
        # PyMuPDF 기본 폰트는 CJK 미지원 → 영문 텍스트로 테스트
        page.insert_text((72, 72), "Hello World test document.")
        pdf_bytes = doc.tobytes()
        doc.close()

        result = _extract_text_from_pdf_bytes(pdf_bytes)
        assert result is not None
        assert "Hello World" in result

    def test_empty_pdf(self):
        """빈 PDF (텍스트 없음)"""
        import fitz
        doc = fitz.open()
        doc.new_page()  # 빈 페이지만
        pdf_bytes = doc.tobytes()
        doc.close()

        result = _extract_text_from_pdf_bytes(pdf_bytes)
        assert result is None

    def test_invalid_pdf_bytes(self):
        """잘못된 PDF 바이트"""
        result = _extract_text_from_pdf_bytes(b"not a pdf")
        assert result is None

    def test_multi_page_pdf(self):
        """여러 페이지 PDF"""
        import fitz
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page()
            page.insert_text((72, 72), f"Page {i+1} content")
        pdf_bytes = doc.tobytes()
        doc.close()

        result = _extract_text_from_pdf_bytes(pdf_bytes)
        assert result is not None
        assert "Page 1" in result
        assert "Page 3" in result

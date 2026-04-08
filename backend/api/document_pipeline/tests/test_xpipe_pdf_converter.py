"""
pdf_converter 서비스 경유 PDF 변환 regression 테스트

이슈 #37: 호스트 LibreOffice 고장 → pdf_converter Docker 서비스로 전환
ExtractStage._convert_and_extract()가 httpx로 localhost:8005를 호출하는지 검증
"""
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from xpipe.stages.extract import ExtractStage


class TestConvertAndExtractPdfConverter:
    """_convert_and_extract가 pdf_converter 서비스를 사용하는지 검증"""

    def test_calls_pdf_converter_service(self):
        """localhost:8005/convert로 HTTP POST 호출"""
        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".hwp", delete=False) as f:
            f.write(b"fake hwp content")
            file_path = f.name

        try:
            mock_response = MagicMock()
            mock_response.status_code = 200
            # 최소 유효 PDF
            mock_response.content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"

            with patch("httpx.post", return_value=mock_response) as mock_post:
                with patch("pdfplumber.open") as mock_pdfplumber:
                    mock_pdf = MagicMock()
                    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
                    mock_pdf.__exit__ = MagicMock(return_value=False)
                    mock_page = MagicMock()
                    mock_page.extract_text.return_value = "추출된 텍스트"
                    mock_pdf.pages = [mock_page]
                    mock_pdfplumber.return_value = mock_pdf

                    result = ExtractStage._convert_and_extract(file_path, "test.hwp")

                    # pdf_converter 서비스 호출 확인
                    mock_post.assert_called_once()
                    call_args = mock_post.call_args
                    assert "http://localhost:8005/convert" in str(call_args)
                    assert result == "추출된 텍스트"
        finally:
            os.unlink(file_path)

    def test_connection_error_returns_empty(self):
        """pdf_converter 서비스 연결 불가 → 빈 문자열"""
        import httpx

        with tempfile.NamedTemporaryFile(suffix=".hwp", delete=False) as f:
            f.write(b"fake")
            file_path = f.name

        try:
            with patch("httpx.post", side_effect=httpx.ConnectError("Connection refused")):
                result = ExtractStage._convert_and_extract(file_path, "test.hwp")
                assert result == ""
        finally:
            os.unlink(file_path)

    def test_timeout_returns_empty(self):
        """변환 시간 초과 → 빈 문자열"""
        import httpx

        with tempfile.NamedTemporaryFile(suffix=".hwp", delete=False) as f:
            f.write(b"fake")
            file_path = f.name

        try:
            with patch("httpx.post", side_effect=httpx.TimeoutException("timeout")):
                result = ExtractStage._convert_and_extract(file_path, "test.hwp")
                assert result == ""
        finally:
            os.unlink(file_path)

    def test_http_500_returns_empty(self):
        """서비스 500 에러 → 빈 문자열"""
        with tempfile.NamedTemporaryFile(suffix=".hwp", delete=False) as f:
            f.write(b"fake")
            file_path = f.name

        try:
            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.json.return_value = {"error": "conversion failed"}

            with patch("httpx.post", return_value=mock_response):
                result = ExtractStage._convert_and_extract(file_path, "test.hwp")
                assert result == ""
        finally:
            os.unlink(file_path)

    def test_nonexistent_file_returns_empty(self):
        """존재하지 않는 파일 → 빈 문자열"""
        result = ExtractStage._convert_and_extract("/nonexistent/file.hwp", "test.hwp")
        assert result == ""

    def test_no_soffice_dependency(self):
        """호스트 soffice/libreoffice에 의존하지 않음"""
        import inspect
        source = inspect.getsource(ExtractStage._convert_and_extract)
        assert "soffice" not in source
        assert "libreoffice" not in source
        assert "subprocess" not in source

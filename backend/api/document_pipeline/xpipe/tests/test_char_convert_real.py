"""Characterization tests: ConvertStage real 모드 동작 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_convert_real.py -v

ConvertStage._convert_real()의 PDF 변환 시도 순서와 fallback 동작을 캡처한다.
1차: httpx로 pdf_converter 서비스(localhost:8005) 호출
2차: soffice/libreoffice 직접 호출 (fallback)
둘 다 실패: 원본 경로 반환 + "변환 수단 없음" 메시지
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from xpipe.stages.convert import ConvertStage, needs_conversion


class TestConvertStageRealPdfConverter:
    """pdf_converter 서비스(8005) 호출 동작 캡처"""

    def test_pdf_converter_success(self, tmp_path):
        """pdf_converter 서비스가 200 + 내용 반환하면 변환 성공"""
        src = tmp_path / "test.xlsx"
        src.write_bytes(b"fake excel content")
        converted = tmp_path / "test.pdf"

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"%PDF-1.4 fake pdf"

        with patch("httpx.post", return_value=mock_response):
            result = ConvertStage._try_pdf_converter_service(
                str(src), str(converted)
            )

        assert result is not None
        path, method, size, detail = result
        assert path == str(converted)
        assert method == "pdf_converter"
        assert "변환 완료" in detail

    def test_pdf_converter_failure_returns_none(self, tmp_path):
        """pdf_converter 서비스 연결 실패 시 None 반환 (fallback으로 넘김)"""
        src = tmp_path / "test.xlsx"
        src.write_bytes(b"fake excel content")
        converted = tmp_path / "test.pdf"

        with patch("httpx.post", side_effect=Exception("Connection refused")):
            result = ConvertStage._try_pdf_converter_service(
                str(src), str(converted)
            )

        assert result is None


class TestConvertStageSofficeFallback:
    """soffice 직접 호출 fallback 동작 캡처"""

    def test_soffice_not_found_returns_none(self, tmp_path):
        """soffice/libreoffice가 PATH에 없으면 None 반환"""
        src = tmp_path / "test.docx"
        src.write_bytes(b"fake docx")
        converted = tmp_path / "test.pdf"

        with patch("shutil.which", return_value=None):
            result = ConvertStage._try_soffice_direct(
                str(src), str(converted), str(tmp_path)
            )

        assert result is None


class TestConvertStageRealBothFail:
    """pdf_converter + soffice 모두 실패 시 동작 캡처"""

    def test_both_fail_returns_original_path(self, tmp_path):
        """두 변환 수단 모두 실패하면 (원본경로, 'none', 0, 에러메시지) 반환"""
        src = tmp_path / "test.hwp"
        src.write_bytes(b"fake hwp")

        with patch("httpx.post", side_effect=Exception("Connection refused")), \
             patch("shutil.which", return_value=None):
            path, method, size, detail = ConvertStage._convert_real(
                str(src), "test.hwp"
            )

        assert path == str(src)
        assert method == "none"
        assert size == 0
        assert "변환 수단 없음" in detail


class TestNeedsConversion:
    """needs_conversion() 유틸 함수 동작 캡처"""

    @pytest.mark.parametrize("mime,expected", [
        ("application/vnd.ms-excel", True),
        ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", True),
        ("application/msword", True),
        ("application/x-hwp", True),
        ("application/haansofthwp", True),
        ("application/pdf", False),
        ("image/png", False),
        ("text/plain", False),
        ("", False),
    ])
    def test_mime_type_detection(self, mime: str, expected: bool):
        """MIME 타입별 변환 필요 여부 정확히 판단"""
        assert needs_conversion(mime) is expected

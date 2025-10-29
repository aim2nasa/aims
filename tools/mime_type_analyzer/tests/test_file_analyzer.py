"""
tools/mime_type_analyzer/file_analyzer.py 테스트
파일 분석 도구 검증
"""
import pytest
import sys
import os

# 프로젝트 루트 경로 추가
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from tools.mime_type_analyzer.file_analyzer import analyze_file


class TestAnalyzeFile:
    """analyze_file 함수 테스트"""

    def test_analyze_pdf_file(self):
        """PDF 파일 분석"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        result = analyze_file(pdf_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"] == "application/pdf"
        assert result["filename"] == "삼성생명약관.pdf"
        assert result["pdf_pages"] > 0

    def test_analyze_jpeg_file(self):
        """JPEG 이미지 분석"""
        jpeg_path = "samples/image/jpeg/08하 7454 자동차등록증.jpeg"

        if not os.path.exists(jpeg_path):
            pytest.skip(f"샘플 파일 없음: {jpeg_path}")

        result = analyze_file(jpeg_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"].startswith("image/")
        assert result["filename"] == "08하 7454 자동차등록증.jpeg"

    def test_analyze_xlsx_file(self):
        """Excel 파일 분석"""
        xlsx_path = "samples/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet/김보성 종신제안.xlsx"

        if not os.path.exists(xlsx_path):
            pytest.skip(f"샘플 파일 없음: {xlsx_path}")

        result = analyze_file(xlsx_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def test_analyze_hwp_file(self):
        """HWP 파일 분석"""
        hwp_path = "samples/application/x-hwp/정관_캐치업코리아.hwp"

        if not os.path.exists(hwp_path):
            pytest.skip(f"샘플 파일 없음: {hwp_path}")

        result = analyze_file(hwp_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"] == "application/x-hwp"

    def test_analyze_nonexistent_file(self):
        """존재하지 않는 파일 분석"""
        fake_path = "samples/nonexistent/fake.pdf"

        result = analyze_file(fake_path)

        assert result is not None
        assert result["status"] == "not_found"
        assert result["mime"] is None

    def test_analyze_png_file(self):
        """PNG 이미지 분석"""
        png_path = "samples/image/png/캐치업통장.png"

        if not os.path.exists(png_path):
            pytest.skip(f"샘플 파일 없음: {png_path}")

        result = analyze_file(png_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"].startswith("image/")
        assert result["filename"] == "캐치업통장.png"

    def test_analyze_docx_file(self):
        """DOCX 파일 분석"""
        docx_path = "samples/application/vnd.openxmlformats-officedocument.wordprocessingml.document/캐치업근무자현황.docx"

        if not os.path.exists(docx_path):
            pytest.skip(f"샘플 파일 없음: {docx_path}")

        result = analyze_file(docx_path)

        assert result is not None
        assert result["status"] == "ok"
        assert result["mime"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    def test_return_structure(self):
        """반환 구조 검증"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        result = analyze_file(pdf_path)

        # 필수 키 확인
        required_keys = [
            "filename", "mime", "extension", "size_bytes",
            "created_at", "status", "exif", "pdf_pages"
        ]
        for key in required_keys:
            assert key in result, f"필수 키 누락: {key}"

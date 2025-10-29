"""
docmeta 모듈 테스트
파일 메타데이터 추출 기능 검증
"""
import pytest
import os
from pathlib import Path
from src.docmeta.core import get_file_metadata


class TestGetFileMetadata:
    """get_file_metadata 함수 테스트"""

    def test_pdf_file_metadata(self):
        """PDF 파일 메타데이터 추출 테스트"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        result = get_file_metadata(pdf_path)

        assert result["status"] == "ok"
        assert result["filename"] == "삼성생명약관.pdf"
        assert result["mime"] == "application/pdf"
        assert result["extension"] == ".pdf"
        assert result["size_bytes"] > 0
        assert result["created_at"] is not None
        assert result["pdf_pages"] is not None
        assert result["pdf_pages"] > 0
        assert result["exif"] == {}  # PDF는 EXIF 없음

    def test_jpeg_image_metadata(self):
        """JPEG 이미지 메타데이터 추출 테스트"""
        jpeg_path = "samples/image/jpeg/08하 7454 자동차등록증.jpeg"

        if not os.path.exists(jpeg_path):
            pytest.skip(f"샘플 파일 없음: {jpeg_path}")

        result = get_file_metadata(jpeg_path)

        assert result["status"] == "ok"
        assert result["filename"] == "08하 7454 자동차등록증.jpeg"
        assert result["mime"].startswith("image/")
        assert result["extension"] == ".jpeg"
        assert result["size_bytes"] > 0
        assert result["created_at"] is not None
        assert result["pdf_pages"] is None
        # EXIF는 파일에 따라 있을 수도 있고 없을 수도 있음
        assert isinstance(result["exif"], dict)

    def test_xlsx_file_metadata(self):
        """Excel 파일 메타데이터 추출 테스트"""
        xlsx_path = "samples/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet/김보성 종신제안.xlsx"

        if not os.path.exists(xlsx_path):
            pytest.skip(f"샘플 파일 없음: {xlsx_path}")

        result = get_file_metadata(xlsx_path)

        assert result["status"] == "ok"
        assert result["filename"] == "김보성 종신제안.xlsx"
        assert result["mime"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert result["extension"] == ".xlsx"
        assert result["size_bytes"] > 0
        assert result["created_at"] is not None
        assert result["pdf_pages"] is None
        assert result["exif"] == {}

    def test_hwp_file_metadata(self):
        """HWP 파일 메타데이터 추출 테스트"""
        hwp_path = "samples/application/x-hwp/정관_캐치업코리아.hwp"

        if not os.path.exists(hwp_path):
            pytest.skip(f"샘플 파일 없음: {hwp_path}")

        result = get_file_metadata(hwp_path)

        assert result["status"] == "ok"
        assert result["filename"] == "정관_캐치업코리아.hwp"
        assert result["mime"] == "application/x-hwp"
        assert result["extension"] == ".hwp"
        assert result["size_bytes"] > 0
        assert result["created_at"] is not None

    def test_nonexistent_file(self):
        """존재하지 않는 파일 처리 테스트"""
        fake_path = "samples/nonexistent/fake_file.pdf"

        result = get_file_metadata(fake_path)

        assert result["status"] == "not_found"
        assert result["filename"] == "fake_file.pdf"
        assert result["mime"] is None
        assert result["extension"] == ".pdf"
        assert result["size_bytes"] == 0
        assert result["created_at"] is None
        assert result["reason"] == "file not found"
        assert result["exif"] == {}
        assert result["pdf_pages"] is None

    def test_empty_pdf_file(self):
        """빈 PDF 파일 처리 테스트"""
        empty_pdf = "samples/corrupt/empty.pdf"

        if not os.path.exists(empty_pdf):
            pytest.skip(f"샘플 파일 없음: {empty_pdf}")

        result = get_file_metadata(empty_pdf)

        # 파일은 존재하지만 손상됨
        assert result["status"] == "ok"
        assert result["filename"] == "empty.pdf"
        assert result["size_bytes"] >= 0  # 0바이트 파일일 수 있음
        # 빈 파일이므로 MIME이 PDF가 아닐 수 있음
        # PDF 페이지 수는 None (PDF가 아님) 또는 0 (손상된 PDF)
        assert result["pdf_pages"] is None or result["pdf_pages"] == 0

    def test_corrupted_jpeg_file(self):
        """손상된 JPEG 파일 처리 테스트"""
        fake_jpeg = "samples/corrupt/fake.jpg"

        if not os.path.exists(fake_jpeg):
            pytest.skip(f"샘플 파일 없음: {fake_jpeg}")

        result = get_file_metadata(fake_jpeg)

        # 파일은 존재하지만 MIME 탐지는 실패할 수 있음
        assert result["status"] == "ok"
        assert result["filename"] == "fake.jpg"
        assert result["mime"] is not None  # fallback to octet-stream
        # EXIF 추출은 실패하지만 에러는 안 남
        assert isinstance(result["exif"], dict)

    def test_metadata_structure(self):
        """메타데이터 구조 검증"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        result = get_file_metadata(pdf_path)

        # 필수 키 존재 확인
        required_keys = [
            "filename", "mime", "extension", "size_bytes",
            "created_at", "status", "exif", "pdf_pages"
        ]
        for key in required_keys:
            assert key in result, f"필수 키 누락: {key}"

        # 타입 검증
        assert isinstance(result["filename"], str)
        assert isinstance(result["extension"], str)
        assert isinstance(result["size_bytes"], int)
        assert isinstance(result["status"], str)
        assert isinstance(result["exif"], dict)

    def test_png_image_metadata(self):
        """PNG 이미지 메타데이터 추출 테스트"""
        png_path = "samples/image/png/캐치업통장.png"

        if not os.path.exists(png_path):
            pytest.skip(f"샘플 파일 없음: {png_path}")

        result = get_file_metadata(png_path)

        assert result["status"] == "ok"
        assert result["filename"] == "캐치업통장.png"
        assert result["mime"].startswith("image/")
        assert result["extension"] == ".png"
        assert result["size_bytes"] > 0

    def test_docx_file_metadata(self):
        """DOCX 파일 메타데이터 추출 테스트"""
        docx_path = "samples/application/vnd.openxmlformats-officedocument.wordprocessingml.document/캐치업근무자현황.docx"

        if not os.path.exists(docx_path):
            pytest.skip(f"샘플 파일 없음: {docx_path}")

        result = get_file_metadata(docx_path)

        assert result["status"] == "ok"
        assert result["filename"] == "캐치업근무자현황.docx"
        assert result["mime"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assert result["extension"] == ".docx"
        assert result["size_bytes"] > 0

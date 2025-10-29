"""
shared.pdf_utils 모듈 테스트
PDF 페이지 수 추출 기능 검증
"""
import pytest
import os
from src.shared.pdf_utils import get_pdf_page_count


class TestGetPdfPageCount:
    """get_pdf_page_count 함수 테스트"""

    def test_valid_pdf_page_count(self):
        """정상 PDF 페이지 수 카운트"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        pages = get_pdf_page_count(pdf_path)
        assert pages > 0
        assert isinstance(pages, int)

    def test_multi_page_pdf(self):
        """다중 페이지 PDF 테스트"""
        pdf_path = "samples/application/pdf/캐치업코리아-낙하리_현대해상.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        pages = get_pdf_page_count(pdf_path)
        assert pages > 0
        assert isinstance(pages, int)

    def test_corrupted_pdf(self):
        """손상된 PDF 파일 처리 (0 반환)"""
        corrupt_pdf = "samples/corrupt/empty.pdf"

        if not os.path.exists(corrupt_pdf):
            pytest.skip(f"샘플 파일 없음: {corrupt_pdf}")

        pages = get_pdf_page_count(corrupt_pdf)
        # 손상된 PDF는 0 반환
        assert pages == 0

    def test_nonexistent_file(self):
        """존재하지 않는 파일 처리 (0 반환)"""
        fake_path = "samples/nonexistent/fake.pdf"

        pages = get_pdf_page_count(fake_path)
        assert pages == 0

    def test_non_pdf_file(self):
        """PDF가 아닌 파일 처리 (0 반환)"""
        image_path = "samples/image/png/캐치업통장.png"

        if not os.path.exists(image_path):
            pytest.skip(f"샘플 파일 없음: {image_path}")

        pages = get_pdf_page_count(image_path)
        # PNG는 PDF가 아니므로 0 반환
        assert pages == 0

    def test_korean_path_handling(self):
        """한글 경로 PDF 처리"""
        korean_pdf = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(korean_pdf):
            pytest.skip(f"샘플 파일 없음: {korean_pdf}")

        pages = get_pdf_page_count(korean_pdf)
        assert pages > 0

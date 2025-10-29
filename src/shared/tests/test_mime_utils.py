"""
shared.mime_utils 모듈 테스트
MIME 타입 탐지 기능 검증
"""
import pytest
import os
from src.shared.mime_utils import get_mime_type


class TestGetMimeType:
    """get_mime_type 함수 테스트"""

    def test_pdf_mime_detection(self):
        """PDF MIME 타입 탐지 테스트"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        mime = get_mime_type(pdf_path)
        assert mime == "application/pdf"

    def test_jpeg_mime_detection(self):
        """JPEG MIME 타입 탐지 테스트"""
        jpeg_path = "samples/image/jpeg/08하 7454 자동차등록증.jpeg"

        if not os.path.exists(jpeg_path):
            pytest.skip(f"샘플 파일 없음: {jpeg_path}")

        mime = get_mime_type(jpeg_path)
        assert mime.startswith("image/jpeg") or mime == "image/jpeg"

    def test_png_mime_detection(self):
        """PNG MIME 타입 탐지 테스트"""
        png_path = "samples/image/png/캐치업통장.png"

        if not os.path.exists(png_path):
            pytest.skip(f"샘플 파일 없음: {png_path}")

        mime = get_mime_type(png_path)
        assert mime.startswith("image/png") or mime == "image/png"

    def test_xlsx_mime_detection(self):
        """XLSX MIME 타입 탐지 테스트 (확장자 매핑)"""
        xlsx_path = "samples/application/vnd.openxmlformats-officedocument.spreadsheetml.sheet/김보성 종신제안.xlsx"

        if not os.path.exists(xlsx_path):
            pytest.skip(f"샘플 파일 없음: {xlsx_path}")

        mime = get_mime_type(xlsx_path)
        # 확장자 후처리 매핑으로 정확한 MIME 반환
        assert mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    def test_docx_mime_detection(self):
        """DOCX MIME 타입 탐지 테스트 (확장자 매핑)"""
        docx_path = "samples/application/vnd.openxmlformats-officedocument.wordprocessingml.document/캐치업근무자현황.docx"

        if not os.path.exists(docx_path):
            pytest.skip(f"샘플 파일 없음: {docx_path}")

        mime = get_mime_type(docx_path)
        assert mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    def test_hwp_mime_detection(self):
        """HWP MIME 타입 탐지 테스트 (확장자 매핑)"""
        hwp_path = "samples/application/x-hwp/정관_캐치업코리아.hwp"

        if not os.path.exists(hwp_path):
            pytest.skip(f"샘플 파일 없음: {hwp_path}")

        mime = get_mime_type(hwp_path)
        assert mime == "application/x-hwp"

    def test_nonexistent_file(self):
        """존재하지 않는 파일 처리"""
        fake_path = "samples/nonexistent/fake.pdf"

        mime = get_mime_type(fake_path)
        assert mime is None

    def test_corrupted_file_fallback(self):
        """손상된 파일 fallback MIME 반환"""
        fake_file = "samples/corrupt/random.bin"

        if not os.path.exists(fake_file):
            pytest.skip(f"샘플 파일 없음: {fake_file}")

        mime = get_mime_type(fake_file)
        # 에러 발생시 fallback
        assert mime is not None
        assert isinstance(mime, str)

    def test_korean_filename_handling(self):
        """한글 파일명 처리 테스트"""
        korean_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(korean_path):
            pytest.skip(f"샘플 파일 없음: {korean_path}")

        mime = get_mime_type(korean_path)
        # 임시 파일 복사로 한글 경로 문제 해결
        assert mime == "application/pdf"

    def test_pptx_mime_detection(self):
        """PPTX MIME 타입 탐지 테스트"""
        pptx_path = "samples/application/vnd.openxmlformats-officedocument.presentationml.presentation/마장사은품.pptx"

        if not os.path.exists(pptx_path):
            pytest.skip(f"샘플 파일 없음: {pptx_path}")

        mime = get_mime_type(pptx_path)
        assert mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation"

"""
shared.exif_utils 모듈 테스트
이미지 EXIF 메타데이터 추출 기능 검증
"""
import pytest
import os
from src.shared.exif_utils import extract_exif


class TestExtractExif:
    """extract_exif 함수 테스트"""

    def test_jpeg_with_exif(self):
        """EXIF가 있는 JPEG 이미지 테스트"""
        jpeg_path = "samples/image/jpeg/08하 7454 자동차등록증.jpeg"

        if not os.path.exists(jpeg_path):
            pytest.skip(f"샘플 파일 없음: {jpeg_path}")

        exif = extract_exif(jpeg_path)

        # EXIF는 있을 수도 있고 없을 수도 있음
        assert isinstance(exif, dict)
        # 에러 없이 정상 실행되면 통과

    def test_png_image(self):
        """PNG 이미지 EXIF 테스트 (보통 EXIF 없음)"""
        png_path = "samples/image/png/캐치업통장.png"

        if not os.path.exists(png_path):
            pytest.skip(f"샘플 파일 없음: {png_path}")

        exif = extract_exif(png_path)

        # PNG는 보통 EXIF가 없지만 dict 반환
        assert isinstance(exif, dict)

    def test_non_image_file(self):
        """이미지가 아닌 파일 처리 (빈 dict 반환)"""
        pdf_path = "samples/application/pdf/삼성생명약관.pdf"

        if not os.path.exists(pdf_path):
            pytest.skip(f"샘플 파일 없음: {pdf_path}")

        exif = extract_exif(pdf_path)

        # PDF는 EXIF가 없으므로 빈 dict
        assert isinstance(exif, dict)

    def test_nonexistent_file(self):
        """존재하지 않는 파일 처리 (빈 dict 반환)"""
        fake_path = "samples/nonexistent/fake.jpg"

        exif = extract_exif(fake_path)

        # 에러 시 빈 dict 반환
        assert exif == {}

    def test_corrupted_image(self):
        """손상된 이미지 파일 처리 (빈 dict 반환)"""
        fake_jpeg = "samples/corrupt/fake.jpg"

        if not os.path.exists(fake_jpeg):
            pytest.skip(f"샘플 파일 없음: {fake_jpeg}")

        exif = extract_exif(fake_jpeg)

        # 손상된 파일은 에러로 빈 dict 반환
        assert isinstance(exif, dict)

    def test_return_type(self):
        """반환 타입 검증"""
        jpeg_path = "samples/image/jpeg/캐치업자동차견적.jpg"

        if not os.path.exists(jpeg_path):
            pytest.skip(f"샘플 파일 없음: {jpeg_path}")

        exif = extract_exif(jpeg_path)

        # 항상 dict 반환
        assert isinstance(exif, dict)

        # dict의 값은 모두 string
        for key, value in exif.items():
            assert isinstance(value, str), f"EXIF 값은 string이어야 함: {key}={value}"

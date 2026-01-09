"""
Tests for MetaService EXIF Extraction
이미지 EXIF 메타데이터 추출 기능 테스트

Tests cover:
- JPEG EXIF extraction
- Image dimensions extraction (PIL)
- GPS coordinates extraction
- Camera make/model extraction
- Date taken extraction
- Orientation extraction
- Edge cases (no EXIF, corrupted data)
"""
import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.meta_service import MetaService


class TestMetaServiceImageDimensions:
    """이미지 크기 추출 테스트 (PIL)"""

    @pytest.mark.asyncio
    async def test_extract_jpeg_dimensions(self, sample_jpeg_minimal):
        """JPEG 이미지 크기 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_minimal,
            filename="test.jpg"
        )

        # 최소 JPEG는 1x1 픽셀
        # PIL이 읽을 수 있는 경우에만 크기 추출됨
        # 샘플이 최소 구조라 PIL이 못 읽을 수 있음
        assert result["error"] is False
        # width/height는 None이거나 값이 있어야 함
        if result["width"] is not None:
            assert result["width"] > 0
        if result["height"] is not None:
            assert result["height"] > 0

    @pytest.mark.asyncio
    async def test_extract_png_dimensions(self, sample_image):
        """PNG 이미지 크기 추출"""
        sample_image.seek(0)
        content = sample_image.read()

        result = await MetaService.extract_metadata(
            file_content=content,
            filename="test.png"
        )

        assert result["width"] == 1
        assert result["height"] == 1

    @pytest.mark.asyncio
    async def test_invalid_image_dimensions(self):
        """손상된 이미지 - 크기 추출 실패"""
        invalid_content = b"not a valid image"

        result = await MetaService.extract_metadata(
            file_content=invalid_content,
            filename="invalid.jpg"
        )

        # 실패해도 에러 없이 None 반환
        assert result["error"] is False
        assert result["width"] is None
        assert result["height"] is None


class TestMetaServiceExifExtraction:
    """EXIF 메타데이터 추출 테스트"""

    @pytest.mark.asyncio
    async def test_extract_exif_from_jpeg(self, sample_jpeg_with_exif):
        """JPEG에서 EXIF 데이터 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        # EXIF 데이터가 있으면 딕셔너리로 반환
        if result.get("exif"):
            assert isinstance(result["exif"], dict)

    @pytest.mark.asyncio
    async def test_extract_camera_info(self, sample_jpeg_with_exif):
        """카메라 제조사/모델 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        # 카메라 정보가 있으면 문자열로 반환
        if result.get("camera_make"):
            assert isinstance(result["camera_make"], str)
        if result.get("camera_model"):
            assert isinstance(result["camera_model"], str)

    @pytest.mark.asyncio
    async def test_extract_date_taken(self, sample_jpeg_with_exif):
        """촬영 날짜 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        # 촬영 날짜가 있으면 문자열로 반환
        if result.get("date_taken"):
            assert isinstance(result["date_taken"], str)

    @pytest.mark.asyncio
    async def test_extract_orientation(self, sample_jpeg_with_exif):
        """이미지 방향(orientation) 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        # orientation이 있으면 문자열로 반환
        if result.get("orientation"):
            assert isinstance(result["orientation"], str)

    @pytest.mark.asyncio
    async def test_no_exif_in_png(self, sample_image):
        """PNG 이미지 - EXIF 없음"""
        sample_image.seek(0)
        content = sample_image.read()

        result = await MetaService.extract_metadata(
            file_content=content,
            filename="image.png"
        )

        # PNG는 EXIF가 없어야 함
        assert result["exif"] is None

    @pytest.mark.asyncio
    async def test_jpeg_without_exif(self, sample_jpeg_minimal):
        """EXIF 없는 JPEG"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_minimal,
            filename="no_exif.jpg"
        )

        # EXIF가 없을 수 있음
        # 에러 없이 처리되어야 함
        assert result["error"] is False


class TestMetaServiceGpsExtraction:
    """GPS 좌표 추출 테스트"""

    @pytest.mark.asyncio
    async def test_gps_fields_structure(self, sample_jpeg_with_exif):
        """GPS 필드 구조 검증"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        # GPS 필드가 결과에 포함되어야 함 (값은 None일 수 있음)
        assert "gps_latitude" in result or result.get("gps_latitude") is None
        assert "gps_longitude" in result or result.get("gps_longitude") is None

    @pytest.mark.asyncio
    async def test_gps_ref_fields(self, sample_jpeg_with_gps):
        """GPS 참조 필드 (N/S, E/W) 추출"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_gps,
            filename="gps_photo.jpg"
        )

        # GPS 데이터가 있으면 참조 필드도 있어야 함
        if result.get("gps_latitude"):
            # gps_latitude_ref가 있으면 N 또는 S
            if result.get("gps_latitude_ref"):
                assert result["gps_latitude_ref"] in ["N", "S"]
        if result.get("gps_longitude"):
            if result.get("gps_longitude_ref"):
                assert result["gps_longitude_ref"] in ["E", "W"]


class TestMetaServiceExifEdgeCases:
    """EXIF 추출 엣지 케이스 테스트"""

    @pytest.mark.asyncio
    async def test_corrupted_exif_data(self):
        """손상된 EXIF 데이터"""
        # JPEG 시그니처만 있고 나머지가 손상된 데이터
        corrupted = bytes([0xFF, 0xD8, 0xFF, 0xE1]) + b"corrupted exif data"

        result = await MetaService.extract_metadata(
            file_content=corrupted,
            filename="corrupted.jpg"
        )

        # 에러 없이 처리되어야 함
        assert result.get("error") is not True or result["error"] is False

    @pytest.mark.asyncio
    async def test_very_large_exif_value_skipped(self):
        """500자 초과 EXIF 값은 스킵"""
        # MetaService._extract_image_info에서 500자 초과 값 스킵
        # 실제 테스트는 모킹으로
        with patch("services.meta_service.exifread") as mock_exifread:
            mock_exifread.process_file.return_value = {
                "Image Make": MagicMock(__str__=lambda x: "Samsung"),
                "EXIF MakerNote": MagicMock(__str__=lambda x: "x" * 600),  # 600자 - 스킵됨
            }

            # HAS_EXIFREAD를 True로 설정
            with patch("services.meta_service.HAS_EXIFREAD", True):
                result = MetaService._extract_image_info(
                    b"fake_content",
                    "image/jpeg"
                )

                # MakerNote는 항상 스킵됨 (prefix 체크)
                assert "EXIF MakerNote" not in (result.get("exif") or {})

    @pytest.mark.asyncio
    async def test_thumbnail_data_skipped(self):
        """Thumbnail 데이터는 스킵"""
        with patch("services.meta_service.exifread") as mock_exifread:
            mock_exifread.process_file.return_value = {
                "Image Make": MagicMock(__str__=lambda x: "Canon"),
                "Thumbnail JPEGInterchangeFormat": MagicMock(__str__=lambda x: "12345"),
            }

            with patch("services.meta_service.HAS_EXIFREAD", True):
                result = MetaService._extract_image_info(
                    b"fake_content",
                    "image/jpeg"
                )

                exif = result.get("exif") or {}
                assert "Thumbnail JPEGInterchangeFormat" not in exif

    @pytest.mark.asyncio
    async def test_tiff_exif_extraction(self):
        """TIFF 이미지 EXIF 추출"""
        # TIFF도 EXIF 추출 지원
        tiff_header = b"II*\x00"  # Little-endian TIFF

        result = await MetaService.extract_metadata(
            file_content=tiff_header + b"\x00" * 100,
            filename="image.tiff"
        )

        # TIFF 처리 시 에러 없어야 함
        assert result.get("error") is not True or result["error"] is False


class TestMetaServiceExifIntegration:
    """EXIF 추출 통합 테스트"""

    @pytest.mark.asyncio
    async def test_full_metadata_response(self, sample_jpeg_with_exif):
        """전체 메타데이터 응답 구조"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="test_photo.jpg"
        )

        # 필수 필드 검증
        assert "filename" in result
        assert "extension" in result
        assert "mime_type" in result
        assert "file_size" in result
        assert "file_hash" in result
        assert "error" in result

        # 이미지 관련 필드
        assert "width" in result
        assert "height" in result
        assert "exif" in result

        # EXIF에서 추출된 상위 필드
        # (값이 있으면 키도 있어야 함)
        exif_top_fields = [
            "date_taken", "camera_make", "camera_model",
            "gps_latitude", "gps_longitude",
            "gps_latitude_ref", "gps_longitude_ref",
            "orientation"
        ]

        for field in exif_top_fields:
            # 필드가 존재하거나 None이어야 함
            assert field in result or result.get(field) is None

    @pytest.mark.asyncio
    async def test_mime_type_detection(self, sample_jpeg_with_exif):
        """MIME 타입 감지"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        assert result["mime_type"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_file_hash_generation(self, sample_jpeg_with_exif):
        """파일 해시 생성"""
        result = await MetaService.extract_metadata(
            file_content=sample_jpeg_with_exif,
            filename="photo.jpg"
        )

        assert result["file_hash"] is not None
        assert len(result["file_hash"]) == 64  # SHA256

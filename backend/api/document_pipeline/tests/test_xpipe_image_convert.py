"""
GIF/WebP -> PNG 변환 + Upstage OCR 미지원 이미지 처리 테스트

이슈 #31: GIF/WebP 이미지가 Upstage API 415 에러 대신 PNG 변환 후 OCR 처리되는지 검증
"""
import os
import tempfile
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from xpipe.stages.extract import (
    ExtractStage,
    UPSTAGE_UNSUPPORTED_IMAGE_EXTS,
    UNSUPPORTED_EXTENSIONS,
)


class TestImageConvertConstants:
    """상수 정의 검증"""

    def test_gif_in_unsupported_image_exts(self):
        assert ".gif" in UPSTAGE_UNSUPPORTED_IMAGE_EXTS

    def test_webp_in_unsupported_image_exts(self):
        assert ".webp" in UPSTAGE_UNSUPPORTED_IMAGE_EXTS

    def test_svg_in_unsupported_extensions(self):
        """SVG는 변환 불가 -> 보관 처리"""
        assert ".svg" in UNSUPPORTED_EXTENSIONS

    def test_jpg_png_not_in_unsupported(self):
        """JPG/PNG는 Upstage 지원 -> 변환 불필요"""
        assert ".jpg" not in UPSTAGE_UNSUPPORTED_IMAGE_EXTS
        assert ".png" not in UPSTAGE_UNSUPPORTED_IMAGE_EXTS


class TestConvertImageToPng:
    """_convert_image_to_png 단위 테스트"""

    def test_gif_converts_to_png(self):
        """GIF -> PNG 변환 성공"""
        # 1x1 빨간 GIF 생성
        try:
            from PIL import Image
        except ImportError:
            pytest.skip("Pillow not installed")

        with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as f:
            img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
            img.save(f, format="GIF")
            gif_path = f.name

        try:
            result = ExtractStage._convert_image_to_png(gif_path, "test.gif")
            assert result is not None
            assert result.endswith(".png")
            assert os.path.exists(result)

            # PNG로 읽을 수 있는지 확인
            with Image.open(result) as png:
                assert png.format == "PNG"
                assert png.size == (10, 10)

            os.unlink(result)
        finally:
            os.unlink(gif_path)

    def test_webp_converts_to_png(self):
        """WebP -> PNG 변환 성공"""
        try:
            from PIL import Image
        except ImportError:
            pytest.skip("Pillow not installed")

        with tempfile.NamedTemporaryFile(suffix=".webp", delete=False) as f:
            img = Image.new("RGBA", (10, 10), (0, 255, 0, 255))
            img.save(f, format="WEBP")
            webp_path = f.name

        try:
            result = ExtractStage._convert_image_to_png(webp_path, "test.webp")
            assert result is not None
            assert result.endswith(".png")
            assert os.path.exists(result)
            os.unlink(result)
        finally:
            os.unlink(webp_path)

    def test_invalid_file_returns_none(self):
        """손상된 파일 -> None 반환 (에러 아님)"""
        with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as f:
            f.write(b"not a gif")
            bad_path = f.name

        try:
            result = ExtractStage._convert_image_to_png(bad_path, "bad.gif")
            assert result is None
        finally:
            os.unlink(bad_path)

    def test_nonexistent_file_returns_none(self):
        """존재하지 않는 파일 -> None 반환"""
        result = ExtractStage._convert_image_to_png("/nonexistent/file.gif", "missing.gif")
        assert result is None


class TestExtractStageImageConvert:
    """ExtractStage.execute()에서 이미지 변환 분기 검증"""

    @pytest.mark.asyncio
    async def test_gif_triggers_convert_then_ocr(self):
        """GIF 파일 -> _convert_image_to_png 호출 후 OCR"""
        try:
            from PIL import Image
        except ImportError:
            pytest.skip("Pillow not installed")

        # GIF 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as f:
            img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
            img.save(f, format="GIF")
            gif_path = f.name

        try:
            stage = ExtractStage()
            context = {
                "file_path": gif_path,
                "filename": "test.gif",
                "mime_type": "image/gif",
                "mode": "stub",
                "models": {"ocr": "upstage"},
            }

            result = await stage.execute(context)

            # 변환+OCR 방식으로 처리됨
            assert result["stage_data"]["extract"]["output"]["method"] == "image_convert+ocr"
            assert result["extracted"] is True
        finally:
            os.unlink(gif_path)

    @pytest.mark.asyncio
    async def test_svg_treated_as_unsupported(self):
        """SVG -> unsupported_format으로 보관 처리"""
        stage = ExtractStage()
        context = {
            "file_path": "/fake/file.svg",
            "filename": "diagram.svg",
            "mime_type": "image/svg+xml",
            "mode": "stub",
        }

        result = await stage.execute(context)

        assert result.get("unsupported_format") is True
        assert result["has_text"] is False
        assert result["stage_data"]["extract"]["output"]["skip_reason"] == "unsupported_format"

    @pytest.mark.asyncio
    async def test_jpg_no_convert(self):
        """JPG -> 변환 없이 바로 OCR"""
        stage = ExtractStage()
        context = {
            "file_path": "/fake/photo.jpg",
            "filename": "photo.jpg",
            "mime_type": "image/jpeg",
            "mode": "stub",
            "models": {"ocr": "upstage"},
        }

        result = await stage.execute(context)

        # 일반 OCR (변환 없음)
        assert result["stage_data"]["extract"]["output"]["method"] == "ocr"

    @pytest.mark.asyncio
    async def test_convert_failure_sets_error_message(self):
        """변환 실패 시 _user_error_message 설정"""
        stage = ExtractStage()
        context = {
            "file_path": "/nonexistent/bad.gif",
            "filename": "bad.gif",
            "mime_type": "image/gif",
            "mode": "real",
            "models": {"ocr": "upstage"},
        }

        result = await stage.execute(context)

        assert result.get("text_extraction_failed") is True
        assert result.get("_extraction_skip_reason") == "image_conversion_failed"
        assert "GIF" in result.get("_user_error_message", "")

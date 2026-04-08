"""
SVG 텍스트 직접 추출 + 깨진 텍스트 감지 테스트

이슈 #34: SVG OCR 시 한글 깨짐 → XML 텍스트 직접 추출 우선, OCR fallback
"""
import os
import tempfile
import pytest

from xpipe.stages.extract import ExtractStage


# ── _extract_svg_text 단위 테스트 ──


class TestExtractSvgText:
    """SVG XML에서 <text>/<tspan> 텍스트 직접 추출"""

    def test_namespace_svg_extracts_text(self):
        """표준 SVG (namespace 있음) → 텍스트 추출 성공"""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
            '<text x="10" y="20">베타 오픈</text>'
            '<text x="10" y="40">2026년 4월</text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "test.svg")
            assert "베타 오픈" in result
            assert "2026년 4월" in result
        finally:
            os.unlink(path)

    def test_no_namespace_svg_extracts_text(self):
        """비표준 SVG (namespace 없음) → 텍스트 추출 성공"""
        svg = (
            '<svg width="100" height="100">'
            '<text x="10" y="20">Hello World</text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "test.svg")
            assert "Hello World" in result
        finally:
            os.unlink(path)

    def test_tspan_text_extracted(self):
        """<tspan> 하위 요소 텍스트 추출"""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<text x="10" y="20"><tspan>첫번째</tspan><tspan>두번째</tspan></text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "test.svg")
            assert "첫번째" in result
            assert "두번째" in result
        finally:
            os.unlink(path)

    def test_tspan_tail_extracted(self):
        """<tspan> tail 텍스트 추출 (mixed content)"""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<text x="10" y="20">앞부분<tspan>중간</tspan>뒷부분</text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "test.svg")
            assert "앞부분" in result
            assert "중간" in result
            assert "뒷부분" in result
        finally:
            os.unlink(path)

    def test_no_text_elements_returns_empty(self):
        """텍스트 없는 SVG → 빈 문자열"""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<rect width="10" height="10" fill="red"/>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "test.svg")
            assert result == ""
        finally:
            os.unlink(path)

    def test_invalid_xml_returns_empty(self):
        """손상된 XML → 빈 문자열 (에러 아님)"""
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as f:
            f.write("not valid xml content <><>")
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "bad.svg")
            assert result == ""
        finally:
            os.unlink(path)

    def test_nonexistent_file_returns_empty(self):
        """존재하지 않는 파일 → 빈 문자열"""
        result = ExtractStage._extract_svg_text("/nonexistent/file.svg", "missing.svg")
        assert result == ""

    def test_xxe_doctype_blocked(self):
        """DOCTYPE 포함 SVG → 파싱 거부 (XXE 방지)"""
        svg = (
            '<?xml version="1.0"?>'
            '<!DOCTYPE svg SYSTEM "http://evil.com/xxe">'
            '<svg xmlns="http://www.w3.org/2000/svg">'
            '<text>should not parse</text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            result = ExtractStage._extract_svg_text(path, "xxe.svg")
            assert result == ""
        finally:
            os.unlink(path)


# ── _is_garbled_text 단위 테스트 ──


class TestIsGarbledText:
    """깨진 텍스트(□ 문자 다수) 감지"""

    def test_garbled_text_detected(self):
        """□ 비율 > 30% → True"""
        # 10자 중 5자가 □ (50%)
        text = "□□□□□ABCDE"
        assert ExtractStage._is_garbled_text(text) is True

    def test_normal_text_not_garbled(self):
        """정상 한글 텍스트 → False"""
        text = "이것은 정상적인 한글 텍스트입니다. 깨진 문자가 없습니다."
        assert ExtractStage._is_garbled_text(text) is False

    def test_boundary_30_percent(self):
        """정확히 30% → False (초과해야 True)"""
        # 10자 중 3자가 □ (30%)
        text = "□□□ABCDEFG"
        assert ExtractStage._is_garbled_text(text) is False

    def test_above_30_percent(self):
        """31% → True"""
        # 10자 중 4자가 □ (40%)
        text = "□□□□ABCDEF"
        assert ExtractStage._is_garbled_text(text) is True

    def test_short_text_returns_false(self):
        """10자 미만 → False (다른 로직에서 처리)"""
        text = "□□□□□"
        assert ExtractStage._is_garbled_text(text) is False

    def test_replacement_char_detected(self):
        """U+FFFD (REPLACEMENT CHARACTER) 감지"""
        text = "\ufffd\ufffd\ufffd\ufffdABCDEF"
        assert ExtractStage._is_garbled_text(text) is True

    def test_empty_text_returns_false(self):
        """빈 문자열 → False"""
        assert ExtractStage._is_garbled_text("") is False


# ── execute() 통합 테스트 ──


class TestExtractStageSvgTextParse:
    """ExtractStage.execute()에서 SVG 텍스트 직접 추출 분기"""

    @pytest.mark.asyncio
    async def test_svg_with_text_uses_svg_text_parse(self):
        """텍스트 있는 SVG → method == svg_text_parse, OCR 스킵"""
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
            '<text x="10" y="20">AIMS 마일스톤 로드맵</text>'
            '<text x="10" y="40">2026년 4월 베타 오픈</text>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            stage = ExtractStage()
            context = {
                "file_path": path,
                "filename": "roadmap.svg",
                "mime_type": "image/svg+xml",
                "mode": "stub",
                "models": {"ocr": "upstage"},
            }

            result = await stage.execute(context)

            assert result["stage_data"]["extract"]["output"]["method"] == "svg_text_parse"
            assert "AIMS 마일스톤 로드맵" in result["extracted_text"]
            assert result["has_text"] is True
            assert result["extracted"] is True
        finally:
            os.unlink(path)

    @pytest.mark.asyncio
    async def test_svg_without_text_falls_back_to_ocr(self):
        """텍스트 없는 SVG → OCR fallback (image_convert+ocr)"""
        try:
            import cairosvg
        except ImportError:
            pytest.skip("cairosvg not installed")

        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'
            '<rect width="10" height="10" fill="red"/>'
            '</svg>'
        )
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w", encoding="utf-8") as f:
            f.write(svg)
            path = f.name

        try:
            stage = ExtractStage()
            context = {
                "file_path": path,
                "filename": "shapes.svg",
                "mime_type": "image/svg+xml",
                "mode": "stub",
                "models": {"ocr": "upstage"},
            }

            result = await stage.execute(context)

            assert result["stage_data"]["extract"]["output"]["method"] == "image_convert+ocr"
            assert result["extracted"] is True
        finally:
            os.unlink(path)


class TestGarbledTextDetection:
    """OCR 후 깨진 텍스트 감지 통합 테스트"""

    @pytest.mark.asyncio
    async def test_garbled_ocr_sets_extraction_failed(self):
        """깨진 OCR 결과 → text_extraction_failed 플래그 설정"""
        try:
            from PIL import Image
        except ImportError:
            pytest.skip("Pillow not installed")

        # 작은 GIF 생성 (OCR 시 깨진 텍스트 시뮬레이션)
        with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as f:
            img = Image.new("RGBA", (10, 10), (255, 0, 0, 255))
            img.save(f, format="GIF")
            gif_path = f.name

        try:
            stage = ExtractStage()

            # _try_ocr를 모킹하여 깨진 텍스트 반환
            garbled = "□ □□ □□ 2026□ 40 - □□ 00000000 □□"

            original_try_ocr = stage._try_ocr

            async def mock_try_ocr(context, fp, fn, m, om):
                return garbled, "upstage"

            stage._try_ocr = mock_try_ocr

            context = {
                "file_path": gif_path,
                "filename": "test.gif",
                "mime_type": "image/gif",
                "mode": "real",
                "models": {"ocr": "upstage"},
            }

            result = await stage.execute(context)

            assert result.get("text_extraction_failed") is True
            assert result.get("_extraction_skip_reason") == "garbled_ocr_text"
            assert result["extracted_text"] == ""
            assert result["has_text"] is False
        finally:
            os.unlink(gif_path)

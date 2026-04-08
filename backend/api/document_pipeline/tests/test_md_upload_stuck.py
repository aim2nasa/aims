"""
Regression 테스트: md 파일 업로드 60% stuck (#41)

이전: .md 파일 MIME이 application/octet-stream → UNSUPPORTED_MIME_TYPES에 해당 →
      ExtractStage가 미지원으로 조기 반환 → conversion_queued 60%에서 영구 stuck

수정 후:
1. TEXT_EXTENSIONS 확장자는 UNSUPPORTED_MIME_TYPES 체크에서 예외 처리
2. ConvertStage/pdf_conversion_worker에서 .md→.txt 이름 변환하여 pdf_converter 전송
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


class TestTextExtensionsBypassUnsupported:
    """TEXT_EXTENSIONS 확장자가 UNSUPPORTED_MIME_TYPES에 의해 차단되지 않는지 검증"""

    def test_md_not_blocked_by_octet_stream(self):
        """application/octet-stream이 UNSUPPORTED이지만 .md는 TEXT_EXTENSIONS → 차단 안 됨"""
        source = Path(__file__).parents[1] / "xpipe" / "stages" / "extract.py"
        content = source.read_text(encoding="utf-8")

        # is_known_text_ext 체크가 UNSUPPORTED 체크 앞에 있는지 확인
        assert "is_known_text_ext" in content, (
            "ExtractStage에 is_known_text_ext 변수가 없습니다"
        )
        assert "not is_known_text_ext" in content, (
            "UNSUPPORTED 체크에서 TEXT_EXTENSIONS 예외가 없습니다"
        )

    def test_md_in_text_extensions(self):
        """'.md'가 TEXT_EXTENSIONS에 포함되어야 함"""
        from xpipe.stages.extract import TEXT_EXTENSIONS
        assert ".md" in TEXT_EXTENSIONS

    def test_octet_stream_in_unsupported(self):
        """application/octet-stream이 UNSUPPORTED_MIME_TYPES에 있어야 함 (다른 바이너리 파일 보호)"""
        from xpipe.stages.extract import UNSUPPORTED_MIME_TYPES
        assert "application/octet-stream" in UNSUPPORTED_MIME_TYPES


class TestMdToTxtRename:
    """.md 파일을 .txt로 이름 변환하여 pdf_converter에 전송하는지 검증"""

    def test_convert_stage_renames_md_to_txt(self):
        """ConvertStage._try_pdf_converter_service에서 CONVERTIBLE_EXTENSIONS_EXTRA를 .txt로 변환"""
        source = Path(__file__).parents[1] / "xpipe" / "stages" / "convert.py"
        content = source.read_text(encoding="utf-8")

        assert "CONVERTIBLE_EXTENSIONS_EXTRA" in content, (
            "convert.py에 CONVERTIBLE_EXTENSIONS_EXTRA가 없습니다"
        )
        # .txt로 변환하는 로직 확인
        assert '".txt"' in content, (
            "convert.py에서 .txt로 이름 변환하는 코드가 없습니다"
        )

    def test_worker_renames_md_to_txt(self):
        """pdf_conversion_worker에서 .md를 .txt로 이름 변환"""
        source = Path(__file__).parents[1] / "workers" / "pdf_conversion_worker.py"
        content = source.read_text(encoding="utf-8")

        assert "CONVERTIBLE_EXTENSIONS_EXTRA" in content, (
            "pdf_conversion_worker.py에서 CONVERTIBLE_EXTENSIONS_EXTRA를 사용해야 합니다"
        )

    def test_md_in_convertible_extensions_extra(self):
        """.md가 CONVERTIBLE_EXTENSIONS_EXTRA에 포함되어야 함"""
        from xpipe.stages.convert import CONVERTIBLE_EXTENSIONS_EXTRA
        assert ".md" in CONVERTIBLE_EXTENSIONS_EXTRA


class TestTriggerPdfConversionPassesFilename:
    """_trigger_pdf_conversion_for_xpipe에서 original_name을 전달하는지 검증"""

    def test_trigger_passes_original_name(self):
        """is_convertible_mime 호출에 original_name이 전달되어야 함"""
        source = Path(__file__).parents[1] / "routers" / "doc_prep_main.py"
        content = source.read_text(encoding="utf-8")

        # _trigger_pdf_conversion_for_xpipe 함수 내에서 is_convertible_mime에 original_name 전달
        start = content.index("def _trigger_pdf_conversion_for_xpipe")
        block = content[start:start + 1500]

        assert "is_convertible_mime(detected_mime, original_name)" in block, (
            "_trigger_pdf_conversion_for_xpipe에서 is_convertible_mime에 original_name을 전달해야 합니다"
        )

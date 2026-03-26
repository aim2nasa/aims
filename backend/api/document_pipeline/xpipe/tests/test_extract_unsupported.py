"""
ExtractStage 미지원 파일 형식 / 텍스트 추출 실패 regression 테스트

검증 대상:
1. ZIP/AI 등 미지원 확장자 → RuntimeError 없이 unsupported_format 플래그 설정
2. 미지원 MIME 타입 → RuntimeError 없이 unsupported_format 플래그 설정
3. 텍스트 0자 파일 (real 모드) → RuntimeError 없이 text_extraction_failed 플래그 설정
4. stub 모드에서는 기존 동작 유지 (빈 텍스트 허용, 플래그 미설정)
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Any

import pytest

from xpipe.stages.extract import (
    ExtractStage,
    UNSUPPORTED_EXTENSIONS,
    UNSUPPORTED_MIME_TYPES,
)


def _run(coro):
    """비동기 코루틴을 동기로 실행"""
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# 1. 미지원 확장자 → unsupported_format 플래그 (에러 아님)
# ---------------------------------------------------------------------------

class TestUnsupportedExtensions:
    """미지원 확장자 파일이 RuntimeError 없이 보관 처리되는지 검증"""

    @pytest.mark.parametrize("ext", sorted(UNSUPPORTED_EXTENSIONS))
    def test_unsupported_ext_sets_flag_stub(self, ext):
        """stub 모드: 미지원 확장자 → unsupported_format 플래그"""
        stage = ExtractStage()
        context = {
            "filename": f"test_file{ext}",
            "mime_type": "application/octet-stream",
            "file_path": "/tmp/nonexistent",
            "mode": "stub",
        }
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True
        assert result.get("extracted_text") == ""
        assert result.get("has_text") is False
        assert result.get("extracted") is True
        # stage_data에 skip_reason 기록
        extract_data = result.get("stage_data", {}).get("extract", {})
        assert extract_data.get("output", {}).get("skip_reason") == "unsupported_format"
        assert extract_data.get("output", {}).get("method") == "unsupported_format"

    @pytest.mark.parametrize("ext", sorted(UNSUPPORTED_EXTENSIONS))
    def test_unsupported_ext_sets_flag_real(self, ext):
        """real 모드: 미지원 확장자 → unsupported_format 플래그 (RuntimeError 아님)"""
        stage = ExtractStage()
        context = {
            "filename": f"test_file{ext}",
            "mime_type": "application/octet-stream",
            "file_path": "/tmp/nonexistent",
            "mode": "real",
        }
        # RuntimeError가 발생하지 않아야 한다
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True
        assert result.get("has_text") is False

    def test_zip_file_no_error(self):
        """ZIP 파일이 xPipe ExtractStage에서 RuntimeError 없이 보관 처리되는지"""
        stage = ExtractStage()
        context = {
            "filename": "archive.zip",
            "mime_type": "application/zip",
            "file_path": "/tmp/archive.zip",
            "mode": "real",
        }
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True
        assert result.get("extracted_text") == ""

    def test_ai_file_no_error(self):
        """AI(Adobe Illustrator) 파일이 RuntimeError 없이 보관 처리되는지"""
        stage = ExtractStage()
        context = {
            "filename": "design.ai",
            "mime_type": "application/postscript",
            "file_path": "/tmp/design.ai",
            "mode": "real",
        }
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True


# ---------------------------------------------------------------------------
# 2. 미지원 MIME 타입 → unsupported_format 플래그
# ---------------------------------------------------------------------------

class TestUnsupportedMimeTypes:
    """미지원 MIME 타입이 RuntimeError 없이 보관 처리되는지 검증"""

    @pytest.mark.parametrize("mime", sorted(UNSUPPORTED_MIME_TYPES))
    def test_unsupported_mime_sets_flag(self, mime):
        """미지원 MIME → unsupported_format 플래그"""
        stage = ExtractStage()
        context = {
            "filename": "unknown_file.bin",
            "mime_type": mime,
            "file_path": "/tmp/unknown",
            "mode": "real",
        }
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True

    def test_x_zip_compressed_no_error(self):
        """application/x-zip-compressed (Windows 변형) MIME이 unsupported로 처리되는지"""
        stage = ExtractStage()
        context = {
            "filename": "archive.zip",
            "mime_type": "application/x-zip-compressed",
            "file_path": "/tmp/archive.zip",
            "mode": "real",
        }
        result = _run(stage.execute(context))

        assert result.get("unsupported_format") is True
        assert result.get("text_extraction_failed") is True


# ---------------------------------------------------------------------------
# 3. 텍스트 0자 (real 모드) → text_extraction_failed (에러 아님)
# ---------------------------------------------------------------------------

class TestTextExtractionFailed:
    """텍스트 0자 파일이 에러 대신 보관 처리되는지 검증"""

    def test_empty_text_real_mode_no_error(self):
        """real 모드에서 텍스트 추출 결과가 0자 → RuntimeError 없이 플래그 설정"""
        # 빈 텍스트 파일을 생성하여 테스트
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("")  # 빈 파일
            tmp_path = f.name

        try:
            stage = ExtractStage()
            context = {
                "filename": "empty.txt",
                "mime_type": "text/plain",
                "file_path": tmp_path,
                "mode": "real",
            }
            result = _run(stage.execute(context))

            assert result.get("text_extraction_failed") is True
            assert result.get("_extraction_skip_reason") == "no_text_extractable"
            assert result.get("has_text") is False
            # unsupported_format은 설정되지 않아야 함 (텍스트 파일은 지원 형식)
            assert result.get("unsupported_format") is None
        finally:
            os.unlink(tmp_path)

    def test_unknown_format_real_mode_no_error(self):
        """알 수 없는 형식(unknown) real 모드에서 빈 텍스트 → 플래그 설정"""
        stage = ExtractStage()
        context = {
            "filename": "data.custom",
            "mime_type": "application/x-custom-format",
            "file_path": "/tmp/data.custom",
            "mode": "real",
        }
        result = _run(stage.execute(context))

        assert result.get("text_extraction_failed") is True
        assert result.get("_extraction_skip_reason") == "no_text_extractable"


# ---------------------------------------------------------------------------
# 4. stub 모드 기존 동작 유지
# ---------------------------------------------------------------------------

class TestStubModePreserved:
    """stub 모드에서 기존 동작이 유지되는지 검증"""

    def test_stub_mode_empty_text_no_flag(self):
        """stub 모드: 빈 텍스트도 text_extraction_failed 없이 통과"""
        stage = ExtractStage()
        context = {
            "filename": "scan.pdf",
            "mime_type": "application/pdf",
            "file_path": "/tmp/nonexistent.pdf",
            "mode": "stub",
        }
        result = _run(stage.execute(context))

        # stub 모드에서 PDF 텍스트 0자는 플래그 없이 그냥 통과
        assert result.get("text_extraction_failed") is None
        assert result.get("extracted") is True

    def test_stub_mode_text_file_with_content(self):
        """stub 모드: 텍스트 있는 파일은 정상 추출"""
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("Hello, World!")
            tmp_path = f.name

        try:
            stage = ExtractStage()
            context = {
                "filename": "hello.txt",
                "mime_type": "text/plain",
                "file_path": tmp_path,
                "mode": "stub",
            }
            result = _run(stage.execute(context))

            assert result.get("extracted_text") == "Hello, World!"
            assert result.get("has_text") is True
            assert result.get("text_extraction_failed") is None
        finally:
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# 5. 정상 파일은 영향 없음 (regression 방어)
# ---------------------------------------------------------------------------

class TestNormalFilesUnaffected:
    """정상 파일(PDF, 텍스트 등)의 추출 동작이 변경되지 않았는지 검증"""

    def test_text_file_with_content_real_mode(self):
        """real 모드: 텍스트 있는 파일은 정상 추출 (플래그 없음)"""
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("정상 텍스트 내용입니다.")
            tmp_path = f.name

        try:
            stage = ExtractStage()
            context = {
                "filename": "normal.txt",
                "mime_type": "text/plain",
                "file_path": tmp_path,
                "mode": "real",
            }
            result = _run(stage.execute(context))

            assert result.get("extracted_text") == "정상 텍스트 내용입니다."
            assert result.get("has_text") is True
            assert result.get("text_extraction_failed") is None
            assert result.get("unsupported_format") is None
        finally:
            os.unlink(tmp_path)

    def test_supported_extensions_not_blocked(self):
        """지원되는 확장자(.pdf, .hwp, .jpg 등)는 미지원 필터에 걸리지 않음"""
        supported = [".pdf", ".hwp", ".doc", ".docx", ".pptx", ".jpg", ".png", ".txt"]
        for ext in supported:
            assert ext not in UNSUPPORTED_EXTENSIONS, f"{ext}가 UNSUPPORTED_EXTENSIONS에 포함됨"

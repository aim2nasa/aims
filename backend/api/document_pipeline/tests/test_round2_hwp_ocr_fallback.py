"""
라운드 2 regression 테스트
- HWP 타임아웃 값 확인
- OCR fallback 마커(ocr_fallback_needed) 설정 확인
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId


# ========================================
# 수정 1: HWP 타임아웃 값 검증
# ========================================

class TestHwpConvertTimeout:
    """HWP 변환 타임아웃이 120초(2분)인지 확인"""

    def test_hwp_timeout_is_120_seconds(self):
        """HWP_CONVERT_TIMEOUT_MS가 120000(2분)이어야 한다"""
        convert_file = Path(__file__).parents[4] / "tools" / "convert" / "convert2pdf.js"
        content = convert_file.read_text(encoding="utf-8")
        assert "HWP_CONVERT_TIMEOUT_MS = 120000" in content, (
            "HWP_CONVERT_TIMEOUT_MS는 120000(2분)이어야 합니다"
        )

    def test_hwp_timeout_not_60_seconds(self):
        """이전 값(60초)이 아닌지 확인"""
        convert_file = Path(__file__).parents[4] / "tools" / "convert" / "convert2pdf.js"
        content = convert_file.read_text(encoding="utf-8")
        assert "HWP_CONVERT_TIMEOUT_MS = 60000" not in content, (
            "HWP_CONVERT_TIMEOUT_MS가 아직 60000(1분)입니다. 120000으로 변경 필요"
        )


# ========================================
# 수정 2: OCR fallback 마커 설정 검증
# ========================================

class TestOcrFallbackMarker:
    """변환 성공 + 텍스트 0자일 때 ocr_fallback_needed 마커 설정 확인"""

    @pytest.fixture
    def mock_settings(self):
        with patch("workers.pdf_conversion_worker.get_settings") as mock:
            mock.return_value = MagicMock(
                UPLOAD_DIR="/data/files",
                PDF_CONVERTER_URL="http://localhost:8005",
            )
            yield mock.return_value

    @pytest.fixture
    def worker(self, mock_settings):
        from workers.pdf_conversion_worker import PdfConversionWorker
        w = PdfConversionWorker.__new__(PdfConversionWorker)
        w._running = True
        return w

    @pytest.mark.asyncio
    async def test_empty_text_sets_ocr_fallback_needed(self, worker):
        """변환 PDF에서 텍스트가 0자이면 ocr_fallback_needed: True를 설정해야 한다"""
        document_id = str(ObjectId())
        pdf_path = "/data/files/test.pdf"

        mock_files_col = AsyncMock()
        # find_one 반환: 기존 텍스트 없음
        mock_files_col.find_one.return_value = {
            "_id": ObjectId(document_id),
            "meta": {},
            "ocr": {},
        }

        with patch("workers.pdf_conversion_worker.os.path.exists", return_value=True), \
             patch("builtins.open", MagicMock()), \
             patch.object(worker, "_extract_text_from_pdf_bytes", return_value=""), \
             patch.object(worker, "_enqueue_ocr_fallback", new_callable=AsyncMock) as mock_enqueue:

            result = await worker._extract_and_update_text(
                document_id, pdf_path, mock_files_col
            )

            assert result is False

            # update_one 호출 확인: ocr_fallback_needed 마커
            mock_files_col.update_one.assert_called_once()
            call_args = mock_files_col.update_one.call_args
            set_fields = call_args[0][1]["$set"]
            assert "meta.ocr_fallback_needed" in set_fields
            assert set_fields["meta.ocr_fallback_needed"] is True

            # OCR 큐 등록 확인
            mock_enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_empty_text_does_not_set_text_extraction_failed(self, worker):
        """변환 PDF 텍스트 0자일 때 text_extraction_failed를 설정하면 안 된다"""
        document_id = str(ObjectId())
        pdf_path = "/data/files/test.pdf"

        mock_files_col = AsyncMock()
        mock_files_col.find_one.return_value = {
            "_id": ObjectId(document_id),
            "meta": {},
            "ocr": {},
        }

        with patch("workers.pdf_conversion_worker.os.path.exists", return_value=True), \
             patch("builtins.open", MagicMock()), \
             patch.object(worker, "_extract_text_from_pdf_bytes", return_value="   "), \
             patch.object(worker, "_enqueue_ocr_fallback", new_callable=AsyncMock):

            result = await worker._extract_and_update_text(
                document_id, pdf_path, mock_files_col
            )

            assert result is False
            call_args = mock_files_col.update_one.call_args
            set_fields = call_args[0][1]["$set"]
            # text_extraction_failed가 아니라 ocr_fallback_needed여야 함
            assert "meta.text_extraction_failed" not in set_fields

    @pytest.mark.asyncio
    async def test_missing_pdf_still_sets_text_extraction_failed(self, worker):
        """변환 PDF 파일이 존재하지 않으면 기존대로 text_extraction_failed를 설정해야 한다"""
        document_id = str(ObjectId())
        pdf_path = "/data/files/nonexistent.pdf"

        mock_files_col = AsyncMock()
        mock_files_col.find_one.return_value = {
            "_id": ObjectId(document_id),
            "meta": {},
            "ocr": {},
        }

        with patch("workers.pdf_conversion_worker.os.path.exists", return_value=False):

            result = await worker._extract_and_update_text(
                document_id, pdf_path, mock_files_col
            )

            assert result is False
            call_args = mock_files_col.update_one.call_args
            set_fields = call_args[0][1]["$set"]
            assert "meta.text_extraction_failed" in set_fields
            assert set_fields["meta.text_extraction_failed"] is True

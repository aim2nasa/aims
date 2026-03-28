"""
대용량 PDF OCR 분할 처리 테스트
@since 2026-03-28

AC 기반:
  AC#1: 30MB+ PDF → 10페이지씩 자동 분할 OCR
  AC#2: 분할 OCR 결과 페이지 순서대로 합침
  AC#3: OCR 완료 후 summarize_text 자동 실행
  AC#6: 30MB 미만 PDF → 기존 로직 (분할 없음)
"""
import pytest
import os
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock, PropertyMock

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.upstage_service import UpstageService


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def upstage_service():
    """UpstageService 인스턴스"""
    with patch("services.upstage_service.get_settings") as mock_settings:
        mock_settings.return_value.UPSTAGE_API_KEY = "test-api-key"
        service = UpstageService()
        yield service


@pytest.fixture
def small_pdf_path(tmp_path):
    """5MB 소형 PDF (분할 불필요)"""
    pdf = tmp_path / "small.pdf"
    pdf.write_bytes(b"%PDF-1.4\n" + b"x" * (5 * 1024 * 1024) + b"\n%%EOF")
    return str(pdf)


@pytest.fixture
def large_pdf_path(tmp_path):
    """38MB 대형 PDF (분할 필요)"""
    pdf = tmp_path / "large.pdf"
    pdf.write_bytes(b"%PDF-1.4\n" + b"x" * (38 * 1024 * 1024) + b"\n%%EOF")
    return str(pdf)


def _make_fitz_mock(total_pages: int):
    """fitz.Document context manager mock 생성 헬퍼"""
    mock_doc = MagicMock()
    mock_doc.__len__ = lambda self: total_pages
    mock_doc.__enter__ = MagicMock(return_value=mock_doc)
    mock_doc.__exit__ = MagicMock(return_value=False)
    mock_doc.select = MagicMock()
    mock_doc.tobytes = MagicMock(return_value=b"fake_pdf_bytes")
    mock_doc.close = MagicMock()
    return mock_doc


def _make_ocr_success(text: str, pages: int = 1, confidence: float = 0.9):
    """OCR 성공 응답 생성 헬퍼"""
    return {
        "error": False,
        "status": 200,
        "userMessage": "OCR 성공",
        "confidence": confidence,
        "full_text": text,
        "num_pages": pages,
        "pages": [{"page": i + 1, "text": f"chunk_{i}"} for i in range(pages)]
    }


# =============================================================================
# AC#1: 30MB+ PDF → 자동 분할 OCR
# =============================================================================

class TestLargePdfTriggersChunkedOcr:
    """AC#1: 파일 크기 > 30MB이면 분할 OCR 실행"""

    @pytest.mark.asyncio
    async def test_large_pdf_calls_chunked_ocr(self, upstage_service, large_pdf_path):
        """30MB+ PDF → _process_ocr_chunked 호출"""
        with patch.object(upstage_service, "_process_ocr_chunked", new_callable=AsyncMock) as mock_chunked:
            mock_chunked.return_value = _make_ocr_success("분할 OCR 결과", pages=25)

            result = await upstage_service.process_ocr_large(large_pdf_path)

            mock_chunked.assert_called_once()
            assert result["error"] is False
            assert result["full_text"] == "분할 OCR 결과"

    @pytest.mark.asyncio
    async def test_chunked_ocr_splits_by_10_pages(self, upstage_service):
        """25페이지 PDF → 3청크 (10+10+5)"""
        mock_doc = _make_fitz_mock(25)
        chunk_call_count = 0

        async def mock_process_ocr(content, filename):
            nonlocal chunk_call_count
            chunk_call_count += 1
            return _make_ocr_success(f"chunk_{chunk_call_count}_text", pages=1)

        with patch("fitz.open", return_value=mock_doc), \
             patch.object(upstage_service, "process_ocr", side_effect=mock_process_ocr):

            result = await upstage_service._process_ocr_chunked(
                file_path="/fake/large.pdf",
                chunk_size=10
            )

            # 3번 호출 (10+10+5)
            assert chunk_call_count == 3

    @pytest.mark.asyncio
    async def test_exact_10_pages_no_split(self, upstage_service):
        """정확히 10페이지 → 1청크 (분할 없이 통째)"""
        mock_doc = _make_fitz_mock(10)
        call_count = 0

        async def mock_process_ocr(content, filename):
            nonlocal call_count
            call_count += 1
            return _make_ocr_success("single_chunk", pages=10)

        with patch("fitz.open", return_value=mock_doc), \
             patch.object(upstage_service, "process_ocr", side_effect=mock_process_ocr):

            result = await upstage_service._process_ocr_chunked(
                file_path="/fake/10pages.pdf",
                chunk_size=10
            )

            assert call_count == 1


# =============================================================================
# AC#2: 분할 결과 페이지 순서대로 합침
# =============================================================================

class TestChunkedOcrMergesInOrder:
    """AC#2: 분할 OCR 텍스트가 페이지 순서대로 합쳐짐"""

    @pytest.mark.asyncio
    async def test_text_merged_in_page_order(self, upstage_service):
        """3청크 텍스트가 순서대로 합쳐짐"""
        mock_doc = _make_fitz_mock(25)
        call_idx = 0
        chunk_texts = ["첫번째_청크_텍스트", "두번째_청크_텍스트", "세번째_청크_텍스트"]

        async def mock_process_ocr(content, filename):
            nonlocal call_idx
            text = chunk_texts[call_idx]
            call_idx += 1
            return _make_ocr_success(text, pages=1)

        with patch("fitz.open", return_value=mock_doc), \
             patch.object(upstage_service, "process_ocr", side_effect=mock_process_ocr):

            result = await upstage_service._process_ocr_chunked(
                file_path="/fake/large.pdf",
                chunk_size=10
            )

            assert result["error"] is False
            full_text = result["full_text"]
            # 순서 검증: 첫번째 < 두번째 < 세번째
            idx1 = full_text.index("첫번째_청크_텍스트")
            idx2 = full_text.index("두번째_청크_텍스트")
            idx3 = full_text.index("세번째_청크_텍스트")
            assert idx1 < idx2 < idx3

    @pytest.mark.asyncio
    async def test_total_pages_summed(self, upstage_service):
        """총 페이지 수 = 각 청크 페이지 합계"""
        mock_doc = _make_fitz_mock(25)
        call_idx = 0
        pages_per_chunk = [10, 10, 5]

        async def mock_process_ocr(content, filename):
            nonlocal call_idx
            p = pages_per_chunk[call_idx]
            call_idx += 1
            return _make_ocr_success(f"text_{call_idx}", pages=p)

        with patch("fitz.open", return_value=mock_doc), \
             patch.object(upstage_service, "process_ocr", side_effect=mock_process_ocr):

            result = await upstage_service._process_ocr_chunked(
                file_path="/fake/large.pdf",
                chunk_size=10
            )

            assert result["num_pages"] == 25


# =============================================================================
# AC#3: OCR 완료 후 summarize_text 실행 (OCR Worker 레벨)
# =============================================================================

class TestSummarizeAfterChunkedOcr:
    """AC#3: 분할 OCR 완료 후 AI 요약/분류 실행"""

    @pytest.mark.asyncio
    async def test_summarize_called_after_chunked_ocr(self):
        """분할 OCR로 텍스트 추출 후 summarize_text 호출"""
        from workers.ocr_worker import OCRWorker

        worker = OCRWorker()

        ocr_text = "건강검진 결과 보고서입니다. 혈압 정상, 혈당 정상 범위입니다." * 10

        with patch.object(worker.upstage_service, "process_ocr_large", new_callable=AsyncMock) as mock_ocr, \
             patch.object(worker.openai_service, "summarize_text", new_callable=AsyncMock) as mock_summarize, \
             patch("os.path.exists", return_value=True), \
             patch("os.path.getsize", return_value=38 * 1024 * 1024):

            mock_ocr.return_value = _make_ocr_success(ocr_text, pages=25)
            mock_summarize.return_value = {
                "summary": "건강검진 결과",
                "document_type": "health_checkup",
                "confidence": 0.95,
                "title": "건강검진 결과 보고서"
            }

            result = await worker._process_ocr(
                "/fake/large.pdf",
                owner_id="test_owner",
                doc_id="test_doc",
                original_name="건강검진.pdf",
                customer_name="[고객명]"
            )

            assert result["error"] is False
            assert result["document_type"] == "health_checkup"
            mock_summarize.assert_called_once()


# =============================================================================
# AC#6: 30MB 미만 → 기존 로직 (분할 없음)
# =============================================================================

class TestSmallPdfNoSplit:
    """AC#6: 소형 PDF는 기존 process_ocr 사용"""

    @pytest.mark.asyncio
    async def test_small_pdf_uses_original_process_ocr(self, upstage_service, small_pdf_path):
        """5MB PDF → process_ocr 직접 호출 (분할 안 함)"""
        with patch.object(upstage_service, "process_ocr", new_callable=AsyncMock) as mock_ocr, \
             patch.object(upstage_service, "_process_ocr_chunked", new_callable=AsyncMock) as mock_chunked:

            mock_ocr.return_value = _make_ocr_success("일반 OCR 결과", pages=3)

            result = await upstage_service.process_ocr_large(small_pdf_path)

            mock_ocr.assert_called_once()
            mock_chunked.assert_not_called()
            assert result["full_text"] == "일반 OCR 결과"

    @pytest.mark.asyncio
    async def test_non_pdf_file_uses_original_process_ocr(self, upstage_service, tmp_path):
        """이미지 파일 → 분할 불가, 기존 process_ocr 사용"""
        img_path = tmp_path / "photo.jpg"
        img_path.write_bytes(b"\xff\xd8\xff" + b"x" * (35 * 1024 * 1024))

        with patch.object(upstage_service, "process_ocr", new_callable=AsyncMock) as mock_ocr, \
             patch.object(upstage_service, "_process_ocr_chunked", new_callable=AsyncMock) as mock_chunked:

            mock_ocr.return_value = _make_ocr_success("이미지 OCR", pages=1)

            result = await upstage_service.process_ocr_large(str(img_path))

            mock_ocr.assert_called_once()
            mock_chunked.assert_not_called()


# =============================================================================
# 엣지 케이스: 청크 중 일부 실패
# =============================================================================

class TestChunkedOcrPartialFailure:
    """분할 OCR 중 일부 청크 실패 시 처리"""

    @pytest.mark.asyncio
    async def test_one_chunk_fails_returns_error(self, upstage_service):
        """3청크 중 2번째 실패 → 전체 에러"""
        mock_doc = _make_fitz_mock(25)
        call_idx = 0

        async def mock_process_ocr(content, filename):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 2:
                return {"error": True, "status": 400, "userMessage": "OCR 실패"}
            return _make_ocr_success(f"chunk_{call_idx}", pages=10)

        with patch("fitz.open", return_value=mock_doc), \
             patch.object(upstage_service, "process_ocr", side_effect=mock_process_ocr):

            result = await upstage_service._process_ocr_chunked(
                file_path="/fake/large.pdf",
                chunk_size=10
            )

            assert result["error"] is True
            assert "청크 2" in result["userMessage"] or "chunk" in result["userMessage"].lower()

    @pytest.mark.asyncio
    async def test_file_not_found_returns_error(self, upstage_service):
        """존재하지 않는 파일 → 에러"""
        result = await upstage_service._process_ocr_chunked(
            file_path="/nonexistent/file.pdf",
            chunk_size=10
        )

        assert result["error"] is True

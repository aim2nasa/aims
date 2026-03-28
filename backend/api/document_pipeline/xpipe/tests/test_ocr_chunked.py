"""
xPipe UpstageOCRProvider 대용량 PDF 분할 OCR 테스트
@since 2026-03-28
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


def _make_fitz_mock(total_pages: int):
    """fitz.Document context manager mock (insert_pdf 패턴 대응)

    첫 호출(file_path 인자): 원본 doc (total_pages 페이지)
    이후 호출(인자 없음): 빈 chunk_doc (insert_pdf + tobytes용)
    """
    # 원본 doc mock
    src_doc = MagicMock()
    src_doc.__len__ = lambda self: total_pages
    src_doc.__enter__ = MagicMock(return_value=src_doc)
    src_doc.__exit__ = MagicMock(return_value=False)
    src_doc.close = MagicMock()
    src_doc.insert_pdf = MagicMock()

    # 청크 doc mock
    chunk_doc = MagicMock()
    chunk_doc.insert_pdf = MagicMock()
    chunk_doc.tobytes = MagicMock(return_value=b"fake_pdf_bytes")
    chunk_doc.close = MagicMock()

    call_count = 0

    def fitz_open_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return src_doc  # 원본 doc (with doc: 블록)
        return chunk_doc    # 빈 문서 (insert_pdf용)

    return fitz_open_side_effect


@pytest.fixture
def provider():
    from xpipe.providers_builtin import UpstageOCRProvider
    return UpstageOCRProvider(api_key="test-key")


class TestLargePdfChunkedOcr:
    """30MB+ PDF 분할 OCR 테스트"""

    @pytest.mark.asyncio
    async def test_large_pdf_triggers_chunked(self, provider, tmp_path):
        """30MB+ PDF → _process_chunked 호출"""
        large_pdf = tmp_path / "large.pdf"
        large_pdf.write_bytes(b"%PDF-1.4\n" + b"x" * (35 * 1024 * 1024))

        with patch.object(provider, "_process_chunked", new_callable=AsyncMock) as mock:
            mock.return_value = {"text": "분할 결과", "pages": 25, "confidence": 0.9}
            result = await provider.process(str(large_pdf))
            mock.assert_called_once()
            assert result["text"] == "분할 결과"

    @pytest.mark.asyncio
    async def test_small_pdf_no_chunking(self, provider, tmp_path):
        """5MB PDF → 기존 단일 호출"""
        small_pdf = tmp_path / "small.pdf"
        small_pdf.write_bytes(b"%PDF-1.4\n" + b"x" * (5 * 1024 * 1024))

        with patch.object(provider, "_process_single_chunk", new_callable=AsyncMock) as mock, \
             patch.object(provider, "_process_chunked", new_callable=AsyncMock) as mock_chunked:
            mock.return_value = {"text": "단일 결과", "pages": 3, "confidence": 0.95}
            result = await provider.process(str(small_pdf))
            mock.assert_called_once()
            mock_chunked.assert_not_called()

    @pytest.mark.asyncio
    async def test_chunks_split_correctly(self, provider):
        """25페이지 → 3청크 (10+10+5)"""
        mock_doc = _make_fitz_mock(25)
        call_count = 0

        async def mock_single(content, filename):
            nonlocal call_count
            call_count += 1
            return {"text": f"chunk_{call_count}", "pages": 10 if call_count < 3 else 5, "confidence": 0.9}

        with patch("fitz.open", side_effect=mock_doc), \
             patch.object(provider, "_process_single_chunk", side_effect=mock_single):
            result = await provider._process_chunked("/fake/large.pdf")
            assert call_count == 3

    @pytest.mark.asyncio
    async def test_text_merged_in_order(self, provider):
        """텍스트가 페이지 순서대로 합쳐짐"""
        mock_doc = _make_fitz_mock(20)
        texts = ["첫번째", "두번째"]
        idx = 0

        async def mock_single(content, filename):
            nonlocal idx
            t = texts[idx]
            idx += 1
            return {"text": t, "pages": 10, "confidence": 0.9}

        with patch("fitz.open", side_effect=mock_doc), \
             patch.object(provider, "_process_single_chunk", side_effect=mock_single):
            result = await provider._process_chunked("/fake/large.pdf")
            assert result["text"].index("첫번째") < result["text"].index("두번째")

    @pytest.mark.asyncio
    async def test_total_pages_summed(self, provider):
        """총 페이지 = 각 청크 합계"""
        mock_doc = _make_fitz_mock(25)
        pages_per = [10, 10, 5]
        idx = 0

        async def mock_single(content, filename):
            nonlocal idx
            p = pages_per[idx]
            idx += 1
            return {"text": "t", "pages": p, "confidence": 0.9}

        with patch("fitz.open", side_effect=mock_doc), \
             patch.object(provider, "_process_single_chunk", side_effect=mock_single):
            result = await provider._process_chunked("/fake/large.pdf")
            assert result["pages"] == 25

    @pytest.mark.asyncio
    async def test_chunk_failure_raises(self, provider):
        """청크 실패 시 RuntimeError"""
        mock_doc = _make_fitz_mock(20)
        idx = 0

        async def mock_single(content, filename):
            nonlocal idx
            idx += 1
            if idx == 2:
                raise RuntimeError("API 오류")
            return {"text": "ok", "pages": 10, "confidence": 0.9}

        with patch("fitz.open", side_effect=mock_doc), \
             patch.object(provider, "_process_single_chunk", side_effect=mock_single):
            with pytest.raises(RuntimeError, match="API 오류"):
                await provider._process_chunked("/fake/large.pdf")

"""
문서 파이프라인 라우팅 회귀 테스트

각 파일 형식이 올바른 텍스트 추출 경로로 처리되는지 검증.
이 테스트가 실패하면 특정 형식의 문서가 잘못된 경로로 처리될 수 있음.

경로 구분:
- 경로 1: 직접 파서 (PDF→PyMuPDF, DOCX→python-docx, XLSX→openpyxl 등)
- 경로 2: PDF 변환 → PyMuPDF (HWP, DOC, PPT, ODT 등 → pdf_converter → 텍스트)
- 경로 3: OCR (이미지, 스캔 PDF → Upstage OCR)

@since 2026-02-23
@issue n8n→FastAPI 마이그레이션 시 경로 2 누락 방지
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from datetime import datetime

from services.pdf_conversion_text_service import (
    is_convertible_mime,
    CONVERTIBLE_MIMES,
)
from services.meta_service import MetaService


# ========================================
# MetaService MIME 핸들러 커버리지 테스트
# ========================================

class TestMetaServiceMimeHandlers:
    """MetaService가 각 MIME에 대해 올바른 핸들러를 사용하는지 검증"""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("mime,expected_handler", [
        # 경로 1: 직접 파서 보유 (텍스트 추출 가능)
        ("application/pdf", "_extract_pdf_info"),
        ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "_extract_xlsx_info"),
        ("application/vnd.ms-excel", "_extract_xlsx_info"),
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "_extract_docx_info"),
        ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "_extract_pptx_info"),
    ])
    async def test_direct_parser_mimes(self, mime, expected_handler):
        """직접 파서가 있는 MIME은 MetaService에 해당 핸들러 메서드가 실제로 존재해야 함
        (xpipe CONVERTIBLE_MIMES에도 포함될 수 있음 — PDF 변환은 별도 경로)"""
        assert hasattr(MetaService, expected_handler), (
            f"MetaService must have handler '{expected_handler}' for MIME '{mime}'"
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("mime", [
        "application/x-hwp",
        "application/msword",
        "application/vnd.ms-powerpoint",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.oasis.opendocument.presentation",
        "application/rtf",
    ])
    async def test_no_direct_parser_mimes_must_be_convertible(self, mime):
        """직접 파서가 없는 문서 MIME은 반드시 CONVERTIBLE_MIMES에 있어야 함"""
        # MetaService에서 이 MIME들의 텍스트 추출 결과 확인
        # (실제 파일 없이 파일 내용으로 테스트)
        result = await MetaService.extract_metadata(
            file_content=b"fake content",
            filename=f"test{_get_extension_for_mime(mime)}"
        )
        # MetaService가 텍스트를 추출하지 못해야 함 (직접 파서 없음)
        extracted_text = result.get("extracted_text")
        text_is_empty = not extracted_text or len(extracted_text.strip()) == 0

        assert text_is_empty, (
            f"MetaService should NOT be able to extract text from '{mime}' directly. "
            f"If it can, remove '{mime}' from CONVERTIBLE_MIMES."
        )
        assert is_convertible_mime(mime), (
            f"MIME '{mime}' has no direct parser — MUST be in CONVERTIBLE_MIMES "
            f"to go through PDF conversion instead of OCR"
        )


# ========================================
# 파이프라인 라우팅 통합 테스트
# ========================================

class TestPipelineRouting:
    """문서 파이프라인에서 각 형식이 올바른 경로로 처리되는지 검증"""

    @pytest.fixture
    def mock_pipeline_deps(self):
        """파이프라인 의존성 mock"""
        mocks = {}
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.RedisService") as mock_redis, \
             patch("routers.doc_prep_main.httpx") as mock_httpx, \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock) as mock_notify:

            # MongoDB mock
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            mock_insert.inserted_id = ObjectId()
            mock_collection.insert_one.return_value = mock_insert
            mock_result = MagicMock()
            mock_result.modified_count = 1
            mock_collection.update_one.return_value = mock_result
            mock_collection.find_one.return_value = None
            mock_collection.delete_one.return_value = MagicMock(deleted_count=0)
            mock_mongo.get_collection.return_value = mock_collection
            mocks["mongo_collection"] = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "saved_file.ext",
                "/data/files/saved_file.ext"
            ))
            mock_file.read_file_as_text = AsyncMock(return_value="text content")
            mocks["file_service"] = mock_file

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약", "tags": ["태그"]
            })
            mocks["openai"] = mock_openai

            # Redis mock
            mock_redis.add_to_stream = AsyncMock(return_value="msg_id")
            mocks["redis"] = mock_redis

            # httpx mock (webhook notifications)
            mock_httpx_client = AsyncMock()
            mock_httpx_response = MagicMock()
            mock_httpx_response.status_code = 200
            mock_httpx_client.post.return_value = mock_httpx_response
            mock_httpx_client.__aenter__.return_value = mock_httpx_client
            mock_httpx_client.__aexit__.return_value = None
            mock_httpx.AsyncClient.return_value = mock_httpx_client
            mocks["httpx"] = mock_httpx

            yield mocks

    @pytest.mark.asyncio
    @pytest.mark.parametrize("mime,extension", [
        ("application/x-hwp", ".hwp"),
        ("application/msword", ".doc"),
        ("application/vnd.ms-powerpoint", ".ppt"),
        ("application/vnd.oasis.opendocument.text", ".odt"),
        ("application/rtf", ".rtf"),
    ])
    async def test_convertible_formats_use_pdf_conversion(
        self, mime, extension, mock_pipeline_deps
    ):
        """
        [회귀] 변환 가능 형식은 PDF 변환 → 텍스트 추출 경로를 사용해야 함.
        OCR 큐로 전송되면 안 됨!
        """
        from routers.doc_prep_main import process_document_pipeline

        # MetaService가 텍스트를 추출하지 못하는 경우 (직접 파서 없음)
        with patch("routers.doc_prep_main.MetaService") as mock_meta:
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": f"test{extension}",
                "extension": extension,
                "mime_type": mime,
                "file_size": 1000,
                "file_hash": "abc123",
                "num_pages": None,
                "extracted_text": None,  # 직접 파서 없음 → 텍스트 없음
                "error": False,
            })

            # PDF 변환 텍스트 추출 mock → 성공
            with patch(
                "routers.doc_prep_main.convert_and_extract_text"
            ) as mock_convert:
                mock_convert.return_value = "PDF 변환으로 추출된 텍스트"

                result = await process_document_pipeline(
                    file_content=b"fake content",
                    original_name=f"test{extension}",
                    user_id="test_user",
                    customer_id=None,
                    source_path=None,
                )

                # PDF 변환 텍스트 추출이 호출되어야 함
                mock_convert.assert_called_once()

                # OCR 큐에 추가되지 않아야 함
                mock_pipeline_deps["redis"].add_to_stream.assert_not_called()

                # 결과가 성공이어야 함
                assert result.get("status") == "completed" or result.get("result") == "success"

    @pytest.mark.asyncio
    async def test_hwp_with_conversion_failure_skips_ocr_and_archives(
        self, mock_pipeline_deps
    ):
        """PDF 변환 실패한 HWP는 OCR에 보내지 않고 보관 처리"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("routers.doc_prep_main.MetaService") as mock_meta:
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.hwp",
                "extension": ".hwp",
                "mime_type": "application/x-hwp",
                "file_size": 1000,
                "file_hash": "abc123",
                "num_pages": None,
                "extracted_text": None,
                "error": False,
            })

            with patch(
                "routers.doc_prep_main.convert_and_extract_text"
            ) as mock_convert:
                mock_convert.return_value = None  # 변환 실패

                result = await process_document_pipeline(
                    file_content=b"fake content",
                    original_name="test.hwp",
                    user_id="test_user",
                    customer_id=None,
                    source_path=None,
                )

                # PDF 변환 시도함
                mock_convert.assert_called_once()

                # 변환 실패한 HWP → OCR 큐로 보내지 않음 (보관 처리)
                mock_pipeline_deps["redis"].add_to_stream.assert_not_called()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("mime,extension", [
        ("application/pdf", ".pdf"),
        ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
        ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
        ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"),
    ])
    async def test_direct_parser_formats_skip_conversion(
        self, mime, extension, mock_pipeline_deps
    ):
        """직접 파서가 있는 형식은 PDF 변환을 사용하지 않아야 함"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("routers.doc_prep_main.MetaService") as mock_meta:
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": f"test{extension}",
                "extension": extension,
                "mime_type": mime,
                "file_size": 1000,
                "file_hash": "abc123",
                "num_pages": 5,
                "extracted_text": "직접 파서로 추출된 텍스트",
                "error": False,
            })

            with patch(
                "routers.doc_prep_main.convert_and_extract_text"
            ) as mock_convert:
                result = await process_document_pipeline(
                    file_content=b"fake content",
                    original_name=f"test{extension}",
                    user_id="test_user",
                    customer_id=None,
                    source_path=None,
                )

                # PDF 변환이 호출되지 않아야 함 (직접 파서로 텍스트 추출 성공)
                mock_convert.assert_not_called()

                # OCR 큐에도 추가되지 않아야 함
                mock_pipeline_deps["redis"].add_to_stream.assert_not_called()

    @pytest.mark.asyncio
    async def test_image_goes_to_ocr_not_conversion(self, mock_pipeline_deps):
        """이미지 파일은 PDF 변환이 아닌 OCR로 처리되어야 함"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("routers.doc_prep_main.MetaService") as mock_meta:
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "photo.jpg",
                "extension": ".jpg",
                "mime_type": "image/jpeg",
                "file_size": 5000,
                "file_hash": "img123",
                "num_pages": None,
                "extracted_text": None,
                "width": 1920,
                "height": 1080,
                "error": False,
            })

            with patch(
                "routers.doc_prep_main.convert_and_extract_text"
            ) as mock_convert:
                result = await process_document_pipeline(
                    file_content=b"fake image",
                    original_name="photo.jpg",
                    user_id="test_user",
                    customer_id=None,
                    source_path=None,
                )

                # 이미지는 PDF 변환 대상 아님
                mock_convert.assert_not_called()

                # OCR 큐로 전송되어야 함
                mock_pipeline_deps["redis"].add_to_stream.assert_called_once()


# ========================================
# 헬퍼 함수
# ========================================

def _get_extension_for_mime(mime: str) -> str:
    """MIME → 확장자 매핑"""
    mapping = {
        "application/x-hwp": ".hwp",
        "application/msword": ".doc",
        "application/vnd.ms-powerpoint": ".ppt",
        "application/vnd.oasis.opendocument.text": ".odt",
        "application/vnd.oasis.opendocument.spreadsheet": ".ods",
        "application/vnd.oasis.opendocument.presentation": ".odp",
        "application/rtf": ".rtf",
    }
    return mapping.get(mime, ".bin")

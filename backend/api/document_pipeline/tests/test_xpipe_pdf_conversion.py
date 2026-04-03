"""
xPipe 경로 비PDF 파일 PDF 변환 큐 등록 회귀 테스트

수정: _process_via_xpipe() 완료 후 _trigger_pdf_conversion_for_xpipe()를 호출하여
비PDF 파일에 대해 preview_pdf 변환 큐 등록.

@since 2026-03-25
"""
import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

VALID_DOC_ID = str(ObjectId())


class TestTriggerPdfConversionForXpipe:
    """xPipe 경로에서 비PDF 파일의 PDF 변환 큐 등록 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        col = MagicMock()
        col.update_one = AsyncMock()
        col.find_one = AsyncMock(return_value=None)
        return col

    @pytest.mark.asyncio
    async def test_pdf_file_sets_not_required(self, mock_files_collection, mock_internal_api_writes):
        """PDF 파일은 conversion_status를 not_required로 설정"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        await _trigger_pdf_conversion_for_xpipe(
            doc_id=VALID_DOC_ID,
            dest_path="/data/uploads/test.pdf",
            original_name="report.pdf",
            detected_mime="application/pdf",
            files_collection=mock_files_collection,
        )

        mock_update = mock_internal_api_writes["update_file"]
        mock_update.assert_called_once()
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields == {"upload.conversion_status": "not_required"}

    @pytest.mark.asyncio
    async def test_image_file_sets_not_required(self, mock_files_collection, mock_internal_api_writes):
        """이미지 파일(JPEG)은 conversion_status를 not_required로 설정"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        await _trigger_pdf_conversion_for_xpipe(
            doc_id=VALID_DOC_ID,
            dest_path="/data/uploads/photo.jpg",
            original_name="photo.jpg",
            detected_mime="image/jpeg",
            files_collection=mock_files_collection,
        )

        mock_update = mock_internal_api_writes["update_file"]
        mock_update.assert_called_once()
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields == {"upload.conversion_status": "not_required"}

    @pytest.mark.asyncio
    async def test_png_image_sets_not_required(self, mock_files_collection, mock_internal_api_writes):
        """PNG 이미지도 not_required"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        await _trigger_pdf_conversion_for_xpipe(
            doc_id=VALID_DOC_ID,
            dest_path="/data/uploads/scan.png",
            original_name="scan.png",
            detected_mime="image/png",
            files_collection=mock_files_collection,
        )

        mock_update = mock_internal_api_writes["update_file"]
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields == {"upload.conversion_status": "not_required"}

    @pytest.mark.asyncio
    async def test_hwp_file_enqueues_preview_pdf(self, mock_files_collection, mock_internal_api_writes):
        """HWP 파일은 conversion_status를 pending으로 설정하고 변환 큐에 등록"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(return_value="queue_id_001")

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/계약서.hwp",
                original_name="계약서.hwp",
                detected_mime="application/x-hwp",
                files_collection=mock_files_collection,
            )

        # 첫 번째 호출: pending 상태 설정
        mock_update = mock_internal_api_writes["update_file"]
        first_call = mock_update.call_args_list[0]
        set_fields = first_call.kwargs.get("set_fields", {})
        assert set_fields == {"upload.conversion_status": "pending"}

        # 큐 등록 확인
        mock_queue.enqueue.assert_called_once_with(
            job_type="preview_pdf",
            input_path="/data/uploads/계약서.hwp",
            original_name="계약서.hwp",
            caller="xpipe_pipeline",
            document_id=VALID_DOC_ID,
        )

    @pytest.mark.asyncio
    async def test_docx_file_enqueues_preview_pdf(self, mock_files_collection, mock_internal_api_writes):
        """DOCX 파일은 변환 큐에 등록"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(return_value="queue_id_002")

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/문서.docx",
                original_name="문서.docx",
                detected_mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                files_collection=mock_files_collection,
            )

        mock_queue.enqueue.assert_called_once()
        call_kwargs = mock_queue.enqueue.call_args
        assert call_kwargs[1]["job_type"] == "preview_pdf"
        assert call_kwargs[1]["document_id"] == VALID_DOC_ID

    @pytest.mark.asyncio
    async def test_xlsx_file_enqueues_preview_pdf(self, mock_files_collection, mock_internal_api_writes):
        """XLSX 파일은 변환 큐에 등록"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(return_value="queue_id_003")

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/data.xlsx",
                original_name="data.xlsx",
                detected_mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                files_collection=mock_files_collection,
            )

        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_pptx_file_enqueues_preview_pdf(self, mock_files_collection, mock_internal_api_writes):
        """PPTX 파일은 변환 큐에 등록"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(return_value="queue_id_004")

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/발표.pptx",
                original_name="발표.pptx",
                detected_mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                files_collection=mock_files_collection,
            )

        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_msword_doc_enqueues_preview_pdf(self, mock_files_collection, mock_internal_api_writes):
        """구형 DOC 파일은 변환 큐에 등록"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(return_value="queue_id_005")

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/old.doc",
                original_name="old.doc",
                detected_mime="application/msword",
                files_collection=mock_files_collection,
            )

        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_unsupported_format_sets_not_required(self, mock_files_collection, mock_internal_api_writes):
        """지원하지 않는 형식(ZIP 등)은 not_required"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        await _trigger_pdf_conversion_for_xpipe(
            doc_id=VALID_DOC_ID,
            dest_path="/data/uploads/archive.zip",
            original_name="archive.zip",
            detected_mime="application/zip",
            files_collection=mock_files_collection,
        )

        mock_update = mock_internal_api_writes["update_file"]
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields == {"upload.conversion_status": "not_required"}

    @pytest.mark.asyncio
    async def test_enqueue_failure_sets_failed_status(self, mock_files_collection, mock_internal_api_writes):
        """큐 등록 실패 시 conversion_status를 failed로 설정 (pending hang 방지)"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(side_effect=RuntimeError("큐 서비스 연결 실패"))

            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/문서.hwp",
                original_name="문서.hwp",
                detected_mime="application/x-hwp",
                files_collection=mock_files_collection,
            )

        # 마지막 호출: failed 상태로 롤백
        mock_update = mock_internal_api_writes["update_file"]
        last_call = mock_update.call_args_list[-1]
        set_fields = last_call.kwargs.get("set_fields", {})
        assert set_fields["upload.conversion_status"] == "failed"
        assert "큐 서비스 연결 실패" in set_fields["upload.conversion_error"]

    @pytest.mark.asyncio
    async def test_enqueue_failure_does_not_raise(self, mock_files_collection):
        """큐 등록 실패가 예외를 전파하지 않음 (파이프라인 격리)"""
        from routers.doc_prep_main import _trigger_pdf_conversion_for_xpipe

        with patch("services.pdf_conversion_queue_service.PdfConversionQueueService") as mock_queue:
            mock_queue.enqueue = AsyncMock(side_effect=RuntimeError("서버 다운"))

            # 예외 없이 정상 반환해야 함
            await _trigger_pdf_conversion_for_xpipe(
                doc_id=VALID_DOC_ID,
                dest_path="/data/uploads/문서.doc",
                original_name="문서.doc",
                detected_mime="application/msword",
                files_collection=mock_files_collection,
            )


class TestIsPreviewNative:
    """_is_preview_native 헬퍼 함수 검증"""

    def test_pdf_is_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("application/pdf", "doc.pdf") is True

    def test_jpeg_is_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("image/jpeg", "photo.jpg") is True

    def test_png_is_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("image/png", "scan.png") is True

    def test_hwp_is_not_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("application/x-hwp", "계약서.hwp") is False

    def test_docx_is_not_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "문서.docx"
        ) is False

    def test_unknown_mime_with_pdf_extension_is_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("application/octet-stream", "report.pdf") is True

    def test_unknown_mime_with_jpg_extension_is_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("application/octet-stream", "photo.jpg") is True

    def test_octet_stream_with_hwp_extension_is_not_native(self):
        from routers.doc_prep_main import _is_preview_native
        assert _is_preview_native("application/octet-stream", "문서.hwp") is False

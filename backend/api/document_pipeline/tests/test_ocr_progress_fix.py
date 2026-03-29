"""
OCR Worker progress 갱신 + HWP→OCR 전송 방지 회귀 테스트

대상:
- OCRWorker._handle_ocr_success (ocr_worker.py): progress=100, progressStage="complete"
- OCRWorker._handle_ocr_error (ocr_worker.py): progress=-1, progressStage="error", overallStatus="error"
- process_document_pipeline (doc_prep_main.py): is_convertible_mime + 빈 텍스트 → OCR 미진입

깨지면: 395건 대량 업로드에서 167건이 progress:70에서 stuck
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from datetime import datetime

TEST_DOC_ID = "507f1f77bcf86cd799439011"
TEST_FILE_ID = "507f1f77bcf86cd799439022"
TEST_OWNER_ID = "user1"
TEST_MESSAGE_ID = "1234567890-0"


# ========================================
# OCR Worker: _handle_ocr_success
# ========================================

class TestOCRSuccessProgress:
    """OCR 성공 시 progress=100, progressStage='complete' 설정 확인"""

    def _make_msg(self):
        return {
            "message_id": TEST_MESSAGE_ID,
            "file_id": TEST_FILE_ID,
            "file_path": "/data/test.pdf",
            "doc_id": TEST_DOC_ID,
            "owner_id": TEST_OWNER_ID,
            "queued_at": datetime.utcnow().isoformat(),
        }

    def _make_ocr_result(self):
        return {
            "error": False,
            "status": 200,
            "confidence": 0.95,
            "full_text": "테스트 텍스트",
            "summary": "테스트 요약",
            "tags": ["태그1"],
            "title": "테스트 문서",
            "document_type": "general",
            "doc_confidence": 0.8,
            "num_pages": 1,
        }

    async def test_success_sets_progress_90_embed_pending(self):
        """OCR 성공 시 progress=90, progressStage='embed_pending' (임베딩 크론 대기)"""
        from workers.ocr_worker import OCRWorker

        worker = OCRWorker()
        captured_update = {}

        async def capture_update(file_id, update):
            captured_update.update(update)

        worker._update_ocr_status = capture_update
        worker._log_ocr_usage = AsyncMock()
        worker._notify_processing_complete = AsyncMock()

        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.redis_service.RedisService.ack_and_delete", new_callable=AsyncMock):
            await worker._handle_ocr_success(
                self._make_msg(), self._make_ocr_result(),
                datetime.utcnow().isoformat(), 1
            )

        # progress 필드 검증 — OCR 완료 후 임베딩 대기 (90%)
        assert captured_update.get("progress") == 90
        assert captured_update.get("progressStage") == "embed_pending"
        assert captured_update.get("progressMessage") == "OCR 완료, 임베딩 대기"
        # 기존 필드도 유지
        assert captured_update.get("ocr.status") == "done"
        assert captured_update.get("status") == "completed"
        assert captured_update.get("overallStatus") == "embed_pending"


# ========================================
# OCR Worker: _handle_ocr_error
# ========================================

class TestOCRErrorProgress:
    """OCR 실패 시 progress=-1, progressStage='error', overallStatus='error' 설정 확인"""

    def _make_msg(self):
        return {
            "message_id": TEST_MESSAGE_ID,
            "file_id": TEST_FILE_ID,
            "file_path": "/data/test.pdf",
            "doc_id": TEST_DOC_ID,
            "owner_id": TEST_OWNER_ID,
            "queued_at": datetime.utcnow().isoformat(),
        }

    async def test_error_sets_progress_minus1(self):
        """OCR 실패 시 progress=-1, progressStage='error', overallStatus='error' 설정"""
        from workers.ocr_worker import OCRWorker

        worker = OCRWorker()
        captured_update = {}

        async def capture_update(file_id, update):
            captured_update.update(update)

        worker._update_ocr_status = capture_update
        worker._log_ocr_usage = AsyncMock()
        worker._notify_processing_complete = AsyncMock()

        with patch("services.redis_service.RedisService.ack_and_delete", new_callable=AsyncMock):
            await worker._handle_ocr_error(
                self._make_msg(),
                {"status": 500, "userMessage": "OCR 타임아웃"},
                datetime.utcnow().isoformat()
            )

        # progress 에러 필드 검증
        assert captured_update.get("progress") == -1
        assert captured_update.get("progressStage") == "error"
        assert captured_update.get("progressMessage") == "OCR 처리 실패"
        assert captured_update.get("status") == "failed"
        assert captured_update.get("overallStatus") == "error"
        # 기존 필드도 유지
        assert captured_update.get("ocr.status") == "error"
        assert captured_update.get("ocr.statusCode") == 500
        assert captured_update.get("ocr.statusMessage") == "OCR 타임아웃"


# ========================================
# HWP(is_convertible_mime) + 빈 텍스트 → OCR 미진입
# ========================================

class TestConvertibleMimeNoOCR:
    """변환 가능 포맷(HWP 등)이 변환 실패 시 OCR 큐에 넣지 않고 보관 처리"""

    @pytest.fixture
    def mock_files_collection(self):
        mock = AsyncMock()
        mock.find_one = AsyncMock(return_value=None)
        mock.update_one = AsyncMock()
        mock.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock

    async def test_hwp_empty_text_skips_ocr(self, mock_files_collection):
        """HWP(is_convertible_mime=True) + 빈 텍스트 → OCR 큐 미진입 + conversion_failed 보관"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []
        progress_stages = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)
            progress_stages.append(stage)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.hwp", "/data/saved.hwp")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/x-hwp", "num_pages": 0,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.hwp",
                 "extension": "hwp", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=True), \
             patch("routers.doc_prep_main.convert_and_extract_text", return_value=None), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock) as mock_complete, \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id") as mock_redis:
            result = await process_document_pipeline(
                file_content=b"hwp bytes",
                original_name="test.hwp",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        # OCR 큐에 추가되지 않아야 함
        mock_redis.assert_not_called()

        # 결과 검증: 변환 대기 상태 (xPipe PDF 변환 큐 대기)
        assert result["status"] == "converting"
        assert result["overallStatus"] == "conversion_pending"

        # progress가 60(conversion_queued)으로 끝나야 함
        assert 60 in progress_values
        assert "conversion_queued" in progress_stages

    async def test_pdf_empty_text_still_queues_ocr(self, mock_files_collection):
        """PDF(is_convertible_mime=False) + 빈 텍스트 → 기존대로 OCR 큐 진입"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id") as mock_redis, \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            result = await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        # OCR 큐에 추가되어야 함
        mock_redis.assert_called_once()

        # progress: 60→70 (OCR 큐 경로)
        assert 60 in progress_values
        assert 70 in progress_values

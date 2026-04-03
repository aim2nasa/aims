"""
진행률 알림 회귀 테스트

대상 함수:
- _notify_progress() (doc_prep_main.py:948)
- _notify_document_complete() (doc_prep_main.py:1021)

깨지면: 사용자가 업로드 진행률을 볼 수 없음
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

TEST_DOC_ID = "507f1f77bcf86cd799439011"


# ========================================
# _notify_progress
# ========================================

class TestNotifyProgress:
    """진행률 알림 검증"""

    async def test_mongodb_updated(self, mock_internal_api_writes):
        """MongoDB에 progress 필드 업데이트 (Internal API 경유)"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=200))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _notify_progress(TEST_DOC_ID, "user1", 50, "meta", "메타 추출 중")

        mock_update = mock_internal_api_writes["update_file"]
        mock_update.assert_called_once()
        call_args = mock_update.call_args
        assert call_args[0][0] == TEST_DOC_ID
        set_fields = call_args[1]["set_fields"] if "set_fields" in call_args[1] else call_args[0][1]
        assert set_fields["progress"] == 50
        assert set_fields["progressStage"] == "meta"
        assert set_fields["progressMessage"] == "메타 추출 중"

    async def test_progress_100_sets_completed(self, mock_internal_api_writes):
        """progress=100, stage='complete' → status='completed'"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=200))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _notify_progress(TEST_DOC_ID, "user1", 100, "complete", "처리 완료")

        mock_update = mock_internal_api_writes["update_file"]
        call_args = mock_update.call_args
        set_fields = call_args[1]["set_fields"] if "set_fields" in call_args[1] else call_args[0][1]
        assert set_fields["status"] == "completed"

    async def test_progress_minus1_sets_failed(self, mock_internal_api_writes):
        """progress=-1, stage='error' → status='failed'"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=200))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _notify_progress(TEST_DOC_ID, "user1", -1, "error", "중복 파일")

        mock_update = mock_internal_api_writes["update_file"]
        call_args = mock_update.call_args
        set_fields = call_args[1]["set_fields"] if "set_fields" in call_args[1] else call_args[0][1]
        assert set_fields["status"] == "failed"
        assert set_fields["overallStatus"] == "error"
        assert "error" in set_fields
        assert set_fields["error"]["statusMessage"] == "중복 파일"

    async def test_normal_progress_no_overallStatus(self, mock_internal_api_writes):
        """일반 progress(50)에서는 overallStatus가 설정되지 않음"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=200))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _notify_progress(TEST_DOC_ID, "user1", 50, "meta", "메타 추출 중")

        mock_update = mock_internal_api_writes["update_file"]
        call_args = mock_update.call_args
        set_fields = call_args[1]["set_fields"] if "set_fields" in call_args[1] else call_args[0][1]
        assert "overallStatus" not in set_fields

    async def test_complete_progress_sets_overallStatus(self, mock_internal_api_writes):
        """progress=100 완료 시 status와 overallStatus 동시 설정"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=MagicMock(status_code=200))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await _notify_progress(TEST_DOC_ID, "user1", 100, "complete", "처리 완료")

        mock_update = mock_internal_api_writes["update_file"]
        call_args = mock_update.call_args
        set_fields = call_args[1]["set_fields"] if "set_fields" in call_args[1] else call_args[0][1]
        assert set_fields["status"] == "completed"
        assert set_fields["overallStatus"] == "completed"

    async def test_redis_event_published(self):
        """Redis 이벤트 발행 확인 (R1: webhook → Redis Pub/Sub)"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_publish:

            await _notify_progress(TEST_DOC_ID, "user1", 60, "ocr", "OCR 처리 중")

        # Redis publish 호출 확인 (DOC_PROGRESS 채널)
        assert mock_publish.call_count >= 1
        first_call = mock_publish.call_args_list[0]
        assert first_call[0][0] == "aims:doc:progress"
        payload = first_call[0][1]
        assert payload["document_id"] == TEST_DOC_ID
        assert payload["progress"] == 60
        assert payload["owner_id"] == "user1"

    async def test_error_sends_complete_event(self):
        """progress=-1 에러 시 DOC_COMPLETE 이벤트도 발행"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_publish:

            await _notify_progress(TEST_DOC_ID, "user1", -1, "error", "에러 발생")

        # publish가 두 번 호출되어야 함 (DOC_PROGRESS + DOC_COMPLETE)
        assert mock_publish.call_count >= 2
        channels = [c[0][0] for c in mock_publish.call_args_list]
        assert "aims:doc:progress" in channels
        assert "aims:doc:complete" in channels

    async def test_mongodb_error_isolated(self, mock_internal_api_writes):
        """MongoDB 오류가 Redis 이벤트 발행을 막지 않음"""
        from routers.doc_prep_main import _notify_progress

        mock_internal_api_writes["update_file"].side_effect = Exception("DB down")

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_publish:

            # 예외 발생하지 않아야 함
            await _notify_progress(TEST_DOC_ID, "user1", 50, "meta", "test")

        # Redis 이벤트는 여전히 발행됨
        mock_publish.assert_called()

    async def test_sse_error_isolated(self, mock_internal_api_writes):
        """SSE 오류가 전체 동작을 막지 않음"""
        from routers.doc_prep_main import _notify_progress

        with patch("services.mongo_service.MongoService.get_collection", return_value=AsyncMock()), \
             patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=Exception("SSE failed"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            # 예외 발생하지 않아야 함
            await _notify_progress(TEST_DOC_ID, "user1", 50, "meta", "test")

        # MongoDB는 정상 업데이트 (Internal API 경유)
        mock_internal_api_writes["update_file"].assert_called_once()


# ========================================
# _notify_document_complete
# ========================================

class TestNotifyDocumentComplete:
    """문서 완료 알림 검증"""

    async def test_completion_webhook_sends_document_id(self):
        """document-processing-complete webhook이 asyncio.create_task로 예약됨"""
        from routers.doc_prep_main import _notify_document_complete

        with patch("asyncio.create_task") as mock_create_task:
            await _notify_document_complete(TEST_DOC_ID, "user1")

        # create_task가 호출됨 (3초 지연 후 알림 전송)
        mock_create_task.assert_called_once()


# ========================================
# Progress Sequence (파이프라인 경로별)
# ========================================

class TestProgressSequence:
    """경로별 progress 순서 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.update_one = AsyncMock()
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock_collection

    async def test_pdf_text_path_progress(self, mock_files_collection):
        """PDF(텍스트 있음) 경로: 20→40→50→90→100"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "충분한 텍스트입니다", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        assert progress_values == [20, 40, 50, 90]

    async def test_ocr_path_progress(self, mock_files_collection):
        """OCR 경로(텍스트 없음): 20→40→50→60→70"""
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
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id"), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        assert progress_values == [20, 40, 50, 60, 70]

    async def test_text_plain_path_progress(self, mock_files_collection):
        """text/plain 경로: 20→40→50→60→80→100"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.txt", "/data/saved.txt")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text content", "mime_type": "text/plain", "num_pages": 0,
                 "file_hash": "abc", "file_size": 100, "filename": "test.txt",
                 "extension": "txt", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
             patch("services.file_service.FileService.read_file_as_text", return_value="text content"), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            await process_document_pipeline(
                file_content=b"text bytes",
                original_name="test.txt",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        assert progress_values == [20, 40, 50, 60, 80, 100]

    async def test_unsupported_mime_path_progress(self, mock_files_collection):
        """지원하지 않는 MIME 경로: 20→40→50→60→80→100"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.zip", "/data/saved.zip")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/zip", "num_pages": 0,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.zip",
                 "extension": "zip", "error": None,
             }), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            result = await process_document_pipeline(
                file_content=b"zip bytes",
                original_name="test.zip",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        assert progress_values == [20, 40, 50, 60, 80, 100]
        assert result["status"] == "completed"
        assert result["processingSkipReason"] == "unsupported_format"

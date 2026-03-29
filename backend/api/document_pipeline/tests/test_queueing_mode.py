"""
큐잉 모드 회귀 테스트

대상: doc_prep_main.py의 UPLOAD_QUEUE_ENABLED=True 분기
- 문서 먼저 생성 → 큐 등록 → 즉시 응답
- credit_pending 시 큐 등록 스킵
- existing_doc_id 워커 재진입 경로

깨지면: 프로덕션 기본 경로에서 모든 업로드 실패
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

TEST_DOC_ID = "507f1f77bcf86cd799439011"


# ========================================
# Queueing Mode Document Creation
# ========================================

class TestQueueingModeDocCreation:
    """큐잉 모드에서 문서 먼저 생성 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_doc_created_before_enqueue(self, client, mock_upload_queue_disabled, mock_files_collection):
        """큐 등록 전에 문서가 먼저 생성됨"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123"), \
             patch("os.path.exists", return_value=False):
            response = await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        assert response.status_code == 200
        assert mock_files_collection.insert_one.called
        data = response.json()
        assert data["document_id"] == TEST_DOC_ID

    async def test_initial_progress_10(self, client, mock_upload_queue_disabled, mock_files_collection):
        """큐잉 모드 문서의 초기 progress=10"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123"), \
             patch("os.path.exists", return_value=False):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        insert_call = mock_files_collection.insert_one.call_args[0][0]
        assert insert_call["progress"] == 10
        assert insert_call["progressStage"] == "queued"

    async def test_customer_id_stored(self, client, mock_upload_queue_disabled, mock_files_collection):
        """customerId가 문서에 저장됨"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"
        customer_oid = str(ObjectId())

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123"), \
             patch("os.path.exists", return_value=False):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1", "customerId": customer_oid},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        insert_call = mock_files_collection.insert_one.call_args[0][0]
        assert "customerId" in insert_call

    async def test_batch_id_stored(self, client, mock_upload_queue_disabled, mock_files_collection):
        """batchId가 문서에 저장됨"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123"), \
             patch("os.path.exists", return_value=False):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1", "batchId": "batch_abc"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        insert_call = mock_files_collection.insert_one.call_args[0][0]
        assert insert_call["batchId"] == "batch_abc"


# ========================================
# Queueing Mode Enqueue
# ========================================

class TestQueueingModeEnqueue:
    """큐 등록 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_enqueue_called(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 충분 시 enqueue 호출됨"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123") as mock_enqueue, \
             patch("os.path.exists", return_value=False):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        mock_enqueue.assert_called_once()

    async def test_queue_id_in_response(self, client, mock_upload_queue_disabled, mock_files_collection):
        """응답에 queue_id 포함"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123"), \
             patch("os.path.exists", return_value=False):
            response = await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        data = response.json()
        assert data["status"] == "queued"
        assert data["queue_id"] == "queue_123"

    async def test_sync_mode_when_queue_disabled(self, client, mock_upload_queue_disabled, mock_files_collection):
        """UPLOAD_QUEUE_ENABLED=False → 동기 처리 (process_document_pipeline 직접 호출)"""
        # autouse fixture는 이미 UPLOAD_QUEUE_ENABLED=False
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = False

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("routers.doc_prep_main.process_document_pipeline", return_value={
                 "result": "success", "document_id": TEST_DOC_ID,
             }) as mock_pipeline:
            response = await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        mock_pipeline.assert_called_once()
        assert response.status_code == 200

    async def test_temp_path_passed_to_enqueue(self, client, mock_upload_queue_disabled, mock_files_collection):
        """temp_path가 enqueue에 전달됨"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "key"

        with patch("routers.doc_prep_main._stream_upload_to_disk", return_value=("/tmp/stream_temp.pdf", 7)), \
             patch("routers.doc_prep_main.check_credit_for_upload", return_value={"allowed": True}), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_from_path", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.temp_file_service.TempFileService.save_from_path", return_value="/tmp/my_temp.pdf"), \
             patch("services.upload_queue_service.UploadQueueService.enqueue", return_value="queue_123") as mock_enqueue, \
             patch("os.path.exists", return_value=False):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"content", "application/pdf")},
            )

        enqueue_call = mock_enqueue.call_args
        assert enqueue_call[1]["file_data"]["temp_path"] == "/tmp/my_temp.pdf"


# ========================================
# Existing Doc ID Path (워커 재진입)
# ========================================

class TestExistingDocIdPath:
    """기존 문서 ID로 워커 재진입 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.update_one = AsyncMock()
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock_collection

    async def test_existing_doc_updates_not_inserts(self, mock_files_collection):
        """기존 문서 → insert 없이 update만"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={
                 "summary": "요약", "tags": ["tag"],
             }), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            result = await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        assert result["result"] == "success"
        assert not mock_files_collection.insert_one.called
        assert mock_files_collection.update_one.called

    async def test_existing_doc_progress_20(self, mock_files_collection):
        """기존 문서 재진입 시 progress=20으로 업데이트"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={
                 "summary": "요약", "tags": [],
             }), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
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

        # 첫 번째 update_one 호출이 progress=20 설정
        first_update = mock_files_collection.update_one.call_args_list[0]
        set_data = first_update[0][1]["$set"]
        assert set_data["progress"] == 20

    async def test_full_pipeline_runs_with_existing_doc(self, mock_files_collection):
        """기존 문서여도 전체 파이프라인(메타 추출→요약→AR감지→완료) 실행"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "충분한 텍스트입니다", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }) as mock_meta, \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={
                 "summary": "요약", "tags": [],
             }) as mock_openai, \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock) as mock_complete, \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            result = await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        mock_meta.assert_called_once()
        mock_openai.assert_called_once()
        mock_complete.assert_called_once()
        assert result["status"] == "completed"

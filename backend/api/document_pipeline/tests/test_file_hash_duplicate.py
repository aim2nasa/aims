"""
파일 해시 중복 및 고아 문서 정리 회귀 테스트

대상: process_document_pipeline() 내 중복 해시 처리 (doc_prep_main.py:1222~1252)

깨지면: 고아 문서 누적 또는 정상 문서 오삭제
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from bson import ObjectId
from datetime import datetime, timedelta

TEST_DOC_ID = "507f1f77bcf86cd799439011"


# ========================================
# Orphan Document Cleanup
# ========================================

class TestOrphanDocumentCleanup:
    """고아 문서 삭제 조건 정확성 테스트"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.update_one = AsyncMock()
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
        return mock_collection

    async def test_orphan_deleted(self, mock_files_collection):
        """고아 문서(customerId=None, 30초 이상) 삭제"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc123hash", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        # delete_one 호출 확인
        assert mock_files_collection.delete_one.called
        delete_query = mock_files_collection.delete_one.call_args[0][0]
        assert delete_query["ownerId"] == "user1"
        assert delete_query["customerId"] is None
        assert delete_query["meta.file_hash"] == "abc123hash"
        assert delete_query["_id"] == {"$ne": ObjectId(TEST_DOC_ID)}
        assert delete_query["status"] == {"$ne": "completed"}
        assert "createdAt" in delete_query

    async def test_completed_docs_protected(self, mock_files_collection):
        """status='completed' 문서는 삭제 안됨 (쿼리 조건)"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc123hash", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        delete_query = mock_files_collection.delete_one.call_args[0][0]
        assert delete_query["status"] == {"$ne": "completed"}

    async def test_current_doc_protected(self, mock_files_collection):
        """현재 문서 자체는 삭제 안됨 (쿼리 조건)"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc123hash", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        delete_query = mock_files_collection.delete_one.call_args[0][0]
        assert delete_query["_id"] == {"$ne": ObjectId(TEST_DOC_ID)}

    async def test_30_second_threshold(self, mock_files_collection):
        """30초 이내 문서는 삭제 안됨 (동시 업로드 보호)"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        delete_query = mock_files_collection.delete_one.call_args[0][0]
        assert "$lt" in str(delete_query["createdAt"])

    async def test_no_delete_when_hash_is_none(self, mock_files_collection):
        """file_hash가 None이면 삭제 시도 안함"""
        from routers.doc_prep_main import process_document_pipeline

        mock_files_collection.delete_one.reset_mock()

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": None, "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        mock_files_collection.delete_one.assert_not_called()

    async def test_other_user_docs_protected(self, mock_files_collection):
        """다른 사용자의 문서는 삭제 안됨 (ownerId 필터)"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="my_user_id",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        delete_query = mock_files_collection.delete_one.call_args[0][0]
        assert delete_query["ownerId"] == "my_user_id"


# ========================================
# DuplicateKeyError
# ========================================

class TestDuplicateKeyError:
    """DuplicateKeyError 처리 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock_collection

    async def test_duplicate_key_sets_error_progress(self, mock_files_collection):
        """DuplicateKeyError 시 progress=-1 에러 알림"""
        from routers.doc_prep_main import process_document_pipeline
        from pymongo.errors import DuplicateKeyError

        # update_one: 첫 번째 호출은 성공, meta 업데이트에서 DuplicateKeyError
        call_count = [0]
        async def side_effect_update(*args, **kwargs):
            call_count[0] += 1
            # meta 업데이트 시 DuplicateKeyError
            set_data = args[1].get("$set", {}) if len(args) > 1 else {}
            if "meta.file_hash" in set_data:
                raise DuplicateKeyError("duplicate key error")
            return MagicMock()

        mock_files_collection.update_one = AsyncMock(side_effect=side_effect_update)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock) as mock_progress, \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            with pytest.raises(Exception, match="동일한 파일이 이미 등록"):
                await process_document_pipeline(
                    file_content=b"pdf bytes",
                    original_name="test.pdf",
                    user_id="user1",
                    customer_id=None,
                    source_path=None,
                    existing_doc_id=TEST_DOC_ID,
                )

        # _notify_progress가 progress=-1, stage="error"로 호출됐는지 확인
        error_calls = [c for c in mock_progress.call_args_list if c[0][2] == -1]
        assert len(error_calls) > 0
        assert error_calls[0][0][3] == "error"


# ========================================
# File Hash Stored
# ========================================

class TestFileHashStored:
    """파일 해시 저장 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.update_one = AsyncMock()
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock_collection

    async def test_file_hash_in_meta(self, mock_files_collection):
        """meta.file_hash에 해시값 저장"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "sha256_hash_value", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
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

        # meta 업데이트에서 file_hash 확인
        for call_item in mock_files_collection.update_one.call_args_list:
            set_data = call_item[0][1].get("$set", {})
            if "meta.file_hash" in set_data:
                assert set_data["meta.file_hash"] == "sha256_hash_value"
                return
        pytest.fail("meta.file_hash was not stored in any update_one call")

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

    async def test_orphan_deleted(self, mock_files_collection, mock_internal_api_writes):
        """고아 문서(customerId=None, 30초 이상) 삭제 — Internal API delete_file_by_filter 경유"""
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

        # delete_file_by_filter 호출 확인
        mock_delete = mock_internal_api_writes["delete_file_by_filter"]
        assert mock_delete.called
        call_args = mock_delete.call_args
        assert call_args.kwargs["owner_id"] == "user1"
        assert call_args.kwargs["file_hash"] == "abc123hash"
        assert call_args.kwargs["exclude_id"] == TEST_DOC_ID

    async def test_completed_docs_protected(self, mock_files_collection, mock_internal_api_writes):
        """status='completed' 문서는 삭제 안됨 (max_status 파라미터)"""
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

        call_args = mock_internal_api_writes["delete_file_by_filter"].call_args
        assert call_args.kwargs["max_status"] == "completed"

    async def test_current_doc_protected(self, mock_files_collection, mock_internal_api_writes):
        """현재 문서 자체는 삭제 안됨 (exclude_id)"""
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

        call_args = mock_internal_api_writes["delete_file_by_filter"].call_args
        assert call_args.kwargs["exclude_id"] == TEST_DOC_ID

    async def test_30_second_threshold(self, mock_files_collection, mock_internal_api_writes):
        """30초 이내 문서는 삭제 안됨 (created_before 파라미터)"""
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

        call_args = mock_internal_api_writes["delete_file_by_filter"].call_args
        assert "created_before" in call_args.kwargs
        assert call_args.kwargs["created_before"]  # non-empty ISO string

    async def test_no_delete_when_hash_is_none(self, mock_files_collection, mock_internal_api_writes):
        """file_hash가 None이면 삭제 시도 안함"""
        from routers.doc_prep_main import process_document_pipeline

        mock_internal_api_writes["delete_file_by_filter"].reset_mock()

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

        mock_internal_api_writes["delete_file_by_filter"].assert_not_called()

    async def test_other_user_docs_protected(self, mock_files_collection, mock_internal_api_writes):
        """다른 사용자의 문서는 삭제 안됨 (owner_id 필터)"""
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

        call_args = mock_internal_api_writes["delete_file_by_filter"].call_args
        assert call_args.kwargs["owner_id"] == "my_user_id"


# ========================================
# DuplicateKeyError
# ========================================

class TestDuplicateKeyError:
    """DuplicateKeyError 자동 정리 검증 (#52-4)"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_collection.find_one = AsyncMock(return_value=None)
        mock_collection.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock_collection

    async def test_duplicate_key_returns_duplicate_skipped(self, mock_files_collection, mock_internal_api_writes):
        """DuplicateKeyError 시 에러가 아닌 duplicate_skipped 결과 반환"""
        from routers.doc_prep_main import process_document_pipeline
        from pymongo.errors import DuplicateKeyError

        # update_file: 첫 몇 호출은 성공, meta 업데이트에서 DuplicateKeyError
        async def side_effect_update(*args, **kwargs):
            set_data = kwargs.get("set_fields", {})
            if "meta.file_hash" in set_data:
                raise DuplicateKeyError("duplicate key error")
            return {"success": True, "data": {"modifiedCount": 1}}

        mock_internal_api_writes["update_file"].side_effect = side_effect_update

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.pdf",
                 "extension": "pdf", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text", return_value={"summary": "", "tags": []}), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock) as mock_progress, \
             patch("routers.doc_prep_main._cleanup_failed_document", new_callable=AsyncMock) as mock_cleanup, \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={"is_annual_report": False}), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock):
            # 에러 대신 정상 결과 반환
            result = await process_document_pipeline(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        # duplicate_skipped 결과 확인
        assert result["result"] == "duplicate_skipped"
        assert result["original_name"] == "test.pdf"

        # cleanup이 호출되었는지 확인
        mock_cleanup.assert_called_once()

        # 에러 SSE 알림이 전송되지 않았는지 확인 (progress=-1 호출 없음)
        error_calls = [c for c in mock_progress.call_args_list if c[0][2] == -1]
        assert len(error_calls) == 0, "DuplicateKeyError 시 에러 SSE 알림이 전송되면 안 됨"


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

    async def test_file_hash_in_meta(self, mock_files_collection, mock_internal_api_writes):
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

        # Internal API update_file에서 file_hash 확인
        for call_item in mock_internal_api_writes["update_file"].call_args_list:
            set_data = call_item.kwargs.get("set_fields", {})
            if "meta.file_hash" in set_data:
                assert set_data["meta.file_hash"] == "sha256_hash_value"
                return
        pytest.fail("meta.file_hash was not stored in any update_file call")

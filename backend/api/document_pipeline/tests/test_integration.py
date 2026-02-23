"""
Integration Tests for Document Pipeline
End-to-end workflow tests

Tests cover:
- Full PDF processing pipeline
- Full image processing pipeline
- n8n response format compatibility
- Concurrent upload handling
- Error recovery scenarios
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO
import asyncio
from bson import ObjectId


class TestFullPipelinePDF:
    """PDF 전체 파이프라인 통합 테스트"""

    @pytest.mark.asyncio
    async def test_text_pdf_full_flow(self, client, sample_pdf):
        """텍스트 PDF: 업로드 → 메타 추출 → 요약 생성 → 완료"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"), \
             patch("routers.doc_prep_main._notify_document_complete") as mock_notify:

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # MongoDB mock
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "20260105_full_flow.pdf",
                "/data/uploads/user/20260105_full_flow.pdf"
            ))

            # MetaService mock - Text PDF with extracted text
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_full_flow.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 50000,
                "file_hash": "fullflow123",
                "num_pages": 10,
                "extracted_text": "이 문서는 보험 계약서입니다. 계약자 정보와 보장 내용이 포함되어 있습니다.",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "보험 계약서로, 계약자 정보와 보장 내용을 담고 있습니다.",
                "tags": ["보험", "계약서", "보장"]
            })

            # Execute
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("contract.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "integration_user"}
            )

            assert response.status_code == 200
            data = response.json()

            # Full flow 검증
            assert data["result"] == "success"
            assert data["document_id"] == str(test_doc_id)
            assert data["status"] == "completed"
            assert data["meta"]["mime"] == "application/pdf"
            assert data["meta"]["pdf_pages"] == "10"

            # MongoDB 호출 순서 검증
            assert mock_collection.insert_one.called
            assert mock_collection.update_one.call_count >= 2  # upload info + meta info

            # 완료 알림 호출 확인
            mock_notify.assert_called_once()

    @pytest.mark.asyncio
    async def test_scanned_pdf_full_flow(self, client, sample_pdf):
        """스캔 PDF: 업로드 → 메타 추출 → OCR 큐 → 대기"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.RedisService") as mock_redis, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # MongoDB mock
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "20260105_scanned.pdf",
                "/data/uploads/user/20260105_scanned.pdf"
            ))

            # MetaService mock - Scanned PDF (no text)
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_scanned.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 100000,
                "file_hash": "scanned456",
                "num_pages": 5,
                "extracted_text": "",  # No text - needs OCR
                "error": None
            })

            # Redis mock
            mock_redis.add_to_stream = AsyncMock(return_value="stream_msg_id")

            # Execute
            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("scanned.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "integration_user"}
            )

            assert response.status_code == 200
            data = response.json()

            # OCR 큐 추가 확인
            assert data["result"] == "success"
            assert data["document_id"] == str(test_doc_id)
            assert data["ocr"]["status"] == "queued"

            # Redis 큐 호출 확인
            mock_redis.add_to_stream.assert_called_once()


class TestFullPipelineImage:
    """이미지 전체 파이프라인 통합 테스트"""

    @pytest.mark.asyncio
    async def test_image_full_flow(self, client, sample_image):
        """이미지: 업로드 → 메타 추출 → OCR 큐 → 대기"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.RedisService") as mock_redis, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # MongoDB mock
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "20260105_image.png",
                "/data/uploads/user/20260105_image.png"
            ))

            # MetaService mock - Image (no text)
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_image.png",
                "extension": "png",
                "mime_type": "image/png",
                "file_size": 5000,
                "file_hash": "img789",
                "num_pages": None,
                "extracted_text": "",
                "error": None
            })

            # Redis mock
            mock_redis.add_to_stream = AsyncMock(return_value="img_stream_id")

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("photo.png", sample_image.read(), "image/png")},
                data={"userId": "integration_user"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["result"] == "success"
            assert data["ocr"]["status"] == "queued"


class TestN8NResponseCompatibility:
    """n8n 응답 형식 호환성 테스트"""

    @pytest.mark.asyncio
    async def test_docprep_main_response_matches_n8n(self, client, sample_pdf):
        """DocPrepMain 응답이 n8n과 일치"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"), \
             patch("routers.doc_prep_main._notify_document_complete"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # Setup mocks
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            mock_file.save_file = AsyncMock(return_value=("test.pdf", "/path/test.pdf"))

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "num_pages": 3,
                "extracted_text": "텍스트",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약",
                "tags": ["태그"]
            })

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user"}
            )

            data = response.json()

            # n8n 응답 필수 필드 확인
            n8n_required_fields = ["result", "document_id", "status", "meta"]
            for field in n8n_required_fields:
                assert field in data, f"Missing n8n field: {field}"

            # meta 필드 내부 구조 확인
            meta_fields = ["filename", "extension", "mime", "size_bytes", "created_at"]
            for field in meta_fields:
                assert field in data["meta"], f"Missing meta field: {field}"

    @pytest.mark.asyncio
    async def test_text_plain_response_matches_n8n(self, client):
        """text/plain 응답이 n8n과 일치 (exitCode, stderr)"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            mock_file.save_file = AsyncMock(return_value=("test.txt", "/path/test.txt"))
            mock_file.read_file_as_text = AsyncMock(return_value="파일 내용")

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.txt",
                "extension": "txt",
                "mime_type": "text/plain",
                "file_size": 100,
                "extracted_text": "파일 내용",
                "error": None
            })

            text_content = BytesIO(b"Test content")
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.txt", text_content.read(), "text/plain")},
                data={"userId": "test_user"}
            )

            data = response.json()

            # n8n text/plain 응답 형식
            assert data["exitCode"] == 0
            assert data["stderr"] == ""

    @pytest.mark.asyncio
    async def test_unsupported_mime_response_matches_n8n(self, client):
        """지원하지 않는 MIME 응답이 n8n과 일치"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            mock_file.save_file = AsyncMock(return_value=("test.zip", "/path/test.zip"))

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.zip",
                "extension": "zip",
                "mime_type": "application/zip",
                "file_size": 1000,
                "extracted_text": "",
                "error": None
            })

            zip_content = BytesIO(b"PK\x03\x04")
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.zip", zip_content.read(), "application/zip")},
                data={"userId": "test_user"}
            )

            # Phase 1: unsupported MIME → HTTP 200 + processingSkipReason
            assert response.status_code == 200
            data = response.json()

            assert data["result"] == "success"
            assert data["status"] == "completed"
            assert data["processingSkipReason"] == "unsupported_format"
            assert "mime" in data
            assert "filename" in data
            assert "document_id" in data


class TestConcurrentUploads:
    """동시 업로드 테스트"""

    @pytest.mark.asyncio
    async def test_concurrent_uploads(self, client, sample_pdf):
        """여러 파일 동시 업로드"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"), \
             patch("routers.doc_prep_main._notify_document_complete"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # Generate unique ObjectIds for each insert
            mock_collection = AsyncMock()

            def mock_insert_one(*args, **kwargs):
                result = MagicMock()
                result.inserted_id = ObjectId()
                return result

            mock_collection.insert_one = AsyncMock(side_effect=mock_insert_one)
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            mock_file.save_file = AsyncMock(return_value=("test.pdf", "/path/test.pdf"))

            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "extracted_text": "텍스트",
                "error": None
            })

            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "요약",
                "tags": []
            })

            # 동시 업로드 5개
            async def upload_file(i):
                sample_pdf.seek(0)
                return await client.post(
                    "/webhook/docprep-main",
                    files={"file": (f"file_{i}.pdf", sample_pdf.read(), "application/pdf")},
                    data={"userId": f"user_{i}"}
                )

            responses = await asyncio.gather(*[upload_file(i) for i in range(5)])

            # 모든 업로드 성공 확인
            for resp in responses:
                assert resp.status_code == 200
                data = resp.json()
                assert data["result"] == "success"

            # 고유 document_id 확인
            doc_ids = [resp.json()["document_id"] for resp in responses]
            assert len(set(doc_ids)) == 5  # All unique


class TestErrorRecovery:
    """에러 복구 시나리오 테스트"""

    @pytest.mark.asyncio
    async def test_mongodb_error_during_upload(self, client, sample_pdf):
        """MongoDB 오류 시 에러 처리"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo:

            mock_collection = AsyncMock()
            mock_collection.insert_one.side_effect = Exception("MongoDB connection failed")
            mock_mongo.get_collection.return_value = mock_collection

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user"}
            )

            assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_file_save_error_recovery(self, client, sample_pdf):
        """파일 저장 실패 시 에러 처리"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file:

            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService 에러
            mock_file.save_file = AsyncMock(side_effect=Exception("Disk full"))

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user"}
            )

            assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_meta_error_logged_to_mongo(self, client, sample_pdf):
        """메타 추출 에러가 MongoDB에 기록되는지 확인"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            test_doc_id = ObjectId()
            mock_insert.inserted_id = test_doc_id
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            mock_file.save_file = AsyncMock(return_value=("test.pdf", "/path/test.pdf"))

            # MetaService 에러
            mock_meta.extract_metadata = AsyncMock(return_value={
                "error": True,
                "status": 500,
                "message": "PDF 파싱 실패"
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user"}
            )

            # 동기 처리 모드에서는 HTTP 200 반환, body에 result: "error" 포함
            assert response.status_code == 200
            data = response.json()
            assert data["result"] == "error"

            # MongoDB에 에러가 기록되었는지 확인
            update_calls = mock_collection.update_one.call_args_list
            error_update_found = any(
                "meta.error" in str(call)
                for call in update_calls
            )
            assert error_update_found

"""
Tests for DocPrepMain Router
Main orchestrator for document processing pipeline

Tests cover:
- PDF upload with text extraction → success
- Image upload → OCR queued
- Text PDF → OCR skipped
- Scanned PDF → OCR queued
- Error handling
- Shadow mode processing
- MongoDB status updates
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO
from bson import ObjectId


class TestDocPrepMainSuccess:
    """DocPrepMain 정상 처리 테스트"""

    @pytest.mark.asyncio
    async def test_pdf_with_text_success(self, client, sample_pdf):
        """텍스트가 있는 PDF 처리 - 요약 생성 후 완료"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer") as mock_connect, \
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
            # delete_many mock for orphan cleanup
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "20260105_test.pdf",
                "/data/uploads/test_user/20260105_test.pdf"
            ))

            # MetaService mock - PDF with text
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "file_hash": "abc123",
                "num_pages": 5,
                "extracted_text": "이것은 추출된 텍스트입니다. 문서 내용이 포함되어 있습니다.",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "테스트 문서 요약입니다."
            })

            # Request
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            # Verify response structure (n8n 응답 형식과 일치)
            assert data["result"] == "success"
            assert data["document_id"] == str(test_doc_id)
            assert data["status"] == "completed"
            assert "meta" in data
            assert data["meta"]["mime"] == "application/pdf"

            # Verify MongoDB calls
            mock_collection.insert_one.assert_called_once()
            assert mock_collection.update_one.call_count >= 1

    @pytest.mark.asyncio
    async def test_scanned_pdf_ocr_queued(self, client, sample_pdf):
        """스캔 PDF (텍스트 없음) - OCR 큐 추가"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.RedisService") as mock_redis, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer") as mock_connect:

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
                "/data/uploads/test_user/20260105_scanned.pdf"
            ))

            # MetaService mock - No text extracted (scanned PDF)
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_scanned.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 54321,
                "file_hash": "xyz789",
                "num_pages": 3,
                "extracted_text": "",  # No text
                "error": None
            })

            # OpenAI not called when no text
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": ""
            })

            # Redis mock
            mock_redis.add_to_stream = AsyncMock(return_value="stream_id")

            # Request
            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("scanned.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            # Verify OCR queued response
            assert data["result"] == "success"
            assert data["document_id"] == str(test_doc_id)
            assert "ocr" in data
            assert data["ocr"]["status"] == "queued"

            # Verify Redis queue call
            mock_redis.add_to_stream.assert_called_once()

    @pytest.mark.asyncio
    async def test_image_upload_ocr_queued(self, client, sample_image):
        """이미지 파일 업로드 - OCR 큐 추가"""
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
                "/data/uploads/test_user/20260105_image.png"
            ))

            # MetaService mock - Image (no text)
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_image.png",
                "extension": "png",
                "mime_type": "image/png",
                "file_size": 1024,
                "file_hash": "img123",
                "num_pages": None,
                "extracted_text": "",
                "error": None
            })

            # Redis mock
            mock_redis.add_to_stream = AsyncMock(return_value="stream_id")

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.png", sample_image.read(), "image/png")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            assert data["result"] == "success"
            assert "ocr" in data
            assert data["ocr"]["status"] == "queued"

    @pytest.mark.asyncio
    async def test_text_plain_file(self, client):
        """text/plain 파일 처리 - n8n 응답 형식과 일치"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

            # UploadQueueService mock
            mock_queue.enqueue = AsyncMock(return_value="queue_id_123")

            # MongoDB mock
            mock_collection = AsyncMock()
            mock_insert = MagicMock()
            mock_insert.inserted_id = ObjectId()
            mock_collection.insert_one.return_value = mock_insert
            mock_collection.update_one.return_value = MagicMock(modified_count=1)
            mock_delete_result = MagicMock()
            mock_delete_result.deleted_count = 0
            mock_collection.delete_one = AsyncMock(return_value=mock_delete_result)
            mock_mongo.get_collection.return_value = mock_collection

            # FileService mock
            mock_file.save_file = AsyncMock(return_value=(
                "20260105_test.txt",
                "/data/uploads/test_user/20260105_test.txt"
            ))
            mock_file.read_file_as_text = AsyncMock(return_value="텍스트 파일 내용")

            # MetaService mock - text/plain
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_test.txt",
                "extension": "txt",
                "mime_type": "text/plain",
                "file_size": 100,
                "file_hash": "txt123",
                "extracted_text": "텍스트 파일 내용",
                "error": None
            })

            text_content = BytesIO(b"Test text file content")
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.txt", text_content.read(), "text/plain")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200
            data = response.json()

            # n8n 응답 형식과 일치
            assert data["exitCode"] == 0
            assert data["stderr"] == ""


class TestDocPrepMainWithCustomer:
    """고객 연결 테스트"""

    @pytest.mark.asyncio
    async def test_with_customer_id(self, client, sample_pdf):
        """customerId 포함 요청 - 고객 연결"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer") as mock_connect, \
             patch("routers.doc_prep_main._notify_document_complete"):

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
                "20260105_customer.pdf",
                "/data/uploads/test_user/20260105_customer.pdf"
            ))

            # MetaService mock
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_customer.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "extracted_text": "고객 문서 내용",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "고객 문서 요약"
            })

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("customer.pdf", sample_pdf.read(), "application/pdf")},
                data={
                    "userId": "test_user_123",
                    "customerId": "customer_456"
                }
            )

            assert response.status_code == 200

            # Verify customer connection was called (ObjectId is converted to string)
            mock_connect.assert_called_once_with("customer_456", str(test_doc_id), "test_user_123")


class TestDocPrepMainErrors:
    """에러 처리 테스트"""

    @pytest.mark.asyncio
    async def test_no_file_error(self, client):
        """파일 없음 에러"""
        # FastAPI will reject the request without a file
        response = await client.post(
            "/webhook/docprep-main",
            data={"userId": "test_user_123"}
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_no_user_id_error(self, client, sample_pdf):
        """userId 없음 에러"""
        response = await client.post(
            "/webhook/docprep-main",
            files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")}
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_unsupported_mime_type(self, client):
        """지원하지 않는 MIME 타입 - 415 응답"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
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
                "20260105_test.zip",
                "/data/uploads/test_user/20260105_test.zip"
            ))

            # MetaService mock - unsupported type
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "20260105_test.zip",
                "extension": "zip",
                "mime_type": "application/zip",
                "file_size": 1024,
                "extracted_text": "",
                "error": None
            })

            zip_content = BytesIO(b"PK\x03\x04")  # Minimal ZIP header
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("test.zip", zip_content.read(), "application/zip")},
                data={"userId": "test_user_123"}
            )

            # Phase 1: unsupported MIME → HTTP 200 + processingSkipReason
            assert response.status_code == 200
            data = response.json()

            assert data["result"] == "success"
            assert data["status"] == "completed"
            assert data["processingSkipReason"] == "unsupported_format"
            assert data["mime"] == "application/zip"

    @pytest.mark.asyncio
    async def test_metadata_extraction_error(self, client, sample_pdf):
        """메타데이터 추출 실패 에러 처리"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main._connect_document_to_customer"):

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
                "20260105_corrupted.pdf",
                "/data/uploads/test_user/20260105_corrupted.pdf"
            ))

            # MetaService mock - extraction error
            mock_meta.extract_metadata = AsyncMock(return_value={
                "error": True,
                "status": 500,
                "message": "PDF 파싱 실패"
            })

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("corrupted.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user_123"}
            )

            # 동기 처리 모드에서는 HTTP 200 반환, body에 result: "error" 포함
            assert response.status_code == 200
            data = response.json()
            assert data["result"] == "error"
            assert data["status"] == 500
            assert "document_id" in data


class TestDocPrepMainShadowMode:
    """Shadow Mode 테스트"""

    @pytest.mark.asyncio
    async def test_shadow_mode_no_db_write(self, client, sample_pdf):
        """Shadow Mode - DB 기록 없이 시뮬레이션"""
        with patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai:

            # MetaService mock
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "extracted_text": "Shadow mode test text",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "Shadow mode summary"
            })

            response = await client.post(
                "/webhook/docprep-main?shadow=true",  # shadow is a query param, not form data
                files={"file": ("test.pdf", sample_pdf.read(), "application/pdf")},
                data={
                    "userId": "test_user_123",
                    "shadow_saved_name": "n8n_generated_filename.pdf",
                    "shadow_created_at": "2026-01-05T12:00:00Z"
                }
            )

            assert response.status_code == 200
            data = response.json()

            # Shadow mode returns simulated document_id
            assert data["document_id"] == "shadow_simulated"
            assert data["status"] == "completed"

    @pytest.mark.asyncio
    async def test_shadow_mode_ocr_needed(self, client, sample_pdf):
        """Shadow Mode - OCR 필요한 경우"""
        with patch("routers.doc_prep_main.MetaService") as mock_meta:

            # MetaService mock - no text
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "scanned.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 54321,
                "extracted_text": "",  # No text
                "error": None
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main?shadow=true",  # shadow is a query param, not form data
                files={"file": ("scanned.pdf", sample_pdf.read(), "application/pdf")},
                data={
                    "userId": "test_user_123"
                }
            )

            assert response.status_code == 200
            data = response.json()

            # Shadow mode with OCR needed
            assert data["document_id"] == "shadow_simulated"
            assert data["ocr"]["status"] == "queued"


class TestDocPrepMainMongoDBUpdates:
    """MongoDB 상태 업데이트 검증"""

    @pytest.mark.asyncio
    async def test_upload_info_saved(self, client, sample_pdf):
        """업로드 정보가 MongoDB에 저장되는지 확인"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"), \
             patch("routers.doc_prep_main._notify_document_complete"):

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
                "saved_filename.pdf",
                "/data/uploads/user/saved_filename.pdf"
            ))

            # MetaService mock
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "saved_filename.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 12345,
                "extracted_text": "Some text",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "Summary"
            })

            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("original.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200

            # Check update_one was called with upload info
            update_calls = mock_collection.update_one.call_args_list
            assert len(update_calls) >= 1

            # First update should contain upload info
            first_update = update_calls[0]
            update_data = first_update[0][1]["$set"]
            assert "upload.originalName" in update_data
            assert update_data["upload.originalName"] == "original.pdf"
            assert "upload.saveName" in update_data
            assert "upload.destPath" in update_data

    @pytest.mark.asyncio
    async def test_meta_info_saved(self, client, sample_pdf):
        """메타데이터 정보가 MongoDB에 저장되는지 확인"""
        with patch("routers.doc_prep_main.MongoService") as mock_mongo, \
             patch("routers.doc_prep_main.FileService") as mock_file, \
             patch("routers.doc_prep_main.MetaService") as mock_meta, \
             patch("routers.doc_prep_main.OpenAIService") as mock_openai, \
             patch("routers.doc_prep_main.UploadQueueService") as mock_queue, \
             patch("routers.doc_prep_main._connect_document_to_customer"), \
             patch("routers.doc_prep_main._notify_document_complete"):

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
                "meta_test.pdf",
                "/data/uploads/user/meta_test.pdf"
            ))

            # MetaService mock
            mock_meta.extract_metadata = AsyncMock(return_value={
                "filename": "meta_test.pdf",
                "extension": "pdf",
                "mime_type": "application/pdf",
                "file_size": 99999,
                "file_hash": "hash123",
                "num_pages": 10,
                "extracted_text": "Extracted text content",
                "error": None
            })

            # OpenAI mock
            mock_openai.summarize_text = AsyncMock(return_value={
                "summary": "Document summary"
            })

            sample_pdf.seek(0)
            response = await client.post(
                "/webhook/docprep-main",
                files={"file": ("meta_test.pdf", sample_pdf.read(), "application/pdf")},
                data={"userId": "test_user_123"}
            )

            assert response.status_code == 200

            # Find the meta update call
            update_calls = mock_collection.update_one.call_args_list
            meta_update_found = False

            for call in update_calls:
                update_data = call[0][1].get("$set", {})
                if "meta.filename" in update_data:
                    meta_update_found = True
                    assert update_data["meta.mime"] == "application/pdf"
                    assert update_data["meta.size_bytes"] == 99999
                    assert update_data["meta.pdf_pages"] == 10
                    assert "meta.summary" in update_data

            assert meta_update_found, "Meta update was not found in MongoDB calls"

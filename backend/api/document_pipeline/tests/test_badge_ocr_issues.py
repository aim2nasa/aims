"""
뱃지/OCR 3대 이슈 regression 테스트
@since 2026-03-26

이슈 A: OCR 성공 후 docembed.status를 "pending"으로 리셋
이슈 B: 변환 파일(PPT/HWP) 텍스트 추출 실패 시 변환 PDF를 OCR 큐로 전달
이슈 C: xPipe 경로에서 OCR 사용 시 ocr.* 필드를 DB에 기록

깨지면:
- (A) OCR 완료된 이미지 문서의 docembed가 영원히 "skipped"로 남음
- (B) 이미지만 포함된 PPT/HWP가 OCR 없이 보관 처리됨
- (C) xPipe 경로로 처리된 이미지의 뱃지가 OCR 대신 TXT로 표시됨
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from datetime import datetime

TEST_DOC_ID = "507f1f77bcf86cd799439011"
TEST_FILE_ID = "507f1f77bcf86cd799439022"
TEST_OWNER_ID = "user1"
TEST_MESSAGE_ID = "1234567890-0"


# ========================================
# 이슈 A: OCR 성공 후 docembed.status 리셋
# ========================================

class TestOCRSuccessResetsDocembed:
    """OCR 성공 시 충분한 텍스트가 있으면 docembed.status를 "pending"으로 리셋"""

    def _make_msg(self):
        return {
            "message_id": TEST_MESSAGE_ID,
            "file_id": TEST_FILE_ID,
            "file_path": "/data/test.jpg",
            "doc_id": TEST_DOC_ID,
            "owner_id": TEST_OWNER_ID,
            "queued_at": datetime.utcnow().isoformat(),
        }

    async def test_ocr_success_with_text_resets_docembed_to_pending(self):
        """OCR 성공 + 텍스트 >= 10자 → docembed.status = "pending", skip_reason = "" """
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

        ocr_result = {
            "error": False,
            "status": 200,
            "confidence": 0.96,
            "full_text": "삼성화재 보험 증권 내용이 여기에 있습니다 테스트 텍스트입니다",
            "summary": "삼성화재 보험 증권",
            "title": "삼성화재 보험 증권",
            "document_type": "general",
            "doc_confidence": 0.8,
            "num_pages": 1,
        }

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.redis_service.RedisService.ack_and_delete", new_callable=AsyncMock):
            await worker._handle_ocr_success(
                self._make_msg(), ocr_result,
                datetime.utcnow().isoformat(), 1
            )

        # 핵심 검증: docembed.status가 "pending"으로 리셋됨
        assert captured_update.get("docembed.status") == "pending", \
            "OCR 성공 + 텍스트 >= 10자 시 docembed.status는 'pending'이어야 합니다"
        assert captured_update.get("docembed.skip_reason") == "", \
            "OCR 성공 시 docembed.skip_reason은 빈 문자열이어야 합니다"
        # overallStatus도 embed_pending이어야 함
        assert captured_update.get("overallStatus") == "embed_pending"

    async def test_ocr_success_short_text_no_docembed_reset(self):
        """OCR 성공 + 텍스트 < 10자 → docembed.status 리셋하지 않음"""
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

        ocr_result = {
            "error": False,
            "status": 200,
            "confidence": 0.01,
            "full_text": "◆",  # 1자 — 텍스트 부족
            "summary": None,
            "title": None,
            "document_type": "general",
            "doc_confidence": 0.0,
            "num_pages": 1,
        }

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.redis_service.RedisService.ack_and_delete", new_callable=AsyncMock):
            await worker._handle_ocr_success(
                self._make_msg(), ocr_result,
                datetime.utcnow().isoformat(), 1
            )

        # 텍스트 부족 시 docembed 관련 필드가 업데이트에 포함되지 않아야 함
        assert "docembed.status" not in captured_update, \
            "텍스트 < 10자 시 docembed.status를 리셋하면 안 됩니다"
        assert "docembed.skip_reason" not in captured_update

    async def test_ocr_success_empty_text_no_docembed_reset(self):
        """OCR 성공 + 빈 텍스트 → docembed.status 리셋하지 않음"""
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

        ocr_result = {
            "error": False,
            "status": 200,
            "confidence": 0.0,
            "full_text": "",
            "summary": None,
            "title": None,
            "document_type": "general",
            "doc_confidence": 0.0,
            "num_pages": 1,
        }

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.redis_service.RedisService.ack_and_delete", new_callable=AsyncMock):
            await worker._handle_ocr_success(
                self._make_msg(), ocr_result,
                datetime.utcnow().isoformat(), 1
            )

        # 빈 텍스트 시 docembed.status 리셋하지 않음
        assert "docembed.status" not in captured_update


# ========================================
# 이슈 B: 변환 파일 텍스트 추출 실패 시 OCR fallback
# ========================================

class TestConvertibleMimeOCRFallback:
    """변환 가능 포맷(PPT/HWP)에서 텍스트 추출 실패 시 변환 PDF를 OCR 큐로 전달"""

    @pytest.fixture
    def mock_files_collection(self):
        mock = AsyncMock()
        mock.find_one = AsyncMock(return_value=None)
        mock.update_one = AsyncMock()
        mock.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock

    async def test_ppt_no_text_with_conv_pdf_queues_ocr(self, mock_files_collection):
        """PPT(텍스트 없음) + 변환 PDF 존재 → OCR 큐 진입 + 변환 PDF 경로 사용"""
        from routers.doc_prep_main import process_document_pipeline

        # find_one이 convPdfPath를 반환하도록 설정
        conv_pdf_path = "/data/converted/test.pdf"

        call_count = {"n": 0}
        original_find_one = mock_files_collection.find_one

        async def smart_find_one(query, projection=None):
            call_count["n"] += 1
            # convPdfPath 조회 시 변환된 PDF 경로 반환
            if projection and "upload.convPdfPath" in projection:
                return {"upload": {"convPdfPath": conv_pdf_path}}
            return None

        mock_files_collection.find_one = AsyncMock(side_effect=smart_find_one)

        progress_values = []
        progress_stages = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)
            progress_stages.append(stage)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.ppt", "/data/saved.ppt")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/vnd.ms-powerpoint", "num_pages": 0,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.ppt",
                 "extension": "ppt", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=True), \
             patch("routers.doc_prep_main.convert_and_extract_text", return_value=None), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("os.path.exists", return_value=True), \
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id") as mock_redis:
            result = await process_document_pipeline(
                file_content=b"ppt bytes",
                original_name="test.ppt",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        # 핵심 검증: OCR 큐에 추가되어야 함
        mock_redis.assert_called_once()

        # OCR 큐에 전달된 file_path가 변환된 PDF 경로여야 함
        call_kwargs = mock_redis.call_args
        assert call_kwargs.kwargs.get("file_path") == conv_pdf_path or \
            (call_kwargs.args and len(call_kwargs.args) > 1 and call_kwargs.args[1] == conv_pdf_path) or \
            conv_pdf_path in str(call_kwargs), \
            f"OCR 큐에 전달된 file_path가 변환 PDF 경로({conv_pdf_path})여야 합니다. 실제: {call_kwargs}"

        # progress: 60→70 (OCR 큐 경로)
        assert 60 in progress_values, "OCR 준비 progress(60)가 있어야 합니다"
        assert 70 in progress_values, "OCR 큐 추가 progress(70)가 있어야 합니다"

    async def test_hwp_no_text_no_conv_pdf_archives(self, mock_files_collection):
        """HWP(텍스트 없음) + 변환 PDF 없음 → 보관 처리 (기존 동작 유지)"""
        from routers.doc_prep_main import process_document_pipeline

        # find_one이 convPdfPath 없음을 반환
        async def smart_find_one(query, projection=None):
            if projection and "upload.convPdfPath" in projection:
                return {"upload": {}}  # convPdfPath 없음
            return None

        mock_files_collection.find_one = AsyncMock(side_effect=smart_find_one)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.hwp", "/data/saved.hwp")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/x-hwp", "num_pages": 0,
                 "file_hash": "abc", "file_size": 1234, "filename": "test.hwp",
                 "extension": "hwp", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=True), \
             patch("routers.doc_prep_main.convert_and_extract_text", return_value=None), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
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

        # OCR 큐에 추가되지 않아야 함 (변환 PDF 없으므로)
        mock_redis.assert_not_called()

        # 보관 처리 확인
        assert result.get("processingSkipReason") == "conversion_failed"


# ========================================
# 이슈 B (xPipe 경로): ExtractStage OCR fallback
# ========================================

class TestExtractStageConvertibleOCRFallback:
    """xPipe ExtractStage에서 변환 파일 텍스트 추출 실패 시 OCR fallback"""

    async def test_convertible_no_text_with_converted_pdf_ocr_fallback(self):
        """변환 파일 텍스트 추출 실패 + 변환 PDF 존재 → OCR fallback"""
        from xpipe.stages.extract import ExtractStage

        stage = ExtractStage()

        context = {
            "file_path": "/data/test.ppt",
            "filename": "test.ppt",
            "mime_type": "application/vnd.ms-powerpoint",
            "mode": "real",
            "models": {"ocr": "upstage"},
            "converted_pdf_path": "/data/converted/test.pdf",
        }

        with patch.object(stage, "_read_pdf_file", return_value=""), \
             patch.object(stage, "_convert_and_extract", return_value=""), \
             patch("os.path.exists", return_value=True), \
             patch.object(stage, "_try_ocr", new_callable=AsyncMock,
                          return_value=("OCR로 추출된 텍스트 입니다 충분한 길이의 텍스트", "upstage")) as mock_ocr:
            result = await stage.execute(context)

        # 핵심 검증: OCR fallback이 호출되었는지
        mock_ocr.assert_called_once()

        # 추출 방식이 libreoffice+ocr_fallback인지
        extract_data = result.get("stage_data", {}).get("extract", {})
        method = extract_data.get("output", {}).get("method", "")
        assert "ocr_fallback" in method, \
            f"변환 파일 텍스트 없음 시 method에 'ocr_fallback'이 포함되어야 합니다. 실제: {method}"

        # 텍스트가 추출되었는지
        assert result.get("extracted_text", "").strip() != ""


# ========================================
# 이슈 C: xPipe 경로 OCR 사용 시 ocr.* 필드 기록
# ========================================

class TestXPipeOCRFieldsRecorded:
    """xPipe 경로에서 OCR 사용 시 ocr.status, ocr.full_text 등이 DB에 기록"""

    async def test_xpipe_ocr_image_records_ocr_fields(self):
        """xPipe로 이미지 처리 시 ocr.* 필드가 meta_update에 포함"""
        from routers.doc_prep_main import _process_via_xpipe

        captured_sets = []
        mock_collection = AsyncMock()

        async def capture_update(query, update):
            if "$set" in update:
                captured_sets.append(update["$set"])
            result = MagicMock()
            result.modified_count = 1
            return result

        mock_collection.update_one = AsyncMock(side_effect=capture_update)
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.find_one = AsyncMock(return_value=None)

        # xPipe Pipeline mock — OCR 사용 결과 반환
        mock_pipeline_result = {
            "extracted_text": "OCR로 추출된 텍스트 내용입니다 충분히 긴 텍스트",
            "text": "OCR로 추출된 텍스트 내용입니다 충분히 긴 텍스트",
            "document_type": "general",
            "classification_confidence": 0.7,
            "detections": [],
            "_ocr_pages": 1,
            "stage_data": {
                "extract": {
                    "status": "completed",
                    "output": {
                        "method": "ocr",  # OCR 사용
                        "text_length": 30,
                        "ocr_model": "upstage",
                    }
                }
            },
        }

        mock_pipeline = AsyncMock()
        mock_pipeline.run = AsyncMock(return_value=mock_pipeline_result)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.jpg", "/data/saved.jpg")), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._generate_display_name", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._trigger_pdf_conversion_for_xpipe", new_callable=AsyncMock), \
             patch("xpipe.pipeline.Pipeline", return_value=mock_pipeline), \
             patch("insurance.adapter.InsuranceDomainAdapter") as mock_adapter_cls:

            mock_adapter = MagicMock()
            mock_adapter.get_classification_config = AsyncMock(return_value=MagicMock(
                extra={"system_prompt": ""}, prompt_template="", categories=[], valid_types=[]
            ))
            mock_adapter_cls.return_value = mock_adapter

            result = await _process_via_xpipe(
                file_content=b"jpg bytes",
                original_name="test.jpg",
                user_id="user1",
                customer_id=None,
                source_path=None,
                mime_type="image/jpeg",
                existing_doc_id=TEST_DOC_ID,
            )

        # 핵심 검증: captured_sets 중 ocr.* 필드가 포함된 업데이트가 있어야 함
        ocr_update_found = False
        for update_set in captured_sets:
            if "ocr.status" in update_set:
                ocr_update_found = True
                assert update_set["ocr.status"] == "done", \
                    f"ocr.status는 'done'이어야 합니다. 실제: {update_set['ocr.status']}"
                assert "ocr.full_text" in update_set, \
                    "ocr.full_text 필드가 있어야 합니다"
                assert update_set["ocr.full_text"] != "", \
                    "ocr.full_text는 비어있으면 안 됩니다"
                assert "ocr.done_at" in update_set, \
                    "ocr.done_at 필드가 있어야 합니다"
                assert "ocr.page_count" in update_set, \
                    "ocr.page_count 필드가 있어야 합니다"
                break

        assert ocr_update_found, \
            "xPipe OCR 처리 시 ocr.status='done'이 DB 업데이트에 포함되어야 합니다"

    async def test_xpipe_non_ocr_no_ocr_fields(self):
        """xPipe로 텍스트 PDF 처리 시 ocr.* 필드가 포함되지 않음"""
        from routers.doc_prep_main import _process_via_xpipe

        captured_sets = []
        mock_collection = AsyncMock()

        async def capture_update(query, update):
            if "$set" in update:
                captured_sets.append(update["$set"])
            result = MagicMock()
            result.modified_count = 1
            return result

        mock_collection.update_one = AsyncMock(side_effect=capture_update)
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.find_one = AsyncMock(return_value=None)

        # xPipe Pipeline mock — pdfplumber 사용 (OCR 아님)
        mock_pipeline_result = {
            "extracted_text": "PDF에서 직접 추출된 텍스트입니다 충분히 긴 텍스트",
            "text": "PDF에서 직접 추출된 텍스트입니다 충분히 긴 텍스트",
            "document_type": "general",
            "classification_confidence": 0.8,
            "detections": [],
            "stage_data": {
                "extract": {
                    "status": "completed",
                    "output": {
                        "method": "pdfplumber",  # OCR 아님
                        "text_length": 30,
                        "ocr_model": "-",
                    }
                }
            },
        }

        mock_pipeline = AsyncMock()
        mock_pipeline.run = AsyncMock(return_value=mock_pipeline_result)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._generate_display_name", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._trigger_pdf_conversion_for_xpipe", new_callable=AsyncMock), \
             patch("xpipe.pipeline.Pipeline", return_value=mock_pipeline), \
             patch("insurance.adapter.InsuranceDomainAdapter") as mock_adapter_cls:

            mock_adapter = MagicMock()
            mock_adapter.get_classification_config = AsyncMock(return_value=MagicMock(
                extra={"system_prompt": ""}, prompt_template="", categories=[], valid_types=[]
            ))
            mock_adapter_cls.return_value = mock_adapter

            result = await _process_via_xpipe(
                file_content=b"pdf bytes",
                original_name="test.pdf",
                user_id="user1",
                customer_id=None,
                source_path=None,
                mime_type="application/pdf",
                existing_doc_id=TEST_DOC_ID,
            )

        # 핵심 검증: ocr.* 필드가 포함되지 않아야 함
        for update_set in captured_sets:
            assert "ocr.status" not in update_set, \
                "pdfplumber 처리 시 ocr.status가 DB 업데이트에 포함되면 안 됩니다"


# ========================================
# Major #1 regression: 이미지 파일 OCR 큐 진입 시 NameError 방지
# ========================================

class TestImageFileOCRQueueNoNameError:
    """일반 이미지(JPG/PNG)가 OCR 큐로 진입할 때 conv_pdf_path NameError가 발생하지 않아야 함"""

    @pytest.fixture
    def mock_files_collection(self):
        mock = AsyncMock()
        mock.find_one = AsyncMock(return_value=None)
        mock.update_one = AsyncMock()
        mock.delete_one = AsyncMock(return_value=MagicMock(deleted_count=0))
        return mock

    async def test_image_file_ocr_queue_no_nameerror(self, mock_files_collection):
        """JPG 이미지 파일(비변환 포맷) OCR 큐 진입 시 NameError 없이 정상 동작"""
        from routers.doc_prep_main import process_document_pipeline

        progress_values = []

        async def capture_progress(doc_id, owner_id, progress, stage, message=""):
            progress_values.append(progress)

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.jpg", "/data/saved.jpg")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "image/jpeg", "num_pages": 0,
                 "file_hash": "abc", "file_size": 1234, "filename": "photo.jpg",
                 "extension": "jpg", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=False), \
             patch("routers.doc_prep_main._notify_progress", side_effect=capture_progress), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("os.path.exists", return_value=True), \
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id") as mock_redis:
            # 핵심: NameError 없이 정상 완료되어야 함
            result = await process_document_pipeline(
                file_content=b"jpg image bytes",
                original_name="photo.jpg",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        # OCR 큐에 추가되어야 함 (이미지는 텍스트가 없으므로 OCR 필요)
        mock_redis.assert_called_once()

        # OCR 큐에 전달된 file_path가 원본 경로여야 함 (변환 PDF가 아님)
        call_kwargs = mock_redis.call_args
        file_path_arg = call_kwargs.kwargs.get("file_path", "")
        assert file_path_arg == "/data/saved.jpg", \
            f"이미지 파일은 원본 경로로 OCR 큐에 전달되어야 합니다. 실제: {file_path_arg}"

        # progress 60 (OCR 준비) 이 있어야 함
        assert 60 in progress_values, "OCR 준비 progress(60)가 있어야 합니다"

    async def test_png_image_ocr_queue_uses_original_path(self, mock_files_collection):
        """PNG 이미지도 동일하게 원본 경로로 OCR 큐 진입"""
        from routers.doc_prep_main import process_document_pipeline

        with patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.png", "/data/saved.png")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "image/png", "num_pages": 0,
                 "file_hash": "def", "file_size": 5678, "filename": "scan.png",
                 "extension": "png", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=False), \
             patch("routers.doc_prep_main._notify_progress", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._notify_document_complete", new_callable=AsyncMock), \
             patch("routers.doc_prep_main._connect_document_to_customer", new_callable=AsyncMock), \
             patch("os.path.exists", return_value=True), \
             patch("services.redis_service.RedisService.add_to_stream", return_value="stream_id") as mock_redis:
            result = await process_document_pipeline(
                file_content=b"png image bytes",
                original_name="scan.png",
                user_id="user1",
                customer_id=None,
                source_path=None,
                existing_doc_id=TEST_DOC_ID,
            )

        mock_redis.assert_called_once()
        call_kwargs = mock_redis.call_args
        file_path_arg = call_kwargs.kwargs.get("file_path", "")
        assert file_path_arg == "/data/saved.png", \
            f"PNG 이미지도 원본 경로로 OCR 큐에 전달되어야 합니다. 실제: {file_path_arg}"

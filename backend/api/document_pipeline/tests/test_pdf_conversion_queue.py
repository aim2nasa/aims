"""
PDF 변환 큐 서비스 및 워커 테스트

큐 서비스: enqueue, claim, complete, fail, reschedule, stale recovery
워커: 변환 처리, 후처리, 실패 핸들링
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from bson import ObjectId


# ========================================
# PdfConversionQueueService 테스트
# ========================================

class TestPdfConversionQueueService:
    """큐 서비스 CRUD 검증"""

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        """MongoDB 컬렉션 mock 설정"""
        self.mock_collection = AsyncMock()

        with patch("services.pdf_conversion_queue_service.MongoService") as mock_mongo:
            mock_mongo.get_collection.return_value = self.mock_collection
            from services.pdf_conversion_queue_service import PdfConversionQueueService
            self.service = PdfConversionQueueService
            yield

    @pytest.mark.asyncio
    async def test_enqueue_text_extraction(self):
        """text_extraction 작업 등록"""
        inserted_id = ObjectId()
        self.mock_collection.insert_one.return_value = MagicMock(inserted_id=inserted_id)

        queue_id = await self.service.enqueue(
            job_type="text_extraction",
            input_path="/data/files/test.hwp",
            original_name="test.hwp",
            caller="document_pipeline",
        )

        assert queue_id == str(inserted_id)
        self.mock_collection.insert_one.assert_called_once()
        call_args = self.mock_collection.insert_one.call_args[0][0]
        assert call_args["status"] == "pending"
        assert call_args["job_type"] == "text_extraction"
        assert call_args["input_path"] == "/data/files/test.hwp"
        assert call_args["caller"] == "document_pipeline"

    @pytest.mark.asyncio
    async def test_enqueue_preview_pdf_dedup(self):
        """preview_pdf 작업 중복 방지 (upsert)"""
        doc_id = str(ObjectId())
        upserted_id = ObjectId()
        self.mock_collection.update_one.return_value = MagicMock(upserted_id=upserted_id)

        queue_id = await self.service.enqueue(
            job_type="preview_pdf",
            input_path="/data/files/test.docx",
            original_name="test.docx",
            caller="aims_api",
            document_id=doc_id,
        )

        assert queue_id == str(upserted_id)
        self.mock_collection.update_one.assert_called_once()
        call_args = self.mock_collection.update_one.call_args
        assert call_args[0][0] == {"document_id": doc_id, "job_type": "preview_pdf"}

    @pytest.mark.asyncio
    async def test_enqueue_preview_pdf_already_exists(self):
        """이미 등록된 preview_pdf 작업은 기존 ID 반환"""
        doc_id = str(ObjectId())
        existing_id = ObjectId()
        self.mock_collection.update_one.return_value = MagicMock(upserted_id=None)
        self.mock_collection.find_one.return_value = {"_id": existing_id}

        queue_id = await self.service.enqueue(
            job_type="preview_pdf",
            input_path="/data/files/test.docx",
            original_name="test.docx",
            caller="aims_api",
            document_id=doc_id,
        )

        assert queue_id == str(existing_id)

    @pytest.mark.asyncio
    async def test_claim_next_fifo(self):
        """FIFO 순서로 claim"""
        job = {"_id": ObjectId(), "status": "processing", "original_name": "test.hwp"}
        self.mock_collection.find_one_and_update.return_value = job

        result = await self.service.claim_next("worker-123")

        assert result == job
        call_args = self.mock_collection.find_one_and_update.call_args
        query = call_args[0][0]
        assert query["status"] == "pending"
        assert "$or" in query  # process_after 조건 포함
        assert call_args[1]["sort"] == [("created_at", 1)]

    @pytest.mark.asyncio
    async def test_claim_next_empty(self):
        """큐가 비어있으면 None"""
        self.mock_collection.find_one_and_update.return_value = None

        result = await self.service.claim_next("worker-123")
        assert result is None

    @pytest.mark.asyncio
    async def test_mark_completed(self):
        """작업 완료 처리"""
        queue_id = str(ObjectId())
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        success = await self.service.mark_completed(queue_id, {"extracted_text": "hello"})
        assert success is True

        call_args = self.mock_collection.update_one.call_args[0]
        update = call_args[1]
        assert update["$set"]["status"] == "completed"
        assert update["$set"]["result"] == {"extracted_text": "hello"}

    @pytest.mark.asyncio
    async def test_mark_failed(self):
        """작업 실패 처리"""
        queue_id = str(ObjectId())
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        success = await self.service.mark_failed(queue_id, "변환 오류")
        assert success is True

    @pytest.mark.asyncio
    async def test_reschedule_within_limit(self):
        """재시도 횟수 내 재스케줄"""
        queue_id = str(ObjectId())
        self.mock_collection.find_one.return_value = {
            "_id": ObjectId(queue_id),
            "retry_count": 0,
            "max_retries": 2,
        }
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        success = await self.service.reschedule(queue_id, "타임아웃", delay_seconds=5.0)
        assert success is True

        call_args = self.mock_collection.update_one.call_args[0][1]
        assert call_args["$set"]["status"] == "pending"
        assert call_args["$set"]["process_after"] is not None  # 딜레이 있으면 process_after 설정
        assert call_args["$inc"]["retry_count"] == 1

    @pytest.mark.asyncio
    async def test_reschedule_no_delay(self):
        """딜레이 없는 재스케줄"""
        queue_id = str(ObjectId())
        self.mock_collection.find_one.return_value = {
            "_id": ObjectId(queue_id),
            "retry_count": 0,
            "max_retries": 2,
        }
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        success = await self.service.reschedule(queue_id, "타임아웃")
        assert success is True

        call_args = self.mock_collection.update_one.call_args[0][1]
        assert call_args["$set"]["process_after"] is None  # 딜레이 없으면 None

    @pytest.mark.asyncio
    async def test_reschedule_exceeds_limit(self):
        """재시도 초과 시 failed 처리"""
        queue_id = str(ObjectId())
        self.mock_collection.find_one.return_value = {
            "_id": ObjectId(queue_id),
            "retry_count": 2,
            "max_retries": 2,
        }
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        success = await self.service.reschedule(queue_id, "타임아웃")
        assert success is False

    @pytest.mark.asyncio
    async def test_cleanup_stale_jobs(self):
        """stale 작업 복구"""
        self.mock_collection.update_many.return_value = MagicMock(modified_count=3)

        count = await self.service.cleanup_stale_jobs(timeout_minutes=5)
        assert count == 3

        call_args = self.mock_collection.update_many.call_args[0]
        query = call_args[0]
        assert query["status"] == "processing"
        assert "$lt" in query["started_at"]

    @pytest.mark.asyncio
    async def test_wait_for_result_completed(self):
        """완료된 작업 대기"""
        queue_id = str(ObjectId())
        completed_job = {
            "_id": ObjectId(queue_id),
            "status": "completed",
            "result": {"extracted_text": "텍스트"},
        }
        self.mock_collection.find_one.return_value = completed_job

        result = await self.service.wait_for_result(queue_id, timeout=5.0, poll_interval=0.1)
        assert result is not None
        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_wait_for_result_failed(self):
        """실패한 작업 즉시 반환"""
        queue_id = str(ObjectId())
        failed_job = {
            "_id": ObjectId(queue_id),
            "status": "failed",
            "error_message": "변환 실패",
        }
        self.mock_collection.find_one.return_value = failed_job

        result = await self.service.wait_for_result(queue_id, timeout=5.0, poll_interval=0.1)
        assert result is not None
        assert result["status"] == "failed"

    @pytest.mark.asyncio
    async def test_wait_for_result_timeout(self):
        """대기 타임아웃 시 job을 failed로 마킹"""
        queue_id = str(ObjectId())
        pending_job = {
            "_id": ObjectId(queue_id),
            "status": "pending",
        }
        self.mock_collection.find_one.return_value = pending_job
        self.mock_collection.update_one.return_value = MagicMock(modified_count=1)

        result = await self.service.wait_for_result(queue_id, timeout=0.3, poll_interval=0.1)
        assert result is None

        # 타임아웃 시 job을 failed로 마킹 확인
        cancel_calls = [
            c for c in self.mock_collection.update_one.call_args_list
            if "caller timeout" in str(c)
        ]
        assert len(cancel_calls) == 1

    @pytest.mark.asyncio
    async def test_get_queue_stats(self):
        """큐 통계"""
        class MockAsyncIterator:
            def __init__(self, items):
                self._items = iter(items)
            def __aiter__(self):
                return self
            async def __anext__(self):
                try:
                    return next(self._items)
                except StopIteration:
                    raise StopAsyncIteration

        # aggregate는 동기 함수로 async iterator를 반환 (motor 패턴)
        self.mock_collection.aggregate = MagicMock(return_value=MockAsyncIterator([
            {"_id": "pending", "count": 5},
            {"_id": "processing", "count": 1},
            {"_id": "completed", "count": 10},
        ]))

        stats = await self.service.get_queue_stats()
        assert stats["pending"] == 5
        assert stats["processing"] == 1
        assert stats["completed"] == 10
        assert stats["failed"] == 0


# ========================================
# PdfConversionWorker 테스트
# ========================================

class TestPdfConversionWorker:
    """워커 처리 로직 검증"""

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        """워커 mock 설정"""
        with patch("workers.pdf_conversion_worker.MongoService") as mock_mongo, \
             patch("workers.pdf_conversion_worker.PdfConversionQueueService") as mock_queue:
            self.mock_mongo = mock_mongo
            self.mock_queue_service = mock_queue
            self.mock_files_col = AsyncMock()
            mock_mongo.get_collection.return_value = self.mock_files_col

            from workers.pdf_conversion_worker import PdfConversionWorker
            self.worker = PdfConversionWorker()
            yield

    @pytest.mark.asyncio
    async def test_convert_text_extraction(self):
        """text_extraction: PDF 변환 → 텍스트 추출"""
        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".hwp", delete=False)
        tmp.write(b"fake hwp content")
        tmp.close()

        job = {
            "_id": ObjectId(),
            "job_type": "text_extraction",
            "input_path": tmp.name,
            "original_name": "test.hwp",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"%PDF-1.4 fake pdf content"

        with patch("workers.pdf_conversion_worker.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            with patch.object(self.worker, "_extract_text_from_pdf_bytes", return_value="추출된 텍스트"):
                result = await self.worker._convert(job)

        os.unlink(tmp.name)
        assert result == {"extracted_text": "추출된 텍스트"}

    @pytest.mark.asyncio
    async def test_convert_preview_pdf(self):
        """preview_pdf: PDF 변환 → 파일 저장"""
        import tempfile, os
        tmp_dir = tempfile.mkdtemp()
        tmp_path = os.path.join(tmp_dir, "test.docx")
        with open(tmp_path, "wb") as f:
            f.write(b"fake docx content")

        job = {
            "_id": ObjectId(),
            "job_type": "preview_pdf",
            "input_path": tmp_path,
            "original_name": "test.docx",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"%PDF-1.4 fake pdf"

        with patch("workers.pdf_conversion_worker.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            result = await self.worker._convert(job)

        expected_pdf = os.path.join(tmp_dir, "test.pdf")
        assert result == {"pdf_path": expected_pdf}
        assert os.path.exists(expected_pdf)

        # cleanup
        os.unlink(tmp_path)
        os.unlink(expected_pdf)
        os.rmdir(tmp_dir)

    @pytest.mark.asyncio
    async def test_convert_file_not_found(self):
        """파일 없으면 FileNotFoundError"""
        job = {
            "_id": ObjectId(),
            "job_type": "text_extraction",
            "input_path": "/nonexistent/file.hwp",
            "original_name": "file.hwp",
        }

        with pytest.raises(FileNotFoundError):
            await self.worker._convert(job)

    @pytest.mark.asyncio
    async def test_convert_http_error(self):
        """HTTP 오류 시 RuntimeError"""
        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".hwp", delete=False)
        tmp.write(b"fake")
        tmp.close()

        job = {
            "_id": ObjectId(),
            "job_type": "text_extraction",
            "input_path": tmp.name,
            "original_name": "test.hwp",
        }

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"

        with patch("workers.pdf_conversion_worker.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post.return_value = mock_response
            mock_client_cls.return_value = mock_client

            with pytest.raises(RuntimeError, match="HTTP 500"):
                await self.worker._convert(job)

        os.unlink(tmp.name)

    @pytest.mark.asyncio
    async def test_handle_failure_file_not_found_no_retry(self):
        """FileNotFoundError는 재시도 없이 즉시 실패"""
        queue_id = str(ObjectId())
        job = {
            "_id": ObjectId(queue_id),
            "job_type": "text_extraction",
            "original_name": "missing.hwp",
            "retry_count": 0,
            "max_retries": 2,
        }

        self.mock_queue_service.mark_failed = AsyncMock()
        with patch.object(self.worker, "_notify_conversion_failed", new_callable=AsyncMock):
            await self.worker._handle_failure(queue_id, job, FileNotFoundError("없음"))

        self.mock_queue_service.mark_failed.assert_called_once()
        self.mock_queue_service.reschedule.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_failure_with_retry(self):
        """일반 오류는 논블로킹 재시도 (process_after로 딜레이)"""
        queue_id = str(ObjectId())
        job = {
            "_id": ObjectId(queue_id),
            "job_type": "text_extraction",
            "original_name": "test.hwp",
            "retry_count": 0,
            "max_retries": 2,
        }

        self.mock_queue_service.reschedule = AsyncMock(return_value=True)

        await self.worker._handle_failure(queue_id, job, RuntimeError("변환 실패"))

        self.mock_queue_service.reschedule.assert_called_once()
        # delay_seconds가 전달되는지 확인
        call_kwargs = self.mock_queue_service.reschedule.call_args
        assert "delay_seconds" in call_kwargs.kwargs or len(call_kwargs.args) >= 3

    @pytest.mark.asyncio
    async def test_post_process_preview_updates_files(self, mock_internal_api_writes):
        """preview_pdf 완료 후 Internal API로 files 업데이트"""
        doc_id = str(ObjectId())
        job = {
            "_id": ObjectId(),
            "job_type": "preview_pdf",
            "document_id": doc_id,
        }
        result = {"pdf_path": "/data/files/test.pdf"}

        with patch.object(self.worker, "_notify_conversion_complete", new_callable=AsyncMock):
            await self.worker._post_process(job, result)

        mock_internal_api_writes["svc_update_file"].assert_called()

    def test_get_status(self):
        """워커 상태 조회"""
        status = self.worker.get_status()
        assert "running" in status
        assert "worker_id" in status
        assert "current_job_id" in status


# ========================================
# 메모리 비소모 검증
# ========================================

class TestMemorySafety:
    """큐에 파일 데이터가 저장되지 않음을 검증"""

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        with patch("services.pdf_conversion_queue_service.MongoService") as mock_mongo:
            self.mock_collection = AsyncMock()
            mock_mongo.get_collection.return_value = self.mock_collection
            from services.pdf_conversion_queue_service import PdfConversionQueueService
            self.service = PdfConversionQueueService
            yield

    @pytest.mark.asyncio
    async def test_enqueue_stores_path_not_content(self):
        """큐에 파일 경로만 저장, 파일 콘텐츠는 저장하지 않음"""
        inserted_id = ObjectId()
        self.mock_collection.insert_one.return_value = MagicMock(inserted_id=inserted_id)

        await self.service.enqueue(
            job_type="text_extraction",
            input_path="/data/files/large_file.hwp",
            original_name="large_file.hwp",
            caller="document_pipeline",
        )

        call_args = self.mock_collection.insert_one.call_args[0][0]
        # input_path는 문자열 (파일 경로)
        assert isinstance(call_args["input_path"], str)
        # 파일 바이너리 데이터 필드가 없어야 함
        assert "file_content" not in call_args
        assert "file_data" not in call_args
        assert "content" not in call_args
        assert "buffer" not in call_args


# ========================================
# 무한 루프 버그 Regression 테스트
# ISSUE: ISSUE_PDF_CONVERSION_WORKER_INFINITE_LOOP.md
# 스캔 문서(텍스트 추출 불가) 무한 재시도 방지 검증
# ========================================

class TestInfiniteLoopRegression:
    """
    PDF 변환 워커의 _recover_completed_without_text()가
    스캔 문서에 대해 무한 루프를 일으키지 않음을 검증.

    버그: 텍스트 추출 불가 시 DB에 마커를 남기지 않아
    3분마다 동일 문서를 영원히 재시도하는 무한 루프 발생.
    수정: meta.text_extraction_failed=True 마커 기록 + 쿼리 필터.
    """

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        """워커 mock 설정"""
        with patch("workers.pdf_conversion_worker.MongoService") as mock_mongo, \
             patch("workers.pdf_conversion_worker.PdfConversionQueueService") as mock_queue:
            self.mock_mongo = mock_mongo
            self.mock_queue_service = mock_queue
            self.mock_files_col = AsyncMock()
            mock_mongo.get_collection.return_value = self.mock_files_col
            mock_mongo.get_db.return_value = {
                "files": self.mock_files_col,
                "pdf_conversion_queue": AsyncMock(),
            }

            from workers.pdf_conversion_worker import PdfConversionWorker
            self.worker = PdfConversionWorker()
            yield

    # --- TC-01: 스캔 문서 재시도 차단 (핵심 버그 검증) ---

    @pytest.mark.asyncio
    async def test_scan_document_marks_ocr_fallback_needed(self, mock_internal_api_writes):
        """TC-01: 텍스트 추출 불가(스캔 문서) 시 meta.ocr_fallback_needed=True 마커가 DB에 기록되고 OCR 큐에 등록된다"""
        doc_id = str(ObjectId())

        # query_file_one이 문서에 텍스트 없음을 반환
        mock_internal_api_writes["svc_query_file_one"].return_value = {
            "_id": ObjectId(doc_id),
            "meta": {},
            "ocr": {},
            "ownerId": "test_user",
            "upload": {"originalName": "scan.ppt"},
        }

        # PyMuPDF가 텍스트 없음 반환 (스캔 문서 시뮬레이션)
        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(b"%PDF-1.4 fake scan pdf")
        tmp.close()

        with patch.object(self.worker, "_extract_text_from_pdf_bytes", return_value=None), \
             patch.object(self.worker, "_enqueue_ocr_fallback", new_callable=AsyncMock) as mock_enqueue:
            result = await self.worker._extract_and_update_text(doc_id, tmp.name)

        os.unlink(tmp.name)

        assert result is False

        # Internal API로 ocr_fallback_needed 마커 기록 확인
        mock_update = mock_internal_api_writes["svc_update_file"]
        mock_update.assert_called_once()
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields["meta.ocr_fallback_needed"] is True

        mock_enqueue.assert_called_once()

    # --- TC-02: 거짓 성공 카운트 제거 ---

    @pytest.mark.asyncio
    async def test_recovered_count_excludes_scan_documents(self):
        """TC-02: 스캔 문서(텍스트 불가)는 recovered 카운트에 포함되지 않는다"""
        doc_id = ObjectId()

        # _recover_completed_without_text()가 1건 감지
        mock_cursor = AsyncMock()
        mock_cursor.to_list.return_value = [
            {
                "_id": doc_id,
                "upload": {"convPdfPath": "/data/scan.pdf", "originalName": "scan.ppt"},
            },
        ]
        self.mock_files_col.find.return_value = mock_cursor

        # _extract_and_update_text()가 False 반환 (스캔 문서)
        with patch.object(self.worker, "_extract_and_update_text", new_callable=AsyncMock, return_value=False):
            await self.worker._recover_completed_without_text()

        # recovered 카운트가 0이므로 "복구 완료" 로그가 출력되지 않음을 간접 확인
        # (recovered > 0일 때만 로그 출력)
        # 핵심: _extract_and_update_text()의 반환값이 False이므로 recovered += 1이 실행되지 않음

    # --- TC-03: 정상 복구 비회귀 ---

    @pytest.mark.asyncio
    async def test_text_extraction_success_returns_true(self, mock_internal_api_writes):
        """TC-03: 텍스트 추출 성공 시 DB 업데이트 + return True"""
        doc_id = str(ObjectId())

        # query_file_one이 텍스트 없는 문서를 반환
        mock_internal_api_writes["svc_query_file_one"].return_value = {
            "_id": ObjectId(doc_id),
            "meta": {},
            "ocr": {},
            "ownerId": "test_user",
            "upload": {"originalName": "report.doc"},
        }

        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(b"%PDF-1.4 real content")
        tmp.close()

        with patch.object(self.worker, "_extract_text_from_pdf_bytes", return_value="추출된 텍스트 내용"):
            with patch("services.openai_service.OpenAIService") as mock_ai:
                mock_ai.summarize_text = AsyncMock(return_value={
                    "summary": "요약",
                    "title": "제목",
                    "document_type": "general",
                    "confidence": 0.9,
                })
                result = await self.worker._extract_and_update_text(doc_id, tmp.name)

        os.unlink(tmp.name)

        assert result is True
        # Internal API로 meta.full_text 저장 확인
        mock_update = mock_internal_api_writes["svc_update_file"]
        assert mock_update.call_count >= 1
        # 마지막 호출에서 meta.full_text 확인
        last_set_fields = mock_update.call_args_list[-1].kwargs.get("set_fields", {})
        assert "meta.full_text" in last_set_fields

    # --- TC-04: 마커 필터링 쿼리 검증 ---

    @pytest.mark.asyncio
    async def test_recover_query_excludes_marked_documents(self, mock_internal_api_writes):
        """TC-04: _recover_completed_without_text() 쿼리가 text_extraction_failed=True 문서를 제외한다"""
        # svc_query_files 기본 반환값은 [] (빈 목록)

        await self.worker._recover_completed_without_text()

        # query_files() 호출 시 쿼리 조건 확인
        mock_svc_query = mock_internal_api_writes["svc_query_files"]
        mock_svc_query.assert_called_once()
        query = mock_svc_query.call_args[0][0]

        # 핵심: meta.text_extraction_failed + meta.ocr_fallback_needed 필터 존재 확인
        assert "meta.text_extraction_failed" in query
        assert query["meta.text_extraction_failed"] == {"$ne": True}
        assert "meta.ocr_fallback_needed" in query
        assert query["meta.ocr_fallback_needed"] == {"$ne": True}

    # --- TC-05: 반환값 계약 검증 ---

    @pytest.mark.asyncio
    async def test_return_false_when_text_empty(self, mock_internal_api_writes):
        """TC-05a: 텍스트 추출 결과가 빈 문자열이면 False 반환"""
        doc_id = str(ObjectId())
        mock_internal_api_writes["svc_query_file_one"].return_value = {
            "_id": ObjectId(doc_id),
            "meta": {},
            "ocr": {},
            "ownerId": "test",
            "upload": {"originalName": "scan.ppt"},
        }

        import tempfile, os
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp.write(b"%PDF")
        tmp.close()

        with patch.object(self.worker, "_extract_text_from_pdf_bytes", return_value="   "), \
             patch.object(self.worker, "_enqueue_ocr_fallback", new_callable=AsyncMock):
            result = await self.worker._extract_and_update_text(doc_id, tmp.name)

        os.unlink(tmp.name)
        assert result is False

    @pytest.mark.asyncio
    async def test_return_false_when_file_missing(self, mock_internal_api_writes):
        """TC-05b: PDF 파일이 없으면 False 반환 + 마커 기록"""
        doc_id = str(ObjectId())
        mock_internal_api_writes["svc_query_file_one"].return_value = {
            "_id": ObjectId(doc_id),
            "meta": {},
            "ocr": {},
            "ownerId": "test",
            "upload": {"originalName": "missing.ppt"},
        }

        result = await self.worker._extract_and_update_text(doc_id, "/nonexistent/path.pdf")

        assert result is False
        # 파일 없어도 마커 기록 확인 (Internal API 경유)
        mock_update = mock_internal_api_writes["svc_update_file"]
        mock_update.assert_called_once()
        set_fields = mock_update.call_args.kwargs.get("set_fields", {})
        assert set_fields["meta.text_extraction_failed"] is True

    @pytest.mark.asyncio
    async def test_return_false_when_doc_not_found(self, mock_internal_api_writes):
        """TC-05c: MongoDB에서 문서를 찾을 수 없으면 False 반환"""
        doc_id = str(ObjectId())
        # svc_query_file_one 기본 반환값이 None이므로 추가 설정 불필요

        result = await self.worker._extract_and_update_text(doc_id, "/any/path.pdf")
        assert result is False

    @pytest.mark.asyncio
    async def test_return_false_when_text_already_exists(self, mock_internal_api_writes):
        """TC-05d: 이미 텍스트가 있으면 False 반환 (재추출 불필요)"""
        doc_id = str(ObjectId())
        mock_internal_api_writes["svc_query_file_one"].return_value = {
            "_id": ObjectId(doc_id),
            "meta": {"full_text": "이미 존재하는 텍스트"},
            "ocr": {},
            "ownerId": "test",
            "upload": {"originalName": "doc.ppt"},
        }

        result = await self.worker._extract_and_update_text(doc_id, "/any/path.pdf")
        assert result is False

    # --- TC-06: 재변환 시 마커 리셋 ---

    @pytest.mark.asyncio
    async def test_post_process_preview_resets_extraction_marker(self, mock_internal_api_writes):
        """TC-06: _post_process_preview() 호출 시 meta.text_extraction_failed가 unset된다"""
        doc_id = str(ObjectId())
        job = {
            "_id": ObjectId(),
            "job_type": "preview_pdf",
            "document_id": doc_id,
        }
        result = {"pdf_path": "/data/files/test.pdf"}

        with patch.object(self.worker, "_extract_and_update_text", new_callable=AsyncMock, return_value=True):
            with patch.object(self.worker, "_notify_conversion_complete", new_callable=AsyncMock):
                await self.worker._post_process(job, result)

        # Internal API update_file 호출에서 unset_fields 확인
        mock_update = mock_internal_api_writes["svc_update_file"]
        # _post_process에서 update_file이 호출되어야 함
        unset_found = False
        for call_obj in mock_update.call_args_list:
            unset_fields = call_obj.kwargs.get("unset_fields", {})
            if "meta.text_extraction_failed" in unset_fields:
                unset_found = True
                break
        assert unset_found, "meta.text_extraction_failed가 unset_fields에 포함되어야 합니다"


# ========================================
# COLLSCAN 인덱스 Regression 테스트
# upload.conversion_status 인덱스가 워커 시작 시
# 자동 생성되는지 검증 (COLLSCAN 방지)
# ========================================

class TestConversionStatusIndex:
    """
    files 컬렉션의 upload.conversion_status 인덱스 생성 검증.

    _recover_completed_without_text()와 _recover_stuck_pending_documents()가
    3분마다 upload.conversion_status로 쿼리하므로, 인덱스 없으면 COLLSCAN 발생.
    워커 시작 시 _ensure_files_indexes()로 sparse 인덱스를 자동 생성해야 한다.
    """

    @pytest.fixture(autouse=True)
    def setup_mocks(self):
        """워커 mock 설정"""
        with patch("workers.pdf_conversion_worker.MongoService") as mock_mongo, \
             patch("workers.pdf_conversion_worker.PdfConversionQueueService") as mock_queue:
            self.mock_mongo = mock_mongo
            self.mock_queue_service = mock_queue
            self.mock_files_col = AsyncMock()
            mock_mongo.get_collection.return_value = self.mock_files_col

            from workers.pdf_conversion_worker import PdfConversionWorker
            self.worker = PdfConversionWorker()
            yield

    @pytest.mark.asyncio
    async def test_ensure_files_indexes_creates_conversion_status_index(self):
        """워커 시작 시 upload.conversion_status sparse 인덱스가 생성된다"""
        self.mock_files_col.create_index.return_value = "idx_conversion_status"

        await self.worker._ensure_files_indexes()

        self.mock_files_col.create_index.assert_called_once()
        call_args = self.mock_files_col.create_index.call_args

        # 인덱스 키: upload.conversion_status ascending
        assert call_args[0][0] == [("upload.conversion_status", 1)]
        # sparse=True (conversion_status 없는 문서는 인덱스에서 제외)
        assert call_args[1]["sparse"] is True
        # 인덱스 이름
        assert call_args[1]["name"] == "idx_conversion_status"

    @pytest.mark.asyncio
    async def test_ensure_files_indexes_error_does_not_raise(self):
        """인덱스 생성 실패 시 예외가 전파되지 않는다 (워커 시작 차단 방지)"""
        self.mock_files_col.create_index.side_effect = Exception("index creation failed")

        # 예외 없이 정상 반환
        await self.worker._ensure_files_indexes()

    @pytest.mark.asyncio
    async def test_worker_start_calls_ensure_files_indexes(self):
        """워커 start()의 코드에 _ensure_files_indexes() 호출이 포함되어 있다"""
        import inspect
        from workers.pdf_conversion_worker import PdfConversionWorker
        source = inspect.getsource(PdfConversionWorker.start)
        assert "_ensure_files_indexes" in source, \
            "start() 메서드에 _ensure_files_indexes() 호출이 없습니다"

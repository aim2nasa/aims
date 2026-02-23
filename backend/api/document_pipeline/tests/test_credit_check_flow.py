"""
크레딧 체크 흐름 회귀 테스트

대상 함수:
- check_credit_for_upload() (doc_prep_main.py:39)
- credit_pending 분기 (doc_prep_main.py:249~420)

깨지면: 크레딧 부족 사용자 문서 처리 차단, 또는 충전 후 재처리 불가
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

TEST_DOC_ID = "507f1f77bcf86cd799439011"


# ========================================
# check_credit_for_upload
# ========================================

class TestCheckCreditForUpload:
    """크레딧 체크 API 호출 검증"""

    @pytest.fixture(autouse=True)
    def reset_credit_check_url(self):
        """CREDIT_CHECK_URL 전역 변수 teardown 보장"""
        import routers.doc_prep_main as module
        original = module.CREDIT_CHECK_URL
        module.CREDIT_CHECK_URL = None
        yield
        module.CREDIT_CHECK_URL = original

    async def test_allowed_when_api_returns_allowed(self):
        """API가 allowed=True → 허용"""
        from routers.doc_prep_main import check_credit_for_upload

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"allowed": True, "credits_remaining": 100}
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await check_credit_for_upload("test_user", 1)

        assert result["allowed"] is True

    async def test_denied_when_api_returns_denied(self):
        """API가 allowed=False → 거부"""
        from routers.doc_prep_main import check_credit_for_upload

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "allowed": False,
                "reason": "credit_exhausted",
                "credits_remaining": 0,
            }
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await check_credit_for_upload("test_user", 1)

        assert result["allowed"] is False

    async def test_fail_open_on_api_error_status(self):
        """API HTTP 500 → fail-open (allowed=True)"""
        from routers.doc_prep_main import check_credit_for_upload

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await check_credit_for_upload("test_user", 1)

        assert result["allowed"] is True
        assert result["reason"] == "api_error_fallback"

    async def test_fail_open_on_timeout(self):
        """API 타임아웃 → fail-open (allowed=True)"""
        from routers.doc_prep_main import check_credit_for_upload
        import httpx as real_httpx

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=real_httpx.TimeoutException("timeout"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await check_credit_for_upload("test_user", 1)

        assert result["allowed"] is True
        assert result["reason"] == "error_fallback"

    async def test_fail_open_on_connection_error(self):
        """API 연결 실패 → fail-open (allowed=True)"""
        from routers.doc_prep_main import check_credit_for_upload
        import httpx as real_httpx

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(side_effect=real_httpx.ConnectError("connection refused"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            result = await check_credit_for_upload("test_user", 1)

        assert result["allowed"] is True
        assert result["reason"] == "error_fallback"

    async def test_api_url_and_headers(self):
        """올바른 URL과 헤더로 API 호출하는지 확인"""
        from routers.doc_prep_main import check_credit_for_upload

        with patch("routers.doc_prep_main.httpx.AsyncClient") as mock_httpx:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"allowed": True}
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_httpx.return_value = mock_client

            await check_credit_for_upload("test_user_123", 5)

        call_args = mock_client.post.call_args
        assert "/api/internal/check-credit" in call_args[0][0]
        assert call_args[1]["json"]["user_id"] == "test_user_123"
        assert call_args[1]["json"]["estimated_pages"] == 5


# ========================================
# credit_pending Document Creation (통합 테스트)
# ========================================

class TestCreditPendingDocCreation:
    """크레딧 부족 시 문서 생성 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_overall_status_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족 → overallStatus='credit_pending'"""
        # autouse fixture의 settings를 UPLOAD_QUEUE_ENABLED=True로 변경
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
                 "credit_quota": 500, "days_until_reset": 15, "estimated_credits": 10,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "error": None,
             }):
            response = await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "credit_pending"
        assert data["document_id"] == TEST_DOC_ID

        # 문서 insert_one 호출 확인
        insert_call = mock_files_collection.insert_one.call_args[0][0]
        assert insert_call["overallStatus"] == "credit_pending"
        assert insert_call["progress"] == 0

    async def test_file_saved_even_when_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족이어도 파일은 반드시 저장"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")) as mock_save, \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "error": None,
             }):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
            )

        mock_save.assert_called_once()

    async def test_meta_extracted_when_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족이어도 메타데이터 추출 실행"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "some text", "mime_type": "application/pdf", "num_pages": 5,
                 "file_hash": "abc", "error": None,
             }) as mock_meta:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
            )

        mock_meta.assert_called_once()

    async def test_full_text_stored_when_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족이어도 full_text 저장 (충전 후 임베딩용)"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "extracted pdf text content", "mime_type": "application/pdf",
                 "num_pages": 3, "file_hash": "abc", "error": None,
             }):
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
            )

        # update_one에서 meta.full_text 저장 확인
        update_calls = mock_files_collection.update_one.call_args_list
        meta_update_found = False
        for call in update_calls:
            set_data = call[0][1].get("$set", {})
            if "meta.full_text" in set_data:
                assert set_data["meta.full_text"] == "extracted pdf text content"
                meta_update_found = True
                break
        assert meta_update_found, "meta.full_text should be stored in credit_pending"


# ========================================
# credit_pending No Queue / No OpenAI
# ========================================

class TestCreditPendingNoQueue:
    """크레딧 부족 시 비용 발생 방지 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_enqueue_not_called(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족 시 큐에 등록하지 않음"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "error": None,
             }), \
             patch("services.upload_queue_service.UploadQueueService.enqueue") as mock_enqueue:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake content", "application/pdf")},
            )

        mock_enqueue.assert_not_called()

    async def test_openai_not_called(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족 시 OpenAI 요약 호출하지 않음"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "some text", "mime_type": "application/pdf", "num_pages": 1,
                 "file_hash": "abc", "error": None,
             }), \
             patch("services.openai_service.OpenAIService.summarize_text") as mock_openai:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake content", "application/pdf")},
            )

        mock_openai.assert_not_called()


# ========================================
# credit_pending AR/CRS Detection
# ========================================

class TestCreditPendingARCRS:
    """크레딧 부족 시에도 AR/CRS 감지 동작 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_ar_detected_in_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection, ar_text_sample):
        """크레딧 부족이어도 AR 감지 실행"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": ar_text_sample, "mime_type": "application/pdf",
                 "num_pages": 3, "file_hash": "abc", "error": None,
             }), \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={
                 "is_annual_report": True, "customer_id": "cust1", "customer_name": "홍길동",
             }) as mock_ar_detect:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake content", "application/pdf")},
            )

        mock_ar_detect.assert_called_once()

    async def test_crs_detected_in_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection, crs_text_sample):
        """크레딧 부족이어도 CRS 감지 실행 (AR 아닌 경우)"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.pdf", "/data/saved.pdf")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": crs_text_sample, "mime_type": "application/pdf",
                 "num_pages": 3, "file_hash": "abc", "error": None,
             }), \
             patch("routers.doc_prep_main._detect_and_process_annual_report", return_value={
                 "is_annual_report": False, "customer_id": None, "customer_name": None,
             }), \
             patch("routers.doc_prep_main._detect_and_process_customer_review", return_value={
                 "is_customer_review": True, "customer_name": "김철수",
             }) as mock_crs_detect:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.pdf", b"fake content", "application/pdf")},
            )

        mock_crs_detect.assert_called_once()

    async def test_ar_crs_skipped_for_non_pdf(self, client, mock_upload_queue_disabled, mock_files_collection):
        """PDF가 아닌 파일은 AR/CRS 감지 안함"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.hwp", "/data/saved.hwp")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "some text", "mime_type": "application/x-hwp",
                 "num_pages": 1, "file_hash": "abc", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=False), \
             patch("routers.doc_prep_main._detect_and_process_annual_report") as mock_ar, \
             patch("routers.doc_prep_main._detect_and_process_customer_review") as mock_crs:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.hwp", b"fake content", "application/x-hwp")},
            )

        # application/x-hwp는 PDF가 아니므로 AR/CRS 감지 안함
        mock_ar.assert_not_called()
        mock_crs.assert_not_called()


# ========================================
# credit_pending PDF Conversion
# ========================================

class TestCreditPendingPDFConversion:
    """크레딧 부족 시 PDF 변환 동작 검증"""

    @pytest.fixture
    def mock_files_collection(self):
        mock_collection = AsyncMock()
        mock_insert = MagicMock()
        mock_insert.inserted_id = ObjectId(TEST_DOC_ID)
        mock_collection.insert_one = AsyncMock(return_value=mock_insert)
        mock_collection.update_one = AsyncMock()
        return mock_collection

    async def test_hwp_conversion_in_credit_pending(self, client, mock_upload_queue_disabled, mock_files_collection):
        """크레딧 부족이어도 HWP→PDF 변환 텍스트 추출 실행"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.hwp", "/data/saved.hwp")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/x-hwp",
                 "num_pages": 0, "file_hash": "abc", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=True), \
             patch("routers.doc_prep_main.convert_and_extract_text", return_value="변환된 텍스트") as mock_convert:
            await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.hwp", b"fake content", "application/x-hwp")},
            )

        mock_convert.assert_called_once()

    async def test_conversion_failure_continues(self, client, mock_upload_queue_disabled, mock_files_collection):
        """PDF 변환 실패해도 문서 생성은 계속"""
        mock_upload_queue_disabled.UPLOAD_QUEUE_ENABLED = True
        mock_upload_queue_disabled.INTERNAL_API_KEY = "internal-key"

        with patch("routers.doc_prep_main.check_credit_for_upload", return_value={
                 "allowed": False, "reason": "credit_exhausted", "credits_remaining": 0,
             }), \
             patch("services.mongo_service.MongoService.get_collection", return_value=mock_files_collection), \
             patch("services.file_service.FileService.save_file", return_value=("saved.hwp", "/data/saved.hwp")), \
             patch("services.meta_service.MetaService.extract_metadata", return_value={
                 "extracted_text": "", "mime_type": "application/x-hwp",
                 "num_pages": 0, "file_hash": "abc", "error": None,
             }), \
             patch("routers.doc_prep_main.is_convertible_mime", return_value=True), \
             patch("routers.doc_prep_main.convert_and_extract_text", return_value=None):
            response = await client.post(
                "/webhook/docprep-main",
                data={"userId": "user1"},
                files={"file": ("test.hwp", b"fake content", "application/x-hwp")},
            )

        assert response.status_code == 200
        assert response.json()["status"] == "credit_pending"

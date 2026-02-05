"""
Upstage OCR Service Unit Tests
@since 2026-02-05

테스트 범위:
1. process_ocr - OCR 처리 (API 키, 성공, 실패, 타임아웃)
2. _normalize_response - 응답 정규화
3. _parse_error_message - 에러 메시지 파싱

@priority HIGH
@see https://www.upstage.ai/pricing
"""
import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock, PropertyMock

# Import path setup
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.upstage_service import UpstageService


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def upstage_service():
    """UpstageService 인스턴스"""
    with patch("services.upstage_service.get_settings") as mock_settings:
        mock_settings.return_value.UPSTAGE_API_KEY = "test-api-key"
        service = UpstageService()
        yield service


@pytest.fixture
def upstage_service_no_key():
    """API 키 없는 UpstageService 인스턴스"""
    with patch("services.upstage_service.get_settings") as mock_settings:
        mock_settings.return_value.UPSTAGE_API_KEY = None
        service = UpstageService()
        yield service


@pytest.fixture
def sample_file_content():
    """샘플 파일 콘텐츠"""
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj"


@pytest.fixture
def sample_ocr_success_response():
    """OCR 성공 응답"""
    return {
        "confidence": 0.95,
        "text": "추출된 텍스트입니다.",
        "numBilledPages": 3,
        "pages": [
            {"page": 1, "text": "페이지 1"},
            {"page": 2, "text": "페이지 2"},
            {"page": 3, "text": "페이지 3"}
        ]
    }


# =============================================================================
# 1. API 키 없음 테스트
# =============================================================================

class TestApiKeyMissing:
    """API 키 누락 테스트"""

    @pytest.mark.asyncio
    async def test_no_api_key_returns_error(self, upstage_service_no_key, sample_file_content):
        """API 키 없으면 즉시 에러 반환"""
        result = await upstage_service_no_key.process_ocr(
            sample_file_content,
            "test.pdf"
        )

        assert result["error"] is True
        assert result["status"] == 500
        assert "API 키가 설정되지 않았습니다" in result["userMessage"]

    @pytest.mark.asyncio
    async def test_no_api_key_returns_null_fields(self, upstage_service_no_key, sample_file_content):
        """API 키 없으면 데이터 필드는 None/빈 배열"""
        result = await upstage_service_no_key.process_ocr(
            sample_file_content,
            "test.pdf"
        )

        assert result["confidence"] is None
        assert result["full_text"] is None
        assert result["num_pages"] is None
        assert result["pages"] == []


# =============================================================================
# 2. OCR 성공 테스트
# =============================================================================

class TestOcrSuccess:
    """OCR 성공 케이스 테스트"""

    @pytest.mark.asyncio
    async def test_ocr_success_returns_normalized_response(self, upstage_service, sample_file_content, sample_ocr_success_response):
        """OCR 성공 시 정규화된 응답 반환"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_ocr_success_response

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is False
            assert result["status"] == 200
            assert result["confidence"] == 0.95
            assert result["full_text"] == "추출된 텍스트입니다."
            assert result["num_pages"] == 3

    @pytest.mark.asyncio
    async def test_ocr_success_pages_extracted(self, upstage_service, sample_file_content, sample_ocr_success_response):
        """OCR 성공 시 페이지별 데이터 추출"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_ocr_success_response

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert len(result["pages"]) == 3
            assert result["pages"][0]["page"] == 1

    @pytest.mark.asyncio
    async def test_ocr_api_called_with_correct_params(self, upstage_service, sample_file_content):
        """API 호출 시 올바른 파라미터 전달"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "test", "confidence": 0.9}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await upstage_service.process_ocr(
                sample_file_content,
                "document.pdf"
            )

            # API 호출 검증
            call_args = mock_client_instance.post.call_args
            assert call_args[0][0] == "https://api.upstage.ai/v1/document-digitization"
            assert "Authorization" in call_args[1]["headers"]
            assert call_args[1]["data"]["model"] == "ocr"

    @pytest.mark.asyncio
    async def test_ocr_bearer_token_included(self, upstage_service, sample_file_content):
        """Bearer 토큰이 헤더에 포함"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "test"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            call_args = mock_client_instance.post.call_args
            assert call_args[1]["headers"]["Authorization"] == "Bearer test-api-key"


# =============================================================================
# 3. OCR 실패 테스트
# =============================================================================

class TestOcrFailure:
    """OCR 실패 케이스 테스트"""

    @pytest.mark.asyncio
    async def test_ocr_400_returns_error(self, upstage_service, sample_file_content):
        """400 Bad Request 시 에러 응답"""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": {"message": "잘못된 파일 형식"}}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is True
            assert result["status"] == 400
            assert "잘못된 파일 형식" in result["userMessage"]

    @pytest.mark.asyncio
    async def test_ocr_500_returns_error(self, upstage_service, sample_file_content):
        """500 Server Error 시 에러 응답"""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.json.side_effect = Exception("JSON parse error")

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is True
            assert result["status"] == 500

    @pytest.mark.asyncio
    async def test_ocr_401_unauthorized(self, upstage_service, sample_file_content):
        """401 Unauthorized 시 에러 응답"""
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"error": {"message": "인증 실패"}}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is True
            assert result["status"] == 401

    @pytest.mark.asyncio
    async def test_ocr_failure_null_fields(self, upstage_service, sample_file_content):
        """실패 시 데이터 필드는 None/빈 배열"""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.json.return_value = {}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["confidence"] is None
            assert result["full_text"] is None
            assert result["num_pages"] is None
            assert result["pages"] == []


# =============================================================================
# 4. 타임아웃 테스트
# =============================================================================

class TestOcrTimeout:
    """타임아웃 테스트"""

    @pytest.mark.asyncio
    async def test_timeout_returns_504(self, upstage_service, sample_file_content):
        """타임아웃 시 504 상태 코드"""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = httpx.TimeoutException("Timeout")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is True
            assert result["status"] == 504
            assert "시간 초과" in result["userMessage"]

    @pytest.mark.asyncio
    async def test_timeout_null_fields(self, upstage_service, sample_file_content):
        """타임아웃 시 데이터 필드는 None/빈 배열"""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = httpx.TimeoutException("Timeout")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["confidence"] is None
            assert result["full_text"] is None
            assert result["num_pages"] is None
            assert result["pages"] == []


# =============================================================================
# 5. 일반 예외 테스트
# =============================================================================

class TestOcrException:
    """일반 예외 테스트"""

    @pytest.mark.asyncio
    async def test_exception_returns_500(self, upstage_service, sample_file_content):
        """일반 예외 시 500 상태 코드"""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = Exception("Network error")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert result["error"] is True
            assert result["status"] == 500
            assert "OCR 처리 실패" in result["userMessage"]

    @pytest.mark.asyncio
    async def test_exception_includes_error_message(self, upstage_service, sample_file_content):
        """예외 메시지가 응답에 포함"""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = Exception("Connection refused")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await upstage_service.process_ocr(
                sample_file_content,
                "test.pdf"
            )

            assert "Connection refused" in result["userMessage"]


# =============================================================================
# 6. _normalize_response 테스트
# =============================================================================

class TestNormalizeResponse:
    """응답 정규화 테스트"""

    def test_normalize_basic_fields(self, upstage_service):
        """기본 필드 정규화"""
        data = {
            "confidence": 0.92,
            "text": "추출 텍스트",
            "numBilledPages": 5
        }

        result = upstage_service._normalize_response(data)

        assert result["error"] is False
        assert result["status"] == 200
        assert result["confidence"] == 0.92
        assert result["full_text"] == "추출 텍스트"
        assert result["num_pages"] == 5

    def test_normalize_with_pages(self, upstage_service):
        """페이지 배열 정규화"""
        data = {
            "confidence": 0.9,
            "text": "텍스트",
            "numBilledPages": 2,
            "pages": [{"page": 1}, {"page": 2}]
        }

        result = upstage_service._normalize_response(data)

        assert len(result["pages"]) == 2

    def test_normalize_pages_fallback_metadata(self, upstage_service):
        """pages 없으면 metadata.pages 사용"""
        data = {
            "confidence": 0.9,
            "text": "텍스트",
            "numBilledPages": 1,
            "metadata": {"pages": [{"page": 1}]}
        }

        result = upstage_service._normalize_response(data)

        assert len(result["pages"]) == 1

    def test_normalize_missing_fields(self, upstage_service):
        """필드 누락 시 None 반환"""
        data = {}

        result = upstage_service._normalize_response(data)

        assert result["confidence"] is None
        assert result["full_text"] is None
        assert result["num_pages"] is None
        assert result["pages"] == []

    def test_normalize_user_message_success(self, upstage_service):
        """성공 시 userMessage"""
        data = {"text": "텍스트"}

        result = upstage_service._normalize_response(data)

        assert result["userMessage"] == "OCR 성공"


# =============================================================================
# 7. _parse_error_message 테스트
# =============================================================================

class TestParseErrorMessage:
    """에러 메시지 파싱 테스트"""

    def test_parse_error_with_message(self, upstage_service):
        """error.message 필드 파싱"""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error": {"message": "파일 형식 오류"}
        }

        result = upstage_service._parse_error_message(mock_response)

        assert result == "파일 형식 오류"

    def test_parse_error_no_message_field(self, upstage_service):
        """error 필드에 message 없음"""
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.json.return_value = {
            "error": {"code": "INTERNAL"}
        }

        result = upstage_service._parse_error_message(mock_response)

        assert "HTTP 500" in result

    def test_parse_error_no_error_field(self, upstage_service):
        """error 필드 없음"""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.json.return_value = {}

        result = upstage_service._parse_error_message(mock_response)

        assert "HTTP 403" in result

    def test_parse_error_json_exception(self, upstage_service):
        """JSON 파싱 실패"""
        mock_response = MagicMock()
        mock_response.status_code = 502
        mock_response.json.side_effect = Exception("JSON error")

        result = upstage_service._parse_error_message(mock_response)

        assert "HTTP 502" in result

    def test_parse_error_default_message(self, upstage_service):
        """기본 에러 메시지 형식"""
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.json.return_value = {}

        result = upstage_service._parse_error_message(mock_response)

        assert result == "OCR 처리 실패 (HTTP 429)"

"""
OpenAI Service Unit Tests
@since 2026-02-05

테스트 범위:
1. check_credit_for_summary - 크레딧 체크 (fail-closed 패턴)
2. OpenAIService._log_token_usage - 토큰 로깅
3. OpenAIService.summarize_text - 텍스트 요약 및 문서 분류

@priority CRITICAL - 과금/크레딧 관련 핵심 서비스
@see docs/EMBEDDING_CREDIT_POLICY.md
"""
import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock, PropertyMock
from datetime import datetime
import uuid

# Import path setup
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.openai_service import check_credit_for_summary, OpenAIService


# =============================================================================
# 1. check_credit_for_summary 함수 테스트 (25개+)
# =============================================================================

class TestCheckCreditForSummary:
    """크레딧 체크 함수 테스트"""

    # ========================================
    # 시스템 사용자 처리
    # ========================================

    @pytest.mark.asyncio
    async def test_system_user_always_allowed(self):
        """user_id='system'이면 항상 허용"""
        result = await check_credit_for_summary("system", 10000)

        assert result["allowed"] is True
        assert result["reason"] == "system_user"

    @pytest.mark.asyncio
    async def test_empty_user_id_always_allowed(self):
        """user_id가 빈 문자열이면 항상 허용"""
        result = await check_credit_for_summary("", 10000)

        assert result["allowed"] is True
        assert result["reason"] == "system_user"

    @pytest.mark.asyncio
    async def test_none_user_id_always_allowed(self):
        """user_id가 None이면 항상 허용"""
        result = await check_credit_for_summary(None, 10000)

        assert result["allowed"] is True
        assert result["reason"] == "system_user"

    # ========================================
    # 크레딧 충분 케이스
    # ========================================

    @pytest.mark.asyncio
    async def test_credit_sufficient_returns_allowed(self):
        """크레딧 충분 시 allowed=True"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "allowed": True,
            "credits_remaining": 500,
            "days_until_reset": 15
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is True
            assert result["credits_remaining"] == 500

    @pytest.mark.asyncio
    async def test_credit_check_passes_estimated_pages(self):
        """estimated_tokens → estimated_pages 변환 확인"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await check_credit_for_summary("user-123", 10000)

            # estimated_pages = max(1, 10000 // 5000) = 2
            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            assert payload["estimated_pages"] == 2
            assert payload["user_id"] == "user-123"

    @pytest.mark.asyncio
    async def test_estimated_pages_minimum_is_one(self):
        """estimated_pages 최소값은 1"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            # 1000 tokens → 0 pages → max(1, 0) = 1
            await check_credit_for_summary("user-123", 1000)

            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            assert payload["estimated_pages"] == 1

    # ========================================
    # 크레딧 부족 케이스
    # ========================================

    @pytest.mark.asyncio
    async def test_credit_insufficient_returns_not_allowed(self):
        """크레딧 부족 시 allowed=False"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "allowed": False,
            "reason": "크레딧이 부족합니다",
            "credits_remaining": 0,
            "days_until_reset": 10
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 5000)

            assert result["allowed"] is False
            assert result["credits_remaining"] == 0

    @pytest.mark.asyncio
    async def test_credit_insufficient_returns_reason(self):
        """크레딧 부족 시 reason 메시지 반환"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "allowed": False,
            "reason": "월정액 크레딧 소진",
            "credits_remaining": -50
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 5000)

            assert result["reason"] == "월정액 크레딧 소진"

    @pytest.mark.asyncio
    async def test_credit_insufficient_returns_days_until_reset(self):
        """크레딧 부족 시 days_until_reset 반환"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "allowed": False,
            "credits_remaining": 0,
            "days_until_reset": 7
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 5000)

            assert result["days_until_reset"] == 7

    # ========================================
    # API 호출 실패 → fail-closed (보류)
    # ========================================

    @pytest.mark.asyncio
    async def test_api_error_status_code_fail_closed(self):
        """API 응답 상태 코드 오류 시 fail-closed (allowed=False) — 안전 우선"""
        mock_response = MagicMock()
        mock_response.status_code = 500  # 서버 오류

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False
            assert result["reason"] == "api_error_fallback"

    @pytest.mark.asyncio
    async def test_api_404_error_fail_closed(self):
        """API 404 오류 시 fail-closed"""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False
            assert result["reason"] == "api_error_fallback"

    @pytest.mark.asyncio
    async def test_api_503_service_unavailable_fail_closed(self):
        """API 503 서비스 불가 시 fail-closed"""
        mock_response = MagicMock()
        mock_response.status_code = 503

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False

    # ========================================
    # 네트워크 예외 → fail-closed (보류)
    # ========================================

    @pytest.mark.asyncio
    async def test_network_exception_fail_closed(self):
        """네트워크 예외 시 fail-closed (allowed=False) — 안전 우선"""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = Exception("Connection refused")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False
            assert result["reason"] == "error_fallback"
            assert "Connection refused" in result.get("error", "")

    @pytest.mark.asyncio
    async def test_timeout_exception_fail_closed(self):
        """타임아웃 예외 시 fail-closed"""
        import httpx

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = httpx.TimeoutException("Timeout")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False
            assert result["reason"] == "error_fallback"

    @pytest.mark.asyncio
    async def test_connection_error_fail_closed(self):
        """연결 오류 시 fail-closed"""
        import httpx

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.side_effect = httpx.ConnectError("Host unreachable")
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            result = await check_credit_for_summary("user-123", 1000)

            assert result["allowed"] is False

    # ========================================
    # 토큰 추정 계산 검증
    # ========================================

    @pytest.mark.asyncio
    async def test_estimated_tokens_100_gives_1_page(self):
        """100 토큰 → 1페이지 (최소값)"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await check_credit_for_summary("user-123", 100)

            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            assert payload["estimated_pages"] == 1

    @pytest.mark.asyncio
    async def test_estimated_tokens_5000_gives_1_page(self):
        """5000 토큰 → 1페이지"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await check_credit_for_summary("user-123", 5000)

            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            assert payload["estimated_pages"] == 1

    @pytest.mark.asyncio
    async def test_estimated_tokens_50000_gives_10_pages(self):
        """50000 토큰 → 10페이지"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await check_credit_for_summary("user-123", 50000)

            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            assert payload["estimated_pages"] == 10

    # ========================================
    # API 키 헤더 검증
    # ========================================

    @pytest.mark.asyncio
    async def test_api_key_header_included(self):
        """x-api-key 헤더가 포함되어야 함"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            await check_credit_for_summary("user-123", 1000)

            call_args = mock_client_instance.post.call_args
            headers = call_args[1]["headers"]
            assert "x-api-key" in headers
            assert headers["Content-Type"] == "application/json"

    # ========================================
    # 다양한 사용자 ID 처리
    # ========================================

    @pytest.mark.asyncio
    async def test_various_user_ids_processed(self):
        """다양한 user_id 처리"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            # 일반 사용자
            result = await check_credit_for_summary("user@example.com", 1000)
            assert result["allowed"] is True

            # UUID 형식 사용자
            result = await check_credit_for_summary("550e8400-e29b-41d4-a716-446655440000", 1000)
            assert result["allowed"] is True

    @pytest.mark.asyncio
    async def test_default_estimated_tokens(self):
        """estimated_tokens 기본값 1000"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"allowed": True}

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.post.return_value = mock_response
            mock_client_instance.__aenter__.return_value = mock_client_instance
            mock_client_instance.__aexit__.return_value = None
            mock_client.return_value = mock_client_instance

            # estimated_tokens 생략 시 기본값 1000
            await check_credit_for_summary("user-123")

            call_args = mock_client_instance.post.call_args
            payload = call_args[1]["json"]
            # 1000 // 5000 = 0 → max(1, 0) = 1
            assert payload["estimated_pages"] == 1


# =============================================================================
# 2. OpenAIService._log_token_usage 테스트 (10개)
# =============================================================================

class TestLogTokenUsage:
    """토큰 사용량 로깅 테스트 (aims_analytics DB 직접 기록)"""

    @pytest.mark.asyncio
    async def test_log_success_returns_true(self):
        """DB 기록 성공 시 True 반환"""
        import sys
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = AsyncMock(return_value=True)
        sys.modules["services.analytics_writer"] = mock_module

        try:
            result = await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )
            assert result is True
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_db_failure_returns_false(self):
        """DB 기록 실패 시 False 반환"""
        import sys
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = AsyncMock(return_value=False)
        sys.modules["services.analytics_writer"] = mock_module

        try:
            result = await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )
            assert result is False
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_exception_returns_false(self):
        """예외 발생 시 False 반환 (fail-open)"""
        import sys
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = AsyncMock(side_effect=Exception("DB error"))
        sys.modules["services.analytics_writer"] = mock_module

        try:
            result = await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )
            assert result is False
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_calls_analytics_writer_with_correct_args(self):
        """AnalyticsWriter에 올바른 인자 전달"""
        import sys
        mock_writer = AsyncMock(return_value=True)
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = mock_writer
        sys.modules["services.analytics_writer"] = mock_module

        try:
            await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )

            mock_writer.assert_called_once()
            call_kwargs = mock_writer.call_args[1]

            assert call_kwargs["user_id"] == "user-123"
            assert call_kwargs["source"] == "doc_summary"
            assert call_kwargs["model"] == "gpt-4o-mini"
            assert call_kwargs["prompt_tokens"] == 100
            assert call_kwargs["completion_tokens"] == 50
            assert call_kwargs["total_tokens"] == 150
            assert call_kwargs["metadata"]["document_id"] == "doc-456"
            assert call_kwargs["metadata"]["workflow"] == "document_pipeline"
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_metadata_contains_document_id(self):
        """metadata에 document_id 포함"""
        import sys
        mock_writer = AsyncMock(return_value=True)
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = mock_writer
        sys.modules["services.analytics_writer"] = mock_module

        try:
            await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-789",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )

            call_kwargs = mock_writer.call_args[1]
            assert call_kwargs["metadata"]["document_id"] == "doc-789"
            assert call_kwargs["metadata"]["workflow"] == "document_pipeline"
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_null_user_id_defaults_to_system(self):
        """user_id가 None이면 'system' 사용"""
        import sys
        mock_writer = AsyncMock(return_value=True)
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = mock_writer
        sys.modules["services.analytics_writer"] = mock_module

        try:
            await OpenAIService._log_token_usage(
                user_id=None,
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )

            call_kwargs = mock_writer.call_args[1]
            assert call_kwargs["user_id"] == "system"
        finally:
            sys.modules.pop("services.analytics_writer", None)

    @pytest.mark.asyncio
    async def test_log_source_is_doc_summary(self):
        """source 필드가 'doc_summary'여야 함"""
        import sys
        mock_writer = AsyncMock(return_value=True)
        mock_module = MagicMock()
        mock_module.AnalyticsWriter.log_token_usage = mock_writer
        sys.modules["services.analytics_writer"] = mock_module

        try:
            await OpenAIService._log_token_usage(
                user_id="user-123",
                document_id="doc-456",
                model="gpt-4o-mini",
                prompt_tokens=100,
                completion_tokens=50,
                total_tokens=150
            )

            call_kwargs = mock_writer.call_args[1]
            assert call_kwargs["source"] == "doc_summary"
        finally:
            sys.modules.pop("services.analytics_writer", None)


# =============================================================================
# 3. OpenAIService.summarize_text 테스트 (15개+)
# =============================================================================

class TestSummarizeText:
    """텍스트 요약 테스트"""

    @pytest.mark.asyncio
    async def test_basic_summarization(self):
        """기본 요약 생성 (JSON 분류 통합)"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.9,"title":"테스트 제목","summary":"테스트 요약입니다.","tags":["테스트","문서","AI"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text("테스트 텍스트입니다.")

            assert "summary" in result
            assert result["summary"] == "테스트 요약입니다."
            assert result["document_type"] == "general"
            assert result["confidence"] == 0.9

    @pytest.mark.asyncio
    async def test_credit_check_insufficient_skips_summary(self):
        """크레딧 부족 시 요약 스킵"""
        mock_credit_check = {
            "allowed": False,
            "credits_remaining": 0,
            "days_until_reset": 10
        }

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = mock_credit_check

            result = await OpenAIService.summarize_text(
                "긴 텍스트입니다.",
                owner_id="user-123"
            )

            assert result["credit_skipped"] is True
            assert result["summary"] == "크레딧 부족으로 요약이 생략되었습니다."
            assert result["credits_remaining"] == 0

    @pytest.mark.asyncio
    async def test_credit_check_sufficient_proceeds(self):
        """크레딧 충분 시 요약 진행"""
        mock_credit_check = {
            "allowed": True,
            "credits_remaining": 500
        }

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"정상 제목","summary":"정상 요약","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check, \
             patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_check.return_value = mock_credit_check
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(
                "텍스트입니다.",
                owner_id="user-123"
            )

            assert "credit_skipped" not in result or result.get("credit_skipped") is False
            assert result["summary"] == "정상 요약"

    @pytest.mark.asyncio
    async def test_text_truncation_over_10000(self):
        """10000자 초과 시 truncated=True"""
        long_text = "가" * 15000  # 15000자

        mock_credit_check = {"allowed": True}

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 5000
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 5100

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.6,"title":"긴 문서","summary":"긴 문서 요약","tags":["장문"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check, \
             patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_check.return_value = mock_credit_check
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(
                long_text,
                owner_id="user-123"
            )

            assert result["truncated"] is True

    @pytest.mark.asyncio
    async def test_text_under_10000_not_truncated(self):
        """10000자 이하는 truncated=False"""
        short_text = "가" * 5000

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 2500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 2600

        mock_message = MagicMock()
        mock_message.content = '{"type":"memo","confidence":0.75,"title":"짧은 문서","summary":"짧은 문서","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(short_text)

            assert result["truncated"] is False

    @pytest.mark.asyncio
    async def test_openai_api_failure_returns_error(self):
        """OpenAI API 실패 시 에러 응답"""
        with patch.object(OpenAIService, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.chat.completions.create.side_effect = Exception("API Error")
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("테스트 텍스트")

            assert "요약 생성 실패" in result["summary"]

    @pytest.mark.asyncio
    async def test_owner_id_passed_to_credit_check(self):
        """owner_id가 크레딧 체크로 전달됨"""
        mock_credit_check = {"allowed": True}

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"테스트","summary":"테스트","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check, \
             patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_check.return_value = mock_credit_check
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            await OpenAIService.summarize_text(
                "텍스트입니다.",
                owner_id="specific-owner-id"
            )

            mock_check.assert_called_once()
            call_args = mock_check.call_args[0]
            assert call_args[0] == "specific-owner-id"

    @pytest.mark.asyncio
    async def test_document_id_passed_to_token_logging(self):
        """document_id가 토큰 로깅으로 전달됨"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"테스트","summary":"테스트","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log, \
             patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock, return_value={"allowed": True}):

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            await OpenAIService.summarize_text(
                "텍스트입니다.",
                owner_id="user-123",
                document_id="doc-specific-id"
            )

            mock_log.assert_called_once()
            call_kwargs = mock_log.call_args[1]
            assert call_kwargs["document_id"] == "doc-specific-id"

    @pytest.mark.asyncio
    async def test_no_credit_check_without_owner_id(self):
        """owner_id가 없으면 크레딧 체크 스킵"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"테스트","summary":"테스트","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check, \
             patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            # owner_id 생략
            await OpenAIService.summarize_text("텍스트입니다.")

            # 크레딧 체크 호출되지 않음
            mock_check.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_text_handling(self):
        """빈 텍스트 처리"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 50
        mock_usage.completion_tokens = 20
        mock_usage.total_tokens = 70

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.0,"title":"","summary":"","tags":[]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text("")

            assert "summary" in result

    @pytest.mark.asyncio
    async def test_response_parsing_fallback(self):
        """JSON 파싱 실패 시 fallback"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = "이것은 JSON이 아닌 응답입니다."

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text("테스트 텍스트")

            # Fallback: JSON 파싱 실패 → content[:500]이 summary, document_type=general
            assert result["summary"] == "이것은 JSON이 아닌 응답입니다."
            assert result["document_type"] == "general"
            assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_max_length_parameter(self):
        """max_length 파라미터 전달"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 200
        mock_usage.total_tokens = 700

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"긴 제목","summary":"긴 요약","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            await OpenAIService.summarize_text(
                "테스트 텍스트",
                max_length=1000
            )

            call_args = mock_client.chat.completions.create.call_args
            assert call_args[1]["max_tokens"] == 1000

    @pytest.mark.asyncio
    async def test_estimated_tokens_calculation_korean(self):
        """한글 텍스트 토큰 추정 (1자 ≈ 2토큰)"""
        korean_text = "가" * 5000  # 5000자 한글 → ~10000 토큰

        mock_credit_check = {"allowed": True}

        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 5000
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 5100

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"한글 문서","summary":"한글 문서","tags":["한글"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check, \
             patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_check.return_value = mock_credit_check
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            await OpenAIService.summarize_text(
                korean_text,
                owner_id="user-123"
            )

            # 5000자 * 2 = 10000 토큰 (min(..., 10000) → 10000)
            call_args = mock_check.call_args[0]
            assert call_args[1] == 10000  # estimated_tokens

    @pytest.mark.asyncio
    async def test_token_logging_called_on_success(self):
        """요약 성공 시 토큰 로깅 호출됨"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = '{"type":"general","confidence":0.7,"title":"테스트","summary":"테스트","tags":["테스트"]}'

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log, \
             patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock, return_value={"allowed": True}):

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            await OpenAIService.summarize_text(
                "텍스트입니다.",
                owner_id="user-123",
                document_id="doc-456"
            )

            mock_log.assert_called_once()
            call_kwargs = mock_log.call_args[1]
            assert call_kwargs["prompt_tokens"] == 500
            assert call_kwargs["completion_tokens"] == 100
            assert call_kwargs["total_tokens"] == 600


# =============================================================================
# 3.5. 문서 분류 테스트
# =============================================================================

class TestDocumentClassification:
    """문서 분류 (DOCUMENT_TAXONOMY.md 1단계) 테스트"""

    def _make_mock_response(self, content_json: str):
        """JSON 응답 mock 생성 헬퍼"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 600
        mock_usage.completion_tokens = 150
        mock_usage.total_tokens = 750

        mock_message = MagicMock()
        mock_message.content = content_json

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage
        return mock_response

    @pytest.mark.asyncio
    async def test_valid_type_returned(self):
        """유효한 document_type이 그대로 반환됨"""
        resp = self._make_mock_response(
            '{"type":"diagnosis","confidence":0.95,"title":"진단서","summary":"진단 내용","tags":["진단"]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("진단서 텍스트")

            assert result["document_type"] == "diagnosis"
            assert result["confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_system_only_type_replaced_with_general(self):
        """annual_report/customer_review/unspecified → general로 교체"""
        for sys_type in ["annual_report", "customer_review", "unspecified"]:
            resp = self._make_mock_response(
                f'{{"type":"{sys_type}","confidence":0.9,"title":"제목","summary":"요약","tags":[]}}'
            )

            with patch.object(OpenAIService, "_get_client") as mock_get_client, \
                 patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
                mock_client = AsyncMock()
                mock_client.chat.completions.create.return_value = resp
                mock_get_client.return_value = mock_client

                result = await OpenAIService.summarize_text("텍스트")

                assert result["document_type"] == "general", f"{sys_type}이 general로 교체되어야 함"

    @pytest.mark.asyncio
    async def test_unknown_type_replaced_with_general(self):
        """목록에 없는 임의 type → general"""
        resp = self._make_mock_response(
            '{"type":"unknown_type_abc","confidence":0.5,"title":"제목","summary":"요약","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("텍스트")

            assert result["document_type"] == "general"

    @pytest.mark.asyncio
    async def test_confidence_clamped_to_0_1(self):
        """confidence가 0~1 범위로 클램핑됨"""
        resp = self._make_mock_response(
            '{"type":"policy","confidence":1.5,"title":"제목","summary":"요약","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("텍스트")

            assert result["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_confidence_negative_clamped_to_zero(self):
        """음수 confidence → 0.0"""
        resp = self._make_mock_response(
            '{"type":"policy","confidence":-0.5,"title":"제목","summary":"요약","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("텍스트")

            assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_temperature_zero(self):
        """temperature=0 으로 호출 (일관성 보장)"""
        resp = self._make_mock_response(
            '{"type":"general","confidence":0.5,"title":"제목","summary":"요약","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            await OpenAIService.summarize_text("텍스트")

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            assert call_kwargs["temperature"] == 0

    @pytest.mark.asyncio
    async def test_response_format_json_object(self):
        """response_format=json_object로 호출"""
        resp = self._make_mock_response(
            '{"type":"general","confidence":0.5,"title":"제목","summary":"요약","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock, return_value=True):
            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = resp
            mock_get_client.return_value = mock_client

            await OpenAIService.summarize_text("텍스트")

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            assert call_kwargs["response_format"] == {"type": "json_object"}

    @pytest.mark.asyncio
    async def test_all_valid_types(self):
        """22개 유효 유형 모두 검증"""
        from services.openai_service import VALID_DOCUMENT_TYPES
        assert len(VALID_DOCUMENT_TYPES) == 22

        for doc_type in VALID_DOCUMENT_TYPES:
            result = OpenAIService._validate_document_type(doc_type)
            assert result == doc_type, f"{doc_type}이 유효 타입으로 인정되어야 함"

    @pytest.mark.asyncio
    async def test_credit_skipped_includes_document_type(self):
        """크레딧 부족 시에도 document_type=general 반환"""
        with patch("services.openai_service.check_credit_for_summary", new_callable=AsyncMock) as mock_check:
            mock_check.return_value = {"allowed": False, "credits_remaining": 0, "days_until_reset": 5}

            result = await OpenAIService.summarize_text("텍스트", owner_id="user-123")

            assert result["credit_skipped"] is True
            assert result["document_type"] == "general"
            assert result["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_api_error_includes_document_type(self):
        """API 오류 시에도 document_type=general 반환"""
        with patch.object(OpenAIService, "_get_client") as mock_get_client:
            mock_client = AsyncMock()
            mock_client.chat.completions.create.side_effect = Exception("API Error")
            mock_get_client.return_value = mock_client

            result = await OpenAIService.summarize_text("텍스트")

            assert result["document_type"] == "general"
            assert result["confidence"] == 0.0


# =============================================================================
# 3-1. summarize_text - 빈 summary fallback 테스트 (ISSUE-8)
# =============================================================================

class TestSummarizeTextEmptySummaryFallback:
    """OpenAI가 빈 summary를 반환할 때 fallback 로직 테스트 (ISSUE-8)

    근본 원인: 기존 코드는 빈 summary 시 content[:500] (raw JSON 응답)을 저장했음.
    수정: unclassifiable이면 안내 메시지, 그 외는 원본 텍스트 앞 200자 사용.
    """

    def _make_mock_response(self, content_json: str):
        """OpenAI 응답 mock 객체 생성 헬퍼"""
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 500
        mock_usage.completion_tokens = 100
        mock_usage.total_tokens = 600

        mock_message = MagicMock()
        mock_message.content = content_json

        mock_choice = MagicMock()
        mock_choice.message = mock_message

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage
        return mock_response

    @pytest.mark.asyncio
    async def test_empty_summary_unclassifiable_returns_text_prefix(self):
        """unclassifiable + 빈 summary → 원본 텍스트 앞 200자 fallback (고정 메시지 아님)"""
        input_text = "비행기 조종 시스템 설명서입니다. " * 20  # 200자 초과
        mock_response = self._make_mock_response(
            '{"type":"unclassifiable","confidence":1.0,"title":"","summary":"","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(input_text)

            assert result["document_type"] == "unclassifiable"
            # 고정 메시지가 아닌 본문 앞부분이 반환되어야 함
            assert "비행기 조종 시스템" in result["summary"]
            assert result["summary"] != "문서 유형을 식별할 수 없습니다."
            assert result["summary"].endswith("...")
            assert "{" not in result["summary"]

    @pytest.mark.asyncio
    async def test_empty_summary_general_type_returns_text_prefix(self):
        """general + 빈 summary → 원본 텍스트 앞 200자 + '...' 반환"""
        long_text = "보험 계약서 내용입니다. " * 50  # 200자 초과
        mock_response = self._make_mock_response(
            '{"type":"general","confidence":0.8,"title":"","summary":"","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(long_text)

            assert result["summary"].endswith("...")
            assert len(result["summary"]) <= 203  # 200자 + "..."
            assert result["document_type"] == "general"
            # raw JSON이 아닌 원본 텍스트가 들어가야 함
            assert "보험 계약서" in result["summary"]
            assert "{" not in result["summary"]

    @pytest.mark.asyncio
    async def test_empty_summary_short_text_no_ellipsis(self):
        """빈 summary + 200자 이하 텍스트 → 말줄임표 없이 원본 텍스트 반환"""
        short_text = "짧은 문서 내용"
        mock_response = self._make_mock_response(
            '{"type":"general","confidence":0.5,"title":"","summary":"","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text(short_text)

            assert result["summary"] == "짧은 문서 내용"
            assert not result["summary"].endswith("...")

    @pytest.mark.asyncio
    async def test_normal_summary_not_affected(self):
        """정상 summary 반환 시 기존 동작 유지 (변경 없음)"""
        mock_response = self._make_mock_response(
            '{"type":"policy","confidence":0.95,"title":"보험 증권","summary":"이 문서는 2025년 보험 증권입니다.","tags":["보험","증권"]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text("원본 텍스트")

            assert result["summary"] == "이 문서는 2025년 보험 증권입니다."
            assert result["document_type"] == "policy"

    @pytest.mark.asyncio
    async def test_empty_summary_no_raw_json_in_result(self):
        """핵심 검증: 어떤 경우에도 raw JSON 문자열이 summary에 저장되지 않음"""
        # unclassifiable 케이스
        mock_response = self._make_mock_response(
            '{"type":"unclassifiable","confidence":1.0,"title":"","summary":"","tags":[]}'
        )

        with patch.object(OpenAIService, "_get_client") as mock_get_client, \
             patch.object(OpenAIService, "_log_token_usage", new_callable=AsyncMock) as mock_log:

            mock_client = AsyncMock()
            mock_client.chat.completions.create.return_value = mock_response
            mock_get_client.return_value = mock_client
            mock_log.return_value = True

            result = await OpenAIService.summarize_text("테스트 텍스트")

            # summary에 JSON 구조가 포함되지 않아야 함
            assert '"type"' not in result["summary"]
            assert '"confidence"' not in result["summary"]
            assert '"summary"' not in result["summary"]



"""
Analytics Writer Unit Tests — aims_analytics 직접 기록 모듈 테스트
R1-1 regression 테스트
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone


class TestCalculateCost:
    """비용 계산 (tokenUsageService.js와 동일 로직)"""

    def test_gpt4o_mini_cost(self):
        """gpt-4o-mini 비용 계산"""
        from services.analytics_writer import calculate_cost
        # input: 0.00015/1K, output: 0.0006/1K
        cost = calculate_cost("gpt-4o-mini", 1000, 500)
        expected = (1000 / 1000) * 0.00015 + (500 / 1000) * 0.0006
        assert cost == round(expected, 6)

    def test_embedding_cost_no_output(self):
        """임베딩 모델은 output 비용 0"""
        from services.analytics_writer import calculate_cost
        cost = calculate_cost("text-embedding-3-small", 1000, 0)
        expected = (1000 / 1000) * 0.00002
        assert cost == round(expected, 6)

    def test_unknown_model_uses_default(self):
        """미등록 모델은 default 비용 사용"""
        from services.analytics_writer import calculate_cost
        cost = calculate_cost("unknown-model", 1000, 1000)
        expected = (1000 / 1000) * 0.001 + (1000 / 1000) * 0.002
        assert cost == round(expected, 6)

    def test_cached_tokens_75pct_discount(self):
        """캐시 토큰 75% 할인"""
        from services.analytics_writer import calculate_cost
        # 1000 prompt, 800 cached → 200 non-cached
        cost = calculate_cost("gpt-4o-mini", 1000, 0, cached_tokens=800)
        # non-cached: (200/1000)*0.00015 = 0.00003
        # cached: (800/1000)*0.00015*0.25 = 0.00003
        expected = 0.00003 + 0.00003
        assert cost == round(expected, 6)

    def test_zero_tokens(self):
        """토큰 0일 때 비용 0"""
        from services.analytics_writer import calculate_cost
        assert calculate_cost("gpt-4o-mini", 0, 0) == 0.0

    def test_result_rounded_to_6_decimals(self):
        """결과가 소수점 6자리로 반올림"""
        from services.analytics_writer import calculate_cost
        cost = calculate_cost("gpt-4o-mini", 7, 3)
        assert len(str(cost).split(".")[-1]) <= 6


class TestAnalyticsWriterLogTokenUsage:
    """AnalyticsWriter.log_token_usage 테스트"""

    @pytest.mark.asyncio
    async def test_success_returns_true(self):
        """DB 기록 성공 시 True"""
        with patch("services.analytics_writer.motor.motor_asyncio") as mock_motor:
            mock_collection = AsyncMock()
            mock_collection.insert_one.return_value = MagicMock(inserted_id="abc")
            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_collection)
            mock_client = MagicMock()
            mock_client.__getitem__ = MagicMock(return_value=mock_db)
            mock_motor.AsyncIOMotorClient.return_value = mock_client

            from services.analytics_writer import AnalyticsWriter
            AnalyticsWriter._client = None  # reset singleton

            result = await AnalyticsWriter.log_token_usage(
                user_id="user-1", source="doc_summary", model="gpt-4o-mini",
                prompt_tokens=100, completion_tokens=50, total_tokens=150
            )
            assert result is True
            mock_collection.insert_one.assert_called_once()
            AnalyticsWriter._client = None  # cleanup

    @pytest.mark.asyncio
    async def test_document_schema_matches_js(self):
        """저장 문서 스키마가 tokenUsageService.js와 동일"""
        with patch("services.analytics_writer.motor.motor_asyncio") as mock_motor:
            mock_collection = AsyncMock()
            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_collection)
            mock_client = MagicMock()
            mock_client.__getitem__ = MagicMock(return_value=mock_db)
            mock_motor.AsyncIOMotorClient.return_value = mock_client

            from services.analytics_writer import AnalyticsWriter
            AnalyticsWriter._client = None

            await AnalyticsWriter.log_token_usage(
                user_id="user-1", source="rag_api", model="gpt-4o-mini",
                prompt_tokens=100, completion_tokens=50, total_tokens=150,
                metadata={"type": "chat_completion"}
            )

            doc = mock_collection.insert_one.call_args[0][0]
            # 필수 필드 존재 확인 (JS 스키마 동일)
            assert doc["user_id"] == "user-1"
            assert doc["source"] == "rag_api"
            assert "request_id" in doc
            assert isinstance(doc["timestamp"], datetime)
            assert doc["model"] == "gpt-4o-mini"
            assert doc["prompt_tokens"] == 100
            assert doc["completion_tokens"] == 50
            assert doc["cached_tokens"] == 0
            assert doc["total_tokens"] == 150
            assert "estimated_cost_usd" in doc
            assert doc["metadata"] == {"type": "chat_completion"}
            AnalyticsWriter._client = None

    @pytest.mark.asyncio
    async def test_db_error_returns_false(self):
        """DB 오류 시 False 반환 (fail-open)"""
        with patch("services.analytics_writer.motor.motor_asyncio") as mock_motor:
            mock_collection = AsyncMock()
            mock_collection.insert_one.side_effect = Exception("connection refused")
            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_collection)
            mock_client = MagicMock()
            mock_client.__getitem__ = MagicMock(return_value=mock_db)
            mock_motor.AsyncIOMotorClient.return_value = mock_client

            from services.analytics_writer import AnalyticsWriter
            AnalyticsWriter._client = None

            result = await AnalyticsWriter.log_token_usage(
                user_id="user-1", source="doc_summary", model="gpt-4o-mini",
                prompt_tokens=100, completion_tokens=50, total_tokens=150
            )
            assert result is False
            AnalyticsWriter._client = None

"""Characterization tests: ClassifyStage/EmbedStage API 키 조회 동작 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_env_fallback.py -v

API 키 조회:
- ProviderRegistry에 LLM/Embedding Provider가 등록되어 있으면 Provider 경유 (키 불필요)
- Provider 미등록 시 context["_api_keys"]["openai"]에서만 읽음
- os.environ fallback 없음 — 키가 없으면 RuntimeError
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from xpipe.stages.classify import ClassifyStage
from xpipe.stages.embed import EmbedStage


def _make_chat_response() -> SimpleNamespace:
    usage = SimpleNamespace(prompt_tokens=10, completion_tokens=5, total_tokens=15)
    message = SimpleNamespace(content=json.dumps({"type": "general", "confidence": 0.5}))
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice], usage=usage)


def _make_embed_response() -> SimpleNamespace:
    data_item = SimpleNamespace(embedding=[0.0] * 10)
    usage = SimpleNamespace(prompt_tokens=10, total_tokens=10)
    return SimpleNamespace(data=[data_item], usage=usage)


class TestClassifyApiKeySource:
    """ClassifyStage API 키 조회 동작 캡처"""

    @pytest.mark.asyncio
    async def test_context_key_used(self, monkeypatch):
        """context._api_keys.openai가 있으면 해당 키로 OpenAI 클라이언트 생성"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key-should-not-be-used")

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_make_chat_response())

        with patch("openai.AsyncOpenAI", return_value=mock_client) as mock_cls:
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "test"},
                "_api_keys": {"openai": "context-key"},
                "extracted_text": "문서 내용 테스트 분류 대상입니다",
            }
            await stage.execute(ctx)

        # AsyncOpenAI가 context 키로 생성됨
        mock_cls.assert_called_once_with(api_key="context-key")

    @pytest.mark.asyncio
    async def test_no_env_fallback_raises(self, monkeypatch):
        """context._api_keys.openai가 빈 문자열이면 RuntimeError (os.environ fallback 없음)"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key-should-not-be-used")

        stage = ClassifyStage()
        ctx = {
            "mode": "real",
            "_classify_config": {"system_prompt": "test"},
            "_api_keys": {"openai": ""},
            "extracted_text": "문서 내용 테스트 분류 대상입니다",
        }
        with pytest.raises(RuntimeError, match="API 키가 없습니다"):
            await stage.execute(ctx)

    @pytest.mark.asyncio
    async def test_provider_registry_bypasses_api_key(self):
        """ProviderRegistry에 LLM Provider가 등록되어 있으면 API 키 없이도 동작"""
        from xpipe.provider_registry import ProviderRegistry
        from xpipe.providers import LLMProvider

        class MockLLM(LLMProvider):
            async def complete(self, system_prompt, user_prompt, **kw):
                return {
                    "content": json.dumps({"type": "mock_type", "confidence": 0.9}),
                    "usage": {"input_tokens": 10, "output_tokens": 5},
                    "model": "mock-model",
                }
            def get_name(self): return "mock"
            def estimate_cost(self, i, o): return 0.0

        registry = ProviderRegistry()
        registry.register("llm", MockLLM(), priority=10)

        stage = ClassifyStage()
        ctx = {
            "mode": "real",
            "_classify_config": {"system_prompt": "test"},
            "_api_keys": {},  # API 키 없음
            "extracted_text": "문서 내용 테스트 분류 대상입니다",
            "_provider_registry": registry,
        }
        result = await stage.execute(ctx)
        assert result["document_type"] == "mock_type"
        assert result["classification_confidence"] == 0.9


class TestEmbedApiKeySource:
    """EmbedStage API 키 조회 동작 캡처"""

    @pytest.mark.asyncio
    async def test_context_key_used(self, monkeypatch):
        """context._api_keys.openai가 있으면 해당 키로 OpenAI 클라이언트 생성"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key-should-not-be-used")

        mock_client = MagicMock()
        mock_client.embeddings.create = AsyncMock(return_value=_make_embed_response())

        with patch("openai.AsyncOpenAI", return_value=mock_client) as mock_cls:
            stage = EmbedStage()
            ctx = {
                "mode": "real",
                "_api_keys": {"openai": "context-key"},
                "extracted_text": "임베딩 텍스트",
            }
            await stage.execute(ctx)

        mock_cls.assert_called_once_with(api_key="context-key")

    @pytest.mark.asyncio
    async def test_no_env_fallback_raises(self, monkeypatch):
        """context._api_keys.openai가 빈 문자열이면 RuntimeError (os.environ fallback 없음)"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key-should-not-be-used")

        stage = EmbedStage()
        ctx = {
            "mode": "real",
            "_api_keys": {"openai": ""},
            "extracted_text": "임베딩 텍스트",
        }
        with pytest.raises(RuntimeError, match="API 키가 없습니다"):
            await stage.execute(ctx)

    @pytest.mark.asyncio
    async def test_provider_registry_bypasses_api_key(self):
        """ProviderRegistry에 Embedding Provider가 등록되어 있으면 API 키 없이도 동작"""
        from xpipe.provider_registry import ProviderRegistry
        from xpipe.providers import EmbeddingProvider

        class MockEmbedding(EmbeddingProvider):
            async def embed(self, texts, **kw):
                return [[0.1] * 128 for _ in texts]
            def get_name(self): return "mock"
            def get_dimensions(self): return 128

        registry = ProviderRegistry()
        registry.register("embedding", MockEmbedding(), priority=10)

        stage = EmbedStage()
        ctx = {
            "mode": "real",
            "_api_keys": {},  # API 키 없음
            "extracted_text": "임베딩 텍스트",
            "_provider_registry": registry,
        }
        result = await stage.execute(ctx)
        assert result["embedded"] is True
        assert result["stage_data"]["embed"]["output"]["vector_dims"] == 128

"""Characterization tests: ClassifyStage/EmbedStage API 키 우선순위 캡처

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_env_fallback.py -v

API 키 조회 우선순위: context["_api_keys"]["openai"] > os.environ["OPENAI_API_KEY"]
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


class TestClassifyApiKeyPriority:
    """ClassifyStage API 키 우선순위 캡처"""

    @pytest.mark.asyncio
    async def test_context_key_takes_priority(self, monkeypatch):
        """context._api_keys.openai가 있으면 환경변수보다 우선"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key-should-not-be-used")

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_make_chat_response())

        with patch("openai.AsyncOpenAI", return_value=mock_client) as mock_cls:
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "test"},
                "_api_keys": {"openai": "context-key"},
                "extracted_text": "문서",
            }
            await stage.execute(ctx)

        # AsyncOpenAI가 context 키로 생성됨
        mock_cls.assert_called_once_with(api_key="context-key")

    @pytest.mark.asyncio
    async def test_env_fallback_when_context_empty(self, monkeypatch):
        """context._api_keys.openai가 빈 문자열이면 환경변수 fallback"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key")

        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=_make_chat_response())

        with patch("openai.AsyncOpenAI", return_value=mock_client) as mock_cls:
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "test"},
                "_api_keys": {"openai": ""},
                "extracted_text": "문서",
            }
            await stage.execute(ctx)

        mock_cls.assert_called_once_with(api_key="env-key")


class TestEmbedApiKeyPriority:
    """EmbedStage API 키 우선순위 캡처"""

    @pytest.mark.asyncio
    async def test_context_key_takes_priority(self, monkeypatch):
        """context._api_keys.openai가 있으면 환경변수보다 우선"""
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
    async def test_env_fallback_when_context_empty(self, monkeypatch):
        """context._api_keys.openai가 빈 문자열이면 환경변수 fallback"""
        monkeypatch.setenv("OPENAI_API_KEY", "env-key")

        mock_client = MagicMock()
        mock_client.embeddings.create = AsyncMock(return_value=_make_embed_response())

        with patch("openai.AsyncOpenAI", return_value=mock_client) as mock_cls:
            stage = EmbedStage()
            ctx = {
                "mode": "real",
                "_api_keys": {"openai": ""},
                "extracted_text": "임베딩 텍스트",
            }
            await stage.execute(ctx)

        mock_cls.assert_called_once_with(api_key="env-key")

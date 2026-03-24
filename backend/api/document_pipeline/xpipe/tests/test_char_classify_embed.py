"""Characterization tests: ClassifyStage & EmbedStage (real 모드)

실행: cd d:\\aims\\backend\\api\\document_pipeline && python -m pytest xpipe/tests/test_char_classify_embed.py -v

이 파일은 ClassifyStage와 EmbedStage의 현재 동작을 "있는 그대로" 캡처한다.
리팩토링 후에도 동일한 동작이 보존되는지 검증하는 regression safety net.
"""
from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from xpipe.stages.classify import ClassifyStage
from xpipe.stages.embed import EmbedStage


# ---------------------------------------------------------------------------
# Helpers: OpenAI mock 응답 구조
# ---------------------------------------------------------------------------

def _make_chat_response(content: str, prompt_tokens: int = 50, completion_tokens: int = 20) -> Any:
    """OpenAI chat.completions.create 응답 구조 모사"""
    usage = SimpleNamespace(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
    )
    message = SimpleNamespace(content=content)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice], usage=usage)


def _make_embedding_response(dims: int = 1536, total_tokens: int = 100) -> Any:
    """OpenAI embeddings.create 응답 구조 모사"""
    embedding = [0.01] * dims
    data_item = SimpleNamespace(embedding=embedding)
    usage = SimpleNamespace(prompt_tokens=total_tokens, total_tokens=total_tokens)
    return SimpleNamespace(data=[data_item], usage=usage)


# ---------------------------------------------------------------------------
# ClassifyStage 테스트
# ---------------------------------------------------------------------------

class TestClassifyStageNoConfig:
    """_classify_config 미제공 시 분류 스킵 동작 캡처"""

    @pytest.mark.asyncio
    async def test_no_config_sets_classified_false(self):
        """_classify_config 없으면 classified=False, document_type=None"""
        stage = ClassifyStage()
        ctx = {"mode": "real"}
        result = await stage.execute(ctx)

        assert result["classified"] is False
        assert result["document_type"] is None
        assert result["classification_confidence"] is None

    @pytest.mark.asyncio
    async def test_no_config_stage_data_skipped(self):
        """_classify_config 없으면 stage_data.classify.status == 'skipped'"""
        stage = ClassifyStage()
        ctx = {"mode": "real"}
        result = await stage.execute(ctx)

        assert result["stage_data"]["classify"]["status"] == "skipped"
        assert "어댑터 미제공" in result["stage_data"]["classify"]["reason"]


class TestClassifyStageStub:
    """stub 모드 동작 캡처"""

    @pytest.mark.asyncio
    async def test_stub_mode_no_api_call(self):
        """stub 모드에서는 OpenAI API를 호출하지 않고 None 값 반환"""
        stage = ClassifyStage()
        ctx = {
            "mode": "stub",
            "_classify_config": {"system_prompt": "test", "categories": ["a", "b"]},
            "extracted_text": "테스트 문서",
        }
        result = await stage.execute(ctx)

        assert result["classified"] is True
        assert result["document_type"] is None
        assert result["classification_confidence"] is None
        assert "stub" in result["stage_data"]["classify"]["output"]["model"]


class TestClassifyStageReal:
    """real 모드 동작 캡처 (OpenAI mock)"""

    @pytest.mark.asyncio
    async def test_real_mode_calls_openai(self):
        """real 모드에서 OpenAI API를 호출하고 JSON 응답을 파싱"""
        mock_response = _make_chat_response(
            json.dumps({"type": "policy", "confidence": 0.95})
        )
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {
                    "system_prompt": "분류하세요",
                    "categories": ["policy", "general"],
                },
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "샘플 문서 내용",
                "filename": "test.pdf",
            }
            result = await stage.execute(ctx)

        assert result["classified"] is True
        assert result["document_type"] == "policy"
        assert result["classification_confidence"] == 0.95

    @pytest.mark.asyncio
    async def test_real_mode_json_parse_failure(self):
        """OpenAI가 유효하지 않은 JSON 반환 시 None/0.0"""
        mock_response = _make_chat_response("이것은 JSON이 아닙니다")
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "문서 텍스트",
            }
            result = await stage.execute(ctx)

        assert result["document_type"] is None
        assert result["classification_confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_real_mode_markdown_json_extraction(self):
        """```json ... ``` 형식의 응답에서 JSON 추출"""
        content = '```json\n{"type": "diagnosis", "confidence": 0.8}\n```'
        mock_response = _make_chat_response(content)
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "진단서 내용",
            }
            result = await stage.execute(ctx)

        assert result["document_type"] == "diagnosis"
        assert result["classification_confidence"] == 0.8

    @pytest.mark.asyncio
    async def test_real_mode_text_truncation(self):
        """3000자 초과 텍스트는 잘려서 전달"""
        long_text = "가" * 5000
        mock_response = _make_chat_response(json.dumps({"type": "general", "confidence": 0.5}))
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "extracted_text": long_text,
            }
            await stage.execute(ctx)

        # 호출된 메시지에서 텍스트 길이 확인
        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs.get("messages", call_args[1].get("messages", []))
        user_msg = [m for m in messages if m["role"] == "user"][0]["content"]
        # 3000자로 잘린 텍스트가 포함되어야 함
        assert "가" * 3000 in user_msg
        assert "가" * 3001 not in user_msg

    @pytest.mark.asyncio
    async def test_real_mode_no_api_key_raises(self):
        """API 키가 없으면 RuntimeError"""
        stage = ClassifyStage()
        ctx = {
            "mode": "real",
            "_classify_config": {"system_prompt": "분류", "categories": []},
            "_api_keys": {},
            "extracted_text": "문서",
        }
        with pytest.raises(RuntimeError, match="API 키가 없습니다"):
            await stage.execute(ctx)

    @pytest.mark.asyncio
    async def test_real_mode_usage_tracking(self):
        """토큰 사용량이 context._usage에 기록"""
        mock_response = _make_chat_response(
            json.dumps({"type": "general", "confidence": 0.5}),
            prompt_tokens=100,
            completion_tokens=30,
        )
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "문서",
            }
            result = await stage.execute(ctx)

        usage = result["_usage"]["classify"]
        assert usage["prompt_tokens"] == 100
        assert usage["completion_tokens"] == 30
        assert usage["total_tokens"] == 130

    @pytest.mark.asyncio
    async def test_text_fallback_to_text_key(self):
        """extracted_text가 없으면 text 키에서 가져옴"""
        mock_response = _make_chat_response(json.dumps({"type": "general", "confidence": 0.5}))
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "text": "fallback 텍스트",
            }
            result = await stage.execute(ctx)

        assert result["stage_data"]["classify"]["input"]["text_length"] == len("fallback 텍스트")

    @pytest.mark.asyncio
    async def test_default_model_is_gpt41_mini(self):
        """기본 LLM 모델은 gpt-4.1-mini"""
        mock_response = _make_chat_response(json.dumps({"type": "general", "confidence": 0.5}))
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = ClassifyStage()
            ctx = {
                "mode": "real",
                "_classify_config": {"system_prompt": "분류", "categories": []},
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "문서",
            }
            await stage.execute(ctx)

        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs.get("model") == "gpt-4.1-mini"


# ---------------------------------------------------------------------------
# EmbedStage 테스트
# ---------------------------------------------------------------------------

class TestEmbedStageStub:
    """stub 모드 동작 캡처"""

    @pytest.mark.asyncio
    async def test_stub_mode_returns_1536_dims(self):
        """stub 모드에서 dims=1536, model에 'stub' 포함"""
        stage = EmbedStage()
        ctx = {"mode": "stub", "extracted_text": "테스트"}
        result = await stage.execute(ctx)

        assert result["embedded"] is True
        assert result["stage_data"]["embed"]["output"]["vector_dims"] == 1536
        assert "stub" in result["stage_data"]["embed"]["output"]["model"]


class TestEmbedStageReal:
    """real 모드 동작 캡처 (OpenAI mock)"""

    @pytest.mark.asyncio
    async def test_real_mode_calls_openai_embeddings(self):
        """real 모드에서 OpenAI Embedding API 호출"""
        mock_response = _make_embedding_response(dims=1536, total_tokens=50)
        mock_client = MagicMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = EmbedStage()
            ctx = {
                "mode": "real",
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "임베딩할 텍스트",
            }
            result = await stage.execute(ctx)

        assert result["embedded"] is True
        assert result["stage_data"]["embed"]["output"]["vector_dims"] == 1536

    @pytest.mark.asyncio
    async def test_real_mode_empty_text_returns_zero_dims(self):
        """빈 텍스트이면 API 호출 없이 dims=0"""
        mock_client = MagicMock()
        mock_client.embeddings.create = AsyncMock()

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = EmbedStage()
            ctx = {
                "mode": "real",
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "   ",
            }
            result = await stage.execute(ctx)

        assert result["stage_data"]["embed"]["output"]["vector_dims"] == 0
        mock_client.embeddings.create.assert_not_called()

    @pytest.mark.asyncio
    async def test_real_mode_text_truncation_3000(self):
        """3000자 초과 텍스트 truncate 확인"""
        mock_response = _make_embedding_response(dims=1536)
        mock_client = MagicMock()
        mock_client.embeddings.create = AsyncMock(return_value=mock_response)

        with patch("openai.AsyncOpenAI", return_value=mock_client):
            stage = EmbedStage()
            ctx = {
                "mode": "real",
                "_api_keys": {"openai": "test-key"},
                "extracted_text": "나" * 5000,
            }
            await stage.execute(ctx)

        call_args = mock_client.embeddings.create.call_args
        input_text = call_args.kwargs.get("input", call_args[1].get("input", ""))
        assert len(input_text) == 3000

    @pytest.mark.asyncio
    async def test_credit_pending_skips(self):
        """credit_pending이면 should_skip이 True"""
        stage = EmbedStage()
        ctx = {"credit_pending": True}
        assert stage.should_skip(ctx) is True

    @pytest.mark.asyncio
    async def test_no_credit_pending_does_not_skip(self):
        """credit_pending이 없으면 should_skip이 False"""
        stage = EmbedStage()
        ctx = {}
        assert stage.should_skip(ctx) is False

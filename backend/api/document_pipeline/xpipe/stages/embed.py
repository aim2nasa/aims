"""EmbedStage — 벡터 임베딩 스테이지"""
from __future__ import annotations

import logging
import time
from typing import Any

from xpipe.stage import Stage

logger = logging.getLogger(__name__)


class EmbedStage(Stage):
    """벡터 임베딩 스테이지

    분류된 문서의 텍스트를 벡터 임베딩으로 변환한다.
    stub 모드: 가짜 벡터 정보만 기록.
    real 모드: OpenAI Embedding API로 실제 벡터화.
    """

    def get_name(self) -> str:
        return "embed"

    def should_skip(self, context: dict[str, Any]) -> bool:
        """크레딧 부족 시 스킵"""
        return bool(context.get("credit_pending"))

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """벡터 임베딩 처리"""
        start = time.time()

        text = context.get("extracted_text", context.get("text", ""))
        mode = context.get("mode", "stub")
        models = context.get("models", {})
        embed_model = models.get("embedding", "text-embedding-3-small")

        # 청크 분할 (간이)
        chunk_size = 500
        text_len = len(text)
        chunk_count = max(1, (text_len + chunk_size - 1) // chunk_size) if text_len > 0 else 0

        if mode == "stub":
            dims = 1536
            model_display = f"{embed_model} (stub)"
        else:
            dims, model_display = await _real_embed(
                text, embed_model, context
            )

        context["embedded"] = True

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        embed_stage_data = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "text_length": text_len,
                "chunk_count": chunk_count,
                "model": model_display,
            },
            "output": {
                "vector_dims": dims,
                "chunk_count": chunk_count,
                "model": model_display,
                "text_source": "extracted_text",
                "docembed_status": "completed",
            },
        }
        # 토큰 사용량 포함 (비용 계산용)
        usage_info = context.get("_usage", {}).get("embed")
        if usage_info:
            embed_stage_data["output"]["tokens"] = usage_info
        context["stage_data"]["embed"] = embed_stage_data

        return context


async def _real_embed(
    text: str, embed_model: str, context: dict[str, Any]
) -> tuple[int, str]:
    """벡터 임베딩 — ProviderRegistry 경유 우선, 없으면 OpenAI 직접 호출 fallback."""

    if not text.strip():
        logger.warning("임베딩 스킵: 텍스트가 비어있습니다")
        return 0, embed_model

    # 텍스트가 너무 길면 앞부분만 (8191 토큰 제한 대비)
    # 한국어 1문자 ≈ 2~3토큰 → 안전하게 3000자로 제한
    embed_text = text[:3000]

    # 1순위: ProviderRegistry에서 Embedding Provider 조회
    registry = context.get("_provider_registry")
    if registry:
        try:
            provider = registry.get("embedding")
            vectors = await provider.embed([embed_text], model=embed_model)
            dims = len(vectors[0]) if vectors and vectors[0] else 0
            model_display = embed_model
            logger.info("임베딩 완료 (provider): %d차원, 모델=%s", dims, model_display)
            return dims, model_display
        except KeyError:
            # "embedding" role에 등록된 Provider가 없음 → fallback으로 진행
            logger.debug("ProviderRegistry에 'embedding' role 미등록 — OpenAI 직접 호출 fallback")

    # 2순위: OpenAI 직접 호출 (fallback — ProviderRegistry 미등록 시)
    api_key = context.get("_api_keys", {}).get("openai", "")
    if not api_key:
        raise RuntimeError(
            "임베딩 실행 불가: context['_api_keys']['openai']에 API 키가 없습니다. "
            "설정 패널에서 API 키를 입력하거나 .env.shared에 설정하세요."
        )

    try:
        from openai import AsyncOpenAI
    except ImportError:
        raise RuntimeError("임베딩 실행 불가: openai 패키지가 설치되지 않았습니다.")

    client = AsyncOpenAI(api_key=api_key)

    response = await client.embeddings.create(
        model=embed_model,
        input=embed_text,
    )

    dims = len(response.data[0].embedding)

    # 토큰 사용량 기록 (비용 계산용)
    usage = response.usage
    if usage:
        context.setdefault("_usage", {})["embed"] = {
            "prompt_tokens": getattr(usage, "prompt_tokens", usage.total_tokens),
            "total_tokens": usage.total_tokens,
            "model": embed_model,
        }

    logger.info("임베딩 완료: %d차원, 모델=%s", dims, embed_model)

    return dims, embed_model

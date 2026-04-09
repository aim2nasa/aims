"""ClassifyStage — AI 분류 스테이지

어댑터가 분류 설정(시스템 프롬프트, 카테고리 등)을 제공해야 동작한다.
어댑터 미제공 시 분류를 수행하지 않는다 (결과 없음).
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from xpipe.stage import Stage

logger = logging.getLogger(__name__)


class ClassifyStage(Stage):
    """AI 분류 스테이지

    어댑터가 context에 _classify_config를 주입해야 동작한다.
    _classify_config 없으면 분류 수행 안 함.

    _classify_config 예시:
        {
            "system_prompt": "다음 문서를 분류하세요...",
            "categories": ["type_a", "type_b", ...],
            "response_format": "json"
        }
    """

    def get_name(self) -> str:
        return "classify"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """AI 분류 처리"""
        start = time.time()

        mode = context.get("mode", "stub")
        classify_config = context.get("_classify_config")

        if not classify_config:
            # 어댑터 미제공 → 분류 수행 안 함
            context["classified"] = False
            context["document_type"] = None
            context["classification_confidence"] = None

            duration_ms = int((time.time() - start) * 1000)
            if "stage_data" not in context:
                context["stage_data"] = {}
            context["stage_data"]["classify"] = {
                "status": "skipped",
                "duration_ms": duration_ms,
                "reason": "어댑터 미제공 — 분류 설정 없음",
            }
            return context

        text = context.get("extracted_text", context.get("text", ""))
        file_name = context.get("filename", context.get("original_name", "unknown"))
        models = context.get("models", {})
        llm_model = models.get("llm", "gpt-4.1-mini")

        # 텍스트 부족 시 AI 호출 없이 즉시 unclassifiable 반환
        if not text or len(text.strip()) < 10:
            context["classified"] = True
            context["document_type"] = "unclassifiable"
            context["classification_confidence"] = 0.0

            duration_ms = int((time.time() - start) * 1000)
            if "stage_data" not in context:
                context["stage_data"] = {}
            context["stage_data"]["classify"] = {
                "status": "skipped",
                "duration_ms": duration_ms,
                "reason": f"텍스트 부족 (길이: {len(text.strip()) if text else 0}) — AI 분류 스킵",
            }
            return context

        if mode == "stub":
            doc_type = None
            confidence = None
            model_display = f"{llm_model} (stub)"
        else:
            doc_type, confidence, model_display = await _real_classify(
                text, file_name, llm_model, classify_config, context
            )

        context["classified"] = True
        context["document_type"] = doc_type
        context["classification_confidence"] = confidence

        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        classify_stage_data = {
            "status": "completed",
            "duration_ms": duration_ms,
            "input": {
                "text_length": len(text),
                "model": model_display,
            },
            "output": {
                "document_type": doc_type,
                "confidence": confidence,
                "model": model_display,
            },
        }
        # 토큰 사용량 포함 (비용 계산용)
        usage_info = context.get("_usage", {}).get("classify")
        if usage_info:
            classify_stage_data["output"]["tokens"] = usage_info
        context["stage_data"]["classify"] = classify_stage_data

        return context


async def _real_classify(
    text: str,
    file_name: str,
    llm_model: str,
    classify_config: dict[str, Any],
    context: dict[str, Any],
) -> tuple[str, float, str]:
    """AI 문서 분류 — ProviderRegistry 경유 우선, 없으면 OpenAI 직접 호출 fallback"""

    # 텍스트가 없거나 너무 짧으면 AI 호출 없이 즉시 unclassifiable 반환
    if not text or len(text.strip()) < 10:
        logger.info("텍스트 부족으로 분류 불가 (길이: %d) — unclassifiable 반환", len(text.strip()) if text else 0)
        return ("unclassifiable", 0.0, f"{llm_model} (skipped)")

    system_prompt = classify_config.get("system_prompt", "")
    categories = classify_config.get("categories", [])

    text_for_classify = text[:3000] if text else f"(텍스트 없음, 파일명: {file_name})"

    user_prompt = f"문서 텍스트:\n{text_for_classify}\n\n파일명: {file_name}"
    if categories:
        user_prompt += f"\n\n분류 카테고리: {', '.join(categories)}"
    user_prompt += '\n\nJSON 응답 형식:\n{"type": "분류결과", "confidence": 0.0~1.0}'

    # 1순위: ProviderRegistry에서 LLM Provider 조회
    registry = context.get("_provider_registry")
    if registry:
        try:
            result = await registry.call_with_fallback(
                "llm", "complete",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=llm_model,
                temperature=0,
                max_tokens=100,
            )
            result_text = result.get("content", "").strip()
            logger.info("AI 분류 결과 (raw, provider): %s", result_text)

            # 토큰 사용량 기록
            usage = result.get("usage", {})
            if usage:
                context.setdefault("_usage", {})["classify"] = {
                    "prompt_tokens": usage.get("input_tokens", 0),
                    "completion_tokens": usage.get("output_tokens", 0),
                    "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                    "model": result.get("model", llm_model),
                }

            return _parse_classify_response(result_text, result.get("model", llm_model))
        except KeyError:
            # "llm" role에 등록된 Provider가 없음 → fallback으로 진행
            logger.debug("ProviderRegistry에 'llm' role 미등록 — OpenAI 직접 호출 fallback")

    # 2순위: OpenAILLMProvider fallback (ProviderRegistry 미등록 시)
    from xpipe.providers_builtin import OpenAILLMProvider

    api_key = context.get("_api_keys", {}).get("openai", "")
    if not api_key:
        raise RuntimeError(
            "AI 분류 실행 불가: context['_api_keys']['openai']에 API 키가 없습니다."
        )

    provider = OpenAILLMProvider(api_key=api_key)
    result = await provider.complete(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=llm_model,
        temperature=0,
        max_tokens=100,
    )

    result_text = result.get("content", "").strip()
    logger.info("AI 분류 결과 (raw): %s", result_text)

    # 토큰 사용량 기록 (비용 계산용)
    raw_usage = result.get("_raw_usage")
    if raw_usage:
        context.setdefault("_usage", {})["classify"] = {
            "prompt_tokens": raw_usage.prompt_tokens,
            "completion_tokens": raw_usage.completion_tokens,
            "total_tokens": raw_usage.total_tokens,
            "model": llm_model,
        }

    return _parse_classify_response(result_text, llm_model)


def _parse_classify_response(result_text: str, model: str) -> tuple[str, float, str]:
    """AI 분류 응답 JSON 파싱"""
    try:
        text = result_text
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text.strip())
        doc_type = parsed.get("type", None)
        confidence = float(parsed.get("confidence", 0.0))
    except (json.JSONDecodeError, ValueError, IndexError):
        logger.warning("AI 분류 JSON 파싱 실패: %s", result_text)
        doc_type = None
        confidence = 0.0

    return doc_type, confidence, model

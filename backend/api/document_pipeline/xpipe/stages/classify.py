"""ClassifyStage — AI 분류 스테이지"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from xpipe.stage import Stage

logger = logging.getLogger(__name__)


class ClassifyStage(Stage):
    """AI 분류 스테이지

    추출된 텍스트를 기반으로 문서 유형을 분류한다.
    stub 모드: 파일명 기반 추정.
    real 모드: OpenAI API로 실제 분류.
    """

    def get_name(self) -> str:
        return "classify"

    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """AI 분류 처리"""
        start = time.time()

        text = context.get("extracted_text", context.get("text", ""))
        file_name = context.get("filename", context.get("original_name", "unknown"))
        mode = context.get("mode", "stub")
        models = context.get("models", {})
        llm_model = models.get("llm", "gpt-4.1-mini")

        if mode == "stub":
            doc_type = _stub_classify(file_name)
            confidence = "-"
            model_display = f"{llm_model} (stub)"
        else:
            doc_type, confidence, model_display = await _real_classify(
                text, file_name, llm_model, context
            )

        context["classified"] = True
        context["document_type"] = doc_type
        context["classification_confidence"] = confidence

        # stage_data 기록
        duration_ms = int((time.time() - start) * 1000)
        if "stage_data" not in context:
            context["stage_data"] = {}
        context["stage_data"]["classify"] = {
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

        return context


async def _real_classify(
    text: str, file_name: str, llm_model: str, context: dict[str, Any]
) -> tuple[str, float, str]:
    """OpenAI API로 실제 문서 분류"""
    import os

    api_key = context.get("_api_keys", {}).get("openai", "") or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "AI 분류 실행 불가: OPENAI_API_KEY가 설정되지 않았습니다. "
            "설정 패널에서 API 키를 입력하거나 .env.shared에 설정하세요."
        )

    try:
        from openai import AsyncOpenAI
    except ImportError:
        raise RuntimeError("AI 분류 실행 불가: openai 패키지가 설치되지 않았습니다.")

    client = AsyncOpenAI(api_key=api_key)

    # 텍스트가 너무 길면 앞부분만 사용
    text_for_classify = text[:3000] if text else f"(텍스트 없음, 파일명: {file_name})"

    prompt = f"""다음 문서의 유형을 분류하세요. 반드시 아래 JSON 형식으로만 응답하세요.

문서 텍스트:
{text_for_classify}

파일명: {file_name}

분류 카테고리: 보험증권, 계약서, 보험금청구서, 진단서, 연간보고서, 고객검토서, 통장사본, 신분증, 메모, 일반문서

JSON 응답 형식:
{{"type": "분류결과", "confidence": 0.0~1.0}}"""

    response = await client.chat.completions.create(
        model=llm_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=100,
    )

    result_text = response.choices[0].message.content.strip()
    logger.info("AI 분류 결과 (raw): %s", result_text)

    # JSON 파싱
    try:
        # ```json ... ``` 형식 처리
        if "```" in result_text:
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        parsed = json.loads(result_text.strip())
        doc_type = parsed.get("type", "일반문서")
        confidence = float(parsed.get("confidence", 0.5))
    except (json.JSONDecodeError, ValueError, IndexError):
        logger.warning("AI 분류 JSON 파싱 실패: %s", result_text)
        doc_type = "일반문서"
        confidence = 0.0

    return doc_type, confidence, llm_model


def _stub_classify(filename: str) -> str:
    """stub 분류 — 파일명 기반 단순 추정 (데모 시각화용)"""
    fn = filename.lower()
    if any(k in fn for k in ["보험", "증권", "policy"]):
        return "보험증권"
    if any(k in fn for k in ["계약", "contract"]):
        return "계약서"
    if any(k in fn for k in ["청구", "claim"]):
        return "보험금청구서"
    if any(k in fn for k in ["ar", "annual", "연간"]):
        return "연간보고서"
    if any(k in fn for k in ["crs", "review", "검토"]):
        return "고객검토서"
    if any(k in fn for k in ["진단", "medical"]):
        return "진단서"
    return "일반문서"

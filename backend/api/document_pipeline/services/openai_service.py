"""
OpenAI Service for Text Summarization
"""
import os
import uuid
import httpx
import openai
import logging
from typing import List, Dict, Any, Optional

from config import get_settings

logger = logging.getLogger(__name__)

# aims_api 토큰 로깅 설정
AIMS_API_BASE_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "aims-internal-token-logging-key-2024")

# 🔴 크레딧 체크 API 설정
CREDIT_CHECK_URL = f"{AIMS_API_BASE_URL}/api/internal/check-credit"


async def check_credit_for_summary(user_id: str, estimated_tokens: int = 1000) -> dict:
    """
    Summary 생성 전 크레딧 체크 (aims_api 내부 API 호출)

    Args:
        user_id: 사용자 ID
        estimated_tokens: 예상 토큰 수 (기본 1000)

    Returns:
        dict: {
            allowed: bool,
            reason: str,
            credits_remaining: int,
            ...
        }

    @see docs/EMBEDDING_CREDIT_POLICY.md
    """
    if not user_id or user_id == "system":
        # system 사용자는 크레딧 체크 스킵
        return {"allowed": True, "reason": "system_user"}

    try:
        # AI 토큰을 페이지 수로 환산 (1K 토큰 ≈ 0.5 크레딧)
        # Summary는 보통 1페이지 미만 분량
        estimated_pages = max(1, estimated_tokens // 5000)

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                CREDIT_CHECK_URL,
                json={
                    "user_id": user_id,
                    "estimated_pages": estimated_pages
                },
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": INTERNAL_API_KEY
                }
            )

            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"[CreditCheck] API 호출 실패: {response.status_code}")
                # fail-open: API 실패 시 허용
                return {"allowed": True, "reason": "api_error_fallback"}

    except Exception as e:
        logger.warning(f"[CreditCheck] 오류 (fail-open): {e}")
        # fail-open: 오류 시 허용
        return {"allowed": True, "reason": "error_fallback", "error": str(e)}


class OpenAIService:
    """OpenAI service using class methods"""

    _client: Optional[openai.AsyncOpenAI] = None

    @classmethod
    def _get_client(cls) -> openai.AsyncOpenAI:
        """Get or create OpenAI client"""
        if cls._client is None:
            settings = get_settings()
            cls._client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return cls._client

    @classmethod
    async def _log_token_usage(
        cls,
        user_id: str,
        document_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int
    ) -> bool:
        """
        aims_api에 토큰 사용량 로깅

        Args:
            user_id: 문서 소유자 ID
            document_id: 문서 ID
            model: 사용된 모델명
            prompt_tokens: 입력 토큰 수
            completion_tokens: 출력 토큰 수
            total_tokens: 총 토큰 수

        Returns:
            bool: 로깅 성공 여부
        """
        try:
            payload = {
                "user_id": user_id or "system",
                "source": "doc_summary",
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "request_id": str(uuid.uuid4()),
                "metadata": {
                    "document_id": document_id,
                    "workflow": "document_pipeline"
                }
            }

            headers = {
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            }

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    TOKEN_LOGGING_URL,
                    json=payload,
                    headers=headers
                )

                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        logger.info(f"[TokenLog] 요약 토큰 로깅 완료: {total_tokens} tokens")
                        return True

            logger.warning(f"[TokenLog] 토큰 로깅 실패: {response.status_code}")
            return False

        except Exception as e:
            logger.warning(f"[TokenLog] 토큰 로깅 오류: {e}")
            return False

    @classmethod
    async def summarize_text(
        cls,
        text: str,
        max_length: int = 500,
        owner_id: Optional[str] = None,
        document_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Summarize text and extract tags.
        Returns {"summary": str, "tags": list}
        """
        # 🔴 크레딧 체크 (EMBEDDING_CREDIT_POLICY.md 참조)
        if owner_id:
            # 텍스트 길이 기준 토큰 추정 (한글 1자 ≈ 2토큰)
            estimated_tokens = min(len(text) * 2, 10000)
            credit_check = await check_credit_for_summary(owner_id, estimated_tokens)

            if not credit_check.get("allowed", True):
                logger.warning(f"[CREDIT_EXCEEDED] Summary 스킵: owner_id={owner_id}, remaining={credit_check.get('credits_remaining', 0)}")
                return {
                    "summary": "크레딧 부족으로 요약이 생략되었습니다.",
                    "tags": [],
                    "truncated": False,
                    "credit_skipped": True,
                    "credits_remaining": credit_check.get("credits_remaining", 0),
                    "days_until_reset": credit_check.get("days_until_reset", 0)
                }

        # Truncate if too long
        truncated = len(text) > 10000
        if truncated:
            text = text[:10000]

        prompt = f"""다음 문서를 3-5줄로 요약하고, 핵심 키워드 태그를 3-5개 추출해주세요.

문서:
{text}

응답 형식:
요약: [요약 내용]
태그: [태그1], [태그2], [태그3]"""

        try:
            client = cls._get_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "당신은 문서 요약 전문가입니다."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_length,
                temperature=0.3
            )

            content = response.choices[0].message.content

            # 토큰 사용량 로깅
            if response.usage and (owner_id or document_id):
                await cls._log_token_usage(
                    user_id=owner_id,
                    document_id=document_id,
                    model="gpt-4o-mini",
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    total_tokens=response.usage.total_tokens
                )

            # Parse response
            summary = ""
            tags = []

            lines = content.strip().split("\n")
            for line in lines:
                if line.startswith("요약:"):
                    summary = line[3:].strip()
                elif line.startswith("태그:"):
                    tag_str = line[3:].strip()
                    tags = [t.strip().strip("[]") for t in tag_str.split(",")]

            # Fallback if parsing fails
            if not summary:
                summary = content[:500]

            return {"summary": summary, "tags": tags, "truncated": truncated}

        except Exception as e:
            # Return error message as summary
            return {"summary": f"요약 생성 실패: {str(e)}", "tags": [], "truncated": truncated}

    @classmethod
    async def extract_tags(cls, text: str) -> List[str]:
        """Extract keywords as tags from text"""
        result = await cls.summarize_text(text)
        return result.get("tags", [])

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

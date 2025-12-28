"""
OpenAI Service for Text Summarization
"""
import openai
from typing import List, Dict, Any, Optional
import re

from config import get_settings


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
    async def summarize_text(
        cls,
        text: str,
        max_length: int = 500
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

"""
OpenAI Service for Text Summarization
"""
import openai
from typing import List, Tuple
import re

from config import get_settings


class OpenAIService:
    def __init__(self):
        self.settings = get_settings()
        self.client = openai.AsyncOpenAI(api_key=self.settings.OPENAI_API_KEY)

    async def summarize_text(
        self,
        text: str,
        max_length: int = 500
    ) -> Tuple[str, List[str]]:
        """
        Summarize text and extract tags.
        Returns (summary, tags)
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
            response = await self.client.chat.completions.create(
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

            return summary, tags

        except Exception as e:
            # Return error message as summary
            return f"요약 생성 실패: {str(e)}", []

    async def extract_tags(self, text: str) -> List[str]:
        """Extract keywords as tags from text"""
        _, tags = await self.summarize_text(text)
        return tags

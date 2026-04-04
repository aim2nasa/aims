"""
Anthropic Claude API Service
Shadow Mode 자동 수정용
"""
import json
import logging
from typing import Any, Dict, Optional

import anthropic
from config import get_settings

logger = logging.getLogger(__name__)


class AnthropicService:
    """Anthropic Claude API 서비스"""

    _client: Optional[anthropic.Anthropic] = None

    @classmethod
    def _get_client(cls) -> anthropic.Anthropic:
        """Get or create Anthropic client"""
        if cls._client is None:
            settings = get_settings()
            cls._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        return cls._client

    @classmethod
    async def analyze_mismatch(
        cls,
        workflow: str,
        n8n_response: Dict[str, Any],
        fastapi_response: Dict[str, Any],
        diffs: list,
        source_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        불일치 분석 및 수정 제안

        Args:
            workflow: 워크플로우 이름 (예: "docupload")
            n8n_response: n8n 응답
            fastapi_response: FastAPI 응답
            diffs: 차이점 목록
            source_code: 관련 소스 코드 (선택)

        Returns:
            분석 결과 및 수정 제안
        """
        prompt = f"""다음 Shadow Mode 불일치를 분석하고 FastAPI 코드 수정 방법을 제안해주세요.

## 워크플로우
{workflow}

## n8n 응답 (기준)
```json
{json.dumps(n8n_response, indent=2, ensure_ascii=False)[:2000]}
```

## FastAPI 응답
```json
{json.dumps(fastapi_response, indent=2, ensure_ascii=False)[:2000]}
```

## 차이점
```json
{json.dumps(diffs, indent=2, ensure_ascii=False)}
```

{f"## 관련 소스 코드{chr(10)}```python{chr(10)}{source_code[:3000]}{chr(10)}```" if source_code else ""}

## 요청사항
1. 불일치 원인 분석
2. FastAPI 코드 수정 방법 (구체적인 코드 제시)
3. 주의사항

JSON 형식으로 응답해주세요:
{{
    "cause": "원인 분석",
    "fix_description": "수정 설명",
    "code_changes": [
        {{
            "file": "파일명",
            "old_code": "기존 코드",
            "new_code": "수정 코드"
        }}
    ],
    "notes": "주의사항"
}}
"""

        try:
            client = cls._get_client()
            message = client.messages.create(
                model="claude-3-5-haiku-20241022",  # 빠르고 저렴
                max_tokens=2000,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            response_text = message.content[0].text

            # JSON 파싱 시도
            try:
                # JSON 블록 추출
                if "```json" in response_text:
                    json_str = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    json_str = response_text.split("```")[1].split("```")[0]
                else:
                    json_str = response_text

                result = json.loads(json_str.strip())
                result["raw_response"] = response_text
                return result
            except json.JSONDecodeError:
                return {
                    "cause": "분석 완료",
                    "fix_description": response_text,
                    "code_changes": [],
                    "notes": "JSON 파싱 실패, 원본 응답 참조",
                    "raw_response": response_text
                }

        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return {
                "error": str(e),
                "cause": None,
                "fix_description": None,
                "code_changes": [],
                "notes": f"API 호출 실패: {e}"
            }

    @classmethod
    async def generate_fix_code(
        cls,
        workflow: str,
        source_file: str,
        source_code: str,
        expected_behavior: str,
        actual_behavior: str
    ) -> Dict[str, Any]:
        """
        수정 코드 생성 (복잡한 케이스용, Sonnet 사용)
        """
        prompt = f"""다음 FastAPI 코드를 수정해주세요.

## 파일
{source_file}

## 현재 코드
```python
{source_code}
```

## 예상 동작 (n8n 기준)
{expected_behavior}

## 실제 동작 (FastAPI)
{actual_behavior}

## 요청
1. 예상 동작과 동일하게 수정
2. 수정된 전체 코드 제공
3. 변경 사항 설명

JSON 형식:
{{
    "modified_code": "수정된 전체 코드",
    "changes": ["변경사항1", "변경사항2"],
    "explanation": "설명"
}}
"""

        try:
            client = cls._get_client()
            message = client.messages.create(
                model="claude-sonnet-4-20250514",  # 복잡한 코드 수정용
                max_tokens=4000,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            response_text = message.content[0].text

            try:
                if "```json" in response_text:
                    json_str = response_text.split("```json")[1].split("```")[0]
                else:
                    json_str = response_text

                return json.loads(json_str.strip())
            except json.JSONDecodeError:
                return {
                    "modified_code": None,
                    "changes": [],
                    "explanation": response_text,
                    "raw_response": response_text
                }

        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return {"error": str(e)}

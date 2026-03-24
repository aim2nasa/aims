"""
xPipe AI Provider ABC + 내장 구현체

=== ABC (코어 인터페이스) ===
- LLMProvider: LLM 완성(completion) 호출
- OCRProvider: OCR 텍스트 인식
- EmbeddingProvider: 벡터 임베딩 생성

=== 내장 구현체 (참조 구현) ===
- UpstageOCRProvider: Upstage Document Digitization API
- OpenAILLMProvider: OpenAI Chat Completions API
- OpenAIEmbeddingProvider: OpenAI Embeddings API

내장 구현체는 코어 ABC 위에 참조 구현으로 제공된다.
독립 패키지 분리 시 별도 모듈로 이동 예정.
"""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """LLM 제공자 (분류/요약/제목 생성)

    하나의 LLM 서비스(OpenAI GPT, Anthropic Claude 등)를 래핑한다.
    xPipe 코어는 이 인터페이스를 통해 LLM을 호출하며,
    구현체 교체만으로 Provider를 전환할 수 있다.
    """

    @abstractmethod
    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """LLM 완성(completion) 호출

        Args:
            system_prompt: 시스템 프롬프트
            user_prompt: 사용자 프롬프트
            **kwargs: Provider별 추가 옵션 (model, temperature, max_tokens 등)

        Returns:
            응답 dict. 최소 필드:
                - content (str): 생성된 텍스트
                - usage (dict): {"input_tokens": int, "output_tokens": int}
                - model (str): 실제 사용된 모델명
        """
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Provider 이름 반환 (예: "openai", "anthropic")"""
        ...

    @abstractmethod
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """비용 추정 (USD)

        Args:
            input_tokens: 입력 토큰 수
            output_tokens: 출력 토큰 수

        Returns:
            추정 비용 (USD). 정확한 값이 아닌 추정치.
        """
        ...


class OCRProvider(ABC):
    """OCR 제공자 (텍스트 인식)

    PDF/이미지에서 텍스트를 추출하는 서비스를 래핑한다.
    """

    @abstractmethod
    async def process(
        self,
        file_path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """OCR 처리

        Args:
            file_path: 처리할 파일 경로
            **kwargs: Provider별 추가 옵션 (language, dpi 등)

        Returns:
            처리 결과 dict. 최소 필드:
                - text (str): 인식된 전체 텍스트
                - pages (int): 처리된 페이지 수
                - confidence (float): 인식 신뢰도 (0~1)
        """
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Provider 이름 반환 (예: "upstage", "tesseract")"""
        ...


class EmbeddingProvider(ABC):
    """임베딩 제공자 (벡터 생성)

    텍스트를 벡터로 변환하는 서비스를 래핑한다.
    """

    @abstractmethod
    async def embed(
        self,
        texts: list[str],
        **kwargs: Any,
    ) -> list[list[float]]:
        """텍스트 임베딩 생성

        Args:
            texts: 임베딩할 텍스트 목록
            **kwargs: Provider별 추가 옵션 (model, dimensions 등)

        Returns:
            벡터 목록. texts와 같은 길이.
            각 벡터는 float 리스트.
        """
        ...

    @abstractmethod
    def get_name(self) -> str:
        """Provider 이름 반환 (예: "openai", "voyage")"""
        ...

    @abstractmethod
    def get_dimensions(self) -> int:
        """임베딩 벡터 차원 수 반환"""
        ...


# ---------------------------------------------------------------------------
# 내장 구현체: UpstageOCRProvider (참조 구현)
# ---------------------------------------------------------------------------

class UpstageOCRProvider(OCRProvider):
    """Upstage Document Digitization API를 사용하는 OCR Provider

    AIMS upstage_service.py의 순수 API 호출 부분을 xPipe Provider 형태로 래핑.
    AIMS 도메인 로직(MongoDB, Redis, 고객명 조회 등)은 포함하지 않음.

    API 키는 생성자에서 외부 주입한다. 환경변수 참조는 소비자(AIMS) 책임.
    """

    API_URL = "https://api.upstage.ai/v1/document-digitization"

    def __init__(self, api_key: str = ""):
        self._api_key = api_key

    @property
    def api_key(self) -> str:
        """생성자에서 주입받은 API 키 반환"""
        return self._api_key

    def set_api_key(self, key: str) -> None:
        """런타임에 API 키 변경"""
        self._api_key = key

    def get_name(self) -> str:
        return "upstage"

    async def process(
        self,
        file_path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Upstage API로 OCR 처리

        Args:
            file_path: 처리할 이미지/PDF 파일 경로

        Returns:
            {text, pages, confidence}
        """
        if not self.api_key:
            raise RuntimeError("Upstage API 키가 설정되지 않았습니다")

        import httpx

        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            file_content = f.read()

        max_retries = 5
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    response = await client.post(
                        self.API_URL,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        files={"document": (filename, file_content)},
                        data={"model": "ocr"},
                    )

                    if response.status_code == 429:
                        # Rate limit (Upstage Tier 1 = 1 RPS) — Retry-After 헤더 우선, 없으면 backoff
                        if attempt < max_retries - 1:
                            import asyncio
                            retry_after = response.headers.get("Retry-After")
                            if retry_after:
                                wait = int(retry_after)
                            else:
                                wait = 10 * (attempt + 1)  # 10, 20, 30, 40초
                            await asyncio.sleep(wait)
                            continue
                        error_msg = self._parse_error(response)
                        raise RuntimeError(f"Upstage API 오류 (429): {error_msg} (재시도 {max_retries}회 소진)")

                    if response.status_code != 200:
                        error_msg = self._parse_error(response)
                        raise RuntimeError(f"Upstage API 오류 ({response.status_code}): {error_msg}")

                    data = response.json()
                    return {
                        "text": data.get("text", ""),
                        "pages": data.get("numBilledPages", 1),
                        "confidence": data.get("confidence", 0.0),
                    }

            except httpx.TimeoutException:
                if attempt < max_retries - 1:
                    import asyncio
                    await asyncio.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError("Upstage OCR 처리 시간 초과 (120초, 재시도 소진)")

        raise RuntimeError("Upstage OCR 재시도 실패")

    @staticmethod
    def _parse_error(response: Any) -> str:
        try:
            data = response.json()
            if "error" in data and "message" in data["error"]:
                return data["error"]["message"]
        except Exception:
            pass
        return f"HTTP {response.status_code}"


# ---------------------------------------------------------------------------
# 내장 구현체: OpenAILLMProvider (참조 구현)
# ---------------------------------------------------------------------------

class OpenAILLMProvider(LLMProvider):
    """OpenAI Chat Completions API를 사용하는 LLM Provider

    stages/ 코드에서 `from openai` 직접 import를 제거하기 위한 래퍼.
    openai import는 이 Provider 내부에서만 수행한다.
    """

    def __init__(self, api_key: str = ""):
        self._api_key = api_key

    def get_name(self) -> str:
        return "openai"

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        # GPT-4.1-mini 기준 대략적 추정 (USD)
        return (input_tokens * 0.4 + output_tokens * 1.6) / 1_000_000

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if not self._api_key:
            raise RuntimeError(
                "AI 분류 실행 불가: context['_api_keys']['openai']에 API 키가 없습니다."
            )

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)

        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        model = kwargs.get("model", "gpt-4.1-mini")
        temperature = kwargs.get("temperature", 0)
        max_tokens = kwargs.get("max_tokens", 100)

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        result_text = response.choices[0].message.content.strip()
        usage = response.usage

        return {
            "content": result_text,
            "usage": {
                "input_tokens": usage.prompt_tokens if usage else 0,
                "output_tokens": usage.completion_tokens if usage else 0,
            },
            "model": model,
            # 원본 usage 객체도 전달 (호환성)
            "_raw_usage": usage,
        }


# ---------------------------------------------------------------------------
# 내장 구현체: OpenAIEmbeddingProvider (참조 구현)
# ---------------------------------------------------------------------------

class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI Embeddings API를 사용하는 Embedding Provider

    stages/ 코드에서 `from openai` 직접 import를 제거하기 위한 래퍼.
    openai import는 이 Provider 내부에서만 수행한다.
    """

    def __init__(self, api_key: str = "", model: str = "text-embedding-3-small"):
        self._api_key = api_key
        self._model = model

    def get_name(self) -> str:
        return "openai"

    def get_dimensions(self) -> int:
        # text-embedding-3-small: 1536, text-embedding-3-large: 3072
        dims_map = {
            "text-embedding-3-small": 1536,
            "text-embedding-3-large": 3072,
            "text-embedding-ada-002": 1536,
        }
        return dims_map.get(self._model, 1536)

    async def embed(
        self,
        texts: list[str],
        **kwargs: Any,
    ) -> list[list[float]]:
        if not self._api_key:
            raise RuntimeError(
                "임베딩 실행 불가: context['_api_keys']['openai']에 API 키가 없습니다. "
                "설정 패널에서 API 키를 입력하거나 .env.shared에 설정하세요."
            )

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self._api_key)
        model = kwargs.get("model", self._model)

        response = await client.embeddings.create(
            model=model,
            input=texts[0] if len(texts) == 1 else texts,
        )

        vectors = [item.embedding for item in response.data]

        # 사용량 정보를 인스턴스에 임시 저장 (호출자가 참조 가능)
        self._last_usage = response.usage

        return vectors

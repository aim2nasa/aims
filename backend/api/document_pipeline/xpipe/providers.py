"""
xPipe AI Provider ABC (코어 인터페이스)

- LLMProvider: LLM 완성(completion) 호출
- OCRProvider: OCR 텍스트 인식
- EmbeddingProvider: 벡터 임베딩 생성

내장 구현체는 providers_builtin.py에 분리되어 있다.
하위 호환을 위해 이 모듈에서도 re-export한다.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


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
# 하위 호환 re-export: 내장 구현체는 providers_builtin.py로 분리됨
# `from xpipe.providers import OpenAILLMProvider` 경로를 유지하기 위함
# ---------------------------------------------------------------------------
from xpipe.providers_builtin import (  # noqa: F401, E402
    UpstageOCRProvider,
    OpenAILLMProvider,
    OpenAIEmbeddingProvider,
)

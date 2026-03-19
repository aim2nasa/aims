"""
xPipe Provider Registry — Provider 등록·조회·폴백 관리

설계 원칙:
- 표준 라이브러리만 사용 (xpipe 독립성 유지)
- role 기반 등록: 하나의 role에 여러 Provider를 priority로 등록
- 폴백 체인: 1순위 실패 시 2순위 자동 전환
- 스레드 안전성: 현재는 단일 스레드 가정 (필요 시 Lock 추가)

사용 예:
    registry = ProviderRegistry()
    registry.register("llm", OpenAIProvider(), priority=10)
    registry.register("llm", AnthropicProvider(), priority=5)  # 폴백

    provider = registry.get("llm")  # → OpenAIProvider (priority 10)
    result = await registry.call_with_fallback("llm", "complete", system_prompt="...", user_prompt="...")
"""
from __future__ import annotations

import logging
from typing import Any, Union

from xpipe.providers import EmbeddingProvider, LLMProvider, OCRProvider

logger = logging.getLogger(__name__)

# Provider 타입 유니온
ProviderType = Union[LLMProvider, OCRProvider, EmbeddingProvider]


class _ProviderEntry:
    """내부용: priority 포함 Provider 엔트리"""

    __slots__ = ("provider", "priority")

    def __init__(self, provider: ProviderType, priority: int):
        self.provider = provider
        self.priority = priority


class ProviderRegistry:
    """Provider 등록·조회·폴백 관리

    role(역할) 기반으로 Provider를 등록하고, priority 순으로 조회한다.
    role 예: "llm", "ocr", "embedding"
    """

    def __init__(self) -> None:
        # role → [_ProviderEntry, ...] (priority 내림차순 정렬)
        self._registry: dict[str, list[_ProviderEntry]] = {}

    def register(
        self,
        role: str,
        provider: ProviderType,
        priority: int = 0,
    ) -> None:
        """Provider 등록

        같은 role에 여러 Provider를 등록할 수 있다.
        priority가 높을수록 우선 사용된다.

        Args:
            role: 역할 식별자 (예: "llm", "ocr", "embedding")
            provider: Provider 인스턴스
            priority: 우선순위 (높을수록 우선. 기본 0)
        """
        entry = _ProviderEntry(provider, priority)

        if role not in self._registry:
            self._registry[role] = []

        self._registry[role].append(entry)
        # priority 내림차순 정렬
        self._registry[role].sort(key=lambda e: e.priority, reverse=True)

    def get(self, role: str) -> ProviderType:
        """최우선 Provider 반환

        Args:
            role: 역할 식별자

        Returns:
            가장 높은 priority의 Provider

        Raises:
            KeyError: 해당 role에 등록된 Provider가 없는 경우
        """
        entries = self._registry.get(role)
        if not entries:
            raise KeyError(f"'{role}' role에 등록된 Provider가 없습니다.")
        return entries[0].provider

    def get_fallback(self, role: str) -> list[ProviderType]:
        """폴백 체인 반환 (priority 내림차순)

        Args:
            role: 역할 식별자

        Returns:
            Provider 목록 (priority 내림차순). 없으면 빈 리스트.
        """
        entries = self._registry.get(role, [])
        return [e.provider for e in entries]

    def list_roles(self) -> list[str]:
        """등록된 role 목록 반환"""
        return list(self._registry.keys())

    def list_providers(self, role: str) -> list[dict[str, Any]]:
        """특정 role에 등록된 Provider 정보 목록 반환

        Args:
            role: 역할 식별자

        Returns:
            Provider 정보 목록. 각 항목:
                - name (str): Provider 이름
                - priority (int): 우선순위
                - type (str): Provider 클래스명
        """
        entries = self._registry.get(role, [])
        return [
            {
                "name": e.provider.get_name(),
                "priority": e.priority,
                "type": type(e.provider).__name__,
            }
            for e in entries
        ]

    async def call_with_fallback(
        self,
        role: str,
        method: str,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """1순위 실패 시 2순위 자동 전환하며 호출

        등록된 Provider를 priority 순으로 시도하고,
        예외 발생 시 다음 Provider로 자동 전환한다.

        Args:
            role: 역할 식별자
            method: 호출할 메서드명 (예: "complete", "process", "embed")
            *args: 메서드 위치 인자
            **kwargs: 메서드 키워드 인자

        Returns:
            성공한 Provider의 메서드 반환값

        Raises:
            KeyError: 해당 role에 등록된 Provider가 없는 경우
            RuntimeError: 모든 Provider가 실패한 경우
        """
        chain = self.get_fallback(role)
        if not chain:
            raise KeyError(f"'{role}' role에 등록된 Provider가 없습니다.")

        last_error: Exception | None = None
        for provider in chain:
            try:
                fn = getattr(provider, method)
                result = await fn(*args, **kwargs)
                return result
            except Exception as e:
                provider_name = provider.get_name()
                logger.warning(
                    "Provider '%s' (%s.%s) 실패: %s. 다음 Provider로 전환.",
                    provider_name, role, method, e,
                )
                last_error = e

        # 모든 Provider 실패
        raise RuntimeError(
            f"'{role}' role의 모든 Provider가 '{method}' 호출에 실패했습니다. "
            f"마지막 에러: {last_error}"
        )

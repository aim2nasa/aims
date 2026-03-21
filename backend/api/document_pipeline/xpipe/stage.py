"""
Stage ABC — 파이프라인 스테이지 플러그인 인터페이스

각 스테이지는 이 ABC를 구현하여 파이프라인에 등록된다.
context dict를 입력받아 처리 후 반환하는 단순한 구조.

설계 원칙:
- 표준 라이브러리만 사용 (xpipe 독립성 유지)
- 스테이지는 stateless 권장 (설정은 config dict로 주입)
- should_skip()으로 조건부 실행 지원
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class Stage(ABC):
    """파이프라인 스테이지 플러그인

    모든 스테이지는 이 ABC를 상속하여 구현한다.
    execute()는 context dict를 받아 처리 후 반환한다.

    사용 예:
        class MyStage(Stage):
            def get_name(self) -> str:
                return "my_stage"

            async def execute(self, context: dict) -> dict:
                context["my_result"] = "done"
                return context
    """

    @abstractmethod
    def get_name(self) -> str:
        """스테이지 고유 이름 반환

        Returns:
            스테이지 식별자 (예: "ingest", "extract", "classify")
        """
        ...

    @abstractmethod
    async def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """스테이지 실행

        Args:
            context: 파이프라인 공유 컨텍스트. 이전 스테이지의 결과가 누적되어 있다.

        Returns:
            처리 후 컨텍스트 (수정된 context를 그대로 반환하거나 새 dict 반환)
        """
        ...

    def should_skip(self, context: dict[str, Any]) -> bool:
        """스킵 조건 평가

        True를 반환하면 이 스테이지를 건너뛴다.
        기본 구현: 항상 False (스킵하지 않음).

        Args:
            context: 파이프라인 공유 컨텍스트

        Returns:
            True면 이 스테이지 건너뜀
        """
        return False

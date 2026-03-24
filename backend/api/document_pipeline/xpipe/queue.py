"""
JobQueue ABC — 비동기 작업 큐 인터페이스

설계 원칙 (Q2 Option B: 얇은 추상화):
- Redis Stream 직접 호출을 캡슐화하되, 과도한 추상화는 피한다.
- Consumer Group 패턴(enqueue → dequeue → ack)을 표준 인터페이스로 정의.
- 기본 구현체(Redis Stream)를 제공하되, 다른 큐(RabbitMQ, SQS 등)로 교체 가능.
- claim_stale()은 선택적 — Redis Stream의 XAUTOCLAIM에 대응.

"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class JobQueue(ABC):
    """비동기 작업 큐 인터페이스

    xPipe 코어는 이 인터페이스를 통해 비동기 작업(OCR, PDF 변환 등)을
    큐에 넣고, 워커가 꺼내서 처리한다.

    구현체는 Redis Stream, RabbitMQ, SQS 등 어떤 큐든 가능하다.
    """

    @abstractmethod
    async def enqueue(self, job_data: dict[str, Any]) -> str:
        """작업을 큐에 추가

        Args:
            job_data: 작업 데이터
                예: {"file_id": "abc", "file_path": "/tmp/doc.pdf",
                     "doc_id": "xyz", "queued_at": "2026-03-19T12:00:00"}

        Returns:
            작업 ID (큐 시스템에서 할당한 고유 ID)
        """
        ...

    @abstractmethod
    async def dequeue(self, block_ms: int = 5000) -> Optional[dict[str, Any]]:
        """큐에서 작업 하나를 꺼냄

        블로킹 방식으로 작업을 대기한다.
        작업이 없으면 block_ms 동안 대기 후 None 반환.

        Args:
            block_ms: 블로킹 대기 시간 (밀리초). 0이면 즉시 반환.

        Returns:
            작업 데이터 dict (message_id 필드 포함). 없으면 None.
            예: {"message_id": "1234-0", "file_id": "abc", ...}
        """
        ...

    @abstractmethod
    async def ack(self, job_id: str) -> bool:
        """작업 처리 완료 확인 (acknowledge)

        처리 완료된 작업을 큐에서 확인 처리한다.
        Redis Stream에서는 XACK + XDEL에 해당.

        Args:
            job_id: 작업 ID (dequeue에서 받은 message_id)

        Returns:
            확인 성공 여부
        """
        ...

    async def claim_stale(self, min_idle_ms: int = 30000) -> list[dict[str, Any]]:
        """오래된 미처리 작업 인수 (선택적 구현)

        워커 장애 시 PEL(Pending Entry List)에 남은 작업을 인수한다.
        Redis Stream의 XAUTOCLAIM에 대응.

        모든 큐 시스템이 이 기능을 지원하지는 않으므로,
        기본 구현은 NotImplementedError를 발생시킨다.
        지원하지 않는 큐에서는 오버라이드하지 않아도 된다.

        Args:
            min_idle_ms: 최소 유휴 시간 (밀리초). 이 시간 이상 처리되지 않은 작업만 인수.

        Returns:
            인수한 작업 목록

        Raises:
            NotImplementedError: 큐 시스템이 이 기능을 지원하지 않는 경우
        """
        raise NotImplementedError(
            f"{type(self).__name__}은 claim_stale()을 지원하지 않습니다."
        )

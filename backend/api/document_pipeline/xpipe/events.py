"""
xPipe Event Bus — 이벤트 발행 + 웹훅 디스패치

설계 원칙:
- 표준 라이브러리만 사용 (xpipe 독립성 유지)
- 인메모리 구현 (외부 저장소 의존 없음)
- 비동기 웹훅 전송 (urllib.request 기반)
- 전송 실패 시 재시도 + Dead Letter Queue (DLQ)
- 향후 Redis Pub/Sub 등으로 확장 가능한 구조

사용 예:
    bus = EventBus()
    bus.register_webhook("document_processed", "https://example.com/hook")

    event = PipelineEvent(
        event_type="document_processed",
        document_id="abc123",
        stage="classification",
        payload={"category": "policy"},
    )
    await bus.emit(event)
"""
from __future__ import annotations

import asyncio
import json
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)


@dataclass
class PipelineEvent:
    """파이프라인 이벤트

    Attributes:
        event_type: 이벤트 유형 (예: "document_processed", "stage_complete", "error")
        document_id: 대상 문서 ID
        stage: 파이프라인 단계 (예: "classification", "ocr", "embedding")
        payload: 이벤트 상세 데이터
        timestamp: ISO 8601 형식의 타임스탬프 (미지정 시 자동 생성)
    """
    event_type: str
    document_id: str
    stage: str
    payload: dict = field(default_factory=dict)
    timestamp: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict[str, Any]:
        """직렬화용 dict 변환"""
        return {
            "event_type": self.event_type,
            "document_id": self.document_id,
            "stage": self.stage,
            "payload": self.payload,
            "timestamp": self.timestamp,
        }


@dataclass
class WebhookConfig:
    """웹훅 전송 설정

    Attributes:
        max_retries: 최대 재시도 횟수
        retry_delay_seconds: 재시도 간 대기 시간 (초)
        timeout_seconds: HTTP 요청 타임아웃 (초)
    """
    max_retries: int = 3
    retry_delay_seconds: float = 1.0
    timeout_seconds: float = 5.0


@dataclass
class _WebhookRegistration:
    """내부용 웹훅 등록 정보"""
    url: str
    headers: dict[str, str] = field(default_factory=dict)


class EventBus:
    """이벤트 발행 + 웹훅 디스패치

    이벤트를 발행하면, 해당 event_type에 등록된 모든 웹훅으로
    비동기 HTTP POST 요청을 전송한다.

    전송 실패(재시도 소진) 시 Dead Letter Queue에 보관한다.
    """

    def __init__(self, config: WebhookConfig | None = None) -> None:
        self._config = config or WebhookConfig()
        # event_type → 웹훅 등록 목록
        self._webhooks: dict[str, list[_WebhookRegistration]] = {}
        # 전송 실패 이벤트 보관
        self._dead_letter_queue: list[dict[str, Any]] = []
        # 동기 리스너 (테스트/내부 연동용)
        self._listeners: dict[str, list[Callable[[PipelineEvent], None]]] = {}

    # --- 웹훅 등록/해제 ---

    def register_webhook(
        self,
        event_type: str,
        url: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        """웹훅 등록

        동일 event_type + url 조합은 중복 등록되지 않는다.

        Args:
            event_type: 구독할 이벤트 유형
            url: 웹훅 수신 URL
            headers: HTTP 요청에 포함할 추가 헤더
        """
        if event_type not in self._webhooks:
            self._webhooks[event_type] = []

        # 중복 체크 (같은 URL은 1번만)
        for existing in self._webhooks[event_type]:
            if existing.url == url:
                return

        self._webhooks[event_type].append(
            _WebhookRegistration(url=url, headers=headers or {})
        )

    def unregister_webhook(self, event_type: str, url: str) -> bool:
        """웹훅 해제

        Args:
            event_type: 이벤트 유형
            url: 해제할 URL

        Returns:
            해제 성공 여부 (등록되어 있지 않으면 False)
        """
        if event_type not in self._webhooks:
            return False

        original_len = len(self._webhooks[event_type])
        self._webhooks[event_type] = [
            w for w in self._webhooks[event_type] if w.url != url
        ]
        removed = len(self._webhooks[event_type]) < original_len

        # 빈 리스트 정리
        if not self._webhooks[event_type]:
            del self._webhooks[event_type]

        return removed

    def get_registered_webhooks(self) -> dict[str, list[dict[str, Any]]]:
        """등록된 웹훅 목록 반환

        Returns:
            {event_type: [{"url": ..., "headers": ...}, ...]}
        """
        result: dict[str, list[dict[str, Any]]] = {}
        for event_type, registrations in self._webhooks.items():
            result[event_type] = [
                {"url": r.url, "headers": dict(r.headers)}
                for r in registrations
            ]
        return result

    # --- 동기 리스너 (내부 연동용) ---

    def on(self, event_type: str, listener: Callable[[PipelineEvent], None]) -> None:
        """동기 리스너 등록 (테스트/내부 연동용)

        Args:
            event_type: 구독할 이벤트 유형
            listener: 이벤트 수신 콜백
        """
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(listener)

    def off(self, event_type: str, listener: Callable[[PipelineEvent], None]) -> None:
        """동기 리스너 해제

        Args:
            event_type: 이벤트 유형
            listener: 제거할 콜백
        """
        if event_type in self._listeners:
            try:
                self._listeners[event_type].remove(listener)
            except ValueError:
                pass

    # --- 이벤트 발행 ---

    async def emit(self, event: PipelineEvent) -> None:
        """이벤트 발행

        1. 동기 리스너 호출
        2. 등록된 웹훅에 비동기 HTTP POST 전송

        Args:
            event: 발행할 이벤트
        """
        # 동기 리스너 호출
        for listener in self._listeners.get(event.event_type, []):
            try:
                listener(event)
            except Exception as exc:
                logger.warning("리스너 호출 실패: %s", exc)

        # 와일드카드 리스너 ("*")
        for listener in self._listeners.get("*", []):
            try:
                listener(event)
            except Exception as exc:
                logger.warning("와일드카드 리스너 호출 실패: %s", exc)

        # 웹훅 전송
        webhooks = self._webhooks.get(event.event_type, [])
        if not webhooks:
            return

        event_data = json.dumps(event.to_dict(), ensure_ascii=False).encode("utf-8")

        tasks = [
            self._send_webhook(registration, event, event_data)
            for registration in webhooks
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_webhook(
        self,
        registration: _WebhookRegistration,
        event: PipelineEvent,
        event_data: bytes,
    ) -> None:
        """단일 웹훅에 HTTP POST 전송 (재시도 포함)"""
        last_error: Exception | None = None

        for attempt in range(1, self._config.max_retries + 1):
            try:
                req = urllib.request.Request(
                    registration.url,
                    data=event_data,
                    method="POST",
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        **registration.headers,
                    },
                )
                # 블로킹 호출을 이벤트 루프에서 실행
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    lambda: urllib.request.urlopen(
                        req, timeout=self._config.timeout_seconds
                    ),
                )
                return  # 성공
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "웹훅 전송 실패 (시도 %d/%d): %s → %s",
                    attempt,
                    self._config.max_retries,
                    registration.url,
                    exc,
                )
                if attempt < self._config.max_retries:
                    await asyncio.sleep(self._config.retry_delay_seconds)

        # 모든 재시도 소진 → DLQ
        self._dead_letter_queue.append({
            "event": event.to_dict(),
            "webhook_url": registration.url,
            "error": str(last_error),
            "retries_exhausted": self._config.max_retries,
            "failed_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.error(
            "웹훅 전송 최종 실패 (DLQ 저장): %s → %s",
            registration.url,
            last_error,
        )

    # --- Dead Letter Queue ---

    def get_dead_letter_queue(self) -> list[dict[str, Any]]:
        """전송 실패 이벤트 목록 (방어적 복사)"""
        return list(self._dead_letter_queue)

    def clear_dead_letter_queue(self) -> int:
        """DLQ 비우기

        Returns:
            삭제된 항목 수
        """
        count = len(self._dead_letter_queue)
        self._dead_letter_queue.clear()
        return count

    # --- 통계 ---

    def get_stats(self) -> dict[str, Any]:
        """EventBus 상태 통계

        Returns:
            등록된 웹훅 수, DLQ 크기 등
        """
        total_webhooks = sum(
            len(registrations) for registrations in self._webhooks.values()
        )
        return {
            "event_types": len(self._webhooks),
            "total_webhooks": total_webhooks,
            "dead_letter_queue_size": len(self._dead_letter_queue),
            "listener_count": sum(
                len(listeners) for listeners in self._listeners.values()
            ),
        }

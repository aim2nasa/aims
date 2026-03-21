"""
xPipe EventBus 테스트

- PipelineEvent 생성/직렬화
- WebhookConfig 기본값
- EventBus 웹훅 등록/해제/중복 방지
- EventBus.emit() 리스너 호출
- Dead Letter Queue (DLQ)
- 통계 조회
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from xpipe.events import EventBus, PipelineEvent, WebhookConfig


# ===========================================================================
# PipelineEvent 테스트
# ===========================================================================


class TestPipelineEvent:
    """PipelineEvent 데이터 클래스"""

    def test_create_event(self):
        """기본 이벤트 생성"""
        event = PipelineEvent(
            event_type="document_processed",
            document_id="doc-001",
            stage="classification",
            payload={"category": "policy"},
        )
        assert event.event_type == "document_processed"
        assert event.document_id == "doc-001"
        assert event.stage == "classification"
        assert event.payload == {"category": "policy"}
        assert event.timestamp  # 자동 생성됨

    def test_auto_timestamp(self):
        """timestamp 미지정 시 자동 생성"""
        event = PipelineEvent(
            event_type="test",
            document_id="d1",
            stage="s1",
        )
        assert event.timestamp != ""
        assert "T" in event.timestamp  # ISO 8601 형식

    def test_custom_timestamp(self):
        """timestamp 지정 시 해당 값 사용"""
        event = PipelineEvent(
            event_type="test",
            document_id="d1",
            stage="s1",
            timestamp="2026-01-01T00:00:00+00:00",
        )
        assert event.timestamp == "2026-01-01T00:00:00+00:00"

    def test_to_dict(self):
        """to_dict()로 직렬화"""
        event = PipelineEvent(
            event_type="error",
            document_id="doc-002",
            stage="ocr",
            payload={"error": "timeout"},
            timestamp="2026-03-19T12:00:00",
        )
        d = event.to_dict()
        assert d["event_type"] == "error"
        assert d["document_id"] == "doc-002"
        assert d["stage"] == "ocr"
        assert d["payload"] == {"error": "timeout"}
        assert d["timestamp"] == "2026-03-19T12:00:00"

    def test_default_payload(self):
        """payload 미지정 시 빈 dict"""
        event = PipelineEvent(
            event_type="test",
            document_id="d1",
            stage="s1",
        )
        assert event.payload == {}


# ===========================================================================
# WebhookConfig 테스트
# ===========================================================================


class TestWebhookConfig:
    """WebhookConfig 기본값 확인"""

    def test_defaults(self):
        """기본 설정값"""
        config = WebhookConfig()
        assert config.max_retries == 3
        assert config.retry_delay_seconds == 1.0
        assert config.timeout_seconds == 5.0

    def test_custom_config(self):
        """커스텀 설정"""
        config = WebhookConfig(max_retries=5, retry_delay_seconds=2.0, timeout_seconds=10.0)
        assert config.max_retries == 5
        assert config.retry_delay_seconds == 2.0
        assert config.timeout_seconds == 10.0


# ===========================================================================
# EventBus 웹훅 등록/해제
# ===========================================================================


class TestEventBusRegistration:
    """웹훅 등록/해제"""

    def test_register_webhook(self):
        """웹훅 등록"""
        bus = EventBus()
        bus.register_webhook("document_processed", "https://example.com/hook")

        webhooks = bus.get_registered_webhooks()
        assert "document_processed" in webhooks
        assert len(webhooks["document_processed"]) == 1
        assert webhooks["document_processed"][0]["url"] == "https://example.com/hook"

    def test_register_with_headers(self):
        """헤더 포함 등록"""
        bus = EventBus()
        bus.register_webhook(
            "error",
            "https://example.com/hook",
            headers={"Authorization": "Bearer token123"},
        )
        webhooks = bus.get_registered_webhooks()
        assert webhooks["error"][0]["headers"]["Authorization"] == "Bearer token123"

    def test_duplicate_registration_ignored(self):
        """동일 URL 중복 등록 방지"""
        bus = EventBus()
        bus.register_webhook("test", "https://example.com/hook")
        bus.register_webhook("test", "https://example.com/hook")

        webhooks = bus.get_registered_webhooks()
        assert len(webhooks["test"]) == 1

    def test_register_multiple_urls(self):
        """동일 이벤트에 다수 URL 등록"""
        bus = EventBus()
        bus.register_webhook("test", "https://a.com/hook")
        bus.register_webhook("test", "https://b.com/hook")

        webhooks = bus.get_registered_webhooks()
        assert len(webhooks["test"]) == 2

    def test_register_multiple_event_types(self):
        """다른 이벤트 유형에 각각 등록"""
        bus = EventBus()
        bus.register_webhook("event_a", "https://a.com/hook")
        bus.register_webhook("event_b", "https://b.com/hook")

        webhooks = bus.get_registered_webhooks()
        assert "event_a" in webhooks
        assert "event_b" in webhooks

    def test_unregister_webhook(self):
        """웹훅 해제"""
        bus = EventBus()
        bus.register_webhook("test", "https://example.com/hook")

        result = bus.unregister_webhook("test", "https://example.com/hook")
        assert result is True
        assert bus.get_registered_webhooks() == {}

    def test_unregister_nonexistent_url(self):
        """미등록 URL 해제 → False"""
        bus = EventBus()
        bus.register_webhook("test", "https://a.com/hook")

        result = bus.unregister_webhook("test", "https://b.com/hook")
        assert result is False

    def test_unregister_nonexistent_event_type(self):
        """미등록 이벤트 유형 해제 → False"""
        bus = EventBus()
        result = bus.unregister_webhook("nonexistent", "https://a.com/hook")
        assert result is False

    def test_empty_webhooks(self):
        """초기 상태: 빈 웹훅 목록"""
        bus = EventBus()
        assert bus.get_registered_webhooks() == {}


# ===========================================================================
# EventBus.emit() — 리스너
# ===========================================================================


class TestEventBusEmit:
    """emit()을 통한 리스너 호출"""

    @pytest.mark.asyncio
    async def test_emit_calls_listener(self):
        """이벤트 발행 시 등록된 리스너 호출"""
        bus = EventBus()
        received: list[PipelineEvent] = []
        bus.on("test_event", lambda e: received.append(e))

        event = PipelineEvent(
            event_type="test_event",
            document_id="d1",
            stage="s1",
        )
        await bus.emit(event)

        assert len(received) == 1
        assert received[0].document_id == "d1"

    @pytest.mark.asyncio
    async def test_emit_multiple_listeners(self):
        """복수 리스너 모두 호출"""
        bus = EventBus()
        count = {"a": 0, "b": 0}
        bus.on("test", lambda _: count.__setitem__("a", count["a"] + 1))
        bus.on("test", lambda _: count.__setitem__("b", count["b"] + 1))

        await bus.emit(PipelineEvent(event_type="test", document_id="d1", stage="s1"))

        assert count["a"] == 1
        assert count["b"] == 1

    @pytest.mark.asyncio
    async def test_emit_wildcard_listener(self):
        """와일드카드('*') 리스너는 모든 이벤트 수신"""
        bus = EventBus()
        received: list[str] = []
        bus.on("*", lambda e: received.append(e.event_type))

        await bus.emit(PipelineEvent(event_type="event_a", document_id="d1", stage="s1"))
        await bus.emit(PipelineEvent(event_type="event_b", document_id="d2", stage="s2"))

        assert received == ["event_a", "event_b"]

    @pytest.mark.asyncio
    async def test_emit_no_listeners(self):
        """리스너 없이 emit → 에러 없이 진행"""
        bus = EventBus()
        event = PipelineEvent(event_type="orphan", document_id="d1", stage="s1")
        await bus.emit(event)  # 예외 없음

    @pytest.mark.asyncio
    async def test_emit_listener_exception_does_not_propagate(self):
        """리스너 예외 시 다른 리스너에 영향 없음"""
        bus = EventBus()
        received: list[str] = []

        def failing_listener(_event: PipelineEvent) -> None:
            raise RuntimeError("리스너 오류")

        bus.on("test", failing_listener)
        bus.on("test", lambda e: received.append("ok"))

        await bus.emit(PipelineEvent(event_type="test", document_id="d1", stage="s1"))
        assert received == ["ok"]

    @pytest.mark.asyncio
    async def test_emit_only_matching_event_type(self):
        """다른 이벤트 유형의 리스너는 호출되지 않음"""
        bus = EventBus()
        called = {"a": False, "b": False}
        bus.on("event_a", lambda _: called.__setitem__("a", True))
        bus.on("event_b", lambda _: called.__setitem__("b", True))

        await bus.emit(PipelineEvent(event_type="event_a", document_id="d1", stage="s1"))

        assert called["a"] is True
        assert called["b"] is False


# ===========================================================================
# Dead Letter Queue
# ===========================================================================


class TestDeadLetterQueue:
    """DLQ 기본 동작"""

    def test_initial_dlq_empty(self):
        """초기 DLQ는 비어있음"""
        bus = EventBus()
        assert bus.get_dead_letter_queue() == []

    def test_dlq_defensive_copy(self):
        """get_dead_letter_queue()는 방어적 복사"""
        bus = EventBus()
        dlq = bus.get_dead_letter_queue()
        dlq.append({"fake": "entry"})
        assert len(bus.get_dead_letter_queue()) == 0

    def test_clear_dlq(self):
        """DLQ 비우기"""
        bus = EventBus()
        # 내부에 직접 추가 (테스트용)
        bus._dead_letter_queue.append({"event": {}, "error": "test"})
        bus._dead_letter_queue.append({"event": {}, "error": "test2"})

        count = bus.clear_dead_letter_queue()
        assert count == 2
        assert bus.get_dead_letter_queue() == []


# ===========================================================================
# EventBus 통계
# ===========================================================================


class TestEventBusStats:
    """get_stats() 통계"""

    def test_empty_stats(self):
        """빈 EventBus 통계"""
        bus = EventBus()
        stats = bus.get_stats()
        assert stats["event_types"] == 0
        assert stats["total_webhooks"] == 0
        assert stats["dead_letter_queue_size"] == 0
        assert stats["listener_count"] == 0

    def test_stats_with_webhooks_and_listeners(self):
        """웹훅+리스너 등록 후 통계"""
        bus = EventBus()
        bus.register_webhook("a", "https://a.com/hook")
        bus.register_webhook("a", "https://b.com/hook")
        bus.register_webhook("b", "https://c.com/hook")
        bus.on("a", lambda _: None)

        stats = bus.get_stats()
        assert stats["event_types"] == 2  # "a", "b"
        assert stats["total_webhooks"] == 3
        assert stats["listener_count"] == 1

    def test_stats_dlq_count(self):
        """DLQ 건수 반영"""
        bus = EventBus()
        bus._dead_letter_queue.append({"event": {}, "error": "test"})
        assert bus.get_stats()["dead_letter_queue_size"] == 1

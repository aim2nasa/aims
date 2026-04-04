"""
Redis 이벤트 발행 전환 regression 테스트
- _send_sse_webhook → Redis Pub/Sub 발행 검증
- _notify_processing_complete → Redis Pub/Sub 발행 검증
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_send_sse_webhook_publishes_ar_status():
    """_send_sse_webhook이 ar-status-change 이벤트를 Redis aims:ar:status 채널로 발행"""
    with patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_pub:
        from routers.doc_prep_main import _send_sse_webhook
        await _send_sse_webhook("ar-status-change", {
            "customer_id": "cust1", "file_id": "file1", "status": "pending"
        })
        mock_pub.assert_called_once()
        channel, payload = mock_pub.call_args[0]
        assert channel == "aims:ar:status"
        assert payload["customer_id"] == "cust1"
        assert payload["file_id"] == "file1"
        assert payload["status"] == "pending"


@pytest.mark.asyncio
async def test_send_sse_webhook_publishes_cr_status():
    """_send_sse_webhook이 cr-status-change 이벤트를 Redis aims:cr:status 채널로 발행"""
    with patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_pub:
        from routers.doc_prep_main import _send_sse_webhook
        await _send_sse_webhook("cr-status-change", {
            "customer_id": "cust2", "file_id": "file2", "status": "completed"
        })
        mock_pub.assert_called_once()
        channel, payload = mock_pub.call_args[0]
        assert channel == "aims:cr:status"
        assert payload["customer_id"] == "cust2"
        assert payload["status"] == "completed"


@pytest.mark.asyncio
async def test_notify_processing_complete_publishes_doc_complete():
    """_notify_processing_complete가 aims:doc:complete 채널로 발행"""
    with patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_pub:
        from workers.ocr_worker import OCRWorker
        worker = OCRWorker.__new__(OCRWorker)  # __init__ 스킵
        await worker._notify_processing_complete("doc1", "owner1", "completed")
        mock_pub.assert_called_once()
        channel, payload = mock_pub.call_args[0]
        assert channel == "aims:doc:complete"
        assert payload["document_id"] == "doc1"
        assert payload["owner_id"] == "owner1"
        assert payload["status"] == "completed"


@pytest.mark.asyncio
async def test_send_sse_webhook_unknown_event_ignored():
    """알 수 없는 이벤트는 Redis 발행하지 않고 무시"""
    with patch("services.redis_service.RedisService.publish_event", new_callable=AsyncMock) as mock_pub:
        from routers.doc_prep_main import _send_sse_webhook
        await _send_sse_webhook("unknown-event", {"key": "val"})
        mock_pub.assert_not_called()

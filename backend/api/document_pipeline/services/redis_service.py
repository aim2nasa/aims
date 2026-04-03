"""
Redis Service - Redis Stream operations + Pub/Sub 이벤트 발행
"""
import json
import redis.asyncio as redis
from typing import Optional, Dict, Any, List
import logging

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# 이벤트 채널 상수 (aims_api eventBus.js와 동일)
# 페이로드 스키마: @aims/shared-schema redis-events.ts 참조
# 각 채널의 필수 필드:
#   DOC_PROGRESS: document_id, progress
#   DOC_COMPLETE: document_id
#   AR_STATUS: customer_id, status
#   CR_STATUS: customer_id, status
#   DOC_LIST: user_id
#   DOC_LINK: document_id, customer_id, user_id
CHANNELS = {
    "DOC_PROGRESS": "aims:doc:progress",
    "DOC_COMPLETE": "aims:doc:complete",
    "AR_STATUS": "aims:ar:status",
    "CR_STATUS": "aims:cr:status",
    "DOC_LIST": "aims:doc:list",
    "DOC_LINK": "aims:doc:link",
}


class RedisService:
    """Async Redis client for stream operations"""

    _client: Optional[redis.Redis] = None

    STREAM_NAME = "ocr_stream"
    CONSUMER_GROUP = "ocr_consumer_group"
    CONSUMER_NAME = "worker-fastapi"

    @classmethod
    async def connect(cls):
        """Initialize Redis connection"""
        if cls._client is None:
            cls._client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True
            )
            logger.info(f"Redis connected: {settings.REDIS_URL}")

            # Ensure consumer group exists
            try:
                await cls._client.xgroup_create(
                    cls.STREAM_NAME,
                    cls.CONSUMER_GROUP,
                    id="0",
                    mkstream=True
                )
                logger.info(f"Created consumer group: {cls.CONSUMER_GROUP}")
            except redis.ResponseError as e:
                if "BUSYGROUP" in str(e):
                    logger.info(f"Consumer group already exists: {cls.CONSUMER_GROUP}")
                else:
                    raise

            # Remove stale consumers (prevent message theft by rogue processes)
            await cls._cleanup_stale_consumers()

    @classmethod
    async def _cleanup_stale_consumers(cls):
        """Remove all consumers except our own from the consumer group.
        Prevents rogue processes (e.g., legacy n8n) from stealing messages."""
        try:
            consumers = await cls._client.xinfo_consumers(
                cls.STREAM_NAME, cls.CONSUMER_GROUP
            )
            for consumer in consumers:
                name = consumer.get("name", "")
                if name and name != cls.CONSUMER_NAME:
                    pending = consumer.get("pending", 0)
                    await cls._client.xgroup_delconsumer(
                        cls.STREAM_NAME, cls.CONSUMER_GROUP, name
                    )
                    logger.warning(
                        f"Removed stale consumer '{name}' "
                        f"(pending={pending}) from {cls.CONSUMER_GROUP}"
                    )
        except Exception as e:
            logger.error(f"Stale consumer cleanup failed: {e}", exc_info=True)

    @classmethod
    async def disconnect(cls):
        """Close Redis connection"""
        if cls._client:
            await cls._client.close()
            cls._client = None
            logger.info("Redis disconnected")

    @classmethod
    async def claim_pending_messages(cls, min_idle_ms: int = 30000) -> List[Dict[str, Any]]:
        """
        Claim and return pending messages from PEL (Pending Entry List).
        Called at Worker startup to recover messages from previous crash.

        Args:
            min_idle_ms: Minimum idle time in ms before claiming (default 30s)

        Returns:
            List of parsed messages (same format as read_stream)
        """
        if cls._client is None:
            await cls.connect()

        try:
            result = await cls._client.xautoclaim(
                name=cls.STREAM_NAME,
                groupname=cls.CONSUMER_GROUP,
                consumername=cls.CONSUMER_NAME,
                min_idle_time=min_idle_ms,
                start_id="0-0",
                count=50
            )

            if not result or len(result) < 2:
                return []

            # xautoclaim returns: [next_start_id, [(id, data), ...], deleted_ids]
            stream_messages = result[1]
            if not stream_messages:
                return []

            messages = []
            for message_id, data in stream_messages:
                if not data:
                    # Deleted message in PEL — just ACK and skip
                    await cls._client.xack(cls.STREAM_NAME, cls.CONSUMER_GROUP, message_id)
                    continue
                parsed = {
                    "message_id": message_id,
                    "file_id": data.get("file_id", ""),
                    "file_path": data.get("file_path", ""),
                    "doc_id": data.get("doc_id", ""),
                    "owner_id": data.get("owner_id", ""),
                    "queued_at": data.get("queued_at", "")
                }
                messages.append(parsed)

            if messages:
                logger.info(f"Claimed {len(messages)} pending messages from PEL")

            return messages

        except Exception as e:
            logger.error(f"Redis claim_pending error: {e}", exc_info=True)
            return []

    @classmethod
    async def read_stream(cls, count: int = 1, block: int = 5000) -> List[Dict[str, Any]]:
        """
        Read messages from the OCR stream using consumer group.

        Args:
            count: Number of messages to read
            block: Blocking timeout in milliseconds

        Returns:
            List of parsed messages with fields:
            - message_id
            - file_id
            - file_path
            - doc_id
            - owner_id
            - queued_at

        Raises:
            Exception: Redis connection/read errors (caller must handle)
        """
        if cls._client is None:
            await cls.connect()

        # XREADGROUP GROUP ocr_consumer_group worker-fastapi COUNT 1 BLOCK 5000 STREAMS ocr_stream >
        result = await cls._client.xreadgroup(
            groupname=cls.CONSUMER_GROUP,
            consumername=cls.CONSUMER_NAME,
            streams={cls.STREAM_NAME: ">"},
            count=count,
            block=block
        )

        if not result:
            return []

        messages = []
        for stream_name, stream_messages in result:
            for message_id, data in stream_messages:
                parsed = {
                    "message_id": message_id,
                    "file_id": data.get("file_id", ""),
                    "file_path": data.get("file_path", ""),
                    "doc_id": data.get("doc_id", ""),
                    "owner_id": data.get("owner_id", ""),
                    "queued_at": data.get("queued_at", "")
                }
                messages.append(parsed)
                logger.debug(f"Read message: {message_id}")

        return messages

    @classmethod
    async def ack_and_delete(cls, message_id: str):
        """
        Acknowledge and delete a message from the stream.

        Args:
            message_id: The Redis message ID to ack and delete
        """
        if cls._client is None:
            await cls.connect()

        try:
            # XACK ocr_stream ocr_consumer_group <message_id>
            await cls._client.xack(cls.STREAM_NAME, cls.CONSUMER_GROUP, message_id)
            # XDEL ocr_stream <message_id>
            await cls._client.xdel(cls.STREAM_NAME, message_id)
            logger.debug(f"Deleted message: {message_id}")
        except Exception as e:
            logger.error(f"Redis ack/delete error: {e}")

    @classmethod
    async def add_to_stream(
        cls,
        file_id: str,
        file_path: str,
        doc_id: str,
        owner_id: str,
        queued_at: str,
        original_name: str = ""
    ) -> str:
        """
        Add a new message to the OCR stream.

        Args:
            file_id: File ID
            file_path: Path to the file
            doc_id: Document ID
            owner_id: Owner (user) ID
            queued_at: ISO timestamp when queued
            original_name: 원본 파일명 (분류 정확도 향상용)

        Returns:
            The Redis message ID
        """
        if cls._client is None:
            await cls.connect()

        try:
            # XADD ocr_stream * file_id <id> file_path <path> ...
            message_id = await cls._client.xadd(
                cls.STREAM_NAME,
                {
                    "file_id": file_id,
                    "file_path": file_path,
                    "doc_id": doc_id,
                    "owner_id": owner_id,
                    "queued_at": queued_at,
                    "original_name": original_name
                }
            )
            logger.info(f"Added message to stream: {message_id}")
            return message_id
        except Exception as e:
            logger.error(f"Redis XADD error: {e}")
            raise

    @classmethod
    async def publish_event(cls, channel: str, payload: dict):
        """Redis Pub/Sub 이벤트 발행"""
        if cls._client is None:
            await cls.connect()
        try:
            await cls._client.publish(channel, json.dumps(payload))
        except Exception as e:
            logger.warning(f"[EventBus] Redis publish 실패 ({channel}): {e}")

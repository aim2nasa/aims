"""
Redis Service - Redis Stream operations
"""
import redis.asyncio as redis
from typing import Optional, Dict, Any, List
import logging

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()


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

    @classmethod
    async def disconnect(cls):
        """Close Redis connection"""
        if cls._client:
            await cls._client.close()
            cls._client = None
            logger.info("Redis disconnected")

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
        """
        if cls._client is None:
            await cls.connect()

        try:
            # XREADGROUP GROUP ocr_consumer_group worker-1 COUNT 1 BLOCK 5000 STREAMS ocr_stream >
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

        except Exception as e:
            logger.error(f"Redis read error: {e}")
            return []

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

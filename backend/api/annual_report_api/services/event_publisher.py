"""
Redis Pub/Sub 이벤트 발행 모듈
AR/CR 상태 변경 시 aims_api eventBus로 이벤트 전달
"""
import json
import logging
import os

import redis

logger = logging.getLogger(__name__)

# 이벤트 채널 상수 (aims_api eventBus.js와 동일)
CHANNELS = {
    "AR_STATUS": "aims:ar:status",
    "CR_STATUS": "aims:cr:status",
}

# Redis 연결 (lazy init)
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        _redis_client = redis.Redis(host=host, port=port, decode_responses=True)
    return _redis_client


def publish_event(channel: str, payload: dict):
    """Redis Pub/Sub 이벤트 발행"""
    try:
        client = _get_redis()
        client.publish(channel, json.dumps(payload))
    except Exception as e:
        logger.warning(f"[EventPublisher] Redis publish 실패 ({channel}): {e}")

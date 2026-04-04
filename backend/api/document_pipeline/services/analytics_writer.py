"""
Analytics Writer — aims_analytics DB에 AI 토큰 사용량 직접 기록

motor(async MongoDB driver)를 사용하여 aims_api HTTP 경유 없이 직접 기록.
aims_api의 tokenUsageService.js와 동일한 스키마 및 비용 계산 로직.
"""
import logging
import uuid
from datetime import datetime, timezone

import motor.motor_asyncio
from config import get_settings

logger = logging.getLogger(__name__)

ANALYTICS_DB = "aims_analytics"
COLLECTION_NAME = "ai_token_usage"

# 토큰 비용 (USD per 1K tokens) — tokenUsageService.js와 동기화
TOKEN_COSTS = {
    "text-embedding-3-small": {"input": 0.00002, "output": 0},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "gpt-4.1-mini": {"input": 0.0004, "output": 0.0016},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "default": {"input": 0.001, "output": 0.002},
}


def calculate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
) -> float:
    """
    토큰 비용 계산 (tokenUsageService.js calculateCost와 동일 로직)

    캐시 토큰은 75% 할인 적용.
    결과는 소수점 6자리로 반올림.
    """
    costs = TOKEN_COSTS.get(model, TOKEN_COSTS["default"])
    non_cached = prompt_tokens - cached_tokens
    input_cost = (non_cached / 1000) * costs["input"]
    cached_cost = (cached_tokens / 1000) * costs["input"] * 0.25
    output_cost = (completion_tokens / 1000) * costs["output"]
    return round(input_cost + cached_cost + output_cost, 6)


class AnalyticsWriter:
    """aims_analytics DB에 AI 토큰 사용량을 직접 기록하는 비동기 writer"""

    _client: motor.motor_asyncio.AsyncIOMotorClient | None = None
    _db = None

    @classmethod
    def _get_db(cls):
        """Motor DB 인스턴스를 lazy-init으로 반환"""
        if cls._client is None:
            settings = get_settings()
            cls._client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URI)
            cls._db = cls._client[ANALYTICS_DB]
        return cls._db

    @classmethod
    async def log_token_usage(
        cls,
        user_id: str,
        source: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int = 0,
        cached_tokens: int = 0,
        metadata: dict | None = None,
    ) -> bool:
        """
        AI 토큰 사용량을 aims_analytics.ai_token_usage에 기록

        Args:
            user_id: 사용자 ID
            source: 사용처 (예: "doc_summary")
            model: AI 모델명
            prompt_tokens: 입력 토큰 수
            completion_tokens: 출력 토큰 수
            total_tokens: 총 토큰 수 (0이면 자동 계산)
            cached_tokens: 캐시된 입력 토큰 수
            metadata: 추가 메타데이터

        Returns:
            bool: 기록 성공 여부
        """
        try:
            db = cls._get_db()
            collection = db[COLLECTION_NAME]

            total = total_tokens or (prompt_tokens + completion_tokens)
            estimated_cost = calculate_cost(model, prompt_tokens, completion_tokens, cached_tokens)

            document = {
                "user_id": user_id,
                "source": source,
                "request_id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc),
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cached_tokens": cached_tokens,
                "total_tokens": total,
                "estimated_cost_usd": estimated_cost,
                "metadata": metadata or {},
            }

            await collection.insert_one(document)
            logger.info(f"[TokenLog] 요약 토큰 로깅 완료: {total} tokens, ${estimated_cost}")
            return True

        except Exception as e:
            # 메인 파이프라인 중단 금지 — warning만 기록
            logger.warning(f"[TokenLog] 토큰 로깅 오류: {e}")
            return False

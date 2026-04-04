# analytics_writer.py
"""
aims_analytics DB 직접 기록 모듈

토큰 사용량(ai_token_usage)과 시스템 로그(error_logs)를
aims_analytics MongoDB에 직접 기록합니다.

기존 aims_api HTTP 엔드포인트 의존성을 제거하기 위한 전환 모듈.
스키마는 aims_api의 tokenUsageService.js / errorLogger.js와 동일합니다.
"""

import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pymongo import MongoClient

# 서비스 고유 DB 상수 (search_logger.py와 동일)
ANALYTICS_DB = "aims_analytics"
TOKEN_USAGE_COLLECTION = "ai_token_usage"
ERROR_LOGS_COLLECTION = "error_logs"

# 토큰 비용 (USD per 1K tokens) - tokenUsageService.js와 동일
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
    토큰 비용 계산 (캐시 토큰 75% 할인 반영)
    tokenUsageService.js calculateCost()와 동일 로직

    Args:
        model: 모델명
        prompt_tokens: 입력 토큰 수
        completion_tokens: 출력 토큰 수
        cached_tokens: 캐시된 입력 토큰 수 (75% 할인)

    Returns:
        예상 비용 (USD, 소수점 6자리 반올림)
    """
    costs = TOKEN_COSTS.get(model, TOKEN_COSTS["default"])
    non_cached_prompt_tokens = prompt_tokens - cached_tokens
    input_cost = (non_cached_prompt_tokens / 1000) * costs["input"]
    cached_input_cost = (cached_tokens / 1000) * costs["input"] * 0.25
    output_cost = (completion_tokens / 1000) * costs["output"]
    return round(input_cost + cached_input_cost + output_cost, 6)


class AnalyticsWriter:
    """aims_analytics DB에 토큰 사용량/시스템 로그를 직접 기록"""

    def __init__(self, mongo_uri: str = "mongodb://localhost:27017/"):
        """
        Args:
            mongo_uri: MongoDB 연결 URI
        """
        self.mongo_client = MongoClient(mongo_uri)
        self.db = self.mongo_client[ANALYTICS_DB]
        self.token_collection = self.db[TOKEN_USAGE_COLLECTION]
        self.log_collection = self.db[ERROR_LOGS_COLLECTION]

    def log_token_usage(
        self,
        user_id: str,
        source: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        request_id: Optional[str] = None,
        cached_tokens: int = 0,
        metadata: Optional[Dict] = None,
    ) -> bool:
        """
        ai_token_usage 컬렉션에 토큰 사용량 기록
        스키마: tokenUsageService.js logTokenUsage()와 동일

        Args:
            user_id: 사용자 ID
            source: 소스 ("rag_api", "doc_summary" 등)
            model: 모델명
            prompt_tokens: 입력 토큰 수
            completion_tokens: 출력 토큰 수
            total_tokens: 총 토큰 수
            request_id: 요청 ID (없으면 자동 생성)
            cached_tokens: 캐시된 토큰 수 (기본 0)
            metadata: 추가 메타데이터

        Returns:
            기록 성공 여부
        """
        try:
            estimated_cost = calculate_cost(
                model, prompt_tokens, completion_tokens, cached_tokens
            )

            document = {
                "user_id": user_id,
                "source": source,
                "request_id": request_id or str(uuid.uuid4()),
                "timestamp": datetime.utcnow(),
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "cached_tokens": cached_tokens,
                "total_tokens": total_tokens or (prompt_tokens + completion_tokens),
                "estimated_cost_usd": estimated_cost,
                "metadata": metadata or {},
            }

            self.token_collection.insert_one(document)
            return True

        except Exception as e:
            # 로깅 실패가 메인 로직을 방해하지 않도록 콘솔만 출력
            print(f"[AnalyticsWriter] 토큰 사용량 기록 실패: {e}")
            return False

    def log_system_event(
        self,
        level: str,
        message: str,
        component: str,
        error: Optional[Exception] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        error_logs 컬렉션에 시스템 이벤트 기록
        스키마: errorLogger.js _insertLog()와 동일

        Args:
            level: 로그 레벨 ("error" | "warn" | "info" | "debug")
            message: 로그 메시지
            component: 컴포넌트명 ("aims_rag_api" 등)
            error: 예외 객체 (error 레벨일 때)
            data: 추가 데이터

        Returns:
            기록 성공 여부
        """
        try:
            # error 객체 구성 (error 레벨일 때만)
            error_obj = None
            if level == "error" and error:
                error_obj = {
                    "type": type(error).__name__,
                    "code": None,
                    "message": str(error),
                    "stack": traceback.format_exception(
                        type(error), error, error.__traceback__
                    )
                    if error.__traceback__
                    else None,
                    "severity": "high",
                    "category": "runtime",
                }
            elif level == "error":
                # error 객체 없이 error 레벨인 경우
                error_obj = {
                    "type": "Error",
                    "code": None,
                    "message": message,
                    "stack": None,
                    "severity": "high",
                    "category": "runtime",
                }

            log_entry = {
                # LEVEL
                "level": level,
                # MESSAGE
                "message": message,
                # DATA
                "data": data,
                # WHO (서버 프로세스이므로 actor 없음)
                "actor": {
                    "user_id": None,
                    "name": None,
                    "email": None,
                    "role": "anonymous",
                    "ip_address": None,
                    "user_agent": None,
                },
                # WHEN
                "timestamp": datetime.utcnow(),
                # WHERE
                "source": {
                    "type": "backend",
                    "endpoint": None,
                    "method": None,
                    "component": component,
                    "url": None,
                    "file": None,
                    "line": None,
                    "column": None,
                },
                # WHAT
                "error": error_obj,
                # CONTEXT
                "context": {
                    "request_id": str(uuid.uuid4()),
                    "session_id": None,
                    "browser": None,
                    "os": None,
                    "version": None,
                    "payload": None,
                    "response_status": None,
                    "component_stack": None,
                },
                # META
                "meta": {
                    "resolved": False,
                    "resolved_by": None,
                    "resolved_at": None,
                    "notes": None,
                },
            }

            self.log_collection.insert_one(log_entry)
            return True

        except Exception as e:
            # 로깅 실패가 메인 로직을 방해하지 않도록 콘솔만 출력
            print(f"[AnalyticsWriter] 시스템 로그 기록 실패: {e}")
            return False


# 사용 예시
if __name__ == "__main__":
    writer = AnalyticsWriter()

    # 토큰 사용량 기록 테스트
    success = writer.log_token_usage(
        user_id="test_user",
        source="rag_api",
        model="gpt-4o-mini",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        metadata={"type": "chat_completion", "query": "테스트 쿼리"},
    )
    print(f"토큰 사용량 기록: {'성공' if success else '실패'}")

    # 시스템 로그 기록 테스트 (에러)
    try:
        raise ValueError("테스트 에러")
    except Exception as e:
        success = writer.log_system_event(
            level="error",
            message="테스트 에러 발생",
            component="aims_rag_api",
            error=e,
            data={"context": "테스트"},
        )
        print(f"에러 로그 기록: {'성공' if success else '실패'}")

    # 시스템 로그 기록 테스트 (경고)
    success = writer.log_system_event(
        level="warn",
        message="테스트 경고 메시지",
        component="aims_rag_api",
        data={"warning_type": "test"},
    )
    print(f"경고 로그 기록: {'성공' if success else '실패'}")

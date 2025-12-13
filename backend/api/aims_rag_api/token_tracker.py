# token_tracker.py
"""
AI Token Usage Tracker

OpenAI API 응답에서 토큰 사용량을 추출하여 aims_api를 통해 저장합니다.
사용자별, 시스템 전체의 AI 토큰 사용량을 추적합니다.

저장소: aims_api → MongoDB aims_analytics.ai_token_usage
"""

from typing import Dict, Optional, Any, List
import os
import uuid
import requests
from datetime import datetime


# aims_api 토큰 로깅 엔드포인트
AIMS_API_BASE_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
TOKEN_LOGGING_URL = f"{AIMS_API_BASE_URL}/api/ai-usage/log"

# 내부 API 키 (환경변수 또는 기본값)
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "aims-internal-token-logging-key-2024")

# 요청 타임아웃 (초)
REQUEST_TIMEOUT = 5


class TokenTracker:
    """AI 토큰 사용량 추적 및 저장 (aims_api 통해 로깅)"""

    def __init__(self):
        """aims_api를 통한 HTTP 기반 토큰 추적"""
        pass

    def track_embedding(self, response: Any, model: str = "text-embedding-3-small") -> Dict:
        """
        임베딩 API 토큰 사용량 추적

        Args:
            response: OpenAI 임베딩 API 응답 객체
            model: 사용된 모델명

        Returns:
            토큰 사용량 정보 딕셔너리
        """
        if not response or not hasattr(response, 'usage'):
            return None

        prompt_tokens = response.usage.prompt_tokens
        total_tokens = response.usage.total_tokens

        return {
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": 0,  # 임베딩은 출력 토큰 없음
            "total_tokens": total_tokens
        }

    def track_chat_completion(self, response: Any, model: str = "gpt-3.5-turbo") -> Dict:
        """
        채팅 완료 API 토큰 사용량 추적

        Args:
            response: OpenAI 채팅 API 응답 객체
            model: 사용된 모델명

        Returns:
            토큰 사용량 정보 딕셔너리
        """
        if not response or not hasattr(response, 'usage'):
            return None

        prompt_tokens = response.usage.prompt_tokens
        completion_tokens = response.usage.completion_tokens
        total_tokens = response.usage.total_tokens

        return {
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens
        }

    def _log_to_api(
        self,
        user_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        metadata: Optional[Dict] = None
    ) -> bool:
        """
        aims_api에 토큰 사용량 로깅

        Args:
            user_id: 사용자 ID
            model: 모델명
            prompt_tokens: 입력 토큰 수
            completion_tokens: 출력 토큰 수
            total_tokens: 총 토큰 수
            metadata: 추가 메타데이터

        Returns:
            bool: 로깅 성공 여부
        """
        try:
            payload = {
                "user_id": user_id,
                "source": "rag_api",
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "request_id": str(uuid.uuid4()),
                "metadata": metadata or {}
            }

            headers = {
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            }

            response = requests.post(
                TOKEN_LOGGING_URL,
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    print(f"[TokenTracker] 토큰 로깅 완료: {model} - {total_tokens} tokens")
                    return True

            print(f"[TokenTracker] 토큰 로깅 실패: {response.status_code} - {response.text}")
            return False

        except requests.exceptions.RequestException as e:
            print(f"[TokenTracker] 토큰 로깅 API 호출 오류: {e}")
            return False
        except Exception as e:
            print(f"[TokenTracker] 예상치 못한 오류: {e}")
            return False

    def save_usage(
        self,
        user_id: str,
        embedding_usage: Optional[Dict] = None,
        chat_usage: Optional[Dict] = None,
        metadata: Optional[Dict] = None,
        search_log_id: Optional[str] = None
    ) -> str:
        """
        토큰 사용량 저장 (aims_api를 통해 로깅)

        Args:
            user_id: 사용자 ID
            embedding_usage: 임베딩 토큰 사용량
            chat_usage: 채팅 토큰 사용량
            metadata: 추가 메타데이터
            search_log_id: 연관된 검색 로그 ID

        Returns:
            request_id: 생성된 요청 ID (실패 시 None)
        """
        request_id = str(uuid.uuid4())
        total_tokens = 0

        # 메타데이터 병합
        combined_metadata = metadata or {}
        if search_log_id:
            combined_metadata["search_log_id"] = search_log_id

        # 임베딩 사용량 로깅
        if embedding_usage:
            total_tokens += embedding_usage.get("total_tokens", 0)
            self._log_to_api(
                user_id=user_id,
                model=embedding_usage.get("model", "text-embedding-3-small"),
                prompt_tokens=embedding_usage.get("prompt_tokens", 0),
                completion_tokens=embedding_usage.get("completion_tokens", 0),
                total_tokens=embedding_usage.get("total_tokens", 0),
                metadata={**combined_metadata, "type": "embedding"}
            )

        # 채팅 사용량 로깅
        if chat_usage:
            total_tokens += chat_usage.get("total_tokens", 0)
            self._log_to_api(
                user_id=user_id,
                model=chat_usage.get("model", "gpt-3.5-turbo"),
                prompt_tokens=chat_usage.get("prompt_tokens", 0),
                completion_tokens=chat_usage.get("completion_tokens", 0),
                total_tokens=chat_usage.get("total_tokens", 0),
                metadata={**combined_metadata, "type": "chat_completion"}
            )

        print(f"📊 토큰 사용량 저장 완료: user={user_id}, total_tokens={total_tokens}")

        return request_id

# 사용 예시 및 테스트
if __name__ == '__main__':
    tracker = TokenTracker()

    # 테스트용 Mock 응답 객체
    class MockEmbeddingUsage:
        prompt_tokens = 100
        total_tokens = 100

    class MockChatUsage:
        prompt_tokens = 200
        completion_tokens = 150
        total_tokens = 350

    class MockEmbeddingResponse:
        usage = MockEmbeddingUsage()

    class MockChatResponse:
        usage = MockChatUsage()

    # 토큰 추적 테스트
    embed_usage = tracker.track_embedding(MockEmbeddingResponse())
    print(f"임베딩 사용량: {embed_usage}")

    chat_usage = tracker.track_chat_completion(MockChatResponse())
    print(f"채팅 사용량: {chat_usage}")

    # 사용량 저장 테스트 (aims_api를 통해)
    request_id = tracker.save_usage(
        user_id="test_user_123",
        embedding_usage=embed_usage,
        chat_usage=chat_usage,
        metadata={
            "query": "테스트 쿼리",
            "search_mode": "semantic"
        }
    )
    print(f"저장 완료: request_id={request_id}")

# token_tracker.py
"""
AI Token Usage Tracker

OpenAI API 응답에서 토큰 사용량을 추출하여 aims_analytics DB에 직접 저장합니다.
사용자별, 시스템 전체의 AI 토큰 사용량을 추적합니다.

저장소: MongoDB aims_analytics.ai_token_usage (직접 기록)
"""

from typing import Dict, Optional, Any, List
import uuid

from analytics_writer import AnalyticsWriter


class TokenTracker:
    """AI 토큰 사용량 추적 및 저장 (aims_analytics DB 직접 기록)"""

    def __init__(self):
        """AnalyticsWriter를 통한 DB 직접 기록"""
        self._writer = AnalyticsWriter()

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

    def _log_to_db(
        self,
        user_id: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        metadata: Optional[Dict] = None
    ) -> bool:
        """
        aims_analytics DB에 토큰 사용량 직접 기록

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
        success = self._writer.log_token_usage(
            user_id=user_id,
            source="rag_api",
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            request_id=str(uuid.uuid4()),
            metadata=metadata or {},
        )

        if success:
            print(f"[TokenTracker] 토큰 로깅 완료: {model} - {total_tokens} tokens")
        else:
            print(f"[TokenTracker] 토큰 로깅 실패: {model}")

        return success

    def save_usage(
        self,
        user_id: str,
        embedding_usage: Optional[Dict] = None,
        chat_usage: Optional[Dict] = None,
        metadata: Optional[Dict] = None,
        search_log_id: Optional[str] = None
    ) -> str:
        """
        토큰 사용량 저장 (aims_analytics DB 직접 기록)

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
            self._log_to_db(
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
            self._log_to_db(
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

    # 사용량 저장 테스트 (DB 직접 기록)
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

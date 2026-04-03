# search_logger.py
"""
검색 로그 수집 모듈

모든 검색 쿼리와 결과를 MongoDB에 저장하여 품질 모니터링 및 분석에 활용합니다.

MongoDB 컬렉션: search_logs
"""

from typing import List, Dict, Optional, Any
from pymongo import MongoClient
from datetime import datetime
import time

# 서비스 고유 컬렉션/DB 상수
ANALYTICS_DB = "aims_analytics"
SEARCH_LOGS_COLLECTION = "search_logs"


class SearchLogger:
    """검색 로그 수집 및 저장"""

    def __init__(self, mongo_uri: str = "mongodb://localhost:27017/"):
        """
        Args:
            mongo_uri: MongoDB 연결 URI
        """
        self.mongo_client = MongoClient(mongo_uri)
        self.db = self.mongo_client[ANALYTICS_DB]  # 분석 전용 DB
        self.collection = self.db[SEARCH_LOGS_COLLECTION]

        # 인덱스 생성 (빠른 조회를 위해)
        self._create_indexes()

    def _create_indexes(self):
        """검색 성능을 위한 인덱스 생성"""
        self.collection.create_index("user_id")
        self.collection.create_index("query_type")
        self.collection.create_index("search_mode")
        self.collection.create_index("timestamp")
        self.collection.create_index([("user_id", 1), ("timestamp", -1)])
        print("✅ 검색 로그 인덱스 생성 완료")

    def log_search(
        self,
        query: str,
        user_id: str,
        search_mode: str,
        query_intent: Dict,
        search_results: List[Dict],
        timing: Dict[str, float],
        metadata: Optional[Dict] = None
    ) -> str:
        """
        검색 로그 저장

        Args:
            query: 사용자 검색 쿼리
            user_id: 사용자 ID
            search_mode: "semantic" | "keyword"
            query_intent: QueryAnalyzer 분석 결과
            search_results: 최종 검색 결과 (재순위화 후)
            timing: 성능 지표 {
                "query_analysis_time": 0.5,
                "search_time": 0.2,
                "rerank_time": 0.3,
                "llm_time": 1.5,
                "total_time": 2.5
            }
            metadata: 추가 메타데이터 (선택)

        Returns:
            log_id: 저장된 로그 ID
        """
        log_entry = {
            # 쿼리 정보
            "query": query,
            "user_id": user_id,
            "search_mode": search_mode,
            "timestamp": datetime.utcnow(),

            # 쿼리 분석 결과
            "query_type": query_intent.get("query_type", "unknown"),
            "entities": query_intent.get("entities", []),
            "concepts": query_intent.get("concepts", []),
            "metadata_keywords": query_intent.get("metadata_keywords", []),

            # 검색 결과 메트릭
            "result_count": len(search_results),
            "doc_ids": [r.get("doc_id") for r in search_results],

            # 점수 분포
            "scores": {
                "original_scores": [r.get("original_score", r.get("score", 0.0)) for r in search_results],
                "rerank_scores": [r.get("rerank_score") for r in search_results if "rerank_score" in r],
                "avg_original_score": sum(r.get("original_score", r.get("score", 0.0)) for r in search_results) / len(search_results) if search_results else 0.0,
                "avg_rerank_score": sum(r.get("rerank_score", 0.0) for r in search_results if "rerank_score" in r) / len([r for r in search_results if "rerank_score" in r]) if any("rerank_score" in r for r in search_results) else None
            },

            # 성능 지표
            "timing": timing,

            # 사용자 피드백 (나중에 업데이트)
            "feedback": {
                "clicked_docs": [],  # 클릭한 문서 ID
                "satisfaction_rating": None,  # 1-5 점수
                "feedback_text": None  # 텍스트 피드백
            },

            # 추가 메타데이터
            "metadata": metadata or {}
        }

        result = self.collection.insert_one(log_entry)
        log_id = str(result.inserted_id)

        return log_id

    def update_feedback(
        self,
        log_id: str,
        clicked_docs: Optional[List[str]] = None,
        satisfaction_rating: Optional[int] = None,
        feedback_text: Optional[str] = None
    ):
        """
        사용자 피드백 업데이트

        Args:
            log_id: 로그 ID
            clicked_docs: 클릭한 문서 ID 리스트
            satisfaction_rating: 만족도 (1-5)
            feedback_text: 텍스트 피드백
        """
        from bson.objectid import ObjectId

        update_fields = {}
        if clicked_docs is not None:
            update_fields["feedback.clicked_docs"] = clicked_docs
        if satisfaction_rating is not None:
            update_fields["feedback.satisfaction_rating"] = satisfaction_rating
        if feedback_text is not None:
            update_fields["feedback.feedback_text"] = feedback_text

        if update_fields:
            self.collection.update_one(
                {"_id": ObjectId(log_id)},
                {"$set": update_fields}
            )
            print(f"✅ 피드백 업데이트 완료: {log_id}")

    def get_recent_logs(self, user_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """
        최근 검색 로그 조회

        Args:
            user_id: 사용자 ID (None이면 전체)
            limit: 최대 조회 수

        Returns:
            검색 로그 리스트 (최신순)
        """
        query = {}
        if user_id:
            query["user_id"] = user_id

        logs = list(self.collection.find(query).sort("timestamp", -1).limit(limit))

        # ObjectId를 문자열로 변환
        for log in logs:
            log["_id"] = str(log["_id"])
            log["timestamp"] = log["timestamp"].isoformat()

        return logs

    def get_failed_queries(
        self,
        threshold_score: float = 0.3,
        threshold_result_count: int = 1,
        limit: int = 50
    ) -> List[Dict]:
        """
        실패한 쿼리 조회

        실패 기준:
        - 평균 점수가 임계값 미만
        - 검색 결과 수가 임계값 미만

        Args:
            threshold_score: 점수 임계값 (기본 0.3)
            threshold_result_count: 결과 수 임계값 (기본 1)
            limit: 최대 조회 수

        Returns:
            실패한 쿼리 리스트
        """
        # MongoDB aggregation으로 실패 쿼리 필터링
        pipeline = [
            {
                "$match": {
                    "$or": [
                        {"scores.avg_original_score": {"$lt": threshold_score}},
                        {"result_count": {"$lt": threshold_result_count}}
                    ]
                }
            },
            {"$sort": {"timestamp": -1}},
            {"$limit": limit}
        ]

        failed_logs = list(self.collection.aggregate(pipeline))

        # ObjectId를 문자열로 변환
        for log in failed_logs:
            log["_id"] = str(log["_id"])
            log["timestamp"] = log["timestamp"].isoformat()

        return failed_logs


# 사용 예시
if __name__ == '__main__':
    logger = SearchLogger()

    # 테스트 로그 저장
    test_log_id = logger.log_search(
        query="곽승철에 대해서",
        user_id="tester",
        search_mode="semantic",
        query_intent={
            "query_type": "entity",
            "entities": ["곽승철"],
            "concepts": ["이력"],
            "metadata_keywords": ["곽승철", "이력서"]
        },
        search_results=[
            {
                "doc_id": "doc123",
                "score": 1.0,
                "rerank_score": 7.5,
                "payload": {"original_name": "곽승철 이력서.pdf"}
            }
        ],
        timing={
            "query_analysis_time": 0.5,
            "search_time": 0.2,
            "rerank_time": 0.3,
            "llm_time": 1.5,
            "total_time": 2.5
        }
    )

    print(f"✅ 로그 저장 완료: {test_log_id}")

    # 최근 로그 조회
    recent_logs = logger.get_recent_logs(limit=5)
    print(f"\n📊 최근 검색 로그 {len(recent_logs)}개:")
    for log in recent_logs:
        print(f"  - {log['query']} ({log['query_type']}) - {log['result_count']}개 결과")

    # 실패한 쿼리 조회
    failed_queries = logger.get_failed_queries()
    print(f"\n❌ 실패한 쿼리 {len(failed_queries)}개:")
    for log in failed_queries:
        print(f"  - {log['query']} (점수: {log['scores']['avg_original_score']:.2f}, 결과: {log['result_count']}개)")

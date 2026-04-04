# quality_analyzer.py
"""
검색 품질 분석 모듈

검색 로그를 분석하여 품질 지표를 계산합니다:
- 쿼리 유형별 정확도
- 평균 검색 점수
- 재순위화 효과 측정
- 성능 지표 (응답 시간)
- 실패율 분석
- 사용자 만족도
"""

from datetime import datetime, timedelta
from typing import Dict, List

from pymongo import MongoClient

# 서비스 고유 컬렉션/DB 상수
ANALYTICS_DB = "aims_analytics"
SEARCH_LOGS_COLLECTION = "search_logs"


class QualityAnalyzer:
    """검색 품질 지표 분석"""

    def __init__(self, mongo_uri: str = "mongodb://localhost:27017/"):
        """
        Args:
            mongo_uri: MongoDB 연결 URI
        """
        self.mongo_client = MongoClient(mongo_uri)
        self.db = self.mongo_client[ANALYTICS_DB]
        self.collection = self.db[SEARCH_LOGS_COLLECTION]

    def get_overall_stats(self, days: int = 7) -> Dict:
        """
        전체 통계 조회

        Args:
            days: 최근 N일 (기본 7일)

        Returns:
            전체 통계 딕셔너리
        """
        since = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {
                "$group": {
                    "_id": None,
                    "total_searches": {"$sum": 1},
                    "avg_result_count": {"$avg": "$result_count"},
                    "avg_original_score": {"$avg": "$scores.avg_original_score"},
                    "avg_rerank_score": {"$avg": "$scores.avg_rerank_score"},
                    "avg_query_analysis_time": {"$avg": "$timing.query_analysis_time"},
                    "avg_search_time": {"$avg": "$timing.search_time"},
                    "avg_rerank_time": {"$avg": "$timing.rerank_time"},
                    "avg_llm_time": {"$avg": "$timing.llm_time"},
                    "avg_total_time": {"$avg": "$timing.total_time"},
                }
            }
        ]

        result = list(self.collection.aggregate(pipeline))
        if not result:
            return {
                "total_searches": 0,
                "avg_result_count": 0.0,
                "avg_original_score": 0.0,
                "avg_rerank_score": None,
                "avg_query_analysis_time": 0.0,
                "avg_search_time": 0.0,
                "avg_rerank_time": 0.0,
                "avg_llm_time": 0.0,
                "avg_total_time": 0.0
            }

        stats = result[0]
        stats.pop("_id", None)
        return stats

    def get_query_type_breakdown(self, days: int = 7) -> Dict[str, Dict]:
        """
        쿼리 유형별 통계

        Args:
            days: 최근 N일

        Returns:
            쿼리 유형별 통계 딕셔너리
            {
                "entity": {...},
                "concept": {...},
                "mixed": {...}
            }
        """
        since = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {
                "$group": {
                    "_id": "$query_type",
                    "count": {"$sum": 1},
                    "avg_result_count": {"$avg": "$result_count"},
                    "avg_original_score": {"$avg": "$scores.avg_original_score"},
                    "avg_rerank_score": {"$avg": "$scores.avg_rerank_score"},
                    "avg_total_time": {"$avg": "$timing.total_time"},
                }
            }
        ]

        results = list(self.collection.aggregate(pipeline))

        breakdown = {}
        for item in results:
            query_type = item.pop("_id")
            breakdown[query_type] = item

        return breakdown

    def get_rerank_impact(self, days: int = 7) -> Dict:
        """
        재순위화 효과 측정

        Args:
            days: 최근 N일

        Returns:
            재순위화 효과 통계
        """
        since = datetime.utcnow() - timedelta(days=days)

        # 재순위화가 적용된 로그만 조회
        logs = list(self.collection.find({
            "timestamp": {"$gte": since},
            "scores.avg_rerank_score": {"$ne": None}
        }))

        if not logs:
            return {
                "total_reranked": 0,
                "avg_score_improvement": 0.0,
                "improved_count": 0,
                "degraded_count": 0,
                "unchanged_count": 0
            }

        total_reranked = len(logs)
        improved = 0
        degraded = 0
        unchanged = 0
        score_improvements = []

        for log in logs:
            orig_score = log["scores"]["avg_original_score"]
            rerank_score = log["scores"].get("avg_rerank_score")

            if rerank_score is None:
                continue

            # 재순위화 점수를 0-1 범위로 정규화 (Cross-Encoder는 -10~10 범위)
            # 단순 비교를 위해 원본 점수와 같은 척도로 변환
            # 여기서는 재순위화가 상위 문서를 더 잘 선택했는지 여부로 판단
            # (실제로는 클릭률 등 사용자 피드백이 필요)

            if rerank_score > orig_score:
                improved += 1
                score_improvements.append(rerank_score - orig_score)
            elif rerank_score < orig_score:
                degraded += 1
                score_improvements.append(rerank_score - orig_score)
            else:
                unchanged += 1

        avg_improvement = sum(score_improvements) / len(score_improvements) if score_improvements else 0.0

        return {
            "total_reranked": total_reranked,
            "avg_score_improvement": avg_improvement,
            "improved_count": improved,
            "degraded_count": degraded,
            "unchanged_count": unchanged
        }

    def get_failure_rate(self, days: int = 7, threshold_score: float = 0.3, threshold_result_count: int = 1) -> Dict:
        """
        실패율 분석

        Args:
            days: 최근 N일
            threshold_score: 점수 임계값
            threshold_result_count: 결과 수 임계값

        Returns:
            실패율 통계
        """
        since = datetime.utcnow() - timedelta(days=days)

        total_searches = self.collection.count_documents({"timestamp": {"$gte": since}})

        if total_searches == 0:
            return {
                "total_searches": 0,
                "failed_searches": 0,
                "failure_rate": 0.0,
                "failure_reasons": {}
            }

        # 실패한 검색 (낮은 점수 또는 결과 없음)
        failed_low_score = self.collection.count_documents({
            "timestamp": {"$gte": since},
            "scores.avg_original_score": {"$lt": threshold_score}
        })

        failed_no_results = self.collection.count_documents({
            "timestamp": {"$gte": since},
            "result_count": {"$lt": threshold_result_count}
        })

        # 중복 제거 (둘 다 해당하는 경우)
        failed_both = self.collection.count_documents({
            "timestamp": {"$gte": since},
            "$or": [
                {"scores.avg_original_score": {"$lt": threshold_score}},
                {"result_count": {"$lt": threshold_result_count}}
            ]
        })

        return {
            "total_searches": total_searches,
            "failed_searches": failed_both,
            "failure_rate": (failed_both / total_searches) * 100,
            "failure_reasons": {
                "low_score": failed_low_score,
                "no_results": failed_no_results,
                "both": failed_both
            }
        }

    def get_user_satisfaction(self, days: int = 7) -> Dict:
        """
        사용자 만족도 분석

        Args:
            days: 최근 N일

        Returns:
            만족도 통계
        """
        since = datetime.utcnow() - timedelta(days=days)

        # 피드백이 있는 로그 조회
        pipeline = [
            {
                "$match": {
                    "timestamp": {"$gte": since},
                    "feedback.satisfaction_rating": {"$ne": None}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_with_feedback": {"$sum": 1},
                    "avg_satisfaction": {"$avg": "$feedback.satisfaction_rating"},
                    "rating_distribution": {
                        "$push": "$feedback.satisfaction_rating"
                    }
                }
            }
        ]

        result = list(self.collection.aggregate(pipeline))

        if not result:
            return {
                "total_with_feedback": 0,
                "avg_satisfaction": 0.0,
                "rating_distribution": {}
            }

        stats = result[0]

        # 평점 분포 계산
        ratings = stats["rating_distribution"]
        distribution = {str(i): ratings.count(i) for i in range(1, 6)}

        return {
            "total_with_feedback": stats["total_with_feedback"],
            "avg_satisfaction": stats["avg_satisfaction"],
            "rating_distribution": distribution
        }

    def get_top_failed_queries(self, days: int = 7, limit: int = 10) -> List[Dict]:
        """
        가장 많이 실패한 쿼리 Top N

        Args:
            days: 최근 N일
            limit: 반환할 최대 개수

        Returns:
            실패 쿼리 리스트 (빈도순)
        """
        since = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {
                "$match": {
                    "timestamp": {"$gte": since},
                    "$or": [
                        {"scores.avg_original_score": {"$lt": 0.3}},
                        {"result_count": {"$lt": 1}}
                    ]
                }
            },
            {
                "$group": {
                    "_id": "$query",
                    "count": {"$sum": 1},
                    "avg_score": {"$avg": "$scores.avg_original_score"},
                    "avg_result_count": {"$avg": "$result_count"},
                    "query_types": {"$addToSet": "$query_type"}
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]

        results = list(self.collection.aggregate(pipeline))

        # 포맷 정리
        for item in results:
            item["query"] = item.pop("_id")

        return results

    def get_performance_trends(self, days: int = 7) -> Dict:
        """
        성능 트렌드 분석 (일별)

        Args:
            days: 최근 N일

        Returns:
            일별 성능 통계
        """
        since = datetime.utcnow() - timedelta(days=days)

        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}
                    },
                    "total_searches": {"$sum": 1},
                    "avg_total_time": {"$avg": "$timing.total_time"},
                    "avg_score": {"$avg": "$scores.avg_original_score"},
                    "failure_count": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$or": [
                                        {"$lt": ["$scores.avg_original_score", 0.3]},
                                        {"$lt": ["$result_count", 1]}
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {"$sort": {"_id": 1}}
        ]

        results = list(self.collection.aggregate(pipeline))

        # 포맷 정리
        trends = {}
        for item in results:
            date = item["_id"]
            trends[date] = {
                "total_searches": item["total_searches"],
                "avg_total_time": item["avg_total_time"],
                "avg_score": item["avg_score"],
                "failure_count": item["failure_count"],
                "failure_rate": (item["failure_count"] / item["total_searches"]) * 100
            }

        return trends


# 사용 예시
if __name__ == '__main__':
    analyzer = QualityAnalyzer()

    print("📊 검색 품질 분석 리포트")
    print("=" * 80)

    # 전체 통계
    overall = analyzer.get_overall_stats(days=7)
    print("\n## 전체 통계 (최근 7일)")
    print(f"  총 검색 수: {overall['total_searches']}")
    print(f"  평균 결과 수: {overall['avg_result_count']:.2f}개")
    print(f"  평균 점수: {overall['avg_original_score']:.3f}")
    print(f"  평균 응답 시간: {overall['avg_total_time']:.2f}초")

    # 쿼리 유형별 통계
    query_types = analyzer.get_query_type_breakdown(days=7)
    print("\n## 쿼리 유형별 통계")
    for qtype, stats in query_types.items():
        print(f"\n  [{qtype}]")
        print(f"    검색 수: {stats['count']}")
        print(f"    평균 점수: {stats['avg_original_score']:.3f}")
        print(f"    평균 결과 수: {stats['avg_result_count']:.2f}개")

    # 재순위화 효과
    rerank_impact = analyzer.get_rerank_impact(days=7)
    print("\n## 재순위화 효과")
    print(f"  재순위화 적용 수: {rerank_impact['total_reranked']}")
    print(f"  개선된 검색: {rerank_impact['improved_count']}")
    print(f"  저하된 검색: {rerank_impact['degraded_count']}")

    # 실패율
    failure_rate = analyzer.get_failure_rate(days=7)
    print("\n## 실패율 분석")
    print(f"  총 검색 수: {failure_rate['total_searches']}")
    print(f"  실패 검색 수: {failure_rate['failed_searches']}")
    print(f"  실패율: {failure_rate['failure_rate']:.2f}%")

    # 실패 쿼리 Top 10
    failed_queries = analyzer.get_top_failed_queries(days=7, limit=10)
    print("\n## 가장 많이 실패한 쿼리 Top 10")
    for i, item in enumerate(failed_queries, 1):
        print(f"  {i}. \"{item['query']}\" (실패 {item['count']}회, 평균 점수: {item['avg_score']:.3f})")

    print("\n" + "=" * 80)

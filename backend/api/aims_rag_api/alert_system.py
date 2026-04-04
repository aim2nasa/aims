# alert_system.py
"""
검색 품질 알림 시스템

실패율이 임계값을 초과하거나 특정 패턴이 감지되면 알림을 발생시킵니다.

알림 채널:
- 로그 파일 (기본)
- 이메일 (선택, 추후 구현)
- Slack/Telegram (선택, 추후 구현)
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional

from quality_analyzer import QualityAnalyzer

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("AlertSystem")


class AlertSystem:
    """검색 품질 알림 시스템"""

    def __init__(
        self,
        failure_rate_threshold: float = 20.0,  # 실패율 20% 초과시 알림
        low_score_threshold: float = 0.3,  # 평균 점수 0.3 미만시 알림
        response_time_threshold: float = 5.0  # 응답 시간 5초 초과시 알림
    ):
        """
        Args:
            failure_rate_threshold: 실패율 임계값 (%)
            low_score_threshold: 점수 임계값
            response_time_threshold: 응답 시간 임계값 (초)
        """
        self.analyzer = QualityAnalyzer()
        self.failure_rate_threshold = failure_rate_threshold
        self.low_score_threshold = low_score_threshold
        self.response_time_threshold = response_time_threshold

    def check_failure_rate(self, days: int = 1) -> Optional[Dict]:
        """
        실패율 체크

        Args:
            days: 최근 N일 (기본 1일)

        Returns:
            알림이 필요하면 알림 정보 반환, 아니면 None
        """
        stats = self.analyzer.get_failure_rate(days=days)

        if stats["total_searches"] == 0:
            return None

        failure_rate = stats["failure_rate"]

        if failure_rate > self.failure_rate_threshold:
            alert = {
                "type": "HIGH_FAILURE_RATE",
                "severity": "WARNING",
                "message": f"검색 실패율이 임계값을 초과했습니다: {failure_rate:.2f}% (임계값: {self.failure_rate_threshold}%)",
                "details": stats,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.warning(f"🚨 {alert['message']}")
            logger.warning(f"   총 검색: {stats['total_searches']}, 실패: {stats['failed_searches']}")

            return alert

        return None

    def check_average_score(self, days: int = 1) -> Optional[Dict]:
        """
        평균 점수 체크

        Args:
            days: 최근 N일

        Returns:
            알림이 필요하면 알림 정보 반환
        """
        stats = self.analyzer.get_overall_stats(days=days)

        if stats["total_searches"] == 0:
            return None

        avg_score = stats["avg_original_score"]

        if avg_score < self.low_score_threshold:
            alert = {
                "type": "LOW_AVERAGE_SCORE",
                "severity": "WARNING",
                "message": f"평균 검색 점수가 낮습니다: {avg_score:.3f} (임계값: {self.low_score_threshold})",
                "details": stats,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.warning(f"🚨 {alert['message']}")
            logger.warning(f"   총 검색: {stats['total_searches']}, 평균 결과 수: {stats['avg_result_count']:.2f}")

            return alert

        return None

    def check_response_time(self, days: int = 1) -> Optional[Dict]:
        """
        응답 시간 체크

        Args:
            days: 최근 N일

        Returns:
            알림이 필요하면 알림 정보 반환
        """
        stats = self.analyzer.get_overall_stats(days=days)

        if stats["total_searches"] == 0:
            return None

        avg_time = stats["avg_total_time"]

        if avg_time > self.response_time_threshold:
            alert = {
                "type": "SLOW_RESPONSE_TIME",
                "severity": "WARNING",
                "message": f"평균 응답 시간이 느립니다: {avg_time:.2f}초 (임계값: {self.response_time_threshold}초)",
                "details": stats,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.warning(f"🚨 {alert['message']}")
            logger.warning(f"   쿼리 분석: {stats['avg_query_analysis_time']:.2f}초")
            logger.warning(f"   검색: {stats['avg_search_time']:.2f}초")
            logger.warning(f"   재순위화: {stats['avg_rerank_time']:.2f}초")
            logger.warning(f"   LLM: {stats['avg_llm_time']:.2f}초")

            return alert

        return None

    def check_failed_query_patterns(self, days: int = 1, min_failures: int = 3) -> Optional[Dict]:
        """
        반복 실패 쿼리 패턴 체크

        동일한 쿼리가 여러 번 실패하면 알림

        Args:
            days: 최근 N일
            min_failures: 최소 실패 횟수

        Returns:
            알림이 필요하면 알림 정보 반환
        """
        failed_queries = self.analyzer.get_top_failed_queries(days=days, limit=5)

        # 최소 실패 횟수 이상인 쿼리 필터링
        repeated_failures = [q for q in failed_queries if q["count"] >= min_failures]

        if repeated_failures:
            alert = {
                "type": "REPEATED_QUERY_FAILURES",
                "severity": "INFO",
                "message": f"{len(repeated_failures)}개의 쿼리가 반복적으로 실패하고 있습니다",
                "details": repeated_failures,
                "timestamp": datetime.utcnow().isoformat()
            }

            logger.info(f"🔔 {alert['message']}")
            for q in repeated_failures[:3]:  # 상위 3개만 로그
                logger.info(f"   - \"{q['query']}\" (실패 {q['count']}회, 평균 점수: {q['avg_score']:.3f})")

            return alert

        return None

    def run_all_checks(self, days: int = 1) -> List[Dict]:
        """
        모든 체크 실행

        Args:
            days: 최근 N일

        Returns:
            발생한 알림 리스트
        """
        alerts = []

        # 실패율 체크
        alert = self.check_failure_rate(days=days)
        if alert:
            alerts.append(alert)

        # 평균 점수 체크
        alert = self.check_average_score(days=days)
        if alert:
            alerts.append(alert)

        # 응답 시간 체크
        alert = self.check_response_time(days=days)
        if alert:
            alerts.append(alert)

        # 반복 실패 쿼리 체크
        alert = self.check_failed_query_patterns(days=days, min_failures=3)
        if alert:
            alerts.append(alert)

        if not alerts:
            logger.info(f"✅ 모든 품질 지표가 정상 범위 내에 있습니다 (최근 {days}일)")

        return alerts


# 사용 예시
if __name__ == '__main__':
    alert_system = AlertSystem(
        failure_rate_threshold=20.0,  # 20% 초과시 알림
        low_score_threshold=0.3,  # 0.3 미만시 알림
        response_time_threshold=5.0  # 5초 초과시 알림
    )

    print("🔍 검색 품질 모니터링 시작...")
    print("=" * 80)

    # 모든 체크 실행
    alerts = alert_system.run_all_checks(days=1)

    if alerts:
        print(f"\n⚠️ {len(alerts)}개의 알림이 발생했습니다:\n")
        for i, alert in enumerate(alerts, 1):
            print(f"{i}. [{alert['severity']}] {alert['type']}")
            print(f"   {alert['message']}")
            print()
    else:
        print("\n✅ 모든 품질 지표가 정상입니다!")

    print("=" * 80)

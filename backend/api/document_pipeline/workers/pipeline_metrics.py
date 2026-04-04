"""
Pipeline Metrics Collector
인메모리 처리 메트릭 수집 (런타임 모니터링용)

외부 의존성 없이 운영 메트릭을 수집하여:
1. /health/deep 응답에 포함
2. 연속 에러 감지 → Slack 알림
"""
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# 슬라이딩 윈도우: 최근 1시간
WINDOW_SECONDS = 3600
# 연속 에러 임계값 (이 횟수 초과 시 알림)
CONSECUTIVE_ERROR_THRESHOLD = 5
# 알림 최소 간격 (초)
ALERT_COOLDOWN_SECONDS = 300


@dataclass
class ProcessingRecord:
    """단일 문서 처리 기록"""
    doc_id: str
    started_at: float
    completed_at: Optional[float] = None
    success: bool = True
    error_type: Optional[str] = None
    mime_type: str = ""
    file_size: int = 0


class PipelineMetrics:
    """
    인메모리 메트릭 수집기

    최근 1시간 분량의 처리 기록을 보관하고,
    슬라이딩 윈도우 기반으로 통계를 계산한다.
    """

    def __init__(self):
        self._records: deque[ProcessingRecord] = deque(maxlen=10000)
        self._consecutive_errors: int = 0
        self._total_processed: int = 0
        self._total_errors: int = 0
        self._alert_sent_at: Optional[float] = None
        self._started_at: float = time.time()

    def record_start(
        self, doc_id: str, mime_type: str = "", file_size: int = 0
    ) -> ProcessingRecord:
        """처리 시작 기록"""
        return ProcessingRecord(
            doc_id=doc_id,
            started_at=time.time(),
            mime_type=mime_type,
            file_size=file_size,
        )

    def record_success(self, record: ProcessingRecord):
        """처리 성공 기록"""
        record.completed_at = time.time()
        record.success = True
        self._records.append(record)
        self._total_processed += 1
        self._consecutive_errors = 0

    async def record_error(self, record: ProcessingRecord, error_type: str):
        """처리 실패 기록 + 임계값 초과 시 알림"""
        record.completed_at = time.time()
        record.success = False
        record.error_type = error_type
        self._records.append(record)
        self._total_processed += 1
        self._total_errors += 1
        self._consecutive_errors += 1

        if self._consecutive_errors >= CONSECUTIVE_ERROR_THRESHOLD:
            await self._send_alert(
                "연속 에러 %d회 (최근: %s)" % (self._consecutive_errors, error_type)
            )

    def get_summary(self) -> Dict[str, Any]:
        """현재 메트릭 요약 (/health/deep 응답에 포함)"""
        self._cleanup_old_records()

        now = time.time()
        window = [
            r for r in self._records
            if r.completed_at and (now - r.completed_at) < WINDOW_SECONDS
        ]

        recent_count = len(window)
        recent_errors = sum(1 for r in window if not r.success)

        durations = [
            r.completed_at - r.started_at
            for r in window
            if r.completed_at and r.success
        ]

        avg_duration = round(sum(durations) / len(durations), 2) if durations else 0
        max_duration = round(max(durations), 2) if durations else 0
        p95_idx = min(int(len(durations) * 0.95), len(durations) - 1) if durations else 0
        p95_duration = round(sorted(durations)[p95_idx], 2) if durations else 0

        error_breakdown: Dict[str, int] = {}
        for r in window:
            if not r.success and r.error_type:
                error_breakdown[r.error_type] = error_breakdown.get(r.error_type, 0) + 1

        return {
            "window": "1h",
            "total_processed": self._total_processed,
            "total_errors": self._total_errors,
            "recent": {
                "count": recent_count,
                "success": recent_count - recent_errors,
                "errors": recent_errors,
                "error_rate_pct": round(recent_errors / recent_count * 100, 1) if recent_count > 0 else 0,
            },
            "duration_sec": {
                "avg": avg_duration,
                "max": max_duration,
                "p95": p95_duration,
            },
            "error_breakdown": error_breakdown,
            "consecutive_errors": self._consecutive_errors,
            "uptime_sec": round(now - self._started_at),
        }

    def _cleanup_old_records(self):
        """윈도우 이전 기록 정리"""
        cutoff = time.time() - WINDOW_SECONDS
        while self._records and self._records[0].completed_at and self._records[0].completed_at < cutoff:
            self._records.popleft()

    async def _send_alert(self, message: str):
        """연속 에러 임계값 초과 시 Slack 알림 (중복 방지)"""
        now = time.time()
        if self._alert_sent_at and (now - self._alert_sent_at) < ALERT_COOLDOWN_SECONDS:
            return

        try:
            from workers.error_logger import error_logger
            await error_logger.log_error(
                error_type="PIPELINE_METRICS_ALERT",
                message="[Runtime Monitor] %s" % message,
                details=self.get_summary(),
                workflow="document_pipeline",
            )
            self._alert_sent_at = now
        except Exception as e:
            logger.warning("[PipelineMetrics] Alert 전송 실패: %s" % e)

        logger.warning("[PipelineMetrics] Alert: %s" % message)


# 전역 인스턴스 (import하여 사용)
pipeline_metrics = PipelineMetrics()

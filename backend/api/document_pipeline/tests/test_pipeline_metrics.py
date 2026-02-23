"""
pipeline_metrics 단위 테스트
"""
import time

import pytest

from workers.pipeline_metrics import PipelineMetrics, ProcessingRecord


class TestPipelineMetrics:
    """PipelineMetrics 클래스 테스트"""

    def test_record_start(self):
        metrics = PipelineMetrics()
        record = metrics.record_start("doc1", "application/pdf", 1024)
        assert record.doc_id == "doc1"
        assert record.mime_type == "application/pdf"
        assert record.file_size == 1024
        assert record.started_at > 0
        assert record.completed_at is None

    def test_record_success(self):
        metrics = PipelineMetrics()
        record = metrics.record_start("doc1")
        metrics.record_success(record)

        summary = metrics.get_summary()
        assert summary["total_processed"] == 1
        assert summary["total_errors"] == 0
        assert summary["recent"]["count"] == 1
        assert summary["recent"]["success"] == 1
        assert summary["recent"]["errors"] == 0
        assert summary["recent"]["error_rate_pct"] == 0
        assert summary["consecutive_errors"] == 0

    @pytest.mark.asyncio
    async def test_record_error(self):
        metrics = PipelineMetrics()
        record = metrics.record_start("doc1")
        await metrics.record_error(record, "ValueError")

        summary = metrics.get_summary()
        assert summary["total_processed"] == 1
        assert summary["total_errors"] == 1
        assert summary["recent"]["errors"] == 1
        assert summary["recent"]["error_rate_pct"] == 100.0
        assert summary["consecutive_errors"] == 1
        assert summary["error_breakdown"] == {"ValueError": 1}

    @pytest.mark.asyncio
    async def test_consecutive_errors_reset_on_success(self):
        metrics = PipelineMetrics()

        # 3 에러
        for i in range(3):
            record = metrics.record_start("doc%d" % i)
            await metrics.record_error(record, "TestError")
        assert metrics._consecutive_errors == 3

        # 1 성공 → 리셋
        record = metrics.record_start("doc_ok")
        metrics.record_success(record)
        assert metrics._consecutive_errors == 0

    @pytest.mark.asyncio
    async def test_error_rate_calculation(self):
        metrics = PipelineMetrics()

        # 7 성공 + 3 실패 = 30% 에러율
        for i in range(7):
            record = metrics.record_start("ok%d" % i)
            metrics.record_success(record)
        for i in range(3):
            record = metrics.record_start("err%d" % i)
            await metrics.record_error(record, "Err")

        summary = metrics.get_summary()
        assert summary["recent"]["count"] == 10
        assert summary["recent"]["error_rate_pct"] == 30.0

    def test_duration_stats(self):
        metrics = PipelineMetrics()

        # 수동으로 시간 설정 (윈도우 내에 있도록 현재 시간 기준)
        now = time.time()
        record = ProcessingRecord(doc_id="doc1", started_at=now - 2.5)
        record.completed_at = now  # 2.5초 소요
        record.success = True
        metrics._records.append(record)
        metrics._total_processed = 1

        summary = metrics.get_summary()
        assert summary["duration_sec"]["avg"] > 0
        assert summary["duration_sec"]["max"] > 0

    def test_empty_metrics(self):
        metrics = PipelineMetrics()
        summary = metrics.get_summary()

        assert summary["total_processed"] == 0
        assert summary["recent"]["count"] == 0
        assert summary["recent"]["error_rate_pct"] == 0
        assert summary["duration_sec"]["avg"] == 0
        assert summary["window"] == "1h"
        assert summary["uptime_sec"] >= 0

    @pytest.mark.asyncio
    async def test_error_breakdown_multiple_types(self):
        metrics = PipelineMetrics()

        for _ in range(2):
            r = metrics.record_start("d")
            await metrics.record_error(r, "ValueError")
        for _ in range(3):
            r = metrics.record_start("d")
            await metrics.record_error(r, "TimeoutError")

        summary = metrics.get_summary()
        assert summary["error_breakdown"]["ValueError"] == 2
        assert summary["error_breakdown"]["TimeoutError"] == 3

    def test_p95_boundary_no_index_error(self):
        """p95 인덱스가 배열 길이와 정확히 같을 때 IndexError 안 발생"""
        metrics = PipelineMetrics()
        now = time.time()

        # 정확히 20개 성공 레코드 (20 * 0.95 = 19.0 → int = 19, len-1 = 19)
        for i in range(20):
            record = ProcessingRecord(
                doc_id="doc%d" % i,
                started_at=now - 1.0,
            )
            record.completed_at = now
            record.success = True
            metrics._records.append(record)
            metrics._total_processed += 1

        summary = metrics.get_summary()
        assert summary["duration_sec"]["p95"] > 0

        # 100개 (100 * 0.95 = 95 → min(95, 99) = 95)
        metrics2 = PipelineMetrics()
        for i in range(100):
            record = ProcessingRecord(
                doc_id="doc%d" % i,
                started_at=now - 2.0,
            )
            record.completed_at = now
            record.success = True
            metrics2._records.append(record)
            metrics2._total_processed += 1

        summary2 = metrics2.get_summary()
        assert summary2["duration_sec"]["p95"] > 0

"""
xPipe Cost Tracker — Provider별 사용량/비용 추적

설계 원칙:
- 표준 라이브러리만 사용 (xpipe 독립성 유지)
- 인메모리 기록 (외부 저장소 의존 없음)
- Provider별/기간별 비용 요약 제공
- 향후 MongoDB 등 영구 저장소 연동은 별도 구현체로 확장

사용 예:
    tracker = CostTracker()
    tracker.record(UsageRecord(
        provider="openai",
        operation="classify",
        input_tokens=500,
        output_tokens=100,
        estimated_cost=0.0012,
        timestamp="2026-03-19T12:00:00",
    ))
    summary = tracker.get_summary("day")
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class UsageRecord:
    """단일 AI 호출의 사용량 기록

    Attributes:
        provider: Provider 이름 (예: "openai", "upstage")
        operation: 작업 유형 (예: "classify", "summarize", "ocr", "embed")
        input_tokens: 입력 토큰 수
        output_tokens: 출력 토큰 수
        estimated_cost: 추정 비용 (USD)
        timestamp: ISO 8601 형식의 타임스탬프
    """
    provider: str
    operation: str
    input_tokens: int
    output_tokens: int
    estimated_cost: float
    timestamp: str


class CostTracker:
    """Provider별 사용량/비용 추적기

    인메모리로 UsageRecord를 저장하고,
    Provider별/기간별 통계를 제공한다.
    """

    def __init__(self) -> None:
        self._records: list[UsageRecord] = []

    def record(self, usage: UsageRecord) -> None:
        """사용량 기록 추가

        Args:
            usage: 사용량 기록
        """
        self._records.append(usage)

    def get_all_records(self) -> list[UsageRecord]:
        """전체 기록 반환 (방어적 복사)"""
        return list(self._records)

    def get_by_provider(self, provider_name: str) -> list[UsageRecord]:
        """특정 Provider의 기록만 반환

        Args:
            provider_name: Provider 이름

        Returns:
            해당 Provider의 UsageRecord 목록
        """
        return [r for r in self._records if r.provider == provider_name]

    def get_by_operation(self, operation: str) -> list[UsageRecord]:
        """특정 작업 유형의 기록만 반환

        Args:
            operation: 작업 유형 (예: "classify", "ocr")

        Returns:
            해당 작업의 UsageRecord 목록
        """
        return [r for r in self._records if r.operation == operation]

    def get_summary(self, period: str = "all") -> dict[str, Any]:
        """기간별 비용 요약

        Args:
            period: 집계 기간
                - "all": 전체 기간
                - "day": 오늘 (UTC 기준)
                - "hour": 최근 1시간

        Returns:
            요약 dict:
                - total_records (int): 기록 수
                - total_cost (float): 총 비용 (USD)
                - total_input_tokens (int): 총 입력 토큰
                - total_output_tokens (int): 총 출력 토큰
                - by_provider (dict): Provider별 비용/토큰 집계
                - by_operation (dict): 작업별 비용/토큰 집계
                - period (str): 집계 기간
        """
        records = self._filter_by_period(period)
        return self._aggregate(records, period)

    def clear(self) -> None:
        """전체 기록 초기화"""
        self._records.clear()

    # --- Private helpers ---

    def _filter_by_period(self, period: str) -> list[UsageRecord]:
        """기간 필터링"""
        if period == "all":
            return list(self._records)

        now = datetime.now(timezone.utc)

        if period == "day":
            # 오늘 날짜 (UTC) 기준
            today_str = now.strftime("%Y-%m-%d")
            return [
                r for r in self._records
                if r.timestamp.startswith(today_str)
            ]

        if period == "hour":
            # 최근 1시간 이내
            cutoff = now.strftime("%Y-%m-%dT%H")
            return [
                r for r in self._records
                if r.timestamp >= cutoff
            ]

        # 알 수 없는 기간 → 전체 반환
        return list(self._records)

    @staticmethod
    def _aggregate(records: list[UsageRecord], period: str) -> dict[str, Any]:
        """기록을 집계하여 요약 dict를 생성한다."""
        total_cost = 0.0
        total_input = 0
        total_output = 0

        by_provider: dict[str, dict[str, Any]] = {}
        by_operation: dict[str, dict[str, Any]] = {}

        for r in records:
            total_cost += r.estimated_cost
            total_input += r.input_tokens
            total_output += r.output_tokens

            # Provider별 집계
            if r.provider not in by_provider:
                by_provider[r.provider] = {
                    "cost": 0.0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "count": 0,
                }
            p = by_provider[r.provider]
            p["cost"] += r.estimated_cost
            p["input_tokens"] += r.input_tokens
            p["output_tokens"] += r.output_tokens
            p["count"] += 1

            # 작업별 집계
            if r.operation not in by_operation:
                by_operation[r.operation] = {
                    "cost": 0.0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "count": 0,
                }
            o = by_operation[r.operation]
            o["cost"] += r.estimated_cost
            o["input_tokens"] += r.input_tokens
            o["output_tokens"] += r.output_tokens
            o["count"] += 1

        return {
            "total_records": len(records),
            "total_cost": round(total_cost, 6),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "by_provider": by_provider,
            "by_operation": by_operation,
            "period": period,
        }

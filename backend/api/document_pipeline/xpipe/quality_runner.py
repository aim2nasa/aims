"""
xPipe Quality Runner — Ground Truth 대비 분류 정확도 자동 측정

설계 원칙:
- GT(Ground Truth) JSON 파일을 로드하여 실제 분류 결과와 비교
- 기준선(baseline) 대비 정확도 저하 여부 판단
- DomainAdapter 의존 없이 독립 동작 가능 (GT 파일 + 문서 데이터만 필요)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# 정확도 보고서
# ---------------------------------------------------------------------------

@dataclass
class AccuracyReport:
    """분류 정확도 보고서

    Attributes:
        total: 전체 GT 항목 수
        correct: 정확히 일치한 항목 수
        incorrect: 불일치 항목 수
        skipped: 비교 불가 항목 수 (문서 없음 등)
        accuracy: 정확도 (0~1)
        mismatches: 불일치 상세 목록
    """
    total: int
    correct: int
    incorrect: int
    skipped: int
    accuracy: float
    mismatches: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Ground Truth Runner
# ---------------------------------------------------------------------------

class GroundTruthRunner:
    """Ground Truth 대비 분류 정확도를 자동 측정한다.

    GT 파일 형식 (JSON):
        [
            {"file_id": "...", "expected_type": "...", "actual_type": "..."},
            ...
        ]

    actual_type이 없으면 doc_provider 콜백으로 문서를 조회하여
    document_type 필드를 사용한다.
    """

    def __init__(
        self,
        doc_provider: Any | None = None,
    ):
        """
        Args:
            doc_provider: 문서 조회 콜백 (선택).
                callable(file_id: str) -> dict | None
                GT에 actual_type이 없을 때 문서를 조회하여 document_type을 가져온다.
        """
        self.doc_provider = doc_provider

    def measure_accuracy(
        self,
        ground_truth_path: str,
        docs: list[dict] | None = None,
    ) -> AccuracyReport:
        """GT 파일을 읽어 분류 정확도를 측정한다.

        Args:
            ground_truth_path: GT JSON 파일 경로
            docs: 문서 목록 (선택). 제공하면 file_id로 매칭하여 actual_type을 추출.
                  제공하지 않으면 GT 항목의 actual_type 필드 사용.

        Returns:
            AccuracyReport: 정확도 보고서
        """
        gt_items = self._load_ground_truth(ground_truth_path)

        # docs를 file_id로 인덱싱
        doc_map: dict[str, dict] = {}
        if docs:
            for doc in docs:
                fid = doc.get("file_id") or doc.get("_id") or ""
                if fid:
                    doc_map[str(fid)] = doc

        correct = 0
        incorrect = 0
        skipped = 0
        mismatches: list[dict[str, Any]] = []

        for item in gt_items:
            file_id = item.get("file_id", "")
            expected_type = item.get("expected_type", "")

            if not expected_type:
                skipped += 1
                continue

            # actual_type 결정
            actual_type = item.get("actual_type")

            if not actual_type and file_id in doc_map:
                actual_type = doc_map[file_id].get("document_type", "")

            if not actual_type and self.doc_provider and file_id:
                doc = self.doc_provider(file_id)
                if doc:
                    actual_type = doc.get("document_type", "")

            if not actual_type:
                skipped += 1
                continue

            # 비교
            if expected_type == actual_type:
                correct += 1
            else:
                incorrect += 1
                mismatches.append({
                    "file_id": file_id,
                    "expected": expected_type,
                    "actual": actual_type,
                })

        compared = correct + incorrect
        accuracy = correct / compared if compared > 0 else 0.0

        return AccuracyReport(
            total=len(gt_items),
            correct=correct,
            incorrect=incorrect,
            skipped=skipped,
            accuracy=round(accuracy, 4),
            mismatches=mismatches,
        )

    def compare_with_baseline(
        self,
        current: AccuracyReport,
        baseline: dict,
    ) -> bool:
        """기준선 대비 정확도 저하 여부를 판단한다.

        Args:
            current: 현재 정확도 보고서
            baseline: 기준선 dict. 최소 {"accuracy": float} 필수.
                예: {"accuracy": 0.918, "total": 158}

        Returns:
            True이면 기준선 이상 유지, False이면 정확도 저하
        """
        baseline_accuracy = baseline.get("accuracy", 0.0)
        return current.accuracy >= baseline_accuracy

    @staticmethod
    def _load_ground_truth(path: str) -> list[dict]:
        """GT JSON 파일을 로드한다.

        Args:
            path: GT JSON 파일 경로

        Returns:
            GT 항목 목록

        Raises:
            FileNotFoundError: 파일이 없는 경우
            json.JSONDecodeError: JSON 파싱 실패
        """
        filepath = Path(path)
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            raise ValueError(f"GT 파일은 JSON 배열이어야 합니다: {path}")

        return data

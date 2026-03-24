"""
xPipe Quality Gate — 문서 처리 결과의 품질을 자동 측정하고, 기준 미달 문서를 플래그

설계 원칙:
- 도메인 무관: 분류 confidence, 텍스트 품질 등 범용 지표만 평가
- 환경 변수 XPIPE_QUALITY_GATE=false로 비활성화 가능
- QualityConfig로 임계치 커스터마이징 가능
- 배치 평가 시 QualityReport로 통계 제공
"""
from __future__ import annotations

import os
import unicodedata
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# 설정
# ---------------------------------------------------------------------------

@dataclass
class QualityConfig:
    """품질 임계치 설정

    Attributes:
        min_confidence: 분류 최소 confidence (이하 → LOW_CONFIDENCE 플래그)
        min_text_length: 최소 텍스트 길이 (미만 → SHORT_TEXT 플래그)
        max_broken_char_ratio: 최대 깨진 문자 비율 (초과 → BROKEN_TEXT 플래그)
        overall_threshold: 종합 점수 통과 임계치
    """
    min_confidence: float = 0.5
    min_text_length: int = 10
    max_broken_char_ratio: float = 0.3
    overall_threshold: float = 0.4


# ---------------------------------------------------------------------------
# 품질 점수
# ---------------------------------------------------------------------------

@dataclass
class QualityScore:
    """문서 품질 점수

    Attributes:
        classification_confidence: 분류 신뢰도 (0~1)
        text_quality: 텍스트 품질 (0~1, 길이/깨짐 기반)
        overall: 종합 점수 (0~1)
        passed: 임계치 통과 여부
        flags: 품질 문제 플래그 목록
    """
    classification_confidence: float
    text_quality: float
    overall: float
    passed: bool
    flags: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 배치 보고서
# ---------------------------------------------------------------------------

@dataclass
class QualityReport:
    """배치 품질 보고서

    Attributes:
        total: 전체 문서 수
        passed: 통과 문서 수
        failed: 실패 문서 수
        flags_summary: 플래그별 건수
        avg_confidence: 평균 분류 신뢰도
        avg_text_quality: 평균 텍스트 품질
        scores: 개별 문서 점수 목록
    """
    total: int
    passed: int
    failed: int
    flags_summary: dict[str, int]
    avg_confidence: float
    avg_text_quality: float
    scores: list[QualityScore] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 깨진 문자 판별
# ---------------------------------------------------------------------------

def _count_broken_chars(text: str) -> int:
    """깨진/비정상 문자 수를 반환한다."""
    count = 0
    for ch in text:
        # U+FFFD (대체 문자)
        if ch == "\ufffd":
            count += 1
            continue
        # 제어 문자 (탭, 줄바꿈, 캐리지리턴 제외)
        cat = unicodedata.category(ch)
        if cat.startswith("C") and ch not in ("\t", "\n", "\r"):
            count += 1
    return count


# ---------------------------------------------------------------------------
# Quality Gate
# ---------------------------------------------------------------------------

def is_enabled() -> bool:
    """Quality Gate 활성화 여부 (환경 변수 기반)

    XPIPE_QUALITY_GATE 환경 변수가 'false', '0', 'no'이면 비활성화.
    기본값: 활성화.
    """
    val = os.environ.get("XPIPE_QUALITY_GATE", "true").lower().strip()
    return val not in ("false", "0", "no")


class QualityGate:
    """파이프라인 품질 게이트

    문서의 분류 결과 + 텍스트 품질을 평가하여 QualityScore를 반환한다.
    """

    def __init__(self, config: QualityConfig | None = None):
        self.config = config or QualityConfig()

    def evaluate(self, doc: dict) -> QualityScore:
        """문서의 품질을 평가한다.

        Args:
            doc: 문서 데이터. 다음 필드를 참조한다:
                - classification_confidence (float): 분류 신뢰도. 없으면 0.0
                - full_text (str): 전체 텍스트. 없으면 ""
                  또는 meta.full_text, ocr.full_text 중 하나
                - document_type (str): 분류된 문서 유형. 없으면 ""

        Returns:
            QualityScore: 품질 평가 결과
        """
        # --- 1. 분류 confidence 추출 ---
        confidence = self._extract_confidence(doc)

        # --- 2. 텍스트 품질 평가 ---
        text = self._extract_text(doc)
        text_quality = self._evaluate_text_quality(text)

        # --- 3. 플래그 수집 ---
        flags: list[str] = []

        if confidence < self.config.min_confidence:
            flags.append("LOW_CONFIDENCE")

        text_len = len(text.strip())
        if text_len < self.config.min_text_length:
            flags.append("SHORT_TEXT")

        if text_len > 0:
            broken_ratio = _count_broken_chars(text) / text_len
            if broken_ratio > self.config.max_broken_char_ratio:
                flags.append("BROKEN_TEXT")

        doc_type = doc.get("document_type", "")
        if not doc_type or doc_type in ("general", "unknown", ""):
            flags.append("UNCLASSIFIED")

        # --- 4. 종합 점수 산출 (가중 평균) ---
        # confidence 60%, text_quality 40%
        overall = confidence * 0.6 + text_quality * 0.4

        # --- 5. 통과 여부 ---
        passed = overall >= self.config.overall_threshold and len(flags) == 0

        return QualityScore(
            classification_confidence=round(confidence, 4),
            text_quality=round(text_quality, 4),
            overall=round(overall, 4),
            passed=passed,
            flags=flags,
        )

    def evaluate_batch(self, docs: list[dict]) -> QualityReport:
        """배치 품질 평가 + 통계

        Args:
            docs: 문서 목록

        Returns:
            QualityReport: 배치 품질 보고서
        """
        scores: list[QualityScore] = []
        for doc in docs:
            scores.append(self.evaluate(doc))

        passed_count = sum(1 for s in scores if s.passed)
        failed_count = len(scores) - passed_count

        # 플래그별 건수 집계
        flags_summary: dict[str, int] = {}
        for s in scores:
            for flag in s.flags:
                flags_summary[flag] = flags_summary.get(flag, 0) + 1

        # 평균 계산
        total = len(scores)
        avg_confidence = (
            sum(s.classification_confidence for s in scores) / total
            if total > 0
            else 0.0
        )
        avg_text_quality = (
            sum(s.text_quality for s in scores) / total
            if total > 0
            else 0.0
        )

        return QualityReport(
            total=total,
            passed=passed_count,
            failed=failed_count,
            flags_summary=flags_summary,
            avg_confidence=round(avg_confidence, 4),
            avg_text_quality=round(avg_text_quality, 4),
            scores=scores,
        )

    # --- Private helpers ---

    def _extract_confidence(self, doc: dict) -> float:
        """문서에서 분류 confidence를 추출한다."""
        # 직접 필드
        if "classification_confidence" in doc:
            val = doc["classification_confidence"]
            if isinstance(val, (int, float)):
                return max(0.0, min(1.0, float(val)))

        # meta.classification_confidence
        meta = doc.get("meta", {})
        if isinstance(meta, dict) and "classification_confidence" in meta:
            val = meta["classification_confidence"]
            if isinstance(val, (int, float)):
                return max(0.0, min(1.0, float(val)))

        return 0.0

    def _extract_text(self, doc: dict) -> str:
        """문서에서 전체 텍스트를 추출한다."""
        # 직접 필드
        if "full_text" in doc and doc["full_text"]:
            return str(doc["full_text"])

        # meta.full_text
        meta = doc.get("meta", {})
        if isinstance(meta, dict) and meta.get("full_text"):
            return str(meta["full_text"])

        # ocr.full_text
        ocr = doc.get("ocr", {})
        if isinstance(ocr, dict) and ocr.get("full_text"):
            return str(ocr["full_text"])

        return ""

    def _evaluate_text_quality(self, text: str) -> float:
        """텍스트 품질을 0~1 점수로 평가한다.

        - 빈 텍스트: 0.0
        - 길이 기반 점수 (0~0.5): min(length / 100, 0.5)
        - 깨진 문자 기반 점수 (0~0.5): (1 - broken_ratio) * 0.5
        """
        text = text.strip()
        if not text:
            return 0.0

        text_len = len(text)

        # 길이 기반 (짧으면 감점, 100자 이상이면 최대)
        length_score = min(text_len / 100.0, 1.0) * 0.5

        # 깨진 문자 비율 기반
        broken_count = _count_broken_chars(text)
        broken_ratio = broken_count / text_len if text_len > 0 else 0.0
        clean_score = max(0.0, 1.0 - broken_ratio) * 0.5

        return round(length_score + clean_score, 4)

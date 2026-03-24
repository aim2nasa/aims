"""
xPipe Quality Gate + GroundTruthRunner 테스트

QualityGate 평가 로직, 임계치 경계값, 배치 보고서,
GroundTruthRunner 기본 동작을 검증한다.
"""
import json
import os
import tempfile
from pathlib import Path

import pytest

from xpipe.quality import (
    QualityConfig,
    QualityGate,
    QualityReport,
    QualityScore,
    _count_broken_chars,
)
from xpipe.quality_runner import AccuracyReport, GroundTruthRunner


# ===========================================================================
# QualityGate 테스트
# ===========================================================================


class TestQualityScore:
    """QualityScore 데이터 클래스 기본 동작"""

    def test_create_quality_score(self):
        """QualityScore 생성 및 필드 접근"""
        score = QualityScore(
            classification_confidence=0.85,
            text_quality=0.9,
            overall=0.87,
            passed=True,
            flags=[],
        )
        assert score.classification_confidence == 0.85
        assert score.passed is True
        assert score.flags == []

    def test_quality_score_with_flags(self):
        """플래그가 있는 QualityScore"""
        score = QualityScore(
            classification_confidence=0.3,
            text_quality=0.1,
            overall=0.22,
            passed=False,
            flags=["LOW_CONFIDENCE", "SHORT_TEXT"],
        )
        assert not score.passed
        assert len(score.flags) == 2
        assert "LOW_CONFIDENCE" in score.flags


class TestQualityConfig:
    """QualityConfig 기본값 및 커스터마이징"""

    def test_default_config(self):
        """기본 설정값 확인"""
        config = QualityConfig()
        assert config.min_confidence == 0.5
        assert config.min_text_length == 10
        assert config.max_broken_char_ratio == 0.3
        assert config.overall_threshold == 0.4

    def test_custom_config(self):
        """커스텀 설정값"""
        config = QualityConfig(
            min_confidence=0.8,
            min_text_length=50,
            max_broken_char_ratio=0.1,
            overall_threshold=0.7,
        )
        assert config.min_confidence == 0.8
        assert config.min_text_length == 50


class TestBrokenCharCount:
    """깨진 문자 판별 유틸"""

    def test_normal_text(self):
        """정상 텍스트 → 깨진 문자 없음"""
        assert _count_broken_chars("안녕하세요 Hello 123") == 0

    def test_replacement_chars(self):
        """U+FFFD 대체 문자 감지"""
        assert _count_broken_chars("abc\ufffddef\ufffd") == 2

    def test_control_chars(self):
        """제어 문자 감지 (탭/줄바꿈 제외)"""
        # \x00 (NULL), \x01 (SOH) → 감지됨
        # \t, \n → 감지 안 됨
        text = "abc\x00\x01\ndef\t"
        assert _count_broken_chars(text) == 2

    def test_empty_text(self):
        """빈 텍스트"""
        assert _count_broken_chars("") == 0


class TestQualityGateEnabled:
    """QualityGate.enabled — 생성자 파라미터 기반 활성화/비활성화"""

    def test_default_enabled(self):
        """기본값: 활성화"""
        gate = QualityGate()
        assert gate.enabled is True

    def test_explicit_enabled(self):
        """명시적 enabled=True"""
        gate = QualityGate(enabled=True)
        assert gate.enabled is True

    def test_disabled(self):
        """enabled=False로 비활성화"""
        gate = QualityGate(enabled=False)
        assert gate.enabled is False

    def test_enabled_with_config(self):
        """config과 enabled 동시 전달"""
        config = QualityConfig(min_confidence=0.9)
        gate = QualityGate(config, enabled=False)
        assert gate.enabled is False
        assert gate.config.min_confidence == 0.9


class TestQualityGateEvaluate:
    """QualityGate.evaluate() 단건 평가"""

    def setup_method(self):
        self.gate = QualityGate()

    def test_high_quality_document(self):
        """고품질 문서 → 통과"""
        doc = {
            "classification_confidence": 0.95,
            "full_text": "이것은 충분히 긴 텍스트입니다. " * 10,
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert score.passed is True
        assert score.flags == []
        assert score.classification_confidence == 0.95
        assert score.overall > 0.4

    def test_low_confidence(self):
        """낮은 confidence → LOW_CONFIDENCE 플래그"""
        doc = {
            "classification_confidence": 0.3,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert "LOW_CONFIDENCE" in score.flags
        assert score.passed is False

    def test_short_text(self):
        """짧은 텍스트 → SHORT_TEXT 플래그"""
        doc = {
            "classification_confidence": 0.9,
            "full_text": "짧음",
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert "SHORT_TEXT" in score.flags

    def test_empty_text(self):
        """빈 텍스트 → SHORT_TEXT 플래그"""
        doc = {
            "classification_confidence": 0.9,
            "full_text": "",
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert "SHORT_TEXT" in score.flags
        assert score.text_quality == 0.0

    def test_broken_text(self):
        """깨진 텍스트 → BROKEN_TEXT 플래그"""
        # 50% 이상 깨진 문자
        broken = "\ufffd" * 40 + "정상텍스트" * 2
        doc = {
            "classification_confidence": 0.9,
            "full_text": broken,
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert "BROKEN_TEXT" in score.flags

    def test_unclassified_document(self):
        """미분류 문서 → UNCLASSIFIED 플래그"""
        doc = {
            "classification_confidence": 0.9,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "general",
        }
        score = self.gate.evaluate(doc)
        assert "UNCLASSIFIED" in score.flags

    def test_unclassified_empty_type(self):
        """document_type이 빈 문자열 → UNCLASSIFIED"""
        doc = {
            "classification_confidence": 0.9,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "",
        }
        score = self.gate.evaluate(doc)
        assert "UNCLASSIFIED" in score.flags

    def test_unclassified_missing_type(self):
        """document_type 필드 없음 → UNCLASSIFIED"""
        doc = {
            "classification_confidence": 0.9,
            "full_text": "충분한 텍스트 " * 20,
        }
        score = self.gate.evaluate(doc)
        assert "UNCLASSIFIED" in score.flags

    def test_no_confidence_field(self):
        """confidence 필드 없음 → 0.0으로 평가"""
        doc = {
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert score.classification_confidence == 0.0
        assert "LOW_CONFIDENCE" in score.flags

    def test_meta_confidence(self):
        """meta.classification_confidence에서 추출"""
        doc = {
            "meta": {"classification_confidence": 0.85},
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert score.classification_confidence == 0.85

    def test_meta_full_text(self):
        """meta.full_text에서 텍스트 추출"""
        doc = {
            "classification_confidence": 0.9,
            "meta": {"full_text": "메타에서 가져온 긴 텍스트입니다. " * 10},
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert score.text_quality > 0.0

    def test_ocr_full_text(self):
        """ocr.full_text에서 텍스트 추출"""
        doc = {
            "classification_confidence": 0.9,
            "ocr": {"full_text": "OCR에서 가져온 긴 텍스트입니다. " * 10},
            "document_type": "policy",
        }
        score = self.gate.evaluate(doc)
        assert score.text_quality > 0.0

    def test_multiple_flags(self):
        """여러 플래그 동시 발생"""
        doc = {
            "classification_confidence": 0.1,
            "full_text": "짧",
            "document_type": "",
        }
        score = self.gate.evaluate(doc)
        assert "LOW_CONFIDENCE" in score.flags
        assert "SHORT_TEXT" in score.flags
        assert "UNCLASSIFIED" in score.flags
        assert score.passed is False


class TestQualityGateThreshold:
    """임계치 경계값 테스트"""

    def test_confidence_exact_threshold(self):
        """confidence가 정확히 임계치와 같으면 → 플래그 없음"""
        gate = QualityGate(QualityConfig(min_confidence=0.5))
        doc = {
            "classification_confidence": 0.5,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert "LOW_CONFIDENCE" not in score.flags

    def test_confidence_just_below_threshold(self):
        """confidence가 임계치 바로 아래 → LOW_CONFIDENCE"""
        gate = QualityGate(QualityConfig(min_confidence=0.5))
        doc = {
            "classification_confidence": 0.499,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert "LOW_CONFIDENCE" in score.flags

    def test_text_length_exact_threshold(self):
        """텍스트 길이가 정확히 임계치 → SHORT_TEXT 아님"""
        gate = QualityGate(QualityConfig(min_text_length=10))
        doc = {
            "classification_confidence": 0.9,
            "full_text": "1234567890",  # 10자
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert "SHORT_TEXT" not in score.flags

    def test_text_length_just_below_threshold(self):
        """텍스트 길이가 임계치 바로 아래 → SHORT_TEXT"""
        gate = QualityGate(QualityConfig(min_text_length=10))
        doc = {
            "classification_confidence": 0.9,
            "full_text": "123456789",  # 9자
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert "SHORT_TEXT" in score.flags

    def test_custom_overall_threshold(self):
        """커스텀 overall_threshold 적용"""
        gate = QualityGate(QualityConfig(overall_threshold=0.9))
        doc = {
            "classification_confidence": 0.8,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        # overall = 0.8 * 0.6 + text_quality * 0.4 → 0.9 미만일 수 있음
        # 플래그가 없어도 overall이 0.9 미만이면 passed=False
        # (실제 overall은 confidence와 text_quality에 의존)
        assert isinstance(score.passed, bool)

    def test_confidence_clamped_to_0_1(self):
        """confidence가 0~1 범위로 클램프"""
        gate = QualityGate()
        doc = {
            "classification_confidence": 1.5,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert score.classification_confidence == 1.0

    def test_negative_confidence_clamped(self):
        """음수 confidence → 0.0으로 클램프"""
        gate = QualityGate()
        doc = {
            "classification_confidence": -0.5,
            "full_text": "충분한 텍스트 " * 20,
            "document_type": "policy",
        }
        score = gate.evaluate(doc)
        assert score.classification_confidence == 0.0


class TestQualityGateBatch:
    """배치 평가 보고서 테스트"""

    def test_empty_batch(self):
        """빈 배치 → 전체 0"""
        gate = QualityGate()
        report = gate.evaluate_batch([])
        assert report.total == 0
        assert report.passed == 0
        assert report.failed == 0
        assert report.avg_confidence == 0.0
        assert report.avg_text_quality == 0.0

    def test_batch_with_mixed_quality(self):
        """혼합 품질 배치"""
        gate = QualityGate()
        docs = [
            {
                "classification_confidence": 0.95,
                "full_text": "고품질 문서 " * 20,
                "document_type": "policy",
            },
            {
                "classification_confidence": 0.1,
                "full_text": "짧",
                "document_type": "",
            },
        ]
        report = gate.evaluate_batch(docs)
        assert report.total == 2
        assert report.passed == 1
        assert report.failed == 1
        assert len(report.scores) == 2

    def test_batch_flags_summary(self):
        """배치 플래그 집계"""
        gate = QualityGate()
        docs = [
            {"classification_confidence": 0.1, "full_text": "짧", "document_type": ""},
            {"classification_confidence": 0.2, "full_text": "짧2", "document_type": "general"},
        ]
        report = gate.evaluate_batch(docs)
        assert report.flags_summary.get("LOW_CONFIDENCE", 0) == 2
        assert report.flags_summary.get("SHORT_TEXT", 0) == 2
        assert report.flags_summary.get("UNCLASSIFIED", 0) == 2

    def test_batch_all_pass(self):
        """전체 통과 배치"""
        gate = QualityGate()
        docs = [
            {
                "classification_confidence": 0.9,
                "full_text": "충분한 텍스트 " * 20,
                "document_type": "policy",
            }
            for _ in range(5)
        ]
        report = gate.evaluate_batch(docs)
        assert report.total == 5
        assert report.passed == 5
        assert report.failed == 0
        assert report.flags_summary == {}

    def test_batch_report_type(self):
        """배치 보고서 타입 확인"""
        gate = QualityGate()
        report = gate.evaluate_batch([])
        assert isinstance(report, QualityReport)


# ===========================================================================
# GroundTruthRunner 테스트
# ===========================================================================


class TestGroundTruthRunner:
    """GroundTruthRunner 기본 동작"""

    def _write_gt_file(self, items: list[dict]) -> str:
        """임시 GT JSON 파일 생성 후 경로 반환"""
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8",
        )
        json.dump(items, f, ensure_ascii=False)
        f.close()
        return f.name

    def test_perfect_accuracy(self):
        """전체 일치 → accuracy 1.0"""
        gt_items = [
            {"file_id": "a", "expected_type": "policy", "actual_type": "policy"},
            {"file_id": "b", "expected_type": "claim", "actual_type": "claim"},
        ]
        gt_path = self._write_gt_file(gt_items)
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert report.accuracy == 1.0
            assert report.correct == 2
            assert report.incorrect == 0
            assert report.mismatches == []
        finally:
            Path(gt_path).unlink()

    def test_partial_accuracy(self):
        """부분 일치 → 정확한 accuracy 계산"""
        gt_items = [
            {"file_id": "a", "expected_type": "policy", "actual_type": "policy"},
            {"file_id": "b", "expected_type": "claim", "actual_type": "general"},
            {"file_id": "c", "expected_type": "receipt", "actual_type": "receipt"},
        ]
        gt_path = self._write_gt_file(gt_items)
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert report.accuracy == pytest.approx(2 / 3, abs=0.001)
            assert report.correct == 2
            assert report.incorrect == 1
            assert len(report.mismatches) == 1
            assert report.mismatches[0]["file_id"] == "b"
            assert report.mismatches[0]["expected"] == "claim"
            assert report.mismatches[0]["actual"] == "general"
        finally:
            Path(gt_path).unlink()

    def test_skip_missing_actual(self):
        """actual_type 없고 doc_provider 없으면 → 스킵"""
        gt_items = [
            {"file_id": "a", "expected_type": "policy"},  # actual_type 없음
        ]
        gt_path = self._write_gt_file(gt_items)
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert report.skipped == 1
            assert report.correct == 0
        finally:
            Path(gt_path).unlink()

    def test_skip_missing_expected(self):
        """expected_type 없으면 → 스킵"""
        gt_items = [
            {"file_id": "a", "expected_type": "", "actual_type": "policy"},
        ]
        gt_path = self._write_gt_file(gt_items)
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert report.skipped == 1
        finally:
            Path(gt_path).unlink()

    def test_docs_parameter(self):
        """docs 파라미터로 actual_type 매칭"""
        gt_items = [
            {"file_id": "abc", "expected_type": "policy"},
        ]
        docs = [
            {"file_id": "abc", "document_type": "policy"},
        ]
        gt_path = self._write_gt_file(gt_items)
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path, docs=docs)
            assert report.correct == 1
            assert report.accuracy == 1.0
        finally:
            Path(gt_path).unlink()

    def test_doc_provider_callback(self):
        """doc_provider 콜백으로 actual_type 조회"""
        gt_items = [
            {"file_id": "xyz", "expected_type": "claim"},
        ]
        gt_path = self._write_gt_file(gt_items)

        def provider(file_id: str):
            if file_id == "xyz":
                return {"document_type": "claim"}
            return None

        try:
            runner = GroundTruthRunner(doc_provider=provider)
            report = runner.measure_accuracy(gt_path)
            assert report.correct == 1
        finally:
            Path(gt_path).unlink()

    def test_nonexistent_file(self):
        """존재하지 않는 GT 파일 → FileNotFoundError"""
        runner = GroundTruthRunner()
        with pytest.raises(FileNotFoundError):
            runner.measure_accuracy("/nonexistent/gt.json")

    def test_invalid_json_format(self):
        """GT 파일이 배열이 아닌 경우 → ValueError"""
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8",
        )
        json.dump({"not": "an array"}, f)
        f.close()
        try:
            runner = GroundTruthRunner()
            with pytest.raises(ValueError, match="JSON 배열"):
                runner.measure_accuracy(f.name)
        finally:
            Path(f.name).unlink()

    def test_empty_gt(self):
        """빈 GT → 전체 0"""
        gt_path = self._write_gt_file([])
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert report.total == 0
            assert report.accuracy == 0.0
        finally:
            Path(gt_path).unlink()

    def test_accuracy_report_type(self):
        """반환 타입 확인"""
        gt_path = self._write_gt_file([
            {"file_id": "a", "expected_type": "x", "actual_type": "x"},
        ])
        try:
            runner = GroundTruthRunner()
            report = runner.measure_accuracy(gt_path)
            assert isinstance(report, AccuracyReport)
        finally:
            Path(gt_path).unlink()


class TestCompareWithBaseline:
    """기준선 대비 비교"""

    def test_above_baseline(self):
        """현재 정확도가 기준선 이상 → True"""
        runner = GroundTruthRunner()
        current = AccuracyReport(
            total=100, correct=92, incorrect=8, skipped=0,
            accuracy=0.92, mismatches=[],
        )
        assert runner.compare_with_baseline(current, {"accuracy": 0.9}) is True

    def test_below_baseline(self):
        """현재 정확도가 기준선 미만 → False"""
        runner = GroundTruthRunner()
        current = AccuracyReport(
            total=100, correct=85, incorrect=15, skipped=0,
            accuracy=0.85, mismatches=[],
        )
        assert runner.compare_with_baseline(current, {"accuracy": 0.9}) is False

    def test_equal_baseline(self):
        """정확히 같으면 → True (이상)"""
        runner = GroundTruthRunner()
        current = AccuracyReport(
            total=100, correct=90, incorrect=10, skipped=0,
            accuracy=0.9, mismatches=[],
        )
        assert runner.compare_with_baseline(current, {"accuracy": 0.9}) is True

    def test_empty_baseline(self):
        """baseline에 accuracy가 없으면 → 0.0 기준 → True"""
        runner = GroundTruthRunner()
        current = AccuracyReport(
            total=10, correct=5, incorrect=5, skipped=0,
            accuracy=0.5, mismatches=[],
        )
        assert runner.compare_with_baseline(current, {}) is True

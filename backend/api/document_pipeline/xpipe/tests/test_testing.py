"""
xPipe TestRunner 테스트

외부 테스트 셋 주입 인터페이스(testing.py)의 동작을 검증한다.
"""
import json
import tempfile
from pathlib import Path

import pytest

from xpipe.testing import TestCase, TestResult, TestRunner
from insurance.adapter import InsuranceDomainAdapter


@pytest.fixture
def adapter():
    return InsuranceDomainAdapter()


@pytest.fixture
def runner(adapter):
    return TestRunner(adapter)


@pytest.fixture
def sample_test_set_path():
    """외부 테스트 셋 JSON 파일 경로"""
    return str(
        Path(__file__).parent / "external" / "sample_insurance.json"
    )


# ---------------------------------------------------------------------------
# TestCase 로드 테스트
# ---------------------------------------------------------------------------

class TestLoadTestSet:
    """JSON에서 테스트 셋 로드"""

    def test_load_sample_insurance(self, sample_test_set_path):
        """샘플 보험 테스트 셋 로드"""
        test_cases = TestRunner.load_test_set(sample_test_set_path)
        assert len(test_cases) == 5
        assert all(isinstance(tc, TestCase) for tc in test_cases)

    def test_load_preserves_fields(self, sample_test_set_path):
        """로드된 TestCase의 필드가 JSON과 일치하는지"""
        test_cases = TestRunner.load_test_set(sample_test_set_path)

        # 첫 번째: AR 감지 테스트
        tc0 = test_cases[0]
        assert "Annual Review Report" in tc0.input_text
        assert tc0.input_mime == "application/pdf"
        assert len(tc0.expected_detections) == 1
        assert tc0.expected_detections[0]["doc_type"] == "annual_report"

    def test_load_nonexistent_file(self):
        """존재하지 않는 파일 로드 시 FileNotFoundError"""
        with pytest.raises(FileNotFoundError):
            TestRunner.load_test_set("/nonexistent/path.json")

    def test_load_from_temp_file(self):
        """임시 파일에서 로드"""
        data = [
            {
                "input_text": "테스트",
                "input_mime": "text/plain",
                "expected_detections": [],
                "description": "임시 테스트",
            }
        ]
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8",
        ) as f:
            json.dump(data, f, ensure_ascii=False)
            tmp_path = f.name

        test_cases = TestRunner.load_test_set(tmp_path)
        assert len(test_cases) == 1
        assert test_cases[0].input_text == "테스트"
        assert test_cases[0].description == "임시 테스트"

        Path(tmp_path).unlink()


# ---------------------------------------------------------------------------
# Detection 테스트 실행
# ---------------------------------------------------------------------------

class TestRunDetectionTests:
    """detect_special_documents() 테스트 실행"""

    @pytest.mark.asyncio
    async def test_run_sample_insurance_detection(self, runner, sample_test_set_path):
        """샘플 보험 테스트 셋으로 감지 테스트 실행 → 전체 통과"""
        test_cases = TestRunner.load_test_set(sample_test_set_path)
        results = await runner.run_detection_tests(test_cases)

        assert results["total"] == 5
        assert results["passed"] == 5
        assert results["failed"] == 0

    @pytest.mark.asyncio
    async def test_ar_detection_pass(self, runner):
        """AR 텍스트 → annual_report 감지"""
        tc = TestCase(
            input_text=(
                "MetLife\n홍길동 고객님을 위한\nAnnual Review Report\n"
                "보유계약 현황\n발행(기준)일: 2026년 1월 15일\n"
            ),
            input_mime="application/pdf",
            expected_detections=[{"doc_type": "annual_report"}],
        )
        results = await runner.run_detection_tests([tc])
        assert results["passed"] == 1

    @pytest.mark.asyncio
    async def test_no_detection_pass(self, runner):
        """일반 텍스트 → 감지 없음"""
        tc = TestCase(
            input_text="일반 보험 증권 문서입니다.",
            input_mime="application/pdf",
            expected_detections=[],
        )
        results = await runner.run_detection_tests([tc])
        assert results["passed"] == 1

    @pytest.mark.asyncio
    async def test_detection_fail_case(self, runner):
        """잘못된 기대값 → 실패 기록"""
        tc = TestCase(
            input_text="일반 텍스트",
            input_mime="application/pdf",
            expected_detections=[{"doc_type": "annual_report"}],  # 감지 안 됨
            description="의도적 실패 테스트",
        )
        results = await runner.run_detection_tests([tc])
        assert results["failed"] == 1
        assert "미감지" in results["results"][0].message


# ---------------------------------------------------------------------------
# Classification 테스트 실행
# ---------------------------------------------------------------------------

class TestRunClassificationTests:
    """get_classification_config() 검증"""

    @pytest.mark.asyncio
    async def test_valid_types_include_policy(self, runner):
        """policy가 valid_types에 포함되어 있는지"""
        tc = TestCase(
            input_text="보험증권",
            input_mime="application/pdf",
            expected_classification="policy",
        )
        results = await runner.run_classification_tests([tc])
        assert results["passed"] == 1
        assert results["config_valid"] is True

    @pytest.mark.asyncio
    async def test_invalid_type_fails(self, runner):
        """존재하지 않는 분류 유형 → 실패"""
        tc = TestCase(
            input_text="테스트",
            input_mime="application/pdf",
            expected_classification="nonexistent_type",
        )
        results = await runner.run_classification_tests([tc])
        assert results["failed"] == 1

    @pytest.mark.asyncio
    async def test_skip_when_no_classification(self, runner):
        """expected_classification이 None이면 스킵"""
        tc = TestCase(
            input_text="테스트",
            input_mime="application/pdf",
            expected_classification=None,
        )
        results = await runner.run_classification_tests([tc])
        assert results["total"] == 0

    @pytest.mark.asyncio
    async def test_sample_insurance_classification(self, runner, sample_test_set_path):
        """샘플 보험 테스트 셋의 분류 테스트 → policy가 valid_types에 포함"""
        test_cases = TestRunner.load_test_set(sample_test_set_path)
        results = await runner.run_classification_tests(test_cases)

        # 샘플에서 expected_classification이 설정된 건 1개 (policy)
        assert results["total"] == 1
        assert results["passed"] == 1

"""
xPipe 외부 테스트 셋 주입 인터페이스

외부 JSON 파일로 정의된 테스트 케이스를 로드하여
DomainAdapter 구현체를 검증한다.

사용 예:
    from xpipe.testing import TestRunner, TestCase

    runner = TestRunner(adapter)
    test_cases = TestRunner.load_test_set("tests/external/sample_documents.json")
    results = await runner.run_detection_tests(test_cases)
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from xpipe.adapter import DomainAdapter, Detection, ClassificationConfig


@dataclass
class TestCase:
    """외부 테스트 셋의 개별 테스트 케이스

    Attributes:
        input_text: 테스트할 문서 텍스트
        input_mime: MIME 타입
        expected_detections: 예상 감지 결과 목록 (doc_type, confidence 등)
        expected_classification: 예상 분류 결과 (없으면 분류 테스트 스킵)
        description: 테스트 케이스 설명
        filename: 테스트용 파일명 (선택)
    """
    input_text: str
    input_mime: str
    expected_detections: list[dict[str, Any]] = field(default_factory=list)
    expected_classification: str | None = None
    description: str = ""
    filename: str = ""


@dataclass
class TestResult:
    """단일 테스트 케이스의 실행 결과

    Attributes:
        test_case: 원본 테스트 케이스
        passed: 통과 여부
        actual: 실제 결과
        message: 상세 메시지 (실패 시 원인)
    """
    test_case: TestCase
    passed: bool
    actual: Any = None
    message: str = ""


class TestRunner:
    """외부 테스트 셋으로 어댑터를 검증

    DomainAdapter 구현체의 detect_special_documents()와
    get_classification_config()을 외부 테스트 케이스로 검증한다.
    """

    def __init__(self, adapter: DomainAdapter):
        self.adapter = adapter

    async def run_detection_tests(self, test_cases: list[TestCase]) -> dict[str, Any]:
        """detect_special_documents() 테스트

        각 테스트 케이스에 대해 어댑터의 감지 메서드를 호출하고,
        예상 결과와 비교한다.

        Args:
            test_cases: 테스트 케이스 목록

        Returns:
            {"total": N, "passed": N, "failed": N, "results": [TestResult, ...]}
        """
        results: list[TestResult] = []

        for tc in test_cases:
            try:
                actual_detections = await self.adapter.detect_special_documents(
                    text=tc.input_text,
                    mime_type=tc.input_mime,
                    filename=tc.filename,
                )

                # 감지 결과를 dict 리스트로 변환하여 비교
                actual_dicts = [
                    {"doc_type": d.doc_type, "confidence": d.confidence}
                    for d in actual_detections
                ]

                # 예상 감지와 비교 (doc_type 기준 매칭)
                expected_types = {e["doc_type"] for e in tc.expected_detections}
                actual_types = {a["doc_type"] for a in actual_dicts}

                if expected_types == actual_types:
                    results.append(TestResult(
                        test_case=tc,
                        passed=True,
                        actual=actual_dicts,
                        message="OK",
                    ))
                else:
                    missing = expected_types - actual_types
                    extra = actual_types - expected_types
                    msg_parts = []
                    if missing:
                        msg_parts.append(f"미감지: {missing}")
                    if extra:
                        msg_parts.append(f"초과감지: {extra}")
                    results.append(TestResult(
                        test_case=tc,
                        passed=False,
                        actual=actual_dicts,
                        message="; ".join(msg_parts),
                    ))
            except Exception as e:
                results.append(TestResult(
                    test_case=tc,
                    passed=False,
                    actual=None,
                    message=f"예외 발생: {e}",
                ))

        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        return {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "results": results,
        }

    async def run_classification_tests(self, test_cases: list[TestCase]) -> dict[str, Any]:
        """get_classification_config() 검증

        분류 설정이 올바르게 정의되어 있는지 검증한다.
        expected_classification이 설정된 테스트 케이스에 대해,
        해당 분류 유형이 valid_types에 포함되어 있는지 확인한다.

        Args:
            test_cases: 테스트 케이스 목록

        Returns:
            {"total": N, "passed": N, "failed": N, "results": [TestResult, ...],
             "config_valid": bool}
        """
        results: list[TestResult] = []
        config_valid = True

        try:
            config = await self.adapter.get_classification_config()

            # ClassificationConfig 기본 검증
            if not isinstance(config, ClassificationConfig):
                config_valid = False

            valid_types_set = set(config.valid_types)

            for tc in test_cases:
                if tc.expected_classification is None:
                    continue  # 분류 테스트 대상이 아님

                if tc.expected_classification in valid_types_set:
                    results.append(TestResult(
                        test_case=tc,
                        passed=True,
                        actual={"expected_type_in_valid_types": True},
                        message="OK",
                    ))
                else:
                    results.append(TestResult(
                        test_case=tc,
                        passed=False,
                        actual={"expected_type_in_valid_types": False},
                        message=f"'{tc.expected_classification}'이 valid_types에 없습니다",
                    ))

        except Exception as e:
            config_valid = False
            # 모든 분류 테스트 케이스를 실패로 기록
            for tc in test_cases:
                if tc.expected_classification is not None:
                    results.append(TestResult(
                        test_case=tc,
                        passed=False,
                        actual=None,
                        message=f"config 조회 실패: {e}",
                    ))

        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        return {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "results": results,
            "config_valid": config_valid,
        }

    @staticmethod
    def load_test_set(path: str) -> list[TestCase]:
        """JSON 파일에서 테스트 셋 로드

        JSON 형식:
        [
            {
                "input_text": "...",
                "input_mime": "application/pdf",
                "expected_detections": [{"doc_type": "special_type_a"}],
                "expected_classification": "policy",
                "description": "AR 감지 테스트",
                "filename": "test.pdf"
            },
            ...
        ]

        Args:
            path: JSON 파일 경로

        Returns:
            TestCase 목록

        Raises:
            FileNotFoundError: 파일이 없는 경우
            json.JSONDecodeError: JSON 파싱 실패
        """
        filepath = Path(path)
        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        test_cases = []
        for item in data:
            test_cases.append(TestCase(
                input_text=item["input_text"],
                input_mime=item["input_mime"],
                expected_detections=item.get("expected_detections", []),
                expected_classification=item.get("expected_classification"),
                description=item.get("description", ""),
                filename=item.get("filename", ""),
            ))
        return test_cases

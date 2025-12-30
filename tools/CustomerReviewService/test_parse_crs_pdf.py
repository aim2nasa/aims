#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Customer Review Service PDF Parser - 자동화 테스트

5개 샘플 PDF 파일에 대한 파싱 정확도 검증 테스트
실행: python test_parse_crs_pdf.py
"""

import sys
import io
from pathlib import Path
from parse_crs_pdf import parse_crs_pdf

# Windows 콘솔 UTF-8 출력 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


# 테스트 기대값 정의
EXPECTED_RESULTS = {
    "TalkFile_00038235_cm_19.pdf": {
        "contract": {
            "policy_number": "0011423761",
            "contract_date": "2013-11-12",
            "insured_amount": 50000000,
            "accumulated_amount": 19336631,
            "investment_return": 64.15,
        },
        "premium": {
            "basic_premium": 50000000,
            "withdrawal": 46900000,
            "total": 3100000,
        },
        "funds": [
            {"fund_name": "성장주식형", "basic_amount": 14580820, "basic_ratio": 75.4, "basic_return": 56.64},
            {"fund_name": "채권형", "basic_amount": 4755811, "basic_ratio": 100.0, "basic_return": 34.43},
        ],
        "total_fund_amount": 19336631,
    },
    "TalkFile_00038235_cm_20.pdf": {
        "contract": {
            "policy_number": "0011409925",
            "contract_date": "2013-10-29",
            "insured_amount": 10000000,
            "accumulated_amount": 62246158,
            "investment_return": 28.43,
        },
        "premium": {
            "basic_premium": 42900000,
            "irregular_additional": 131390000,
            "regular_additional": 65800000,
            "withdrawal": 203960000,
            "total": 36130000,
        },
        "funds": [
            {"fund_name": "가치주식형", "basic_amount": 43583076, "additional_amount": 18663082},
        ],
        "total_fund_amount": 62246158,
    },
    "TalkFile_00038235_cm_21.pdf": {
        "contract": {
            "policy_number": "0011409939",
            "contract_date": "2013-10-29",
            "insured_amount": 10000000,
            "accumulated_amount": 55025572,
            "investment_return": 31.05,
        },
        "premium": {
            "basic_premium": 28600000,
            "irregular_additional": 54210000,
            "regular_additional": 45400000,
            "withdrawal": 94720000,
            "total": 33490000,
        },
        "funds": [
            {"fund_name": "가치주식형", "basic_amount": 29689650, "additional_amount": 25335922},
        ],
        "total_fund_amount": 55025572,
    },
    "TalkFile_00038235_cm_22.pdf": {
        "contract": {
            "policy_number": "0011375656",
            "contract_date": "2013-09-10",
            "insured_amount": 10000000,
            "accumulated_amount": 38405005,
            "investment_return": 65.58,
        },
        "premium": {
            "basic_premium": 43200000,
            "withdrawal": 16820000,
            "total": 26380000,
            "policy_loan": 3000000,
        },
        "funds": [
            {"fund_name": "미국주식형", "basic_amount": 26567772, "basic_ratio": 70.0, "basic_return": 74.5},
            {"fund_name": "배당주식형", "basic_amount": 4061119, "basic_ratio": 10.0, "basic_return": 23.2},
            {"fund_name": "글로벌IT섹터", "basic_amount": 7776114, "basic_ratio": 20.0, "basic_return": 24.08},
        ],
        "total_fund_amount": 38405005,
    },
    "TalkFile_00038235_cm_23.pdf": {
        "contract": {
            "policy_number": "0011348919",
            "contract_date": "2013-08-06",
            "insured_amount": 10000000,
            "accumulated_amount": 23302427,
            "investment_return": 13.08,
        },
        "premium": {
            "basic_premium": 43500000,
            "withdrawal": 18830000,
            "total": 24670000,
        },
        "funds": [
            {"fund_name": "미국주식형", "basic_amount": 16532136, "basic_return": 5.88},
            {"fund_name": "글로벌주식형", "basic_amount": 1964477, "basic_ratio": 8.4, "basic_return": 4.93},
            {"fund_name": "배당주식형", "basic_amount": 4805814, "basic_ratio": 20.6, "basic_return": 28.37},
        ],
        "total_fund_amount": 23302427,
    },
}


class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def add_pass(self):
        self.passed += 1

    def add_fail(self, message: str):
        self.failed += 1
        self.errors.append(message)


def assert_equal(result: TestResult, actual, expected, field_name: str, file_name: str):
    """값 비교 및 결과 기록"""
    if actual == expected:
        result.add_pass()
        return True
    else:
        result.add_fail(f"[{file_name}] {field_name}: expected {expected}, got {actual}")
        return False


def assert_close(result: TestResult, actual: float, expected: float, field_name: str, file_name: str, tolerance: float = 0.01):
    """실수 비교 (오차 허용)"""
    if abs(actual - expected) <= tolerance:
        result.add_pass()
        return True
    else:
        result.add_fail(f"[{file_name}] {field_name}: expected {expected}, got {actual}")
        return False


def test_contract_info(result: TestResult, parsed: dict, expected: dict, file_name: str):
    """계약정보 테스트"""
    contract = parsed.get('contract', {})
    exp_contract = expected.get('contract', {})

    for key, exp_value in exp_contract.items():
        actual_value = contract.get(key)
        if isinstance(exp_value, float):
            assert_close(result, actual_value, exp_value, f"contract.{key}", file_name)
        else:
            assert_equal(result, actual_value, exp_value, f"contract.{key}", file_name)


def test_premium_info(result: TestResult, parsed: dict, expected: dict, file_name: str):
    """납입원금 테스트"""
    premium = parsed.get('premium', {})
    exp_premium = expected.get('premium', {})

    for key, exp_value in exp_premium.items():
        actual_value = premium.get(key)
        assert_equal(result, actual_value, exp_value, f"premium.{key}", file_name)


def test_funds(result: TestResult, parsed: dict, expected: dict, file_name: str):
    """펀드 정보 테스트"""
    funds = parsed.get('funds', [])
    exp_funds = expected.get('funds', [])

    # 펀드 개수 확인
    assert_equal(result, len(funds), len(exp_funds), "fund_count", file_name)

    # 각 펀드 상세 확인
    for i, exp_fund in enumerate(exp_funds):
        fund_name = exp_fund['fund_name']

        # 해당 펀드 찾기
        actual_fund = None
        for f in funds:
            if f['fund_name'] == fund_name:
                actual_fund = f
                break

        if actual_fund is None:
            result.add_fail(f"[{file_name}] Fund '{fund_name}' not found")
            continue

        # 펀드 필드 확인
        for key, exp_value in exp_fund.items():
            if key == 'fund_name':
                continue
            actual_value = actual_fund.get(key, 0)
            if isinstance(exp_value, float):
                assert_close(result, actual_value, exp_value, f"fund[{fund_name}].{key}", file_name)
            else:
                assert_equal(result, actual_value, exp_value, f"fund[{fund_name}].{key}", file_name)


def test_total_amount(result: TestResult, parsed: dict, expected: dict, file_name: str):
    """총 적립금 테스트"""
    summary = parsed.get('summary', {})
    exp_total = expected.get('total_fund_amount', 0)
    actual_total = summary.get('total_fund_amount', 0)
    assert_equal(result, actual_total, exp_total, "total_fund_amount", file_name)


def run_tests():
    """모든 테스트 실행"""
    samples_dir = Path(__file__).parent / "samples"

    if not samples_dir.exists():
        print(f"ERROR: 샘플 폴더를 찾을 수 없습니다: {samples_dir}")
        return False

    print("=" * 70)
    print("  Customer Review Service PDF Parser - 자동화 테스트")
    print("=" * 70)

    result = TestResult()
    file_results = {}

    for file_name, expected in EXPECTED_RESULTS.items():
        pdf_path = samples_dir / file_name

        if not pdf_path.exists():
            print(f"\n  SKIP: {file_name} (파일 없음)")
            continue

        print(f"\n  Testing: {file_name}")
        parsed = parse_crs_pdf(str(pdf_path))

        before_passed = result.passed
        before_failed = result.failed

        # 각 섹션 테스트
        test_contract_info(result, parsed, expected, file_name)
        test_premium_info(result, parsed, expected, file_name)
        test_funds(result, parsed, expected, file_name)
        test_total_amount(result, parsed, expected, file_name)

        file_passed = result.passed - before_passed
        file_failed = result.failed - before_failed
        file_results[file_name] = (file_passed, file_failed)

        status = "PASS" if file_failed == 0 else "FAIL"
        print(f"    {status}: {file_passed} passed, {file_failed} failed")

    # 최종 결과 출력
    print("\n" + "=" * 70)
    print("  테스트 결과 요약")
    print("=" * 70)

    for file_name, (passed, failed) in file_results.items():
        status = "[PASS]" if failed == 0 else "[FAIL]"
        print(f"  {status}  {file_name}")

    print("-" * 70)
    total = result.passed + result.failed
    print(f"  Total: {result.passed}/{total} assertions passed")

    if result.errors:
        print("\n  Failures:")
        for error in result.errors:
            print(f"    - {error}")

    print("=" * 70)

    # 성공 여부 반환
    success = result.failed == 0
    if success:
        print("\n  SUCCESS: All tests passed!")
    else:
        print(f"\n  FAILED: {result.failed} test(s) failed")

    return success


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)

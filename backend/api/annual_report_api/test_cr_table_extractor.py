"""
CR Table Extractor 검증 테스트

5개 샘플 PDF에 대해 파싱 결과가 원본 데이터와 100% 일치하는지 검증.
Ground Truth는 원본 PDF에서 수동으로 확인한 값.

실행 방법:
    cd ~/aims/backend/api/annual_report_api
    source venv/bin/activate
    python test_cr_table_extractor.py
"""

import os
import sys
from typing import Dict, List, Any

# 테스트 대상 모듈
from cr_table_extractor import extract_cr_fund_table


# ============================================================================
# Ground Truth Data (원본 PDF에서 수동 확인)
# ============================================================================

GROUND_TRUTH = {
    "고영자CRS_0011423761_202509.pdf": {
        "fund_count": 2,
        "total_accumulated_amount": 19336631,
        "funds": [
            {
                "fund_name": "성장주식형",
                "basic_accumulated": 14580820,
                "additional_accumulated": 0,
                "allocation_ratio": 75.4,
                "return_rate": 56.64,
                "invested_principal": 9308205
            },
            {
                "fund_name": "채권형",
                "basic_accumulated": 4755811,
                "additional_accumulated": 0,
                "allocation_ratio": 24.6,
                "return_rate": 34.43,
                "invested_principal": 3537801
            }
        ]
    },
    "변수현CRS_0011348919_202509.pdf": {
        "fund_count": 3,
        "total_accumulated_amount": 23302427,
        "funds": [
            {
                "fund_name": "미국주식형",
                "basic_accumulated": 16532136,
                "additional_accumulated": 0,
                "allocation_ratio": 70.9,
                "return_rate": 5.88,
                "invested_principal": 15614133
            },
            {
                "fund_name": "글로벌주식형",
                "basic_accumulated": 1964477,
                "additional_accumulated": 0,
                "allocation_ratio": 8.4,
                "return_rate": 4.93,
                "invested_principal": 1872090
            },
            {
                "fund_name": "배당주식형",
                "basic_accumulated": 4805814,
                "additional_accumulated": 0,
                "allocation_ratio": 20.6,
                "return_rate": 28.37,
                "invested_principal": 3743626
            }
        ]
    },
    "정지호CRS_0011375656_202509.pdf": {
        "fund_count": 3,
        "total_accumulated_amount": 38405005,
        "funds": [
            {
                "fund_name": "미국주식형",
                "basic_accumulated": 26567772,
                "additional_accumulated": 0,
                "allocation_ratio": 69.2,
                "return_rate": 74.5,
                "invested_principal": 15224875
            },
            {
                "fund_name": "배당주식형",
                "basic_accumulated": 4061119,
                "additional_accumulated": 0,
                "allocation_ratio": 10.6,
                "return_rate": 23.2,
                "invested_principal": 3296384
            },
            {
                "fund_name": "글로벌IT섹터",
                "basic_accumulated": 7776114,
                "additional_accumulated": 0,
                "allocation_ratio": 20.2,
                "return_rate": 24.08,
                "invested_principal": 6266847
            }
        ]
    },
    "한진구CRS_0011409925_202509.pdf": {
        "fund_count": 1,
        "total_accumulated_amount": 62246158,
        "funds": [
            {
                "fund_name": "가치주식형",
                "basic_accumulated": 43583076,
                "additional_accumulated": 18663082,
                "allocation_ratio": 100.0,
                "additional_allocation_ratio": 100.0,
                "return_rate": 8.94,
                "additional_return_rate": 8.6,
                "invested_principal": 40007196
            }
        ]
    },
    "한진구CRS_0011409939_202509.pdf": {
        "fund_count": 1,
        "total_accumulated_amount": 55025572,
        "funds": [
            {
                "fund_name": "가치주식형",
                "basic_accumulated": 29689650,
                "additional_accumulated": 25335922,
                "allocation_ratio": 100.0,
                "additional_allocation_ratio": 100.0,
                "return_rate": 8.94,
                "additional_return_rate": 8.92,
                "invested_principal": 27252214
            }
        ]
    }
}


# ============================================================================
# Test Functions
# ============================================================================

def compare_fund(parsed: Dict, expected: Dict, fund_name: str) -> List[str]:
    """펀드 데이터 비교"""
    errors = []

    fields = [
        ("basic_accumulated", "기본적립금"),
        ("additional_accumulated", "추가적립금"),
        ("allocation_ratio", "구성비율"),
        ("return_rate", "수익률"),
        ("invested_principal", "투입원금"),
    ]

    for field, label in fields:
        expected_val = expected.get(field, 0)
        parsed_val = parsed.get(field, 0) or 0

        # None 처리
        if parsed_val is None:
            parsed_val = 0

        if expected_val != parsed_val:
            errors.append(
                f"  {fund_name}.{label}: 예상={expected_val}, 실제={parsed_val}"
            )

    # 추가 수익률 (optional)
    if "additional_return_rate" in expected:
        expected_val = expected["additional_return_rate"]
        parsed_val = parsed.get("additional_return_rate", 0) or 0
        if expected_val != parsed_val:
            errors.append(
                f"  {fund_name}.추가수익률: 예상={expected_val}, 실제={parsed_val}"
            )

    return errors


def test_file(pdf_path: str, expected: Dict) -> Dict[str, Any]:
    """단일 파일 테스트"""
    filename = os.path.basename(pdf_path)
    result = {
        "filename": filename,
        "passed": True,
        "errors": []
    }

    try:
        parsed = extract_cr_fund_table(pdf_path)

        # 펀드 수 검증
        if parsed["fund_count"] != expected["fund_count"]:
            result["errors"].append(
                f"펀드 수: 예상={expected['fund_count']}, 실제={parsed['fund_count']}"
            )

        # 총적립금 검증
        if parsed["total_accumulated_amount"] != expected["total_accumulated_amount"]:
            result["errors"].append(
                f"총적립금: 예상={expected['total_accumulated_amount']:,}, "
                f"실제={parsed['total_accumulated_amount']:,}"
            )

        # 각 펀드별 검증
        parsed_funds = {f["fund_name"]: f for f in parsed["fund_allocations"]}

        for expected_fund in expected["funds"]:
            fund_name = expected_fund["fund_name"]

            if fund_name not in parsed_funds:
                result["errors"].append(f"펀드 누락: {fund_name}")
                continue

            fund_errors = compare_fund(parsed_funds[fund_name], expected_fund, fund_name)
            result["errors"].extend(fund_errors)

        if result["errors"]:
            result["passed"] = False

    except Exception as e:
        result["passed"] = False
        result["errors"].append(f"파싱 오류: {str(e)}")

    return result


def run_all_tests(sample_dir: str) -> Dict[str, Any]:
    """전체 테스트 실행"""
    results = []
    passed_count = 0
    total_count = 0

    for filename, expected in GROUND_TRUTH.items():
        pdf_path = os.path.join(sample_dir, filename)

        if not os.path.exists(pdf_path):
            print(f"⚠️  파일 없음: {filename}")
            continue

        total_count += 1
        result = test_file(pdf_path, expected)
        results.append(result)

        if result["passed"]:
            passed_count += 1
            print(f"✅ {filename}")
        else:
            print(f"❌ {filename}")
            for error in result["errors"]:
                print(f"   {error}")

    return {
        "total": total_count,
        "passed": passed_count,
        "failed": total_count - passed_count,
        "results": results
    }


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    # 샘플 디렉토리 설정
    sample_dir = os.environ.get(
        "CRS_SAMPLE_DIR",
        "/home/rossi/aims/samples/MetlifeReport/CustomerReviewService"
    )

    print("=" * 60)
    print("CR Table Extractor 검증 테스트")
    print("=" * 60)
    print(f"샘플 디렉토리: {sample_dir}\n")

    # 테스트 실행
    summary = run_all_tests(sample_dir)

    # 결과 출력
    print("\n" + "=" * 60)
    print(f"총 테스트: {summary['total']}개")
    print(f"통과: {summary['passed']}개 ({summary['passed']/summary['total']*100:.1f}%)")
    print(f"실패: {summary['failed']}개")

    if summary['failed'] == 0:
        print("\n🎉 모든 테스트 통과!")
        sys.exit(0)
    else:
        print("\n⚠️  일부 테스트 실패")
        sys.exit(1)

"""
이슈 #58 회귀 테스트 — 계약 필드 키를 백엔드 전 구간에서 영문으로 통일한다.

- parser_interface.normalize_contract 는 영문 키 dict 를 반환
- parser_pdfplumber_table.convert_contract_format 는 영문 키 dict 를 반환
- parser_interface.create_success_result 는 영문 top-level 키 반환
- 마이그레이션 함수 convert_contract 는 한글 → 영문 변환을 올바르게 수행
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# services/ 을 import 할 수 있도록 annual_report_api 루트 추가
_THIS = Path(__file__).resolve()
_AR_ROOT = _THIS.parents[1]
if str(_AR_ROOT) not in sys.path:
    sys.path.insert(0, str(_AR_ROOT))

from services.parser_interface import (  # noqa: E402
    create_success_result,
    normalize_contract,
)
from services.parser_pdfplumber_table import convert_contract_format  # noqa: E402


# ─────────────────────────────────────────────────────────────
# 1) normalize_contract: 한글 헤더 → 영문 키
# ─────────────────────────────────────────────────────────────
class TestNormalizeContractEnglishKeys:
    def test_korean_headers_are_normalized_to_english(self):
        raw = {
            "순번": "1",
            "증권번호": "POL-0001",
            "보험상품": "종신보험",
            "계약자": "[계약자]",
            "피보험자": "[피보험자]",
            "계약일": "2024-01-15",
            "계약상태": "정상",
            "가입금액(만원)": "10,000",
            "보험기간": "종신",
            "납입기간": "20년",
            "보험료(원)": "150,000",
        }
        result = normalize_contract(raw)

        assert result is not None
        # 영문 키만 존재해야 한다
        for english_key in (
            "seq",
            "contract_number",
            "product_name",
            "contractor_name",
            "insured_name",
            "contract_date",
            "status",
            "coverage_amount",
            "insurance_period",
            "premium_payment_period",
            "monthly_premium",
        ):
            assert english_key in result, f"missing {english_key}"

        # 한글 키는 남아있지 않아야 한다
        for korean_key in (
            "순번",
            "증권번호",
            "보험상품",
            "계약자",
            "피보험자",
            "계약일",
            "계약상태",
            "가입금액(만원)",
            "보험기간",
            "납입기간",
            "보험료(원)",
        ):
            assert korean_key not in result, f"legacy Korean key leaked: {korean_key}"

        # 타입 변환 검증
        assert result["seq"] == 1
        assert result["coverage_amount"] == 10000.0
        assert result["monthly_premium"] == 150000
        assert result["contract_number"] == "POL-0001"

    def test_english_keys_pass_through(self):
        """이미 영문 키인 경우에도 정상 처리되어야 한다."""
        raw = {
            "contract_number": "POL-9999",
            "product_name": "실손보험",
            "contractor_name": "[계약자]",
            "insured_name": "[피보험자]",
            "contract_date": "2023-05-01",
            "status": "정상",
            "coverage_amount": 5000,
            "insurance_period": "1년",
            "premium_payment_period": "1년",
            "monthly_premium": 30000,
        }
        result = normalize_contract(raw)

        assert result is not None
        assert result["contract_number"] == "POL-9999"
        assert result["monthly_premium"] == 30000
        assert result["coverage_amount"] == 5000.0

    def test_missing_contract_number_returns_none(self):
        """증권번호가 없으면 유효하지 않은 계약으로 간주하여 None 반환."""
        raw = {"보험상품": "종신보험", "계약자": "[계약자]"}
        assert normalize_contract(raw) is None


# ─────────────────────────────────────────────────────────────
# 2) convert_contract_format: table_extractor → 영문 키
# ─────────────────────────────────────────────────────────────
class TestConvertContractFormatEnglishKeys:
    def test_outputs_english_keys(self):
        contract = {
            "seq": 1,
            "policyNumber": "POL-0001",
            "productName": "종신보험",
            "contractor": "[계약자]",
            "insured": "[피보험자]",
            "contractDate": "2024-01-15",
            "status": "정상",
            "coverageAmount": 10000.0,
            "insurancePeriod": "종신",
            "paymentPeriod": "20년",
            "premium": 150000,
        }
        result = convert_contract_format(contract)

        # 반환 dict 는 영문 키만 사용해야 한다
        assert set(result.keys()) == {
            "seq",
            "contract_number",
            "product_name",
            "contractor_name",
            "insured_name",
            "contract_date",
            "status",
            "coverage_amount",
            "insurance_period",
            "premium_payment_period",
            "monthly_premium",
        }

        assert result["contract_number"] == "POL-0001"
        assert result["product_name"] == "종신보험"
        assert result["monthly_premium"] == 150000
        assert result["coverage_amount"] == 10000.0


# ─────────────────────────────────────────────────────────────
# 3) create_success_result: top-level 키 영문화
# ─────────────────────────────────────────────────────────────
class TestCreateSuccessResultEnglishTopLevelKeys:
    def test_top_level_keys_are_english(self):
        result = create_success_result(
            total_premium=1_234_567,
            contracts=[{"contract_number": "POL-1"}],
            lapsed_contracts=[{"contract_number": "POL-LAP"}],
        )

        # 이슈 #58: 한글 top-level 키 금지
        assert "총_월보험료" not in result
        assert "보유계약 현황" not in result
        assert "부활가능 실효계약" not in result

        # 영문 키로 제공
        assert result["total_monthly_premium"] == 1_234_567
        assert result["contracts"] == [{"contract_number": "POL-1"}]
        assert result["lapsed_contracts"] == [{"contract_number": "POL-LAP"}]


# ─────────────────────────────────────────────────────────────
# 4) 마이그레이션 스크립트 — 순수 함수 단위 테스트
# ─────────────────────────────────────────────────────────────
class TestMigrationConvertContract:
    def _load_migration_module(self):
        import importlib.util

        script_path = _AR_ROOT / "scripts" / "migrate_korean_to_english_keys_58.py"
        spec = importlib.util.spec_from_file_location(
            "migrate_korean_to_english_keys_58", script_path
        )
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_convert_contract_replaces_all_known_korean_keys(self):
        mod = self._load_migration_module()
        raw = {
            "순번": 1,
            "증권번호": "POL-0001",
            "보험상품": "종신보험",
            "보험사": "테스트생명",
            "계약자": "[계약자]",
            "피보험자": "[피보험자]",
            "계약일": "2024-01-15",
            "계약상태": "정상",
            "가입금액(만원)": 10000,
            "보험기간": "종신",
            "납입기간": "20년",
            "보험료(원)": 150000,
        }
        new_contract, changed = mod.convert_contract(raw)

        assert changed is True
        # 모든 한글 키는 제거
        for k in list(raw.keys()):
            assert k not in new_contract, f"legacy Korean key remained: {k}"
        # 모든 영문 키가 존재
        for english_key in (
            "seq",
            "contract_number",
            "product_name",
            "insurance_company",
            "contractor_name",
            "insured_name",
            "contract_date",
            "status",
            "coverage_amount",
            "insurance_period",
            "premium_payment_period",
            "monthly_premium",
        ):
            assert english_key in new_contract, f"missing {english_key}"
        assert new_contract["contract_number"] == "POL-0001"
        assert new_contract["monthly_premium"] == 150000

    def test_convert_contract_noop_if_already_english(self):
        mod = self._load_migration_module()
        raw = {
            "contract_number": "POL-9999",
            "product_name": "실손보험",
            "monthly_premium": 30000,
        }
        new_contract, changed = mod.convert_contract(raw)
        assert changed is False
        assert new_contract == raw

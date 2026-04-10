"""
Issue #58 — customers.annual_reports[].contracts[] / lapsed_contracts[]
한글 키 → 영문 키 마이그레이션

변경 사항:
    한글 키                 → 영문 키
    ─────────────────────────────────────────
    순번                    → seq
    증권번호                → contract_number
    보험상품                → product_name
    보험사                  → insurance_company
    계약자                  → contractor_name
    피보험자                → insured_name
    계약일                  → contract_date
    계약상태                → status
    가입금액(만원)          → coverage_amount    (단위 유지: 만원)
    보험기간                → insurance_period
    납입기간                → premium_payment_period
    보험료(원)              → monthly_premium    (단위 유지: 원)

실행 방법:
    # Dry-run (기본: 변경 사항 요약만 출력, DB 미수정)
    python migrate_korean_to_english_keys_58.py

    # 실제 실행
    python migrate_korean_to_english_keys_58.py --apply

    # 특정 고객만
    python migrate_korean_to_english_keys_58.py --apply --customer-id <ObjectId>

환경 변수:
    MONGO_URI (기본: mongodb://localhost:27017)
    MONGO_DB  (기본: docupload)
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, List, Tuple

from pymongo import MongoClient
from bson import ObjectId


KOREAN_TO_ENGLISH: Dict[str, str] = {
    "순번": "seq",
    "증권번호": "contract_number",
    "보험상품": "product_name",
    "보험사": "insurance_company",
    "계약자": "contractor_name",
    "피보험자": "insured_name",
    "계약일": "contract_date",
    "계약상태": "status",
    "가입금액(만원)": "coverage_amount",
    "보험기간": "insurance_period",
    "납입기간": "premium_payment_period",
    "보험료(원)": "monthly_premium",
}


def convert_contract(contract: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """
    단일 계약 dict에서 한글 키를 영문 키로 변경.

    Returns:
        (new_contract, changed): 변환된 dict와 변경 여부.
    """
    if not isinstance(contract, dict):
        return contract, False

    new_contract: Dict[str, Any] = {}
    changed = False

    for key, value in contract.items():
        if key in KOREAN_TO_ENGLISH:
            english_key = KOREAN_TO_ENGLISH[key]
            # 영문 키가 이미 존재하면 기존 값 우선 (충돌 방지)
            if english_key not in new_contract:
                new_contract[english_key] = value
            changed = True
        else:
            # 이미 영문 키이거나 알 수 없는 키 → 그대로 유지
            if key not in new_contract:
                new_contract[key] = value

    return new_contract, changed


def convert_contract_list(contracts: List[Any]) -> Tuple[List[Dict[str, Any]], int]:
    """계약 리스트 전체를 변환."""
    if not isinstance(contracts, list):
        return contracts, 0

    converted: List[Dict[str, Any]] = []
    changed_count = 0
    for c in contracts:
        new_c, changed = convert_contract(c)
        converted.append(new_c)
        if changed:
            changed_count += 1
    return converted, changed_count


def migrate(db, apply: bool, customer_id: str | None = None) -> Dict[str, int]:
    """
    모든 고객의 annual_reports 를 순회하여 contracts/lapsed_contracts 를 변환.

    Args:
        db: pymongo Database
        apply: True면 실제 DB 업데이트 수행, False면 dry-run
        customer_id: 특정 고객 ObjectId (지정 시 해당 고객만)

    Returns:
        통계 dict
    """
    query: Dict[str, Any] = {"annual_reports.0": {"$exists": True}}
    if customer_id:
        query["_id"] = ObjectId(customer_id)

    stats = {
        "customers_scanned": 0,
        "customers_updated": 0,
        "reports_updated": 0,
        "contracts_converted": 0,
        "lapsed_contracts_converted": 0,
    }

    cursor = db["customers"].find(query, {"annual_reports": 1})

    for doc in cursor:
        stats["customers_scanned"] += 1
        reports = doc.get("annual_reports", [])
        customer_dirty = False
        new_reports: List[Dict[str, Any]] = []

        for report in reports:
            report_dirty = False
            new_report = dict(report)

            # contracts
            if "contracts" in new_report:
                converted, n = convert_contract_list(new_report["contracts"])
                if n > 0:
                    new_report["contracts"] = converted
                    stats["contracts_converted"] += n
                    report_dirty = True

            # lapsed_contracts
            if "lapsed_contracts" in new_report:
                converted, n = convert_contract_list(new_report["lapsed_contracts"])
                if n > 0:
                    new_report["lapsed_contracts"] = converted
                    stats["lapsed_contracts_converted"] += n
                    report_dirty = True

            if report_dirty:
                stats["reports_updated"] += 1
                customer_dirty = True

            new_reports.append(new_report)

        if customer_dirty:
            stats["customers_updated"] += 1
            if apply:
                db["customers"].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"annual_reports": new_reports}},
                )

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="실제 DB 업데이트 수행 (기본: dry-run)",
    )
    parser.add_argument(
        "--customer-id",
        help="특정 고객 ObjectId만 처리",
        default=None,
    )
    args = parser.parse_args()

    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.environ.get("MONGO_DB", "docupload")

    print(f"[migrate#58] MongoDB URI = {mongo_uri}")
    print(f"[migrate#58] Database    = {mongo_db}")
    print(f"[migrate#58] Mode        = {'APPLY' if args.apply else 'DRY-RUN'}")
    if args.customer_id:
        print(f"[migrate#58] Customer ID = {args.customer_id}")
    print()

    client = MongoClient(mongo_uri)
    db = client[mongo_db]

    try:
        stats = migrate(db, apply=args.apply, customer_id=args.customer_id)
    finally:
        client.close()

    print("[migrate#58] === Summary ===")
    for k, v in stats.items():
        print(f"  {k:<28} {v}")

    if not args.apply:
        print()
        print("[migrate#58] Dry-run 완료. 실제 적용하려면 --apply 옵션을 사용하세요.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

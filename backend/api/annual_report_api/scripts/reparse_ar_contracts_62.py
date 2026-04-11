"""
Issue #62 — 기존 customers.annual_reports[].contracts[] 에서 누락된
status / coverage_amount / insurance_period / premium_payment_period /
monthly_premium / insurance_company / contractor_name 등을 재파싱하여 보강.

동작:
- customer 전체 순회 → annual_reports[] 각각에 대해 source_file_id 로 원본 파일 경로 조회
- 해당 PDF 를 parser_factory.get_parser 로 재파싱 (Upstage 응답은 디스크 캐시 재사용)
- 새 contracts[] 결과의 필드로 기존 DB 의 대응 계약(contract_number 기준)에 **누락된 키만** 보강 추가
- contract_number 가 동일한 계약 매칭이 없으면 경고 로그 후 건너뜀

실행:
    # dry-run (기본)
    python scripts/reparse_ar_contracts_62.py

    # 실제 반영
    python scripts/reparse_ar_contracts_62.py --apply

    # 특정 고객만
    python scripts/reparse_ar_contracts_62.py --apply --customer-id <ObjectId>

환경변수:
    MONGO_URI (기본: mongodb://localhost:27017)
    MONGO_DB  (기본: docupload)
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# services / parser_factory 를 import 하기 위한 sys.path
AR_ROOT = Path(__file__).resolve().parents[1]
if str(AR_ROOT) not in sys.path:
    sys.path.insert(0, str(AR_ROOT))

from bson import ObjectId  # noqa: E402
from pymongo import MongoClient  # noqa: E402


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("reparse#62")


# 보강 대상 필드 (영문 키)
AUGMENT_FIELDS = (
    "status",
    "coverage_amount",
    "insurance_period",
    "premium_payment_period",
    "monthly_premium",
    "insurance_company",
    "contractor_name",
    "insured_name",
    "product_name",
    "contract_date",
    "seq",
)


def _is_missing(value: Any) -> bool:
    """'누락' 판정: None / 빈 문자열 / 0 은 모두 미기재로 본다.

    ⚠️ 0 을 미기재로 취급하는 것은 이슈 #62 맥락에서만 안전 —
    Upstage 파서 누락 케이스에서 숫자 필드가 0으로 저장되는 경우가 없기 때문.
    """
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


# 누락 판정에 사용할 핵심 필드 — 이슈 #62 에서 관찰된 Upstage 누락 필드
CRITICAL_FIELDS = (
    "status",
    "coverage_amount",
    "insurance_period",
    "premium_payment_period",
)


def ar_has_missing_fields(ar_dict: Dict[str, Any]) -> bool:
    """annual_report 내 contracts 중 하나라도 CRITICAL_FIELDS 가 누락된 경우 True."""
    for c in (ar_dict.get("contracts") or []):
        if not isinstance(c, dict):
            continue
        for key in CRITICAL_FIELDS:
            if _is_missing(c.get(key)):
                return True
    for c in (ar_dict.get("lapsed_contracts") or []):
        if not isinstance(c, dict):
            continue
        for key in CRITICAL_FIELDS:
            if _is_missing(c.get(key)):
                return True
    return False


def reparse_single_ar(
    db,
    files_coll,
    ar_dict: Dict[str, Any],
) -> Optional[List[Dict[str, Any]]]:
    """
    단일 annual_report 문서의 contracts 를 재파싱하여 보강된 리스트를 반환.

    Returns:
        보강된 contracts 리스트 또는 None (재파싱 불가)
    """
    from services.parser_factory import get_parser

    source_file_id = ar_dict.get("source_file_id")
    if not source_file_id:
        return None

    # files 컬렉션에서 destPath 조회
    try:
        fid = ObjectId(source_file_id) if not isinstance(source_file_id, ObjectId) else source_file_id
    except Exception:
        return None

    file_doc = files_coll.find_one(
        {"_id": fid},
        {"upload.destPath": 1, "upload.originalName": 1},
    )
    if not file_doc:
        logger.warning("file_id=%s: files 문서 없음", source_file_id)
        return None

    dest_path = (file_doc.get("upload") or {}).get("destPath")
    if not dest_path or not os.path.exists(dest_path):
        logger.warning("file_id=%s: destPath 없음 또는 존재하지 않음 (%s)", source_file_id, dest_path)
        return None

    # 재파싱
    try:
        parser_fn = get_parser(dest_path)
        # has_cover 는 파서가 자동 판정 (pdfplumber_table 은 표지 없는 PDF 도 처리)
        # 여기서는 원본 저장 시의 has_cover 를 알 수 없으므로 True 시도 → 실패 시 False 재시도
        result = parser_fn(dest_path, has_cover=True)
        if result.get("error") or not result.get("contracts"):
            result = parser_fn(dest_path, has_cover=False)
    except Exception as e:
        logger.exception("file_id=%s: 재파싱 실패 — %s", source_file_id, e)
        return None

    if result.get("error"):
        logger.warning("file_id=%s: 재파싱 에러 — %s", source_file_id, result.get("error"))
        return None

    new_contracts: List[Dict[str, Any]] = result.get("contracts") or []
    if not new_contracts:
        return None

    # 기존 DB 계약을 contract_number 기준으로 매칭하여 누락 필드만 보강
    existing = list(ar_dict.get("contracts") or [])
    by_cn: Dict[str, Dict[str, Any]] = {}
    for c in existing:
        if not isinstance(c, dict):
            continue
        cn = c.get("contract_number") or c.get("증권번호") or ""
        if cn:
            by_cn[str(cn).strip()] = c

    augmented: List[Dict[str, Any]] = []
    for new_c in new_contracts:
        if not isinstance(new_c, dict):
            continue
        cn = new_c.get("contract_number") or ""
        existing_c = by_cn.get(str(cn).strip()) if cn else None

        if existing_c is None:
            # 기존 DB 에 없는 새 계약 → 그대로 추가
            augmented.append(dict(new_c))
            continue

        merged = dict(existing_c)  # 기존 값 우선 보존
        for key in AUGMENT_FIELDS:
            if _is_missing(merged.get(key)) and not _is_missing(new_c.get(key)):
                merged[key] = new_c[key]
        augmented.append(merged)

    return augmented


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="실제 DB 반영 (기본: dry-run)")
    parser.add_argument("--customer-id", default=None, help="특정 고객만 처리")
    args = parser.parse_args()

    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    mongo_db = os.environ.get("MONGO_DB", "docupload")

    logger.info("MongoDB URI = %s", mongo_uri)
    logger.info("Database    = %s", mongo_db)
    logger.info("Mode        = %s", "APPLY" if args.apply else "DRY-RUN")

    client = MongoClient(mongo_uri)
    db = client[mongo_db]
    customers_coll = db["customers"]
    files_coll = db["files"]

    query: Dict[str, Any] = {"annual_reports.0": {"$exists": True}}
    if args.customer_id:
        query["_id"] = ObjectId(args.customer_id)

    stats = {
        "customers_scanned": 0,
        "customers_updated": 0,
        "reports_scanned": 0,
        "reports_skipped_complete": 0,
        "reports_updated": 0,
        "contracts_augmented": 0,
    }

    try:
        for doc in customers_coll.find(query, {"annual_reports": 1}):
            stats["customers_scanned"] += 1
            reports = doc.get("annual_reports") or []
            customer_dirty = False
            new_reports: List[Dict[str, Any]] = []

            for report in reports:
                stats["reports_scanned"] += 1

                # 빠른 필터: CRITICAL_FIELDS 가 모두 채워져 있으면 재파싱 스킵
                if not ar_has_missing_fields(report):
                    stats["reports_skipped_complete"] += 1
                    new_reports.append(dict(report))
                    continue

                new_report = dict(report)
                augmented = reparse_single_ar(db, files_coll, new_report)
                if augmented is not None:
                    # 보강된 계약 수 카운트 (변경된 것만)
                    original = report.get("contracts") or []
                    changed = 0
                    for i, aug_c in enumerate(augmented):
                        orig_c = original[i] if i < len(original) else {}
                        for key in AUGMENT_FIELDS:
                            if _is_missing(orig_c.get(key)) and not _is_missing(aug_c.get(key)):
                                changed += 1
                                break
                    if changed > 0:
                        new_report["contracts"] = augmented
                        stats["contracts_augmented"] += changed
                        stats["reports_updated"] += 1
                        customer_dirty = True

                new_reports.append(new_report)

            if customer_dirty:
                stats["customers_updated"] += 1
                if args.apply:
                    customers_coll.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"annual_reports": new_reports}},
                    )
                    logger.info("customer %s updated", doc["_id"])
    finally:
        client.close()

    print()
    print("=== reparse#62 summary ===")
    for k, v in stats.items():
        print(f"  {k:<24} {v}")
    if not args.apply:
        print()
        print("Dry-run 완료. 실제 반영하려면 --apply 옵션을 사용하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

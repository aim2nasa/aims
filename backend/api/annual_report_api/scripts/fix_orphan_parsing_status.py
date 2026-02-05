#!/usr/bin/env python3
"""
고아 AR/CRS 파싱 상태 복구 스크립트

문제:
- ar_parsing_status="completed" 또는 cr_parsing_status="completed"인데
- 실제 파싱 결과가 customers.annual_reports / customers.customer_reviews에 없는 문서

원인:
- doc_prep_main.py에서 AR/CRS 감지 시 "completed" 대신 "pending"으로 설정해야 했음
- 수정 전에 업로드된 문서들이 잘못된 상태로 남아있음

해결:
- 파싱 결과가 없는 문서의 상태를 "pending"으로 변경
- annual_report_api의 스캐너가 자동으로 재파싱 수행

사용법:
    python fix_orphan_parsing_status.py [--dry-run]

    --dry-run: 실제 수정 없이 대상 문서만 출력
"""
import sys
import argparse
from pymongo import MongoClient
from bson import ObjectId

# MongoDB 연결
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "docupload"


def find_orphan_ar_documents(db):
    """
    ar_parsing_status=completed인데 파싱 결과가 없는 AR 문서 찾기
    """
    orphans = []

    # AR로 감지된 문서 조회
    ar_docs = list(db["files"].find({
        "is_annual_report": True,
        "ar_parsing_status": "completed",
        "customerId": {"$exists": True, "$ne": None}
    }))

    for doc in ar_docs:
        customer_id = doc.get("customerId")
        if not customer_id:
            continue

        # 고객의 annual_reports 배열 확인
        customer = db["customers"].find_one(
            {"_id": customer_id},
            {"annual_reports": 1, "personal_info.name": 1}
        )

        if not customer:
            orphans.append({
                "file_id": doc["_id"],
                "filename": doc.get("upload", {}).get("originalName", "unknown"),
                "customer_id": customer_id,
                "customer_name": "고객 없음",
                "reason": "고객이 삭제됨"
            })
            continue

        # annual_reports 배열이 비어있으면 고아 문서
        annual_reports = customer.get("annual_reports", [])
        if len(annual_reports) == 0:
            orphans.append({
                "file_id": doc["_id"],
                "filename": doc.get("upload", {}).get("originalName", "unknown"),
                "customer_id": customer_id,
                "customer_name": customer.get("personal_info", {}).get("name", "unknown"),
                "reason": "파싱 결과 없음"
            })

    return orphans


def find_orphan_cr_documents(db):
    """
    cr_parsing_status=completed인데 파싱 결과가 없는 CRS 문서 찾기
    """
    orphans = []

    # CRS로 감지된 문서 조회
    cr_docs = list(db["files"].find({
        "is_customer_review": True,
        "cr_parsing_status": "completed",
        "customerId": {"$exists": True, "$ne": None}
    }))

    for doc in cr_docs:
        customer_id = doc.get("customerId")
        if not customer_id:
            continue

        # 고객의 customer_reviews 배열 확인
        customer = db["customers"].find_one(
            {"_id": customer_id},
            {"customer_reviews": 1, "personal_info.name": 1}
        )

        if not customer:
            orphans.append({
                "file_id": doc["_id"],
                "filename": doc.get("upload", {}).get("originalName", "unknown"),
                "customer_id": customer_id,
                "customer_name": "고객 없음",
                "reason": "고객이 삭제됨"
            })
            continue

        # customer_reviews 배열이 비어있으면 고아 문서
        customer_reviews = customer.get("customer_reviews", [])
        if len(customer_reviews) == 0:
            orphans.append({
                "file_id": doc["_id"],
                "filename": doc.get("upload", {}).get("originalName", "unknown"),
                "customer_id": customer_id,
                "customer_name": customer.get("personal_info", {}).get("name", "unknown"),
                "reason": "파싱 결과 없음"
            })

    return orphans


def fix_orphan_documents(db, ar_orphans, cr_orphans, dry_run=False):
    """
    고아 문서의 상태를 pending으로 변경
    """
    fixed_ar = 0
    fixed_cr = 0

    if ar_orphans:
        print(f"\n=== AR 고아 문서 ({len(ar_orphans)}건) ===")
        for orphan in ar_orphans:
            print(f"  - {orphan['filename']} (고객: {orphan['customer_name']}, 이유: {orphan['reason']})")

        if not dry_run:
            for orphan in ar_orphans:
                db["files"].update_one(
                    {"_id": orphan["file_id"]},
                    {"$set": {"ar_parsing_status": "pending"}}
                )
                fixed_ar += 1
            print(f"  ✅ {fixed_ar}건 상태 복구 (pending으로 변경)")

    if cr_orphans:
        print(f"\n=== CRS 고아 문서 ({len(cr_orphans)}건) ===")
        for orphan in cr_orphans:
            print(f"  - {orphan['filename']} (고객: {orphan['customer_name']}, 이유: {orphan['reason']})")

        if not dry_run:
            for orphan in cr_orphans:
                db["files"].update_one(
                    {"_id": orphan["file_id"]},
                    {"$set": {"cr_parsing_status": "pending"}}
                )
                fixed_cr += 1
            print(f"  ✅ {fixed_cr}건 상태 복구 (pending으로 변경)")

    return fixed_ar, fixed_cr


def main():
    parser = argparse.ArgumentParser(description="고아 AR/CRS 파싱 상태 복구")
    parser.add_argument("--dry-run", action="store_true", help="실제 수정 없이 대상만 출력")
    args = parser.parse_args()

    print("=" * 50)
    print("고아 AR/CRS 파싱 상태 복구 스크립트")
    print("=" * 50)

    if args.dry_run:
        print("⚠️  DRY RUN 모드 - 실제 수정 없음")

    # MongoDB 연결
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    try:
        # 고아 문서 찾기
        print("\n🔍 고아 AR 문서 검색 중...")
        ar_orphans = find_orphan_ar_documents(db)

        print("🔍 고아 CRS 문서 검색 중...")
        cr_orphans = find_orphan_cr_documents(db)

        if not ar_orphans and not cr_orphans:
            print("\n✅ 고아 문서가 없습니다. 모든 상태가 정상입니다.")
            return

        # 복구 실행
        fixed_ar, fixed_cr = fix_orphan_documents(db, ar_orphans, cr_orphans, args.dry_run)

        if args.dry_run:
            print(f"\n📋 복구 대상: AR {len(ar_orphans)}건, CRS {len(cr_orphans)}건")
            print("   실제 복구하려면 --dry-run 옵션 없이 실행하세요.")
        else:
            print(f"\n✅ 복구 완료: AR {fixed_ar}건, CRS {fixed_cr}건")
            print("   annual_report_api의 스캐너가 자동으로 재파싱합니다.")

    finally:
        client.close()


if __name__ == "__main__":
    main()

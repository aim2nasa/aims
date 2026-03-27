#!/usr/bin/env python3
"""
document_types 컬렉션 v4 마이그레이션 스크립트
@since 2026-03-27

프론트엔드 documentCategories.ts (v4) 기준으로 DB document_types 정비:
  1. 누락 유형 추가 (upsert)
  2. 라벨 불일치 수정
  3. category 필드 추가
  4. order 필드 재정렬 (DOCUMENT_TYPE_LABELS 순서)
  5. 레거시 유형에 isLegacy: true 표시

사용법:
  python migrate_document_types_v4.py                    # 실제 실행
  python migrate_document_types_v4.py --dry-run          # 변경 내용만 출력
  python migrate_document_types_v4.py --mongo-uri <URI>  # MongoDB URI 지정
"""

import argparse
import sys
from datetime import datetime, timezone
from pymongo import MongoClient

# ============================================================
# 프론트엔드 v4 기준 데이터 (documentCategories.ts 동기)
# ============================================================

# DOCUMENT_TYPE_LABELS 순서 = order 값
DOCUMENT_TYPE_LABELS = [
    # 1. 보험계약 (insurance)
    ("policy", "보험증권"),
    ("coverage_analysis", "보장분석"),
    ("application", "청약서"),
    ("plan_design", "가입설계서"),
    ("annual_report", "연간보고서(AR)"),
    ("customer_review", "변액리포트(CRS)"),
    ("insurance_etc", "기타 보험관련"),
    # 2. 보험금 청구 (claim)
    ("diagnosis", "진단서/소견서"),
    ("medical_receipt", "진료비영수증"),
    ("claim_form", "보험금청구서"),
    ("consent_delegation", "위임장/동의서"),
    # 3. 신분/증명 (identity)
    ("id_card", "신분증"),
    ("family_cert", "가족관계서류"),
    ("personal_docs", "기타 통장 및 개인서류"),
    # 4. 건강/의료 (medical)
    ("health_checkup", "건강검진결과"),
    # 5. 자산 (asset)
    ("asset_document", "자산관련서류"),
    ("inheritance_gift", "상속/증여"),
    # 6. 법인 (corporate)
    ("corp_basic", "기본서류"),
    ("hr_document", "인사/노무"),
    ("corp_tax", "세무"),
    ("corp_asset", "법인자산"),
    ("legal_document", "기타 법률서류"),
    # 7. 기타 (etc)
    ("general", "일반문서"),
    ("unclassifiable", "분류불가"),
    ("unspecified", "-"),
]

# TYPE_TO_CATEGORY 매핑
TYPE_TO_CATEGORY = {
    "policy": "insurance",
    "coverage_analysis": "insurance",
    "application": "insurance",
    "plan_design": "insurance",
    "annual_report": "insurance",
    "customer_review": "insurance",
    "insurance_etc": "insurance",
    "diagnosis": "claim",
    "medical_receipt": "claim",
    "claim_form": "claim",
    "consent_delegation": "claim",
    "id_card": "identity",
    "family_cert": "identity",
    "personal_docs": "identity",
    "health_checkup": "medical",
    "asset_document": "asset",
    "inheritance_gift": "asset",
    "corp_basic": "corporate",
    "hr_document": "corporate",
    "corp_tax": "corporate",
    "corp_asset": "corporate",
    "legal_document": "corporate",
    "general": "etc",
    "unclassifiable": "etc",
    "unspecified": "etc",
}

# 시스템 유형 (isSystem: true)
SYSTEM_TYPES = {"unspecified", "annual_report", "customer_review"}

# v4 기준 모든 유형 value 집합
V4_TYPE_VALUES = {t[0] for t in DOCUMENT_TYPE_LABELS}


def print_section(title: str):
    """구분선 출력"""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def print_before_state(collection):
    """마이그레이션 전 상태 출력"""
    print_section("마이그레이션 전 상태")
    docs = list(collection.find({}).sort("order", 1))
    print(f"  총 {len(docs)}개 유형")
    print(f"  {'value':<25} {'label':<20} {'category':<12} {'order':<6} {'isSystem':<10} {'isLegacy'}")
    print(f"  {'-' * 25} {'-' * 20} {'-' * 12} {'-' * 6} {'-' * 10} {'-' * 8}")
    for doc in docs:
        value = doc.get("value", "???")
        label = doc.get("label", "???")
        category = doc.get("category", "-")
        order = doc.get("order", "-")
        is_system = doc.get("isSystem", False)
        is_legacy = doc.get("isLegacy", False)
        print(f"  {value:<25} {label:<20} {category:<12} {str(order):<6} {str(is_system):<10} {is_legacy}")
    return docs


def print_after_state(collection):
    """마이그레이션 후 상태 출력"""
    print_section("마이그레이션 후 상태")
    docs = list(collection.find({}).sort("order", 1))
    print(f"  총 {len(docs)}개 유형")
    print(f"  {'value':<25} {'label':<20} {'category':<12} {'order':<6} {'isSystem':<10} {'isLegacy'}")
    print(f"  {'-' * 25} {'-' * 20} {'-' * 12} {'-' * 6} {'-' * 10} {'-' * 8}")
    for doc in docs:
        value = doc.get("value", "???")
        label = doc.get("label", "???")
        category = doc.get("category", "-")
        order = doc.get("order", "-")
        is_system = doc.get("isSystem", False)
        is_legacy = doc.get("isLegacy", False)
        print(f"  {value:<25} {label:<20} {category:<12} {str(order):<6} {str(is_system):<10} {is_legacy}")


def run_migration(collection, dry_run: bool):
    """
    v4 기준 마이그레이션 실행

    멱등성 보장: 여러 번 실행해도 동일 결과.
    개별 작업 실패 시 에러를 출력하고 계속 진행 (부분 마이그레이션 허용).
    """
    now = datetime.now(timezone.utc)
    errors = []
    existing_docs = {doc["value"]: doc for doc in collection.find({})}
    existing_values = set(existing_docs.keys())

    # 통계
    stats = {"added": 0, "label_updated": 0, "category_set": 0, "order_updated": 0, "legacy_marked": 0}

    # ── 1. v4 유형 upsert (추가 + 라벨/category/order 업데이트) ──
    print_section("v4 유형 upsert")
    for order, (value, label) in enumerate(DOCUMENT_TYPE_LABELS):
        category = TYPE_TO_CATEGORY[value]
        is_system = value in SYSTEM_TYPES

        if value not in existing_values:
            # 신규 추가
            new_doc = {
                "value": value,
                "label": label,
                "description": "",
                "category": category,
                "isSystem": is_system,
                "isLegacy": False,
                "order": order,
                "createdAt": now,
                "updatedAt": now,
            }
            print(f"  [추가] {value} → label='{label}', category='{category}', order={order}")
            if not dry_run:
                try:
                    collection.insert_one(new_doc)
                except Exception as e:
                    errors.append(f"insert {value}: {e}")
                    print(f"  [오류] {value} 추가 실패: {e}")
                    continue
            stats["added"] += 1
        else:
            # 기존 유형 업데이트
            doc = existing_docs[value]
            updates = {}

            # 라벨 불일치 수정
            if doc.get("label") != label:
                print(f"  [라벨수정] {value}: '{doc.get('label')}' → '{label}'")
                updates["label"] = label
                stats["label_updated"] += 1

            # category 필드 설정
            if doc.get("category") != category:
                old_cat = doc.get("category", "(없음)")
                print(f"  [카테고리] {value}: '{old_cat}' → '{category}'")
                updates["category"] = category
                stats["category_set"] += 1

            # order 재정렬
            if doc.get("order") != order:
                print(f"  [순서변경] {value}: {doc.get('order')} → {order}")
                updates["order"] = order
                stats["order_updated"] += 1

            # isSystem 보정
            if doc.get("isSystem") != is_system:
                updates["isSystem"] = is_system

            # isLegacy 제거 (v4에 있으므로 레거시 아님)
            if doc.get("isLegacy", False):
                updates["isLegacy"] = False

            if updates:
                updates["updatedAt"] = now
                if not dry_run:
                    try:
                        collection.update_one({"value": value}, {"$set": updates})
                    except Exception as e:
                        errors.append(f"update {value}: {e}")
                        print(f"  [오류] {value} 업데이트 실패: {e}")

    # ── 2. 레거시 유형 표시 ──
    legacy_values = existing_values - V4_TYPE_VALUES
    if legacy_values:
        print_section("레거시 유형 표시")
        for value in sorted(legacy_values):
            doc = existing_docs[value]
            if not doc.get("isLegacy", False):
                print(f"  [레거시] {value} (label='{doc.get('label', '?')}')")
                stats["legacy_marked"] += 1
                if not dry_run:
                    try:
                        # 레거시 유형의 order는 v4 유형 뒤에 배치 (기존 order + 1000)
                        legacy_order = 1000 + (doc.get("order", 0))
                        collection.update_one(
                            {"value": value},
                            {"$set": {
                                "isLegacy": True,
                                "order": legacy_order,
                                "updatedAt": now,
                            }},
                        )
                    except Exception as e:
                        errors.append(f"legacy {value}: {e}")
                        print(f"  [오류] {value} 레거시 표시 실패: {e}")
            else:
                print(f"  [레거시] {value} — 이미 isLegacy=true")
    else:
        print("\n  레거시 유형 없음")

    # ── 결과 요약 ──
    print_section("마이그레이션 요약")
    mode = "DRY-RUN (실제 변경 없음)" if dry_run else "실행 완료"
    print(f"  모드: {mode}")
    print(f"  신규 추가: {stats['added']}건")
    print(f"  라벨 수정: {stats['label_updated']}건")
    print(f"  카테고리 설정: {stats['category_set']}건")
    print(f"  순서 변경: {stats['order_updated']}건")
    print(f"  레거시 표시: {stats['legacy_marked']}건")

    if errors:
        print(f"\n  [!] 오류 {len(errors)}건 발생:")
        for err in errors:
            print(f"      - {err}")

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="document_types 컬렉션 v4 마이그레이션"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="변경 내용만 출력하고 실제 DB 수정 안 함",
    )
    parser.add_argument(
        "--mongo-uri",
        default="mongodb://tars:27017",
        help="MongoDB URI (기본값: mongodb://tars:27017)",
    )
    parser.add_argument(
        "--db-name",
        default="docupload",
        help="데이터베이스 이름 (기본값: docupload)",
    )
    args = parser.parse_args()

    print(f"document_types v4 마이그레이션")
    print(f"  MongoDB: {args.mongo_uri}/{args.db_name}")
    print(f"  모드: {'DRY-RUN' if args.dry_run else '실행'}")

    try:
        client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=5000)
        # 연결 확인
        client.admin.command("ping")
        print(f"  MongoDB 연결 성공")
    except Exception as e:
        print(f"  MongoDB 연결 실패: {e}", file=sys.stderr)
        sys.exit(1)

    db = client[args.db_name]
    collection = db["document_types"]

    # 마이그레이션 전 상태
    print_before_state(collection)

    # 마이그레이션 실행
    run_migration(collection, dry_run=args.dry_run)

    # 마이그레이션 후 상태 (dry-run이 아닐 때만)
    if not args.dry_run:
        print_after_state(collection)

    client.close()
    print(f"\n완료.")


if __name__ == "__main__":
    main()

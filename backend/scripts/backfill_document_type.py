"""
document_type SSoT 마이그레이션 스크립트 (Phase 2)

문제: document_type이 null이고 meta.document_type에 값이 있는 문서가 존재.
해결: meta.document_type 값을 top-level document_type으로 복사.

멱등성: 이미 document_type에 값이 있는 문서는 건드리지 않음.
         반복 실행해도 안전.

실행 기록:
  - 2026-03-27: 723건 마이그레이션 완료 (MongoDB MCP 직접 실행)

사용법:
  python backfill_document_type.py [--dry-run]
"""

import argparse
import sys
from pymongo import MongoClient

MONGO_URI = "mongodb://tars:27017"
DATABASE = "docupload"
COLLECTION = "files"


def run(dry_run: bool = False):
    client = MongoClient(MONGO_URI)
    db = client[DATABASE]
    files = db[COLLECTION]

    query = {
        "$or": [
            {"document_type": None},
            {"document_type": {"$exists": False}},
        ],
        "meta.document_type": {"$exists": True, "$ne": None},
    }

    count = files.count_documents(query)
    print(f"대상 문서: {count}건")

    if count == 0:
        print("마이그레이션 대상 없음. 이미 완료된 상태입니다.")
        return

    if dry_run:
        print("[dry-run] 실제 수정하지 않습니다.")
        return

    result = files.update_many(
        query,
        [
            {
                "$set": {
                    "document_type": "$meta.document_type",
                    "document_type_auto": {
                        "$ifNull": ["$document_type_auto", True]
                    },
                }
            }
        ],
    )

    print(f"수정 완료: matched={result.matched_count}, modified={result.modified_count}")

    remaining = files.count_documents(query)
    print(f"잔여 대상: {remaining}건")
    if remaining > 0:
        print("WARNING: 잔여 문서가 있습니다. 확인 필요.")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="document_type SSoT 마이그레이션")
    parser.add_argument("--dry-run", action="store_true", help="실제 수정 없이 대상만 확인")
    args = parser.parse_args()
    run(dry_run=args.dry_run)

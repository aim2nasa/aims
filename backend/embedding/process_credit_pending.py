#!/usr/bin/env python3
"""
크레딧 보류 문서 재처리 스크립트
매월 1일 크레딧 리셋 후 실행하여 보류된 문서를 처리 대기열에 추가

사용법:
  python process_credit_pending.py

크론탭 설정 (매월 1일 00:05 KST):
  5 0 1 * * cd /home/rossi/aims/backend/embedding && python process_credit_pending.py >> /var/log/aims/credit_pending.log 2>&1

@see docs/EMBEDDING_CREDIT_POLICY.md
"""
import os
import sys
import requests
from datetime import datetime, timezone
from typing import Dict, List
from pymongo import MongoClient
from bson.objectid import ObjectId

# 환경 변수
MONGO_URI = os.getenv("MONGO_URI", "mongodb://tars:27017/")
DB_NAME = os.getenv("DB_NAME", "docupload")
AIMS_API_URL = os.getenv("AIMS_API_URL", "http://localhost:3010")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# 크레딧 체크 API URL
CREDIT_CHECK_URL = f"{AIMS_API_URL}/api/internal/check-credit"


def check_user_credit(user_id: str, estimated_pages: int = 1) -> Dict:
    """사용자 크레딧 체크"""
    try:
        response = requests.post(
            CREDIT_CHECK_URL,
            json={
                "user_id": user_id,
                "estimated_pages": estimated_pages
            },
            headers={
                "Content-Type": "application/json",
                "x-api-key": INTERNAL_API_KEY
            },
            timeout=10
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"[CreditCheck] API 호출 실패: {response.status_code}")
            return {"allowed": False, "reason": "api_error"}

    except Exception as e:
        print(f"[CreditCheck] 오류: {e}")
        return {"allowed": False, "reason": "error", "error": str(e)}


def process_credit_pending_documents():
    """
    credit_pending 상태의 문서를 조회하고, 크레딧이 충분한 사용자의 문서를 재처리 대기열에 추가
    """
    print(f"\n{'='*60}")
    print(f"크레딧 보류 문서 재처리 시작: {datetime.now(timezone.utc).isoformat()}")
    print(f"{'='*60}\n")

    try:
        # MongoDB 연결
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        files_collection = db['files']

        # 1. credit_pending 상태 문서 조회 (사용자별 그룹)
        pipeline = [
            {"$match": {"overallStatus": "credit_pending"}},
            {"$group": {
                "_id": "$ownerId",
                "docs": {"$push": {
                    "doc_id": "$_id",
                    "original_name": "$upload.originalName",
                    "page_count": {"$ifNull": ["$ocr.page_count", 1]},
                    "created_at": "$createdAt"
                }},
                "total_docs": {"$sum": 1}
            }}
        ]

        user_groups = list(files_collection.aggregate(pipeline))
        total_pending = sum(group["total_docs"] for group in user_groups)

        print(f"보류된 문서 현황:")
        print(f"  - 총 문서 수: {total_pending}")
        print(f"  - 사용자 수: {len(user_groups)}")
        print()

        if total_pending == 0:
            print("처리할 보류 문서가 없습니다.")
            return

        # 2. 사용자별 크레딧 체크 및 문서 재처리
        processed_count = 0
        skipped_count = 0

        for user_group in user_groups:
            user_id = user_group["_id"]
            docs = user_group["docs"]

            print(f"\n사용자 {user_id}:")
            print(f"  - 보류 문서 수: {len(docs)}")

            # 크레딧 체크 (가장 큰 페이지 수 기준)
            max_pages = max(doc.get("page_count", 1) for doc in docs)
            credit_check = check_user_credit(user_id, max_pages)

            if not credit_check.get("allowed", False):
                print(f"  - 크레딧 부족: 남은 {credit_check.get('credits_remaining', 0)} / 필요 {credit_check.get('estimated_credits', 0)}")
                print(f"  - 다음 리셋까지: {credit_check.get('days_until_reset', 0)}일")
                skipped_count += len(docs)
                continue

            print(f"  - 크레딧 충분: 남은 {credit_check.get('credits_remaining', 0)}")

            # 3. 문서 상태를 pending으로 변경 (재처리 대기)
            for doc in docs:
                doc_id = doc["doc_id"]
                original_name = doc.get("original_name", "unknown")

                # 상태 업데이트: credit_pending → pending
                files_collection.update_one(
                    {"_id": doc_id},
                    {"$set": {
                        "status": "pending",
                        "overallStatus": "pending",
                        "docembed.status": "pending",
                        "docembed.reprocessed_from_credit_pending": True,
                        "docembed.reprocessed_at": datetime.now(timezone.utc).isoformat(),
                        "progressStage": "queued",
                        "progressMessage": "크레딧 충전 후 재처리 대기"
                    },
                    "$unset": {
                        "credit_pending_since": "",
                        "credit_pending_info": ""
                    }}
                )

                print(f"    ✅ {original_name} → pending (재처리 대기)")
                processed_count += 1

        # 4. 요약 출력
        print(f"\n{'='*60}")
        print(f"처리 완료:")
        print(f"  - 재처리 대기열 추가: {processed_count}개")
        print(f"  - 크레딧 부족으로 유지: {skipped_count}개")
        print(f"{'='*60}\n")

        # 5. full_pipeline.py 실행 알림
        if processed_count > 0:
            print("💡 재처리를 위해 다음 명령을 실행하세요:")
            print("   cd /home/rossi/aims/backend/embedding && python full_pipeline.py")

    except Exception as e:
        print(f"오류 발생: {e}")
        sys.exit(1)


if __name__ == "__main__":
    process_credit_pending_documents()

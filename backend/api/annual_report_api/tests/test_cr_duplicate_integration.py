#!/usr/bin/env python3
"""
test_cr_duplicate_integration.py
Customer Review 중복 체크 통합 테스트 (실제 DB 연결)

실행 방법:
  cd /home/rossi/aims/backend/api/annual_report_api
  source venv/bin/activate
  python tests/test_cr_duplicate_integration.py

테스트 시나리오:
1. 실제 DB에서 customer_reviews가 있는 고객 조회
2. 기존 리뷰와 동일한 4가지 필드로 저장 시도 → 중복 건너뜀 확인
3. 1가지 필드 다르게 저장 시도 → 새로 저장 확인
4. 테스트 데이터 정리 (rollback)
"""

import sys
import os
from datetime import datetime, timezone
from bson import ObjectId

# 경로 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# MongoDB 연결
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "docupload"

# 테스트 결과 저장
test_results = []

def log_test(name: str, passed: bool, message: str = ""):
    """테스트 결과 로깅"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} | {name}")
    if message:
        print(f"       → {message}")
    test_results.append({"name": name, "passed": passed, "message": message})


def run_integration_tests():
    """통합 테스트 실행"""
    print("=" * 60)
    print("Customer Review 중복 체크 통합 테스트")
    print("=" * 60)
    print()

    # MongoDB 연결
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        print(f"📌 MongoDB 연결: {MONGO_URI}/{DB_NAME}")
    except Exception as e:
        print(f"❌ MongoDB 연결 실패: {e}")
        return False

    # 1. customer_reviews가 있는 고객 찾기
    print("\n[1] customer_reviews가 있는 고객 조회...")
    customer = db.customers.find_one({
        "customer_reviews": {"$exists": True, "$ne": []},
        "customer_reviews.0": {"$exists": True}  # 최소 1개 이상
    })

    if not customer:
        print("⚠️  customer_reviews가 있는 고객이 없습니다. 테스트 건너뜀.")
        print("    → 실제 CR 파싱 후 다시 테스트해 주세요.")
        return True  # 데이터 없으면 스킵 (실패 아님)

    customer_id = str(customer["_id"])
    existing_reviews = customer.get("customer_reviews", [])
    print(f"   고객 ID: {customer_id}")
    print(f"   고객명: {customer.get('name', 'N/A')}")
    print(f"   기존 리뷰 수: {len(existing_reviews)}")

    if len(existing_reviews) == 0:
        print("⚠️  customer_reviews가 비어있습니다. 테스트 건너뜀.")
        return True

    # 기존 리뷰 정보 출력
    existing_review = existing_reviews[0]
    print(f"\n   [기존 리뷰 정보]")
    print(f"   - contractor_name: {existing_review.get('contractor_name', 'N/A')}")
    print(f"   - policy_number: {existing_review.get('contract_info', {}).get('policy_number', 'N/A')}")
    print(f"   - product_name: {existing_review.get('product_name', 'N/A')}")
    print(f"   - issue_date: {existing_review.get('issue_date', 'N/A')}")

    # 2. 중복 체크 로직 시뮬레이션
    print("\n[2] 중복 체크 로직 시뮬레이션...")

    # save_customer_review 함수 import
    from services.db_writer import save_customer_review

    # 기존 리뷰와 동일한 데이터 준비
    contractor_name = existing_review.get("contractor_name")
    policy_number = existing_review.get("contract_info", {}).get("policy_number")
    product_name = existing_review.get("product_name")
    issue_date = existing_review.get("issue_date")

    # issue_date를 문자열로 변환
    if isinstance(issue_date, datetime):
        issue_date_str = issue_date.strftime("%Y-%m-%d")
    elif isinstance(issue_date, str):
        issue_date_str = issue_date.split('T')[0]
    else:
        issue_date_str = None

    # 필수 필드 체크
    if not all([contractor_name, policy_number, product_name, issue_date_str]):
        print("⚠️  기존 리뷰에 필수 필드가 누락되어 있습니다. 테스트 건너뜀.")
        print(f"   contractor_name={contractor_name}, policy_number={policy_number}")
        print(f"   product_name={product_name}, issue_date_str={issue_date_str}")
        return True

    # Test 2-1: 동일한 4가지 필드로 저장 시도 → 중복으로 건너뜀
    print(f"\n[2-1] 동일한 4가지 필드로 저장 시도...")
    result = save_customer_review(
        db=db,
        customer_id=customer_id,
        report_data={
            "contract_info": {"policy_number": policy_number},
            "premium_info": {},
            "fund_allocations": [],
            "total_accumulated_amount": 99999999,  # 다른 값
            "fund_count": 99  # 다른 값
        },
        metadata={
            "contractor_name": contractor_name,
            "product_name": product_name,
            "issue_date": issue_date_str
        }
    )

    is_duplicate = result.get("duplicate", False)
    log_test(
        "동일한 4가지 필드 → 중복 건너뜀",
        is_duplicate is True,
        f"duplicate={is_duplicate}, message={result.get('message', '')}"
    )

    # 저장 후 리뷰 수 확인 (변하지 않아야 함)
    customer_after = db.customers.find_one({"_id": ObjectId(customer_id)})
    reviews_after = customer_after.get("customer_reviews", [])
    log_test(
        "리뷰 수 변화 없음 확인",
        len(reviews_after) == len(existing_reviews),
        f"기존={len(existing_reviews)}, 현재={len(reviews_after)}"
    )

    # Test 2-2: 다른 발행일로 저장 시도 → 새로 저장됨
    print(f"\n[2-2] 다른 발행일로 저장 시도...")
    different_date = "2099-12-31"  # 확실히 다른 날짜
    result2 = save_customer_review(
        db=db,
        customer_id=customer_id,
        report_data={
            "contract_info": {"policy_number": policy_number},
            "premium_info": {},
            "fund_allocations": [],
            "total_accumulated_amount": 88888888,
            "fund_count": 88
        },
        metadata={
            "contractor_name": contractor_name,
            "product_name": product_name,
            "issue_date": different_date  # 다른 발행일
        }
    )

    is_saved = result2.get("success", False) and not result2.get("duplicate", False)
    log_test(
        "다른 발행일 → 새로 저장됨",
        is_saved is True,
        f"success={result2.get('success')}, duplicate={result2.get('duplicate', False)}"
    )

    # 저장 후 리뷰 수 확인 (1개 증가해야 함)
    customer_after2 = db.customers.find_one({"_id": ObjectId(customer_id)})
    reviews_after2 = customer_after2.get("customer_reviews", [])
    log_test(
        "리뷰 수 1개 증가 확인",
        len(reviews_after2) == len(existing_reviews) + 1,
        f"기존={len(existing_reviews)}, 현재={len(reviews_after2)}"
    )

    # 3. 테스트 데이터 정리 (Rollback)
    print(f"\n[3] 테스트 데이터 정리 (Rollback)...")
    # 방금 추가한 테스트 리뷰 삭제 (issue_date가 2099-12-31인 것)
    rollback_result = db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$pull": {"customer_reviews": {"issue_date": datetime(2099, 12, 31, tzinfo=timezone.utc)}}}
    )
    print(f"   삭제된 테스트 리뷰: {rollback_result.modified_count}건")

    # 최종 리뷰 수 확인
    customer_final = db.customers.find_one({"_id": ObjectId(customer_id)})
    reviews_final = customer_final.get("customer_reviews", [])
    log_test(
        "Rollback 후 원래 리뷰 수 복원",
        len(reviews_final) == len(existing_reviews),
        f"기존={len(existing_reviews)}, 최종={len(reviews_final)}"
    )

    # 결과 요약
    print("\n" + "=" * 60)
    print("테스트 결과 요약")
    print("=" * 60)
    passed = sum(1 for r in test_results if r["passed"])
    failed = sum(1 for r in test_results if not r["passed"])
    print(f"통과: {passed}, 실패: {failed}, 총: {len(test_results)}")

    if failed > 0:
        print("\n❌ 실패한 테스트:")
        for r in test_results:
            if not r["passed"]:
                print(f"   - {r['name']}: {r['message']}")

    return failed == 0


if __name__ == "__main__":
    success = run_integration_tests()
    sys.exit(0 if success else 1)

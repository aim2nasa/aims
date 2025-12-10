#!/usr/bin/env python3
"""
데이터 격리 자동화 테스트
계정별 데이터가 올바르게 분리되어 있는지 검증
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3010/api"
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSIsIm5hbWUiOiLqsJzrsJzsnpAiLCJyb2xlIjoidXNlciIsImlhdCI6MTc2NTM3Nzk1NSwiZXhwIjoxNzY1MzgxNTU1fQ.F_w8R1btM2kRmegBTg_ahz_nJAQsfBUqjdtVdeUfoXw"

# 테스트할 사용자 목록
TEST_USERS = [
    {"id": "000000000000000000000001", "name": "개발자 (Dev)", "expected_docs": 29, "expected_customers": 1},
    {"id": "user2", "name": "user2", "expected_docs": 0, "expected_customers": 0},
    {"id": "kwak-id-001", "name": "곽승철", "expected_docs": 0, "expected_customers": 0},
]

def test_user(user_id, user_name):
    """특정 사용자로 API 호출하여 데이터 확인"""
    headers = {
        "Authorization": f"Bearer {JWT_TOKEN}",
        "x-user-id": user_id,
        "Content-Type": "application/json"
    }

    results = {"user": user_name, "user_id": user_id, "passed": True, "details": []}

    # 1. 문서 목록 조회
    try:
        resp = requests.get(f"{BASE_URL}/documents/status", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # API returns nested structure: data.data.documents, data.data.pagination
            inner_data = data.get("data", data)
            docs = inner_data.get("documents", [])
            pagination = inner_data.get("pagination", {})
            doc_count = pagination.get("totalCount", len(docs))
            results["doc_count"] = doc_count

            # met샘플.xlsx가 포함되어 있는지 확인
            met_found = any("met샘플" in (d.get("originalName", "") or "") for d in docs)
            if met_found:
                results["passed"] = False
                results["details"].append("❌ met샘플.xlsx가 결과에 포함됨 (개인 파일)")
            else:
                results["details"].append("✓ met샘플.xlsx 제외 확인")
        else:
            results["doc_count"] = f"Error: {resp.status_code}"
            results["passed"] = False
            results["details"].append(f"❌ 문서 API 오류: {resp.status_code}")
    except Exception as e:
        results["doc_count"] = f"Error: {str(e)}"
        results["passed"] = False
        results["details"].append(f"❌ 문서 API 예외: {str(e)}")

    # 2. 고객 목록 조회
    try:
        resp = requests.get(f"{BASE_URL}/customers", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # API returns nested structure: data.data.customers, data.data.pagination
            inner_data = data.get("data", data)
            customers = inner_data.get("customers", [])
            pagination = inner_data.get("pagination", {})
            customer_count = pagination.get("total", len(customers))
            results["customer_count"] = customer_count
            results["details"].append(f"✓ 고객 목록 조회 성공")
        else:
            results["customer_count"] = f"Error: {resp.status_code}"
            results["passed"] = False
            results["details"].append(f"❌ 고객 API 오류: {resp.status_code}")
    except Exception as e:
        results["customer_count"] = f"Error: {str(e)}"
        results["passed"] = False
        results["details"].append(f"❌ 고객 API 예외: {str(e)}")

    # 3. 계약 목록 조회
    try:
        resp = requests.get(f"{BASE_URL}/contracts", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            # Contracts API: success, data (list), total, limit, skip
            contract_count = data.get("total", 0)
            results["contract_count"] = contract_count
            results["details"].append(f"✓ 계약 목록 조회 성공")
        else:
            results["contract_count"] = f"Error: {resp.status_code}"
            results["passed"] = False
            results["details"].append(f"❌ 계약 API 오류: {resp.status_code}")
    except Exception as e:
        results["contract_count"] = f"Error: {str(e)}"
        results["passed"] = False
        results["details"].append(f"❌ 계약 API 예외: {str(e)}")

    return results

def main():
    print("=" * 60)
    print("🔒 AIMS 데이터 격리 자동화 테스트")
    print("=" * 60)
    print()

    all_passed = True
    results_summary = []

    for user in TEST_USERS:
        print(f"테스트 중: {user['name']} ({user['id']})")
        result = test_user(user["id"], user["name"])
        results_summary.append(result)

        if not result["passed"]:
            all_passed = False

        print(f"  문서: {result.get('doc_count', 'N/A')}")
        print(f"  고객: {result.get('customer_count', 'N/A')}")
        print(f"  계약: {result.get('contract_count', 'N/A')}")
        for detail in result["details"]:
            print(f"  {detail}")
        print()

    # 데이터 격리 검증
    print("=" * 60)
    print("📊 데이터 격리 검증 결과")
    print("=" * 60)

    # 개발자 데이터 확인
    dev_result = results_summary[0]
    user2_result = results_summary[1]
    kwak_result = results_summary[2]

    isolation_passed = True

    # 1. 개발자는 데이터가 있어야 함
    if isinstance(dev_result.get("doc_count"), int) and dev_result["doc_count"] > 0:
        print("✅ 개발자: 문서 데이터 존재 확인")
    else:
        print("❌ 개발자: 문서 데이터가 없음")
        isolation_passed = False

    if isinstance(dev_result.get("customer_count"), int) and dev_result["customer_count"] > 0:
        print("✅ 개발자: 고객 데이터 존재 확인")
    else:
        print("❌ 개발자: 고객 데이터가 없음")
        isolation_passed = False

    # 2. user2는 데이터가 없어야 함
    if isinstance(user2_result.get("doc_count"), int) and user2_result["doc_count"] == 0:
        print("✅ user2: 문서 데이터 격리 확인 (0건)")
    else:
        print(f"❌ user2: 문서 데이터 격리 실패 ({user2_result.get('doc_count')}건)")
        isolation_passed = False

    if isinstance(user2_result.get("customer_count"), int) and user2_result["customer_count"] == 0:
        print("✅ user2: 고객 데이터 격리 확인 (0건)")
    else:
        print(f"❌ user2: 고객 데이터 격리 실패 ({user2_result.get('customer_count')}건)")
        isolation_passed = False

    # 3. 곽승철은 데이터가 없어야 함
    if isinstance(kwak_result.get("doc_count"), int) and kwak_result["doc_count"] == 0:
        print("✅ 곽승철: 문서 데이터 격리 확인 (0건)")
    else:
        print(f"❌ 곽승철: 문서 데이터 격리 실패 ({kwak_result.get('doc_count')}건)")
        isolation_passed = False

    if isinstance(kwak_result.get("customer_count"), int) and kwak_result["customer_count"] == 0:
        print("✅ 곽승철: 고객 데이터 격리 확인 (0건)")
    else:
        print(f"❌ 곽승철: 고객 데이터 격리 실패 ({kwak_result.get('customer_count')}건)")
        isolation_passed = False

    print()
    print("=" * 60)
    if isolation_passed and all_passed:
        print("🎉 모든 테스트 통과! 데이터 격리가 정상 작동합니다.")
        sys.exit(0)
    else:
        print("⚠️  일부 테스트 실패. 데이터 격리 문제 확인 필요.")
        sys.exit(1)

if __name__ == "__main__":
    main()

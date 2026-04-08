#!/usr/bin/env python3
"""
GT(Ground Truth) 데이터셋 ↔ 실제 DB 대조 스크립트

서버에서 실행: python3 ~/aims/tools/ai_assistant_regression/gt_db_reconcile.py
SSH 경유:      ssh rossi@100.110.215.65 'cd ~/aims && python3 tools/ai_assistant_regression/gt_db_reconcile.py'

docs/gt_test_cases.json의 Q4/Q6 GT 기대값이 실제 DB 데이터와 일치하는지 검증하고,
불일치 케이스를 목록화하여 GT 갱신 정보를 제공합니다.
"""

import json
import os
import re
import sys
from datetime import datetime

try:
    from pymongo import MongoClient
except ImportError:
    print("[ERROR] pymongo가 설치되어 있지 않습니다. pip install pymongo")
    sys.exit(1)

# --- 설정 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
GT_FILE = os.path.join(PROJECT_ROOT, "docs", "gt_test_cases.json")
RESULT_FILE = "/tmp/gt_reconcile_results.json"

MONGO_URI = "mongodb://tars:27017"
MONGO_DB = "docupload"
MONGO_COLLECTION = "customers"


# --- DB 접근 ---

def get_db():
    """MongoDB 연결"""
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # 연결 확인
    client.server_info()
    return client[MONGO_DB]


def find_customer(db, name):
    """고객명으로 고객 문서 조회 (부분 매칭, MCP 도구와 동일)"""
    coll = db[MONGO_COLLECTION]
    # 정확히 일치하는 것부터 시도
    customer = coll.find_one({"personal_info.name": name})
    if customer:
        return customer
    # 부분 매칭 (법인명 등: "캐치업코리아" → "주식회사캐치업코리아")
    customer = coll.find_one({"personal_info.name": {"$regex": re.escape(name), "$options": "i"}})
    return customer


# --- 납입상태 계산 (MCP calculatePaymentStatus와 동일) ---

def calculate_payment_status(payment_period, contract_date):
    """납입기간과 계약일로 납입상태 계산"""
    period = payment_period.strip()
    if "일시납" in period:
        return "일시납"
    if "전기납" in period:
        return "전기납"

    # "N년" 패턴
    m = re.match(r'^(\d+)\s*년$', period)
    if m and contract_date:
        years = int(m.group(1))
        try:
            dt = datetime.fromisoformat(contract_date.replace("Z", "+00:00")) if "T" in contract_date else datetime.strptime(contract_date[:10], "%Y-%m-%d")
            end_date = dt.replace(year=dt.year + years)
            return "납입완료" if end_date <= datetime.now() else "납입중"
        except (ValueError, TypeError):
            pass

    return "납입중"


# --- AR 계약 정규화 (MCP normalizeContract와 동일) ---

def normalize_ar_contract(contract, customer_id, customer_name, ar_issue_date, is_lapsed=False):
    """AR 계약 데이터를 정규화"""
    payment_period = contract.get("납입기간", "")
    contract_date = contract.get("계약일", "")

    return {
        "customerId": customer_id,
        "customerName": customer_name,
        "policyNumber": contract.get("증권번호", ""),
        "productName": contract.get("보험상품", ""),
        "insurerName": contract.get("보험사", ""),
        "contractor": contract.get("계약자", ""),
        "insured": contract.get("피보험자", ""),
        "contractDate": contract_date,
        "status": contract.get("계약상태", ""),
        "coverageAmount": contract.get("가입금액(만원)", 0),
        "insurancePeriod": contract.get("보험기간", ""),
        "paymentPeriod": payment_period,
        "paymentStatus": calculate_payment_status(payment_period, contract_date),
        "premium": contract.get("보험료(원)", 0),
        "isLapsed": is_lapsed,
        "arIssueDate": ar_issue_date,
        "source": "AR"
    }


# --- CRS 계약 정규화 (MCP 도구와 동일 로직) ---

def normalize_crs_contract(cr, customer_id, customer_name):
    """CRS(customer_reviews) 데이터를 정규화"""
    contract_info = cr.get("contract_info", {})
    if not contract_info:
        return None

    policy_number = contract_info.get("policy_number", "")
    monthly_premium = contract_info.get("monthly_premium", 0) or 0
    initial_premium = contract_info.get("initial_premium", 0) or 0
    insured_amount = contract_info.get("insured_amount", 0) or 0
    contract_date = contract_info.get("contract_date", "")

    product_name = cr.get("product_name", "")

    # 납입기간 추출 (MCP 도구와 동일)
    payment_year_match = re.search(r'(\d+)\s*년\s*납', product_name)
    if payment_year_match:
        crs_payment_period = f"{payment_year_match.group(1)}년"
    elif monthly_premium == 0:
        # 상품명에 년납 패턴 없고 월보험료 0이면 일시납
        crs_payment_period = "일시납"
    else:
        crs_payment_period = ""

    premium = monthly_premium if monthly_premium > 0 else initial_premium

    return {
        "customerId": customer_id,
        "customerName": customer_name,
        "policyNumber": policy_number,
        "productName": product_name,
        "insurerName": "",
        "contractor": cr.get("contractor_name", ""),
        "insured": cr.get("insured_name", ""),
        "contractDate": contract_date,
        "status": "정상",
        "coverageAmount": insured_amount / 10000 if insured_amount else 0,
        "insurancePeriod": "",
        "paymentPeriod": crs_payment_period,
        "paymentStatus": "일시납" if crs_payment_period == "일시납" else calculate_payment_status(crs_payment_period, contract_date),
        "premium": premium,
        "isLapsed": False,
        "arIssueDate": cr.get("issue_date", ""),
        "source": "CRS"
    }


# --- AR + CRS 병합 (MCP handleSearchCustomerWithContracts와 동일) ---

def merge_contracts(customer):
    """고객의 AR + CRS 계약을 병합 (증권번호 중복 제거, AR 우선)"""
    customer_id = str(customer.get("_id", ""))
    customer_name = customer.get("personal_info", {}).get("name", "")
    annual_reports = customer.get("annual_reports", []) or []
    customer_reviews = customer.get("customer_reviews", []) or []

    contract_map = {}  # 증권번호 → 정규화 계약
    no_policy_contracts = []  # 증권번호 없는 계약

    # AR 처리 (issue_date 기준 최신 우선 정렬)
    sorted_reports = sorted(
        annual_reports,
        key=lambda ar: ar.get("issue_date", "0"),
        reverse=True
    )

    for ar in sorted_reports:
        ar_issue_date = ar.get("issue_date", "")

        # 정상 계약
        for contract in (ar.get("contracts") or []):
            pn = contract.get("증권번호", "")
            if pn and pn in contract_map:
                continue
            normalized = normalize_ar_contract(contract, customer_id, customer_name, ar_issue_date, False)
            if pn:
                contract_map[pn] = normalized
            else:
                no_policy_contracts.append(normalized)

        # 실효 계약은 기본 포함하지 않음 (includeLapsed=False 기본값)

    # CRS 처리 (AR에 없는 증권번호만)
    for cr in customer_reviews:
        contract_info = cr.get("contract_info")
        if not contract_info:
            continue
        pn = contract_info.get("policy_number", "")
        if pn and pn in contract_map:
            continue
        normalized = normalize_crs_contract(cr, customer_id, customer_name)
        if normalized is None:
            continue
        if pn:
            contract_map[pn] = normalized
        else:
            no_policy_contracts.append(normalized)

    all_contracts = list(contract_map.values()) + no_policy_contracts
    return all_contracts


# --- Summary 계산 (MCP 도구와 동일) ---

def calculate_summary(contracts):
    """계약 목록에서 summary 집계 (MCP 도구와 동일 로직)"""
    total_premium = 0
    monthly_premium = 0
    lump_sum_premium = 0
    total_contracts = 0
    active_contracts = 0
    lapsed_contracts = 0

    for c in contracts:
        premium = c.get("premium", 0) or 0
        total_premium += premium
        total_contracts += 1

        is_lump_sum = "일시납" in c.get("paymentPeriod", "")
        status_lower = c.get("status", "").lower()
        is_active = "정상" in status_lower or "유지" in status_lower

        if is_lump_sum:
            lump_sum_premium += premium
        elif is_active:
            monthly_premium += premium

        if is_active:
            active_contracts += 1
        elif any(k in status_lower for k in ("실효", "해지", "만기")):
            lapsed_contracts += 1

    return {
        "totalPremium": total_premium,
        "monthlyPremium": monthly_premium,
        "lumpSumPremium": lump_sum_premium,
        "totalContracts": total_contracts,
        "activeContracts": active_contracts,
        "lapsedContracts": lapsed_contracts
    }


# --- GT expected 파싱 ---

def parse_expected_numbers(expected_text):
    """GT expected 텍스트에서 건수, 보험료 숫자 추출"""
    result = {
        "건수": None,
        "월보험료": None,
        "일시납": None,
    }

    # 건수 추출: "N건", "총 N건"
    count_match = re.search(r'(?:총\s*)?(\d+)\s*건', expected_text)
    if count_match:
        result["건수"] = int(count_match.group(1))

    # 월보험료 추출: "월 N원", "월납 N원", "월 보험료 합계 N원"
    monthly_match = re.search(r'월\s*(?:보험료\s*)?(?:합계\s*)?([\d,]+)\s*원', expected_text)
    if monthly_match:
        result["월보험료"] = int(monthly_match.group(1).replace(",", ""))

    # 일시납 추출: "일시납 N원", "(일시납 N원 별도)"
    lump_match = re.search(r'일시납\s*([\d,]+)\s*원', expected_text)
    if lump_match:
        result["일시납"] = int(lump_match.group(1).replace(",", ""))

    return result


def extract_customer_name(case):
    """테스트 케이스에서 고객명 추출"""
    # gt_customer 필드 우선
    if case.get("gt_customer"):
        return case["gt_customer"]

    # query에서 추출 시도
    query = case.get("query", "")
    # "XXX 계약 현황", "XXX 보험료" 등 패턴
    m = re.match(r'^([가-힣a-zA-Z]+)', query)
    if m:
        return m.group(1)

    return None


# --- 대조 로직 ---

def reconcile_case(case, db):
    """단일 GT 케이스를 DB와 대조"""
    case_id = case["id"]
    expected_text = case.get("expected", "")
    customer_name = extract_customer_name(case)

    result = {
        "id": case_id,
        "type": case["type"],
        "query": case["query"],
        "customer_name": customer_name,
        "gt_expected": expected_text,
        "db_actual": {},
        "match": True,
        "mismatches": [],
        "suggested_expected": None
    }

    if not customer_name:
        result["match"] = None
        result["mismatches"].append("고객명 추출 불가")
        return result

    # GT expected에서 숫자 파싱
    gt_numbers = parse_expected_numbers(expected_text)

    # 숫자가 하나도 없으면 대조 불필요 (방향성 expected)
    if all(v is None for v in gt_numbers.values()):
        result["match"] = None
        result["mismatches"].append("GT expected에 비교 가능한 숫자 없음 (방향성 expected)")
        return result

    # DB에서 고객 조회
    customer = find_customer(db, customer_name)
    if not customer:
        result["match"] = False
        result["mismatches"].append(f"DB에서 '{customer_name}' 고객 미발견")
        return result

    # AR + CRS 병합 계약 수집
    contracts = merge_contracts(customer)
    summary = calculate_summary(contracts)

    result["db_actual"] = {
        "customer_found": True,
        "customer_db_name": customer.get("personal_info", {}).get("name", ""),
        "ar_count": sum(1 for c in contracts if c.get("source") == "AR"),
        "crs_count": sum(1 for c in contracts if c.get("source") == "CRS"),
        "merged_total": summary["totalContracts"],
        "monthly_premium": summary["monthlyPremium"],
        "lump_sum_premium": summary["lumpSumPremium"],
        "active_contracts": summary["activeContracts"],
        "lapsed_contracts": summary["lapsedContracts"]
    }

    # 대조
    mismatches = []

    # 건수 대조
    if gt_numbers["건수"] is not None:
        if gt_numbers["건수"] != summary["totalContracts"]:
            mismatches.append(
                f"건수: GT={gt_numbers['건수']}건 vs DB={summary['totalContracts']}건"
            )

    # 월보험료 대조
    if gt_numbers["월보험료"] is not None:
        if gt_numbers["월보험료"] != summary["monthlyPremium"]:
            mismatches.append(
                f"월보험료: GT={gt_numbers['월보험료']:,}원 vs DB={summary['monthlyPremium']:,}원"
            )

    # 일시납 대조
    if gt_numbers["일시납"] is not None:
        if gt_numbers["일시납"] != summary["lumpSumPremium"]:
            mismatches.append(
                f"일시납: GT={gt_numbers['일시납']:,}원 vs DB={summary['lumpSumPremium']:,}원"
            )

    if mismatches:
        result["match"] = False
        result["mismatches"] = mismatches
        # 갱신 제안 생성
        parts = []
        if summary["totalContracts"]:
            parts.append(f"{summary['totalContracts']}건")
        if summary["monthlyPremium"]:
            parts.append(f"월 {summary['monthlyPremium']:,}원")
        if summary["lumpSumPremium"]:
            parts.append(f"(일시납 {summary['lumpSumPremium']:,}원 별도)")
        result["suggested_expected"] = ", ".join(parts)

    return result


# --- 메인 ---

def main():
    print("=" * 70)
    print("  GT ↔ DB 대조 (gt_db_reconcile)")
    print("  GT 기준일: 2026-03-21 | 대조 시점: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 70)
    print()

    # GT 파일 로드
    if not os.path.exists(GT_FILE):
        print(f"[ERROR] GT 파일 없음: {GT_FILE}")
        sys.exit(1)

    with open(GT_FILE, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    cases = gt_data.get("test_cases", [])
    print(f"전체 테스트 케이스: {len(cases)}건")

    # Q4, Q6 유형 + expected에 숫자가 있는 케이스만 필터
    target_cases = [
        c for c in cases
        if c.get("type") in ("Q4", "Q6")
        and c.get("expected")
        and c.get("gt_customer")  # 고객명이 있어야 DB 조회 가능
    ]
    print(f"대조 대상 (Q4/Q6, 고객명 있음): {len(target_cases)}건")
    print()

    # DB 연결
    try:
        db = get_db()
        print("[DB] MongoDB 연결 성공")
    except Exception as e:
        print(f"[ERROR] MongoDB 연결 실패: {e}")
        sys.exit(1)

    # 대조 실행
    results = []
    match_count = 0
    mismatch_count = 0
    skip_count = 0

    for case in target_cases:
        result = reconcile_case(case, db)
        results.append(result)

        if result["match"] is True:
            match_count += 1
        elif result["match"] is False:
            mismatch_count += 1
        else:
            skip_count += 1

    # --- 콘솔 출력: 불일치 요약 ---
    print()
    print("=" * 70)
    print("  대조 결과 요약")
    print("=" * 70)
    print(f"  일치: {match_count}건 | 불일치: {mismatch_count}건 | 건너뜀: {skip_count}건")
    print()

    if mismatch_count > 0:
        print("-" * 70)
        print("  불일치 상세")
        print("-" * 70)
        print(f"  {'ID':<10} {'고객명':<10} {'불일치 내용':<50}")
        print("-" * 70)
        for r in results:
            if r["match"] is False:
                for m in r["mismatches"]:
                    print(f"  {r['id']:<10} {r.get('customer_name', ''):<10} {m}")
                if r.get("suggested_expected"):
                    print(f"  {'':10} {'':10} → 제안: {r['suggested_expected']}")
                print()

    if skip_count > 0:
        print("-" * 70)
        print("  건너뜀 상세")
        print("-" * 70)
        for r in results:
            if r["match"] is None:
                print(f"  {r['id']:<10} {r.get('customer_name', ''):<10} {r['mismatches'][0] if r['mismatches'] else ''}")

    # --- 일치 케이스도 간략 표시 ---
    if match_count > 0:
        print()
        print("-" * 70)
        print("  일치 케이스")
        print("-" * 70)
        for r in results:
            if r["match"] is True:
                db_info = r.get("db_actual", {})
                print(f"  {r['id']:<10} {r.get('customer_name', ''):<10} "
                      f"건수={db_info.get('merged_total', '?')}, "
                      f"월보험료={db_info.get('monthly_premium', 0):,}원")

    # --- JSON 결과 파일 저장 ---
    output = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "gt_file": GT_FILE,
        "gt_created": gt_data.get("_meta", {}).get("created", ""),
        "summary": {
            "total_compared": len(results),
            "match": match_count,
            "mismatch": mismatch_count,
            "skipped": skip_count
        },
        "results": results
    }

    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print()
    print(f"  결과 파일: {RESULT_FILE}")
    print("=" * 70)

    # 불일치가 있으면 exit code 1
    sys.exit(1 if mismatch_count > 0 else 0)


if __name__ == "__main__":
    main()

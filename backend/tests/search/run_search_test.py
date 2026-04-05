#!/usr/bin/env python3
"""AIMS 상세검색 자동화 테스트 (키워드 검색)

단일 파일로 모든 것을 포함:
- Part 1: 정답 생성기 (Ground Truth Generator)
- Part 2: 테스트 실행기
- Part 3: 검증기
- Part 4: AND/OR 정합성 검증
- Part 5: 페이지네이션 검증
- Part 6: 메인 실행 + 리포트 생성

실행: python backend/tests/search/run_search_test.py
필요: pymongo, httpx, Python 3.10+, Tailscale 연결
"""

import asyncio
import io
import math
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# Windows 콘솔 UTF-8 출력 강제
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import httpx
from pymongo import MongoClient

# ============================================================
# 설정
# ============================================================

MONGO_URI = "mongodb://100.110.215.65:27017"
MONGO_DB = "docupload"
SEARCH_API = "http://100.110.215.65:8100/webhook/smartsearch"
USER_ID = "69875e2b4c2149195032adc6"


# ============================================================
# Part 1: 정답 생성기 (Ground Truth Generator)
# ============================================================

def generate_test_cases(db, user_id: str) -> List[Dict[str, Any]]:
    """DB에서 문서를 읽어 테스트 케이스를 자동 생성.
    DB 조회 실패 시 해당 카테고리를 건너뛰고 나머지를 계속 생성한다.
    """
    test_cases: List[Dict[str, Any]] = []

    # --- 1. 파일명 Recall 테스트 ---
    # displayName에서 고객명 부분을 추출하여 검색어로 사용
    # 해당 문서가 결과에 포함되어야 함
    try:
        files = list(db.files.find(
            {"ownerId": user_id, "status": "completed", "displayName": {"$ne": None}},
            {"displayName": 1, "customerId": 1}
        ).limit(40))

        seen_names: set = set()
        for doc in files:
            name = doc["displayName"]
            # displayName에서 고객명 추출 (예: "류이화_AR_2026-02-20.pdf" → "류이화")
            customer_name = name.split("_")[0] if "_" in name else name.split(".")[0]
            if len(customer_name) >= 2 and customer_name not in seen_names:
                seen_names.add(customer_name)
                test_cases.append({
                    "id": f"FNAME-{len(test_cases)+1:03d}",
                    "category": "filename_recall",
                    "query": customer_name,
                    "expected_doc_id": str(doc["_id"]),
                    "description": f"'{customer_name}' 검색 시 '{name}' 포함 확인"
                })
    except Exception as e:
        print(f"  [경고] 파일명 Recall 테스트 케이스 생성 실패: {e}")

    # --- 2. 요약 키워드 Recall 테스트 ---
    # meta.summary에서 특징적 키워드를 추출하여 검색
    try:
        files = list(db.files.find(
            {"ownerId": user_id, "status": "completed",
             "meta.summary": {"$exists": True, "$ne": ""}},
            {"displayName": 1, "meta.summary": 1}
        ).limit(20))

        keywords_seen: set = set()
        target_keywords = ["보유계약", "보장내용", "연례", "보험금", "증권", "약관"]
        for doc in files:
            summary = doc.get("meta", {}).get("summary", "")
            if not summary or len(summary) < 20:
                continue
            for word in target_keywords:
                if word in summary and word not in keywords_seen:
                    keywords_seen.add(word)
                    test_cases.append({
                        "id": f"SUMRY-{len(test_cases)+1:03d}",
                        "category": "summary_recall",
                        "query": word,
                        "expected_doc_id": str(doc["_id"]),
                        "description": f"'{word}' 검색 시 요약에 포함된 문서 확인"
                    })
                    break
    except Exception as e:
        print(f"  [경고] 요약 키워드 Recall 테스트 케이스 생성 실패: {e}")

    # --- 3. 고객 필터 정합성 테스트 ---
    # 특정 customerId로 검색 → 결과가 모두 해당 고객 소유인지
    try:
        customer_ids = db.files.distinct(
            "customerId",
            {"ownerId": user_id, "status": "completed", "customerId": {"$ne": None}}
        )[:10]
        for cid in customer_ids:
            test_cases.append({
                "id": f"CUST-{len(test_cases)+1:03d}",
                "category": "customer_filter",
                "query": "보험",
                "customer_id": str(cid),
                "description": f"고객 {str(cid)[-6:]} 필터 시 해당 고객 문서만 반환"
            })
    except Exception as e:
        print(f"  [경고] 고객 필터 테스트 케이스 생성 실패: {e}")

    # --- 4. 특수문자/경계값 테스트 (DB 조회 불필요) ---
    edge_cases = [
        ("EDGE-EMPTY", "", "빈 쿼리"),
        ("EDGE-SPACE", "   ", "공백만 쿼리"),
        ("EDGE-SPECIAL1", "(주)삼성", "괄호 포함"),
        ("EDGE-SPECIAL2", ".*", "regex 메타문자"),
        ("EDGE-SPECIAL3", "[a-z]+", "regex 클래스"),
        ("EDGE-SPECIAL4", "\\d+", "regex 이스케이프"),
        ("EDGE-STOPWORD", "관련 에서 의", "불용어만 쿼리"),
        ("EDGE-LONG", "보험 " * 100, "매우 긴 쿼리"),
        ("EDGE-DUP", "보험 보험 보험", "중복 키워드"),
        ("EDGE-JAMO", "ㄱ", "한글 자모"),
    ]
    for eid, query, desc in edge_cases:
        test_cases.append({
            "id": eid,
            "category": "edge_case",
            "query": query,
            "description": desc
        })

    # --- 5. AND/OR 정합성 테스트 ---
    # 실제 DB에서 displayName을 기반으로 2단어 쿼리를 생성
    # displayName 형식: "[고객명] 문서내용 날짜.확장자" 또는 "고객명 문서내용 날짜.확장자"
    try:
        import re as _re
        and_or_files = list(db.files.find(
            {"ownerId": user_id, "status": "completed", "displayName": {"$ne": None}},
            {"displayName": 1}
        ).limit(200))

        and_or_count = 0
        and_or_seen: set = set()
        for doc in and_or_files:
            if and_or_count >= 5:
                break
            name = doc["displayName"]
            # 확장자 제거
            name_no_ext = name.rsplit(".", 1)[0] if "." in name else name
            # 공백으로 분리하여 의미 있는 단어 2개 추출
            # [대괄호] 제거 후 분리
            cleaned = _re.sub(r'[\[\]]', '', name_no_ext)
            words = [w for w in cleaned.split() if len(w) >= 2 and not _re.match(r'^\d', w)]
            if len(words) >= 2:
                # 첫 번째 단어(고객명) + 두 번째 단어(문서 유형)
                customer_part = words[0]
                doc_type_part = words[1]
                if customer_part not in and_or_seen:
                    and_or_seen.add(customer_part)
                    query = f"{customer_part} {doc_type_part}"
                    test_cases.append({
                        "id": f"ANDOR-{len(test_cases)+1:03d}",
                        "category": "and_or_consistency",
                        "query": query,
                        "description": f"'{query}' AND/OR 정합성: AND 결과 ⊆ OR 결과"
                    })
                    and_or_count += 1
    except Exception as e:
        print(f"  [경고] AND/OR 정합성 테스트 케이스 생성 실패: {e}")

    # --- 6. 페이지네이션 테스트 (DB 조회 불필요) ---
    page_cases = [
        ("PAGE-0", 0, 20, "page=0 경계 (1로 클램핑)"),
        ("PAGE-NEG", -1, 20, "page=-1 경계 (1로 클램핑)"),
        ("PAGE-SIZE0", 1, 0, "page_size=0 경계 (1로 클램핑)"),
        ("PAGE-SIZE200", 1, 200, "page_size=200 (100 제한 확인)"),
        ("PAGE-CONSIST", 1, 10, "페이지 일관성: p1 total == p2 total"),
    ]
    for pid, page, psize, desc in page_cases:
        test_cases.append({
            "id": pid,
            "category": "pagination",
            "query": "보험",
            "page": page,
            "page_size": psize,
            "description": desc
        })

    return test_cases


# ============================================================
# Part 2: 테스트 실행기
# ============================================================

async def run_keyword_search(
    query: str,
    user_id: str = USER_ID,
    mode: str = "OR",
    customer_id: str = "",
    page: int = 1,
    page_size: int = 20,
) -> Tuple[int, Any, float]:
    """키워드 검색 API 호출.
    Returns: (status_code, response_body, elapsed_seconds)
    """
    async with httpx.AsyncClient(timeout=30) as client:
        payload = {
            "query": query,
            "user_id": user_id,
            "mode": mode,
            "customer_id": customer_id,
            "page": page,
            "page_size": page_size,
        }
        start = time.time()
        try:
            resp = await client.post(SEARCH_API, json=payload)
            elapsed = time.time() - start
            body = resp.json() if resp.status_code == 200 else {}
            return resp.status_code, body, elapsed
        except Exception as e:
            elapsed = time.time() - start
            return 0, {"error": str(e)}, elapsed


# ============================================================
# Part 3: 검증기
# ============================================================

def _extract_results(body: Any) -> List[Dict]:
    """API 응답에서 results 리스트를 추출.
    빈 쿼리/공백 쿼리는 list([])를 반환하고,
    키워드 쿼리는 dict({"results": [...]})를 반환하므로 양쪽 모두 처리.
    """
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        return body.get("results", [])
    return []


async def verify_result(
    test_case: Dict[str, Any],
    status_code: int,
    body: Any,
    elapsed: float,
) -> List[str]:
    """테스트 케이스 검증 → 실패 사유 리스트 (빈 리스트 = PASS)"""
    category = test_case["category"]
    failures: List[str] = []

    # 공통: 에러 없이 응답 (edge case의 빈/공백 쿼리는 200 + 빈 리스트 허용)
    if status_code != 200:
        failures.append(f"HTTP {status_code}")
        return failures

    # 공통: 응답 시간
    if elapsed > 5.0:
        failures.append(f"응답 시간 {elapsed:.1f}초 > 5초")

    results_list = _extract_results(body)

    if category == "filename_recall":
        expected_id = test_case["expected_doc_id"]
        result_ids = [str(r.get("_id", "")) for r in results_list]
        if expected_id not in result_ids:
            failures.append(
                f"기대 문서 ...{expected_id[-8:]} 미포함 (결과 {len(result_ids)}건)"
            )

    elif category == "summary_recall":
        expected_id = test_case["expected_doc_id"]
        # 범용 키워드는 결과가 많으므로 전체 페이지를 순회하여 확인
        all_ids = set(str(r.get("_id", "")) for r in results_list)
        total = body.get("total", len(results_list)) if isinstance(body, dict) else len(results_list)
        if expected_id not in all_ids and total > len(results_list):
            # 첫 페이지에 없으면 나머지 페이지 순회
            page = 2
            while (page - 1) * 20 < total:
                _, more, _ = await run_keyword_search(test_case["query"], page=page)
                for r in _extract_results(more):
                    all_ids.add(str(r.get("_id", "")))
                if expected_id in all_ids:
                    break
                page += 1
        if expected_id not in all_ids:
            failures.append(f"기대 문서 ...{expected_id[-8:]} 미포함 (전체 {total}건 검색)")

    elif category == "customer_filter":
        customer_id = test_case["customer_id"]
        for r in results_list:
            # customer_relation.customer_id 또는 customerId 필드 확인
            doc_cid = str(r.get("customerId", ""))
            if doc_cid and doc_cid != customer_id:
                failures.append(f"다른 고객 문서 포함: ...{doc_cid[-8:]}")
                break

    elif category == "edge_case":
        # 특수문자/경계값: 에러 없이 응답만 확인 (이미 status_code 체크)
        pass

    # and_or_consistency, pagination 은 별도 함수에서 처리
    # 여기서는 skip

    # --- 불변 조건: ownerId 일치 ---
    for r in results_list:
        owner = r.get("ownerId")
        if owner and str(owner) != USER_ID:
            failures.append(f"ownerId 불일치: {owner}")
            break

    return failures


# ============================================================
# Part 4: AND/OR 정합성 검증
# ============================================================

async def verify_and_or(test_case: Dict[str, Any]) -> List[str]:
    """AND 결과 ⊆ OR 결과 검증.
    AND 모드의 모든 문서 ID가 OR 모드 결과에도 포함되어야 한다.
    참고: 기본 page_size=20이므로 전체 목록 비교를 위해 큰 page_size 사용.
    """
    query = test_case["query"]
    failures: List[str] = []

    # OR 결과를 전체 페이지 순회하여 수집 (AND ⊆ OR 수학적 검증)
    or_ids = set()
    page = 1
    while True:
        _, or_body, _ = await run_keyword_search(query, mode="OR", page=page, page_size=100)
        or_results = _extract_results(or_body)
        for r in or_results:
            or_ids.add(str(r.get("_id", "")))
        or_total = or_body.get("total", 0) if isinstance(or_body, dict) else 0
        if page * 100 >= or_total or not or_results:
            break
        page += 1

    _, and_body, and_elapsed = await run_keyword_search(query, mode="AND", page_size=100)
    and_results = _extract_results(and_body)
    and_ids = set(str(r.get("_id", "")) for r in and_results)

    # AND 결과는 OR 결과의 부분집합이어야 함
    if and_ids and not and_ids.issubset(or_ids):
        diff = and_ids - or_ids
        failures.append(f"AND 결과가 OR에 미포함: {len(diff)}건")

    # AND 결과 수 <= OR 결과 수
    or_total = or_body.get("total", len(or_results)) if isinstance(or_body, dict) else len(or_results)
    and_total = and_body.get("total", len(and_results)) if isinstance(and_body, dict) else len(and_results)
    if and_total > or_total:
        failures.append(f"AND total({and_total}) > OR total({or_total})")

    # 응답 시간 (AND만 체크 — OR은 페이지 순회하므로 누적 시간 무의미)
    if and_elapsed > 5.0:
        failures.append(f"AND 응답 시간 {and_elapsed:.1f}초 > 5초")

    return failures


# ============================================================
# Part 5: 페이지네이션 검증
# ============================================================

async def verify_pagination(test_case: Dict[str, Any]) -> List[str]:
    """페이지네이션 경계값 검증"""
    failures: List[str] = []
    query = test_case["query"]
    page = test_case.get("page", 1)
    page_size = test_case.get("page_size", 20)
    test_id = test_case["id"]

    if test_id == "PAGE-CONSIST":
        # 두 페이지의 total이 일치하는지
        _, r1, _ = await run_keyword_search(query, page=1, page_size=10)
        _, r2, _ = await run_keyword_search(query, page=2, page_size=10)

        t1 = r1.get("total", -1) if isinstance(r1, dict) else -1
        t2 = r2.get("total", -1) if isinstance(r2, dict) else -1
        if t1 != t2:
            failures.append(f"total 불일치: page1={t1}, page2={t2}")

        # 중복 문서 확인
        ids1 = set(str(r.get("_id", "")) for r in _extract_results(r1))
        ids2 = set(str(r.get("_id", "")) for r in _extract_results(r2))
        overlap = ids1 & ids2
        if overlap:
            failures.append(f"페이지 간 중복: {len(overlap)}건")

    else:
        status, body, elapsed = await run_keyword_search(
            query, page=page, page_size=page_size
        )

        if status != 200:
            failures.append(f"HTTP {status}")
            return failures

        if elapsed > 5.0:
            failures.append(f"응답 시간 {elapsed:.1f}초 > 5초")

        results_list = _extract_results(body)

        # page_size=200 → 서버에서 100으로 클램핑
        if test_id == "PAGE-SIZE200":
            actual_size = len(results_list)
            if actual_size > 100:
                failures.append(f"page_size 100 초과: {actual_size}건")
            # 응답의 page_size도 100으로 클램핑되었는지 확인
            resp_page_size = body.get("page_size", -1) if isinstance(body, dict) else -1
            if resp_page_size > 100:
                failures.append(f"응답 page_size 100 초과: {resp_page_size}")

        # page=0, page=-1 → 서버에서 1로 클램핑
        if test_id in ("PAGE-0", "PAGE-NEG"):
            resp_page = body.get("page", -1) if isinstance(body, dict) else -1
            if resp_page not in (-1, 1):
                failures.append(f"page 클램핑 실패: 응답 page={resp_page}")

        # page_size=0 → 서버에서 1로 클램핑
        if test_id == "PAGE-SIZE0":
            resp_page_size = body.get("page_size", -1) if isinstance(body, dict) else -1
            if resp_page_size not in (-1, 1):
                failures.append(f"page_size 클램핑 실패: 응답 page_size={resp_page_size}")

    return failures


# ============================================================
# Part 6: 메인 실행 + 리포트 생성
# ============================================================

async def main():
    print("=" * 70)
    print("  AIMS 상세검색 자동화 테스트 (키워드 검색)")
    print(f"  실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  대상 사용자: {USER_ID}")
    print(f"  API: {SEARCH_API}")
    print("=" * 70)

    # DB 연결
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]

    # 사전 점검: DB 연결 확인
    try:
        doc_count = db.files.count_documents(
            {"ownerId": USER_ID, "status": "completed"}
        )
        print(f"\n  DB 연결 확인: completed 문서 {doc_count}건")
    except Exception as e:
        print(f"\n  [오류] DB 연결 실패: {e}")
        client.close()
        return False

    # 사전 점검: API 연결 확인
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            resp = await hc.post(SEARCH_API, json={
                "query": "테스트", "user_id": USER_ID
            })
            print(f"  API 연결 확인: HTTP {resp.status_code}")
    except Exception as e:
        print(f"\n  [오류] API 연결 실패: {e}")
        client.close()
        return False

    # 테스트 케이스 생성
    print("\n[1/4] 테스트 케이스 생성 중...")
    test_cases = generate_test_cases(db, USER_ID)
    print(f"  → {len(test_cases)}건 생성 완료")

    # 카테고리별 건수 출력
    cat_counts: Dict[str, int] = {}
    for tc in test_cases:
        cat = tc["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    for cat, cnt in cat_counts.items():
        print(f"    - {cat}: {cnt}건")

    # 실행
    print("\n[2/4] 키워드 검색 테스트 실행 중...")
    results: List[Dict[str, Any]] = []

    for i, tc in enumerate(test_cases):
        category = tc["category"]

        if category == "and_or_consistency":
            failures = await verify_and_or(tc)
        elif category == "pagination":
            failures = await verify_pagination(tc)
        else:
            status, body, elapsed = await run_keyword_search(
                tc["query"],
                customer_id=tc.get("customer_id", ""),
                page=tc.get("page", 1),
                page_size=tc.get("page_size", 20),
            )
            failures = await verify_result(tc, status, body, elapsed)

        passed = len(failures) == 0
        results.append({
            "test_case": tc,
            "passed": passed,
            "failures": failures,
        })

        status_mark = "PASS" if passed else "FAIL"
        print(f"  [{i+1:3d}/{len(test_cases)}] {status_mark} {tc['id']}: {tc['description']}")
        if failures:
            for f in failures:
                print(f"        -> {f}")

    # 리포트
    print("\n" + "=" * 70)
    print("  테스트 결과 리포트")
    print("=" * 70)

    total = len(results)
    passed_count = sum(1 for r in results if r["passed"])
    failed_count = total - passed_count

    # 카테고리별 집계
    categories: Dict[str, Dict[str, int]] = {}
    for r in results:
        cat = r["test_case"]["category"]
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0, "failed": 0}
        categories[cat]["total"] += 1
        if r["passed"]:
            categories[cat]["passed"] += 1
        else:
            categories[cat]["failed"] += 1

    print(f"\n  총 테스트: {total}건")
    print(f"  PASS: {passed_count}건 ({passed_count/total*100:.1f}%)")
    print(f"  FAIL: {failed_count}건 ({failed_count/total*100:.1f}%)")

    print(f"\n  {'카테고리':<25} {'총':>4} {'PASS':>6} {'FAIL':>6}")
    print(f"  {'-'*25} {'-'*4} {'-'*6} {'-'*6}")
    for cat, counts in categories.items():
        print(f"  {cat:<25} {counts['total']:>4} {counts['passed']:>6} {counts['failed']:>6}")

    if failed_count > 0:
        print(f"\n  실패 상세:")
        for r in results:
            if not r["passed"]:
                tc = r["test_case"]
                print(f"    [{tc['id']}] {tc['description']}")
                for f in r["failures"]:
                    print(f"      -> {f}")
    else:
        print(f"\n  전체 PASS — 키워드 검색 신뢰도 확보")

    print("\n" + "=" * 70)

    # 리포트를 파일로도 저장
    report_path = f"/d/tmp/search_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(f"AIMS 상세검색 테스트 리포트\n")
            f.write(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"대상: {USER_ID}\n")
            f.write(f"API: {SEARCH_API}\n")
            f.write(f"총: {total}, PASS: {passed_count}, FAIL: {failed_count}\n")
            f.write(f"\n{'='*60}\n카테고리별 집계\n{'='*60}\n")
            for cat, counts in categories.items():
                f.write(f"  {cat:<25} 총:{counts['total']} PASS:{counts['passed']} FAIL:{counts['failed']}\n")
            f.write(f"\n{'='*60}\n상세 결과\n{'='*60}\n")
            for r in results:
                tc = r["test_case"]
                status = "PASS" if r["passed"] else "FAIL"
                f.write(f"[{status}] {tc['id']}: {tc['description']}\n")
                if tc.get("query"):
                    f.write(f"  query: {tc['query'][:80]}\n")
                for fail in r["failures"]:
                    f.write(f"  -> {fail}\n")
        print(f"  리포트 저장: {report_path}")
    except Exception as e:
        print(f"  [경고] 리포트 파일 저장 실패: {e} (콘솔 출력은 정상)")

    client.close()
    return failed_count == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)

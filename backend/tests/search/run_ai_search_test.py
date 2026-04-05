#!/usr/bin/env python3
"""AIMS AI 검색(시맨틱/벡터) 자동화 테스트

단일 파일로 모든 것을 포함:
- Part 1: 정답 생성기 (Ground Truth Generator)
- Part 2: 테스트 실행기 (API 호출)
- Part 3: 검증기 (카테고리별 PASS/FAIL)
- Part 4: 메인 실행 + 리포트 생성

테스트 카테고리:
1. 최소 포함 검증 (Minimum Inclusion) — DB displayName 키워드 → 상위 20건에 포함
2. 순위 안정성 (Stability) — 동일 쿼리 3회 반복 → Jaccard >= 0.6
3. 교차 검증 (Cross-validation) — 키워드 검색 vs AI 검색 겹침 >= 1건
4. 관련성 역검증 (Negative) — 무의미 쿼리 → 결과 0건 또는 저점수
5. 응답 구조 검증 — 필수 필드 존재, score 범위
6. 스코어 분포 검증 — 상위 5건 점수 >= 0.3, 점진적 감소

실행: PYTHONIOENCODING=utf-8 python backend/tests/search/run_ai_search_test.py
필요: pymongo, httpx, Python 3.10+, Tailscale 연결
"""

import asyncio
import io
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

# Windows 콘솔 UTF-8 출력 강제 (파이프 리다이렉트 시에도 안전하게)
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

import httpx
from pymongo import MongoClient

# ============================================================
# 설정
# ============================================================

MONGO_URI = "mongodb://100.110.215.65:27017"
MONGO_DB = "docupload"
# aims_rag_api 직접 호출 (Docker, FastAPI)
AI_SEARCH_API = "http://100.110.215.65:8000/search"
# 키워드 검색 (교차 검증용)
KEYWORD_SEARCH_API = "http://100.110.215.65:8100/webhook/smartsearch"
# API 인증 키 (환경변수 RAG_API_KEY 필수)
RAG_API_KEY = os.getenv("RAG_API_KEY", "")
if not RAG_API_KEY:
    # .env.shared에서 로드 시도 (서버/로컬 양쪽 경로)
    for _env_path in [
        os.path.expanduser("~/aims/.env.shared"),       # tars 서버
        os.path.join("D:\\aims", ".env.shared"),          # Windows 로컬 (있을 경우)
    ]:
        if os.path.exists(_env_path):
            with open(_env_path, encoding="utf-8") as _f:
                for _line in _f:
                    if _line.startswith("RAG_API_KEY="):
                        RAG_API_KEY = _line.strip().split("=", 1)[1]
                        break
            if RAG_API_KEY:
                break
if not RAG_API_KEY:
    print("[오류] RAG_API_KEY 환경변수가 설정되지 않았습니다.")
    print("  실행 방법: RAG_API_KEY=<키값> python backend/tests/search/run_ai_search_test.py")
    sys.exit(1)
USER_ID = "69875e2b4c2149195032adc6"

# AI 검색은 비결정론적이므로 PASS 기준을 관대하게 설정
TOP_K_INCLUSION = 20  # 최소 포함 검증 시 상위 N건
STABILITY_RUNS = 3    # 안정성 검증 반복 횟수
STABILITY_TOP_K = 5   # 안정성 검증 시 비교할 상위 N건
STABILITY_JACCARD_THRESHOLD = 0.6  # Jaccard 유사도 최소값
NEGATIVE_SCORE_THRESHOLD = 0.3  # 역검증 시 "낮은 점수" 기준


# ============================================================
# Part 1: 정답 생성기 (Ground Truth Generator)
# ============================================================

def generate_test_cases(db, user_id: str, embedded_doc_ids: Set[str] = None) -> List[Dict[str, Any]]:
    """DB에서 문서를 읽어 테스트 케이스를 자동 생성.
    embedded_doc_ids: 부트스트랩으로 확보한 Qdrant 임베딩 doc_id 집합 (minimum_inclusion용)
    """
    test_cases: List[Dict[str, Any]] = []

    # --- 1. 최소 포함 검증 (Minimum Inclusion) ---
    # AI 검색은 Qdrant 벡터 기반이므로 임베딩된 문서만 대상으로 해야 함
    # 부트스트랩: 사전에 AI 검색으로 확보한 doc_id 중 DB displayName에 키워드가 있는 문서 선별
    try:
        if embedded_doc_ids:
            from bson import ObjectId
            # 임베딩된 doc_id들의 displayName을 DB에서 조회
            oid_list = []
            for did in embedded_doc_ids:
                try:
                    oid_list.append(ObjectId(did))
                except Exception:
                    pass
            embedded_files = list(db.files.find(
                {"_id": {"$in": oid_list}, "displayName": {"$ne": None}},
                {"displayName": 1, "customerId": 1}
            ))
        else:
            embedded_files = []

        # 키워드 매칭
        target_keywords = [
            "진단서", "증권", "약관", "보험금", "청구서",
            "계약", "보장", "연례", "통지서", "보유계약",
            "보험", "분석", "가입",
        ]
        keyword_docs: Dict[str, List[Dict]] = {}
        for doc in embedded_files:
            name = doc["displayName"]
            for kw in target_keywords:
                if kw in name:
                    if kw not in keyword_docs:
                        keyword_docs[kw] = []
                    keyword_docs[kw].append(doc)
                    break

        inclusion_count = 0
        for kw, docs in keyword_docs.items():
            if inclusion_count >= 15:
                break
            doc = docs[0]
            test_cases.append({
                "id": f"INCL-{len(test_cases)+1:03d}",
                "category": "minimum_inclusion",
                "query": kw,
                "expected_doc_id": str(doc["_id"]),
                "expected_name": doc["displayName"],
                "description": f"'{kw}' AI 검색 → 상위 {TOP_K_INCLUSION}건에 임베딩된 문서 포함"
            })
            inclusion_count += 1

        # 고객명으로도 검색 테스트 (임베딩된 문서의 displayName에서 추출)
        seen_names: set = set()
        for doc in embedded_files:
            if inclusion_count >= 20:
                break
            name = doc["displayName"]
            # [고객명] 또는 고객명_ 패턴에서 추출
            import re as _re
            bracket_match = _re.search(r'\[([^\]]+)\]', name)
            if bracket_match:
                customer_name = bracket_match.group(1)
            elif "_" in name:
                customer_name = name.split("_")[0]
            else:
                continue
            if len(customer_name) >= 2 and customer_name not in seen_names:
                if customer_name[0].isdigit():
                    continue
                seen_names.add(customer_name)
                test_cases.append({
                    "id": f"INCL-{len(test_cases)+1:03d}",
                    "category": "minimum_inclusion",
                    "query": customer_name,
                    "expected_doc_id": str(doc["_id"]),
                    "expected_name": doc["displayName"],
                    "description": f"'{customer_name}' AI 검색 → 상위 {TOP_K_INCLUSION}건에 관련 문서 포함"
                })
                inclusion_count += 1

    except Exception as e:
        print(f"  [경고] 최소 포함 검증 테스트 케이스 생성 실패: {e}")

    # --- 2. 순위 안정성 (Stability) ---
    stability_queries = ["보험 계약", "진단서", "보장 내용", "연례 보고서", "보험금 청구"]
    for i, q in enumerate(stability_queries):
        test_cases.append({
            "id": f"STAB-{len(test_cases)+1:03d}",
            "category": "stability",
            "query": q,
            "description": f"'{q}' 3회 반복 → 상위 {STABILITY_TOP_K}건 Jaccard >= {STABILITY_JACCARD_THRESHOLD}"
        })

    # --- 3. 교차 검증 (Cross-validation) ---
    # 키워드와 AI 검색은 근본적으로 다른 방식이므로 넓은 범위에서 비교
    cross_queries = ["보험", "계약", "진단서", "보장", "증권"]
    for q in cross_queries:
        test_cases.append({
            "id": f"CROSS-{len(test_cases)+1:03d}",
            "category": "cross_validation",
            "query": q,
            "description": f"'{q}' 키워드 상위 20건 vs AI 상위 20건 → 겹침 >= 1건"
        })

    # --- 4. 관련성 역검증 (Negative) ---
    # 벡터 검색 특성: 한글 쿼리는 임베딩 공간에서 유사도가 자연스럽게 높을 수 있음
    # strict=True: 영문/특수문자 (결과 0건 또는 score < 0.3 기대)
    # strict=False: 한글 무관 주제 (결과가 있어도 score 패턴만 확인)
    negative_queries = [
        ("xyzabc123", "완전 무의미 문자열", True),
        ("quantum entanglement spaceship", "영문 무관 주제", True),
        ("!@#$%^&*()", "특수문자만", True),
        ("asdfghjkl", "무작위 키보드 입력", True),
        ("블록체인 가상화폐 비트코인", "보험과 무관한 한글 주제", False),
    ]
    for q, desc, strict in negative_queries:
        test_cases.append({
            "id": f"NEG-{len(test_cases)+1:03d}",
            "category": "negative",
            "query": q,
            "strict": strict,
            "description": f"역검증: '{q}' → {'저점수 기대' if strict else '응답 정상 확인'} ({desc})"
        })

    # --- 5. 응답 구조 검증 ---
    structure_queries = ["보험", "계약 내용", "진단서 확인", "고객 정보", "약관"]
    for q in structure_queries:
        test_cases.append({
            "id": f"STRUCT-{len(test_cases)+1:03d}",
            "category": "response_structure",
            "query": q,
            "description": f"'{q}' 응답 구조: 필수 필드 존재, score 범위 0~1"
        })

    # --- 6. 스코어 분포 검증 ---
    score_queries = ["보험 보장 내용", "진단서 청구", "계약 증권", "연례 보고서", "보험금 지급"]
    for q in score_queries:
        test_cases.append({
            "id": f"SCORE-{len(test_cases)+1:03d}",
            "category": "score_distribution",
            "query": q,
            "description": f"'{q}' 상위 5건 점수 >= 0.3, 점진적 감소"
        })

    return test_cases


# ============================================================
# Part 2: 테스트 실행기
# ============================================================

async def run_ai_search(
    query: str,
    user_id: str = USER_ID,
    top_k: int = 20,
    customer_id: str = "",
) -> Tuple[int, Any, float]:
    """AI(시맨틱) 검색 API 호출.
    Returns: (status_code, response_body, elapsed_seconds)
    """
    async with httpx.AsyncClient(timeout=60) as client:
        payload: Dict[str, Any] = {
            "query": query,
            "search_mode": "semantic",
            "user_id": user_id,
            "top_k": top_k,
        }
        if customer_id:
            payload["customer_id"] = customer_id
        start = time.time()
        try:
            resp = await client.post(
                AI_SEARCH_API,
                json=payload,
                headers={"x-api-key": RAG_API_KEY},
            )
            elapsed = time.time() - start
            body = resp.json() if resp.status_code in (200, 402, 403, 429) else {}
            return resp.status_code, body, elapsed
        except Exception as e:
            elapsed = time.time() - start
            return 0, {"error": str(e)}, elapsed


async def run_keyword_search(
    query: str,
    user_id: str = USER_ID,
    page_size: int = 20,
) -> Tuple[int, Any, float]:
    """키워드 검색 API 호출 (교차 검증용).
    Returns: (status_code, response_body, elapsed_seconds)
    """
    async with httpx.AsyncClient(timeout=30) as client:
        payload = {
            "query": query,
            "user_id": user_id,
            "mode": "OR",
            "page": 1,
            "page_size": page_size,
        }
        start = time.time()
        try:
            resp = await client.post(KEYWORD_SEARCH_API, json=payload)
            elapsed = time.time() - start
            body = resp.json() if resp.status_code == 200 else {}
            return resp.status_code, body, elapsed
        except Exception as e:
            elapsed = time.time() - start
            return 0, {"error": str(e)}, elapsed


def _extract_ai_results(body: Any) -> List[Dict]:
    """AI 검색 응답에서 search_results 리스트를 추출."""
    if isinstance(body, dict):
        return body.get("search_results", [])
    return []


def _extract_doc_ids(results: List[Dict]) -> List[str]:
    """AI 검색 결과에서 doc_id 리스트를 추출.
    결과 항목 구조: {doc_id, score, payload: {doc_id, ...}, final_score, ...}
    """
    ids = []
    for r in results:
        # 최상위 doc_id 또는 payload 내 doc_id
        doc_id = r.get("doc_id") or (r.get("payload", {}) or {}).get("doc_id")
        if doc_id:
            ids.append(str(doc_id))
    return ids


def _extract_keyword_doc_ids(body: Any) -> List[str]:
    """키워드 검색 응답에서 doc_id 리스트를 추출."""
    results = []
    if isinstance(body, dict):
        results = body.get("results", [])
    elif isinstance(body, list):
        results = body
    return [str(r.get("_id", "")) for r in results if r.get("_id")]


def _get_scores(results: List[Dict]) -> List[float]:
    """AI 검색 결과에서 final_score 리스트를 추출."""
    scores = []
    for r in results:
        # final_score > score > 0.0
        s = r.get("final_score") or r.get("score") or 0.0
        scores.append(float(s))
    return scores


# ============================================================
# Part 3: 검증기
# ============================================================

async def verify_minimum_inclusion(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """최소 포함 검증: DB 문서가 AI 검색 상위 N건에 포함되는지."""
    failures: List[str] = []
    meta: Dict[str, Any] = {}

    status, body, elapsed = await run_ai_search(tc["query"], top_k=TOP_K_INCLUSION)
    meta["elapsed"] = elapsed

    if status != 200:
        failures.append(f"HTTP {status}")
        return failures, meta

    # AI 검색은 LLM 답변 생성을 포함하므로 60초까지 허용
    if elapsed > 60.0:
        failures.append(f"응답 시간 {elapsed:.1f}초 > 60초")

    results = _extract_ai_results(body)
    doc_ids = _extract_doc_ids(results)
    meta["result_count"] = len(doc_ids)

    expected = tc.get("expected_doc_id")
    if expected:
        # doc_id는 payload 내에 있음 — 전체 결과에서 검색
        if expected not in doc_ids:
            failures.append(
                f"기대 문서 ...{expected[-8:]} 미포함 (결과 {len(doc_ids)}건)"
            )

    return failures, meta


async def verify_stability(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """순위 안정성: 동일 쿼리 3회 반복, 상위 K건 Jaccard >= 임계값."""
    failures: List[str] = []
    meta: Dict[str, Any] = {}
    all_top_ids: List[Set[str]] = []

    for run_idx in range(STABILITY_RUNS):
        status, body, elapsed = await run_ai_search(tc["query"], top_k=STABILITY_TOP_K)
        if status != 200:
            failures.append(f"Run {run_idx+1}: HTTP {status}")
            return failures, meta
        results = _extract_ai_results(body)
        doc_ids = _extract_doc_ids(results)[:STABILITY_TOP_K]
        all_top_ids.append(set(doc_ids))
        # 요청 간 간격을 두어 rate limit 방지
        if run_idx < STABILITY_RUNS - 1:
            await asyncio.sleep(1.0)

    # 모든 쌍의 Jaccard 유사도 계산
    jaccard_scores = []
    for i in range(len(all_top_ids)):
        for j in range(i + 1, len(all_top_ids)):
            a, b = all_top_ids[i], all_top_ids[j]
            if not a and not b:
                jaccard = 1.0
            elif not a or not b:
                jaccard = 0.0
            else:
                jaccard = len(a & b) / len(a | b)
            jaccard_scores.append(jaccard)

    avg_jaccard = sum(jaccard_scores) / len(jaccard_scores) if jaccard_scores else 0.0
    meta["avg_jaccard"] = round(avg_jaccard, 3)
    meta["jaccard_scores"] = [round(j, 3) for j in jaccard_scores]

    if avg_jaccard < STABILITY_JACCARD_THRESHOLD:
        failures.append(
            f"Jaccard 평균 {avg_jaccard:.3f} < {STABILITY_JACCARD_THRESHOLD} "
            f"(개별: {meta['jaccard_scores']})"
        )

    return failures, meta


async def verify_cross_validation(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """교차 검증: 키워드 상위 20건과 AI 상위 20건에서 겹치는 문서 >= 1건.
    키워드 검색은 files._id, AI 검색은 doc_id(=files._id)를 사용하므로 직접 비교 가능.
    """
    failures: List[str] = []
    meta: Dict[str, Any] = {}

    # 키워드 검색 (넓은 범위)
    kw_status, kw_body, _ = await run_keyword_search(tc["query"], page_size=20)
    if kw_status != 200:
        failures.append(f"키워드 검색 HTTP {kw_status}")
        return failures, meta
    kw_ids = set(_extract_keyword_doc_ids(kw_body))
    meta["keyword_count"] = len(kw_ids)

    # AI 검색 (넓은 범위)
    ai_status, ai_body, elapsed = await run_ai_search(tc["query"], top_k=20)
    meta["elapsed"] = elapsed
    if ai_status != 200:
        failures.append(f"AI 검색 HTTP {ai_status}")
        return failures, meta
    ai_ids = set(_extract_doc_ids(_extract_ai_results(ai_body)))
    meta["ai_count"] = len(ai_ids)

    overlap = kw_ids & ai_ids
    meta["overlap_count"] = len(overlap)

    if len(overlap) < 1 and kw_ids and ai_ids:
        failures.append(
            f"교차 문서 0건 (키워드 {len(kw_ids)}건, AI {len(ai_ids)}건)"
        )

    return failures, meta


async def verify_negative(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """역검증: 무의미 쿼리 → 결과 0건 또는 모든 점수가 낮음.
    strict=True: 영문/특수문자 — 고점수 50% 초과 시 FAIL
    strict=False: 한글 무관 주제 — 정상 응답(HTTP 200)만 확인
    """
    failures: List[str] = []
    meta: Dict[str, Any] = {}
    strict = tc.get("strict", True)

    status, body, elapsed = await run_ai_search(tc["query"], top_k=10)
    meta["elapsed"] = elapsed

    if status != 200:
        # 400/422 에러는 예상 가능 (유효하지 않은 쿼리)
        if status in (400, 422):
            meta["expected_error"] = True
            return failures, meta
        failures.append(f"HTTP {status}")
        return failures, meta

    results = _extract_ai_results(body)
    scores = _get_scores(results)
    meta["result_count"] = len(results)
    meta["max_score"] = round(max(scores), 3) if scores else 0.0
    meta["strict"] = strict

    # strict 모드: 결과가 있으면 점수가 낮아야 함
    if strict and results and scores:
        high_score_count = sum(1 for s in scores if s > NEGATIVE_SCORE_THRESHOLD)
        if high_score_count > len(scores) * 0.5:
            failures.append(
                f"무의미 쿼리에 고점수 결과 {high_score_count}/{len(scores)}건 "
                f"(최고 {meta['max_score']:.3f})"
            )
    # non-strict 모드: HTTP 200 응답만 확인 (이미 통과)

    return failures, meta


async def verify_response_structure(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """응답 구조 검증: 필수 필드, score 범위."""
    failures: List[str] = []
    meta: Dict[str, Any] = {}

    status, body, elapsed = await run_ai_search(tc["query"], top_k=5)
    meta["elapsed"] = elapsed

    if status != 200:
        failures.append(f"HTTP {status}")
        return failures, meta

    # 최상위 필수 필드
    required_fields = ["search_mode", "search_results"]
    for field in required_fields:
        if field not in body:
            failures.append(f"최상위 필드 '{field}' 누락")

    # search_mode 값 확인
    if body.get("search_mode") != "semantic":
        failures.append(f"search_mode={body.get('search_mode')}, expected 'semantic'")

    # search_results 각 항목 검증
    results = _extract_ai_results(body)
    meta["result_count"] = len(results)

    for i, r in enumerate(results[:5]):
        # doc_id 존재
        doc_id = r.get("doc_id") or (r.get("payload", {}) or {}).get("doc_id")
        if not doc_id:
            failures.append(f"결과[{i}] doc_id 누락")

        # score 범위 (0~1 또는 약간 넘을 수 있음)
        score = r.get("score", None)
        if score is not None and (score < 0 or score > 1.5):
            failures.append(f"결과[{i}] score={score} 범위 초과")

        # final_score 존재
        if "final_score" not in r:
            failures.append(f"결과[{i}] final_score 누락")

    return failures, meta


async def verify_score_distribution(tc: Dict[str, Any]) -> Tuple[List[str], Dict]:
    """스코어 분포 검증: 상위 5건 점수 >= 0.3, 점진적 감소 패턴."""
    failures: List[str] = []
    meta: Dict[str, Any] = {}

    status, body, elapsed = await run_ai_search(tc["query"], top_k=10)
    meta["elapsed"] = elapsed

    if status != 200:
        failures.append(f"HTTP {status}")
        return failures, meta

    results = _extract_ai_results(body)
    scores = _get_scores(results)[:5]
    meta["top_5_scores"] = [round(s, 3) for s in scores]

    if not scores:
        failures.append("결과 0건 — 스코어 분포 검증 불가")
        return failures, meta

    # 상위 5건 중 최소 1건은 0.3 이상
    if max(scores) < 0.3:
        failures.append(
            f"상위 {len(scores)}건 최고 점수 {max(scores):.3f} < 0.3"
        )

    # 대체로 감소 패턴인지 (완전 단조감소는 아닐 수 있으므로 관대하게)
    # 첫 번째 점수가 마지막 점수보다 높아야 함
    if len(scores) >= 2 and scores[0] < scores[-1]:
        failures.append(
            f"점수 역전: 첫 번째({scores[0]:.3f}) < 마지막({scores[-1]:.3f})"
        )

    return failures, meta


# ============================================================
# 검증 라우터
# ============================================================

VERIFIERS = {
    "minimum_inclusion": verify_minimum_inclusion,
    "stability": verify_stability,
    "cross_validation": verify_cross_validation,
    "negative": verify_negative,
    "response_structure": verify_response_structure,
    "score_distribution": verify_score_distribution,
}


# ============================================================
# Part 4: 메인 실행 + 리포트 생성
# ============================================================

async def main():
    print("=" * 70)
    print("  AIMS AI 검색(시맨틱) 자동화 테스트")
    print(f"  실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  대상 사용자: {USER_ID}")
    print(f"  AI 검색 API: {AI_SEARCH_API}")
    print(f"  키워드 검색 API: {KEYWORD_SEARCH_API}")
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

    # 사전 점검: AI 검색 API 연결 확인
    try:
        async with httpx.AsyncClient(timeout=60) as hc:
            resp = await hc.post(
                AI_SEARCH_API,
                json={"query": "테스트", "search_mode": "semantic", "user_id": USER_ID, "top_k": 1},
                headers={"x-api-key": RAG_API_KEY},
            )
            print(f"  AI 검색 API 연결 확인: HTTP {resp.status_code}")
            if resp.status_code != 200:
                print(f"  [오류] AI 검색 API 응답 오류: {resp.text[:200]}")
                client.close()
                return False
    except Exception as e:
        print(f"\n  [오류] AI 검색 API 연결 실패: {e}")
        client.close()
        return False

    # 부트스트랩: AI 검색으로 임베딩된 doc_id 집합 수집
    # (minimum_inclusion 테스트에서 Qdrant에 실제 존재하는 문서만 대상으로 사용)
    print("\n[0/3] 임베딩된 문서 부트스트랩 중...")
    embedded_doc_ids: Set[str] = set()
    bootstrap_queries = ["보험", "계약", "진단서", "보장", "증권", "약관", "청구", "보험금", "분석", "가입"]
    for bq in bootstrap_queries:
        try:
            _, bbody, _ = await run_ai_search(bq, top_k=20)
            for did in _extract_doc_ids(_extract_ai_results(bbody)):
                embedded_doc_ids.add(did)
            await asyncio.sleep(0.3)
        except Exception:
            pass
    print(f"  → 임베딩 확인된 고유 문서: {len(embedded_doc_ids)}건")

    # 테스트 케이스 생성
    print("\n[1/3] 테스트 케이스 생성 중...")
    test_cases = generate_test_cases(db, USER_ID, embedded_doc_ids=embedded_doc_ids)
    print(f"  → {len(test_cases)}건 생성 완료")

    # 카테고리별 건수 출력
    cat_counts: Dict[str, int] = {}
    for tc in test_cases:
        cat = tc["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    for cat, cnt in cat_counts.items():
        print(f"    - {cat}: {cnt}건")

    # 실행
    print(f"\n[2/3] AI 검색 테스트 실행 중...")
    results: List[Dict[str, Any]] = []

    for i, tc in enumerate(test_cases):
        category = tc["category"]
        verifier = VERIFIERS.get(category)

        if not verifier:
            print(f"  [{i+1:3d}/{len(test_cases)}] SKIP {tc['id']}: 검증기 없음")
            continue

        try:
            failures, meta = await verifier(tc)
        except Exception as e:
            failures = [f"검증 중 예외: {e}"]
            meta = {}

        passed = len(failures) == 0
        results.append({
            "test_case": tc,
            "passed": passed,
            "failures": failures,
            "meta": meta,
        })

        status_mark = "PASS" if passed else "FAIL"
        elapsed_str = f" ({meta.get('elapsed', 0):.1f}s)" if "elapsed" in meta else ""
        print(f"  [{i+1:3d}/{len(test_cases)}] {status_mark} {tc['id']}: {tc['description']}{elapsed_str}")
        if failures:
            for f in failures:
                print(f"        -> {f}")

        # AI 검색은 rate limit이 있으므로 적절한 간격
        if category != "stability":  # stability는 내부에서 sleep 처리
            await asyncio.sleep(0.5)

    # 리포트
    print("\n" + "=" * 70)
    print("  AI 검색 테스트 결과 리포트")
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

    pass_rate = passed_count / total * 100 if total > 0 else 0
    print(f"\n  총 테스트: {total}건")
    print(f"  PASS: {passed_count}건 ({pass_rate:.1f}%)")
    print(f"  FAIL: {failed_count}건 ({failed_count/total*100:.1f}%)" if total > 0 else "")

    print(f"\n  {'카테고리':<25} {'총':>4} {'PASS':>6} {'FAIL':>6} {'비율':>8}")
    print(f"  {'-'*25} {'-'*4} {'-'*6} {'-'*6} {'-'*8}")
    for cat, counts in categories.items():
        rate = counts["passed"] / counts["total"] * 100 if counts["total"] > 0 else 0
        print(f"  {cat:<25} {counts['total']:>4} {counts['passed']:>6} {counts['failed']:>6} {rate:>7.1f}%")

    if failed_count > 0:
        print(f"\n  실패 상세:")
        for r in results:
            if not r["passed"]:
                tc = r["test_case"]
                print(f"    [{tc['id']}] {tc['description']}")
                for f in r["failures"]:
                    print(f"      -> {f}")
    else:
        print(f"\n  전체 PASS — AI 검색 품질 확보")

    # 목표 달성 여부
    print(f"\n  목표: 80%+ PASS → {'달성' if pass_rate >= 80 else '미달성'} ({pass_rate:.1f}%)")
    print("=" * 70)

    # 리포트 파일 저장
    report_path = os.path.join("D:\\tmp", f"ai_search_test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
    try:
        lines = []
        lines.append(f"AIMS AI 검색(시맨틱) 테스트 리포트")
        lines.append(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"대상: {USER_ID}")
        lines.append(f"API: {AI_SEARCH_API}")
        lines.append(f"총: {total}, PASS: {passed_count}, FAIL: {failed_count}, 비율: {pass_rate:.1f}%")
        lines.append(f"\n{'='*60}\n카테고리별 집계\n{'='*60}")
        for cat, counts in categories.items():
            rate = counts["passed"] / counts["total"] * 100 if counts["total"] > 0 else 0
            lines.append(f"  {cat:<25} 총:{counts['total']} PASS:{counts['passed']} FAIL:{counts['failed']} ({rate:.1f}%)")
        lines.append(f"\n{'='*60}\n상세 결과\n{'='*60}")
        for r in results:
            tc = r["test_case"]
            status = "PASS" if r["passed"] else "FAIL"
            meta_str = ""
            if r["meta"]:
                meta_items = []
                for k, v in r["meta"].items():
                    if k != "elapsed":
                        meta_items.append(f"{k}={v}")
                if meta_items:
                    meta_str = f" [{', '.join(meta_items)}]"
            lines.append(f"[{status}] {tc['id']}: {tc['description']}{meta_str}")
            if tc.get("query"):
                lines.append(f"  query: {tc['query'][:80]}")
            for fail in r["failures"]:
                lines.append(f"  -> {fail}")

        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"\n  리포트 저장: {report_path}")
    except Exception as e:
        print(f"  [경고] 리포트 파일 저장 실패: {e}")

    client.close()
    return pass_rate >= 80


if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)

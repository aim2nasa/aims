# 상세검색 자동화 테스트 계획서

> 작성일: 2026-04-06
> 작성: Alex (SW Architect)
> 대상: `smart_search.py` (키워드 검색) + `rag_search.py` / `hybrid_search.py` (AI 검색)

---

## 1. 목적과 범위

### 목적

상세검색 기능(키워드 + AI)의 **잠재 버그를 자동화 테스트로 발견**하고, 발견 즉시 수정하여 검색 품질의 신뢰도를 확보한다.

### 범위

| 영역 | 대상 코드 | API 엔드포인트 |
|------|-----------|----------------|
| 키워드 검색 | `smart_search.py` | `POST /smartsearch` |
| AI 검색 | `rag_search.py` + `hybrid_search.py` | `POST /search` |
| 공통 | 불변 조건, 에러 처리, 페이지네이션 | 양쪽 모두 |

### 범위 제외

- 프론트엔드 UI 렌더링 (이 테스트는 API 레벨)
- OCR 파이프라인, 임베딩 생성 (상위 파이프라인)
- 인증/인가 (별도 보안 테스트에서 다룸)

---

## 2. 테스트 아키텍처

### 전체 흐름

```
+------------------+     +------------------+     +------------------+
|  정답 생성기     |     |  테스트 실행기   |     |  결과 비교기     |
|  (DB 직접 조회)  | --> |  (API 호출)      | --> |  (정답 vs 결과)  |
+------------------+     +------------------+     +------------------+
        |                                                  |
        |  MongoDB db.files.find()                         |  PASS / FAIL
        |  (검색 로직과 독립)                              |
        v                                                  v
+------------------+                            +------------------+
|  테스트 케이스   |                            |  결과 리포트     |
|  100건+ JSON     |                            |  + 버그 분류     |
+------------------+                            +------------------+
                                                           |
                                                           v
                                                +------------------+
                                                |  피드백 루프     |
                                                |  FAIL -> 수정    |
                                                |  -> 재실행       |
                                                +------------------+
```

### 핵심 원칙: 정답 생성과 검색 실행의 경로 분리

```
경로 A (정답 생성기):
  MongoDB -> db.files.find({ownerId: ...}) -> 필드값 읽기 -> 정답 세트

경로 B (검색 API):
  HTTP POST -> 불용어 제거 -> regex 변환 -> MongoDB $regex 쿼리
  -> projection -> 점수 계산 -> 정렬 -> 페이지네이션 -> 응답

두 경로가 완전히 다르므로 동어반복이 아니다.
```

---

## 3. 키워드 검색 테스트

### 3.1 정답 생성 방법 (동어반복 회피)

정답 생성기는 검색 로직을 일절 거치지 않는다. MongoDB에서 **문서 필드값을 직접 읽어** 정답을 구성한다.

```python
# 정답 생성기 (경로 A) - 단순 필드값 읽기
def generate_ground_truth(db):
    """DB에서 실제 문서를 직접 조회하여 정답 세트를 생성한다."""
    files = db.files.find(
        {"ownerId": USER_ID, "status": "completed"},
        {"displayName": 1, "upload.originalName": 1, "ocr.summary": 1,
         "customerId": 1, "_id": 1}
    )
    test_cases = []
    for doc in files:
        # 파일명에서 단어 추출
        display_name = doc.get("displayName", "")
        words = extract_meaningful_words(display_name)
        for word in words:
            test_cases.append({
                "query": word,
                "expected_doc_id": str(doc["_id"]),
                "source_field": "displayName",
                "category": "filename_recall"
            })
    return test_cases
```

검색 API(경로 B)는 이 단어를 받아 **불용어 제거 -> `re.escape()` -> `$regex` 변환 -> `_KEYWORD_SEARCH_PROJECTION` 적용 -> `_compute_relevance_score()` 점수 계산 -> 정렬 -> 페이지 슬라이싱 -> `_enrich_customer_relations()` -> `_convert_objectids()`** 파이프라인을 거친다.

정답 생성기가 "이 단어가 이 문서에 있다"는 **사실**만 읽고, 검색 API가 이를 찾아내는지 검증하는 구조이므로 동어반복이 아니다.

### 3.2 테스트 케이스 자동 생성 카테고리

| # | 카테고리 | 생성 방법 | 검증 기준 |
|---|----------|-----------|-----------|
| 1 | 파일명 단어 Recall | `displayName`에서 2글자 이상 단어 추출 -> 검색 | 해당 문서가 결과에 포함 |
| 2 | 요약 키워드 Recall | `ocr.summary`에서 명사 추출 -> 검색 | 해당 문서가 결과에 포함 |
| 3 | 고객 필터 정합성 | `customerId` 지정 -> 검색 | 결과의 모든 문서가 해당 고객 소유 |
| 4 | 특수문자 쿼리 | `(주)`, `@`, `#`, `.*`, `[a-z]` 등 | HTTP 200, 에러 없음 |
| 5 | 빈/공백 쿼리 | `""`, `"   "`, `"\t"` | 빈 결과 반환, 에러 아님 |
| 6 | 불용어만 쿼리 | `"관련 에서 의"` | 원본 키워드로 검색 (불용어 제거 후 빈 목록 -> 원본 반환 로직) |
| 7 | 중복 키워드 | `"보험 보험 보험"` | 정상 동작, 점수 과다 계산 없음 |
| 8 | 매우 긴 쿼리 | 500자+ 랜덤 문자열 | HTTP 200, 에러 없음 |
| 9 | AND/OR 정합성 | 동일 키워드로 AND/OR 실행 | AND 결과 doc_id 집합 ⊆ OR 결과 doc_id 집합 |
| 10 | 페이지네이션 경계 | `page=0`, `page=-1`, `page_size=0`, `page_size=200` | 에러 없이 응답, page_size 범위 클램핑 확인 |

### 3.3 자동 생성 목표: 100건 이상

```
파일명 Recall:          ~40건 (문서 20개 x 단어 2개)
요약 키워드 Recall:     ~30건 (문서 15개 x 키워드 2개)
고객 필터 정합성:       ~10건 (고객 10명)
특수문자/경계값:        ~10건 (고정 케이스)
AND/OR 정합성:          ~10건 (키워드 조합 10개)
                        -------
합계:                   ~100건+
```

---

## 4. AI 검색 테스트

AI 검색은 `QueryAnalyzer` (LLM 기반 쿼리 분석) + `HybridSearchEngine` (벡터+메타데이터 병합) + `SearchReranker` (Cross-Encoder 재순위화)를 거치므로 **비결정론적**이다. 정확한 정답 대조가 불가하므로, Alex/Gini/Ari 3인의 아이디어를 종합하여 아래 평가 방법을 적용한다.

### 4.0 AI 검색 평가 철학

> **"정답을 맞혔는가"가 아니라 "결과가 타당한가"를 판단한다.**

| 접근 | 키워드 검색 | AI 검색 |
|------|-----------|---------|
| 평가 기준 | 정답 포함 여부 (결정론적) | 타당성 판정 (확률론적) |
| 정답 생성 | DB 필드값 읽기 | 불가 → 대안 방법 사용 |
| 판정 방법 | 집합 포함 비교 | LLM 판정, 통계적 검증, 상대 순위 |

### 4.1 LLM-as-Judge (AI가 AI를 평가) ⭐ 핵심

검색 결과를 별도 LLM에게 보여주고 타당성을 판정시킨다.

```
입력: (쿼리, 검색 결과 상위 5건의 제목+요약)
프롬프트: "이 쿼리에 대해 각 결과가 관련 있는가? 1~5점으로 평가"
출력: 각 결과의 관련성 점수 → 평균 >= 3.0이면 PASS
```

- 검색 파이프라인과 평가 파이프라인이 **완전히 분리**되어 객관성 확보
- concept 쿼리를 포함한 전체 커버 가능
- 비용: GPT-4o-mini 호출 (테스트당 ~$0.001)

### 4.2 역방향 검증 (Reverse Reconstruction)

검색 결과 문서의 내용을 요약한 뒤, 그 요약으로 다시 검색하여 원본 문서가 나오는지 확인.

```
쿼리 "보험" → 상위 결과 문서 A
문서 A를 GPT로 한 문장 요약 → "생명보험 계약 조건 설명 문서"
그 요약으로 재검색 → 문서 A가 상위 3위 안에 있어야 함
```

- Self-Retrieval Rate (SRR) = 자기 문서를 top-K에서 찾은 비율
- 벡터 공간의 대칭성을 검증하는 창의적 방법

### 4.3 대조 쌍 (Contrastive Pair) ⭐ 가장 강건

"A가 B보다 상위에 와야 한다"는 **상대 순위**만 검증. 비결정론에 매우 강건.

```json
{
  "query": "당뇨 관련 보험금 청구",
  "should_rank_higher": "doc_id_당뇨_진단서",
  "should_rank_lower": "doc_id_자동차_보험증권"
}
```

- 절대 순위가 아니라 상대 비교이므로 매번 결과가 달라도 판정 가능
- 대조 쌍 20개만 있으면 즉시 자동화 가능

### 4.4 동의어 일관성 (Self-Consistency Probe)

같은 의미의 다른 표현으로 검색했을 때 결과가 수렴하는지 확인.

```
"보험료" / "납입 금액" / "월 보험료"
→ 세 쿼리의 상위 5건 doc_id 교집합 비율 측정
→ 교집합 >= 3/5이면 PASS
```

- 임베딩 모델의 의미 공간 일관성을 직접 검증

### 4.5 스코어 분포 이상 감지 ⭐ 즉시 가능

추가 API 호출 없이, 이미 반환되는 점수 패턴으로 저품질을 감지.

```
정상: 0.91 → 0.87 → 0.83 → 0.78 (점진적 감소, 최고점 높음)
이상: 0.61 → 0.60 → 0.61 → 0.59 (평탄, 최고점 낮음 = 무작위 반환 의심)

경보 조건:
- 1위 유사도 < 0.65
- 상위 5개 표준편차 < 0.02
```

### 4.6 최소 포함 검증 (Minimum Inclusion)

```
전제: 문서 파일명에 "보험증권"이 포함된 문서가 DB에 존재
검증: "보험증권" AI 검색 시 상위 20건에 해당 문서가 포함되어야
```

- AI가 **최소한 이 수준은 찾아야 한다**는 하한선 검증

### 4.7 순위 안정성 (Stability Test)

```
전제: 문서 파일명에 "보험증권"이 포함된 문서가 DB에 존재
검증: "보험증권" AI 검색 시 상위 20건에 해당 문서가 포함되어야
```

- 정답은 DB에서 `displayName` 필드 매칭으로 생성 (단순 사실)
- AI가 **최소한 이 수준은 찾아야 한다**는 하한선(floor) 검증
- 하한선이므로 엄격한 순위 비교는 하지 않음

### 4.7 순위 안정성 (Stability Test) — 기존 유지

```
동일 쿼리를 5회 반복 실행
    -> 각 실행의 상위 5건 doc_id 집합 수집
    -> 5개 집합의 Jaccard 유사도 평균 >= 0.8 (80%)
```

- 불안정하면 `QueryAnalyzer`의 LLM 호출이 과도한 비결정성을 유발하는 것 -> 버그
- 안정적이면 캐시 또는 temperature 설정이 적절한 것

### 4.8 교차 검증 (Cross-validation)

```
동일 쿼리로:
  - 키워드 검색 실행 -> 상위 5건 doc_id 집합 A
  - AI 검색 실행     -> 상위 10건 doc_id 집합 B
  - |A ∩ B| >= 1 이면 PASS
```

- 완전히 다른 결과라면 둘 중 하나의 검색 로직이 잘못된 것
- AI 검색은 의미 검색이므로 범위를 넓게 (상위 10) 잡아 비교

### 4.9 관련성 역검증 (Negative Test)

```
케이스 1: 고객 A 문서만 존재 + 고객 B로 필터링 -> AI 검색 -> 결과 0건
케이스 2: "xyzabc123" (무의미 쿼리) -> AI 검색 -> 결과 0건 또는 점수 매우 낮음
```

- 관련 없는 문서가 높은 점수로 반환되면 -> 벡터 검색 또는 재순위화 버그

### 4.10 응답 구조 검증

```python
def validate_ai_response(response):
    assert "answer" in response           # 답변 필드 존재
    assert "search_results" in response   # 검색 결과 배열 존재
    for result in response["search_results"]:
        assert 0 <= result["score"] <= 1  # 점수 범위 0~1
        assert "doc_id" in result         # 문서 ID 존재
```

- 응답 스키마가 깨지면 프론트엔드 크래시 -> 구조 검증 필수

### 4.11 캐시 일관성

```
쿼리 "보험증권"을 2회 연속 실행:
  - 1회차 응답 시간: T1
  - 2회차 응답 시간: T2
  - 검증 1: T2 <= T1 (캐시 히트로 더 빠르거나 동일)
  - 검증 2: 1회차 결과 == 2회차 결과 (동일 쿼리는 동일 결과)
```

- 임베딩 캐시 (`_embedding_cache`, TTL 10분)가 정상 작동하는지 확인

---

## 5. 불변 조건 검증

어떤 데이터, 어떤 쿼리에서든 **항상 성립해야 하는 조건**이다. 모든 테스트 케이스 실행 시 함께 검증한다.

| # | 불변 조건 | 검증 방법 |
|---|-----------|-----------|
| 1 | `results` 내 모든 문서의 `ownerId` == 요청 `user_id` | 전 결과 순회 확인 |
| 2 | `customer_id` 필터 시 결과의 모든 `customerId` == 요청값 | 전 결과 순회 확인 |
| 3 | `total` >= `len(results)` (현재 페이지 결과는 total 이하) | 응답 필드 비교 |
| 4 | `page` <= `total_pages` 일 때 `results`는 비어있지 않음 | 조건부 확인 |
| 5 | `total_pages` == `ceil(total / page_size)` | 계산 검증 |
| 6 | 점수 내림차순 정렬 (키워드 검색) | 인접 문서 쌍 점수 비교 |
| 7 | AND 결과 ⊆ OR 결과 (동일 쿼리) | 집합 포함 관계 |
| 8 | HTTP 상태 코드: 정상 요청은 200, 비정상은 4xx/5xx | 상태 코드 확인 |
| 9 | 응답 시간 <= 10초 (타임아웃 전 응답) | 시간 측정 |
| 10 | `_convert_objectids` 후 ObjectId/datetime이 문자열 | 타입 검증 |

---

## 6. 잠재 버그 후보 (타겟 검증)

Alex와 Gini의 코드 분석에서 발견한 **의심 지점**이다. 각각에 대해 전용 테스트 케이스를 작성한다.

### 6.1 customer_relation 점수 계산 시점 문제

**의심**: `_SCORE_FIELDS_LOW`에 `customer_relation.customer_name`이 포함되어 있지만, `_enrich_customer_relations()`는 점수 계산 **이후**에 호출된다.

```
smart_search.py 실행 순서:
  [1] query_files() -- projection으로 결과 가져옴
  [2] _compute_relevance_score() -- 점수 계산 (이 시점에 customer_relation 없음)
  [3] results.sort() -- 정렬
  [4] 페이지 슬라이싱
  [5] full_text 재조회
  [6] _enrich_customer_relations() -- 여기서 customer_relation 추가 (이미 정렬 끝남)
```

**검증 방법**:
```python
def test_customer_name_scoring():
    """고객명이 검색어와 매칭되는 문서가 적절한 점수를 받는지 확인"""
    # DB에서 고객명 "홍길동"이 연결된 문서 ID 확보
    # "홍길동"으로 키워드 검색
    # 해당 문서의 점수가 baseline(0.5)보다 높은지 확인
    # -> 현재 코드상 항상 baseline만 받을 것으로 예상 (버그 확인)
```

**예상 결과**: `customer_relation.customer_name` 필드 매칭이 **항상 실패**하여 해당 가중치가 사실상 무효. 점수 계산이 실제와 다름.

### 6.2 limit=1000 하드 제한

**의심**: `query_files(..., limit=1000)`으로 최대 1000건만 가져온다. 매칭 문서가 1001건 이상이면 `total`이 실제보다 작게 보고되고, 페이지네이션이 부정확해진다.

```python
def test_limit_1000_boundary():
    """매칭 문서가 1000건을 초과할 때 total이 정확한지 확인"""
    # 전체 문서 수가 1000 이상인 사용자로 "" 쿼리 대신
    # 매우 포괄적 키워드 (예: 한 글자 "보")로 검색
    # total이 실제 매칭 건수와 일치하는지 DB count와 비교
```

**예상 결과**: 1000건 초과 시 `total`이 1000으로 잘리며, 마지막 페이지 이후 문서가 누락됨.

### 6.3 baseline 점수 역전

**의심**: `full_text`에서만 매칭된 문서는 projection에서 `full_text`가 제외되어 점수 필드에서 매칭을 못 찾는다. 이 경우 `WEIGHT_BASELINE(0.5)`을 받는데, 파일명 매칭 문서(`WEIGHT_HIGH=3`)와 섞이면 순위가 올바르지만, **baseline 문서끼리의 상대 순위는 무의미**해진다.

```python
def test_baseline_score_ordering():
    """full_text에서만 매칭되는 문서들의 상대 순위가 의미 있는지 확인"""
    # full_text에 "경비행기"가 포함된 문서가 여러 건일 때
    # 모두 동일한 baseline 점수를 받아 상대 순위가 랜덤인지 확인
    # -> "비행기" 검색 시 키워드 근접도가 반영되지 않음
```

**예상 결과**: baseline 문서끼리는 MongoDB 반환 순서(삽입 순)대로 정렬되어 **관련성과 무관한 순서**가 됨.

### 6.4 Qdrant MatchAny 대량 ID 성능

**의심**: AI 검색에서 관계 고객 문서 ID를 `MatchAny`로 전달할 때, ID가 수백~수천 건이면 Qdrant 쿼리 성능이 급격히 저하될 수 있다.

```python
def test_qdrant_large_id_filter():
    """관계 고객 문서가 많은 사용자의 AI 검색 응답 시간 확인"""
    # 관계 고객이 많은 사용자로 AI 검색 실행
    # 응답 시간이 3초 이내인지 확인
    # -> 대량 ID 시 타임아웃 가능성
```

---

## 7. 자동화 루프

### 실행 흐름

```
[Step 1] 테스트 케이스 자동 생성 (DB 샘플링 기반 100건+)
    |
    |  MongoDB MCP로 db.files에서 문서 샘플링
    |  displayName, ocr.summary, customerId에서 키워드 추출
    |  카테고리별 테스트 케이스 JSON 생성
    |
    v
[Step 2] 키워드 검색 테스트 실행 -> PASS/FAIL 수집
    |
    |  POST /smartsearch 호출 (100건+)
    |  정답 문서 포함 여부, 불변 조건, 에러 검증
    |
    v
[Step 3] AI 검색 테스트 실행 -> PASS/FAIL 수집
    |
    |  POST /search 호출
    |  최소 포함, 안정성, 교차 검증, 역검증, 구조, 캐시
    |
    v
[Step 4] 불변 조건 검증 -> PASS/FAIL 수집
    |
    |  Step 2/3의 모든 응답에 대해 불변 조건 10개 검증
    |
    v
[Step 5] 결과 리포트 생성
    |
    +-- 전체 PASS --> "검증 완료, 신뢰도 확보"
    |
    +-- FAIL 존재 --> 버그 분류
                        |
                        +-- [Critical] 데이터 격리 위반, 에러 -> 즉시 수정
                        +-- [High] Recall 미달, 점수 역전 -> 다음 스프린트
                        +-- [Medium] 성능 초과, 캐시 미스 -> 백로그
                        |
                        v
                    Alex 수정 -> Step 2부터 재실행 (최대 3회 반복)
```

### 리포트 형식

```
================================================================
  AIMS 상세검색 자동화 테스트 리포트
  실행 시각: 2026-04-06 14:30:00 KST
  라운드: 1/3
================================================================

[키워드 검색]
  총 케이스: 102건
  PASS: 97건 (95.1%)
  FAIL: 5건 (4.9%)
    - FAIL-K001: "경비행기" Recall 실패 (baseline 점수 역전)
    - FAIL-K002: page=0 처리 시 빈 결과 대신 page=1 반환 예상
    ...

[AI 검색]
  총 케이스: 24건
  PASS: 22건 (91.7%)
  FAIL: 2건 (8.3%)
    - FAIL-A001: 안정성 테스트 Jaccard 0.6 (목표 0.8)
    ...

[불변 조건]
  총 검증: 1260건 (126 응답 x 10 조건)
  PASS: 1260건 (100%)

[잠재 버그 타겟]
  customer_relation 시점 문제: CONFIRMED (버그 확인)
  limit=1000 경계: NOT_TRIGGERED (데이터 부족)
  baseline 점수 역전: CONFIRMED (버그 확인)
  Qdrant 대량 ID: PASS (응답 2.1초)

================================================================
  종합: FAIL 7건 -> Alex 수정 후 라운드 2 실행 예정
================================================================
```

---

## 8. 측정 지표와 성공 기준

| 영역 | 지표 | 측정 방법 | 목표 |
|------|------|-----------|------|
| 키워드 Recall | 정답 문서가 결과에 포함되는 비율 | `expected_doc_id in [r["_id"] for r in results]` | >= 95% |
| 키워드 정합성 | AND ⊆ OR, 점수 내림차순, ownerId 일치 | 불변 조건 검증 | 100% |
| AI 최소 포함 | 파일명 매칭 문서가 상위 20에 포함 | 상위 20건 doc_id에 기대 문서 존재 | >= 80% |
| AI 안정성 | 5회 반복 시 상위 5건 Jaccard 유사도 | `|A ∩ B| / |A ∪ B|` 평균 | >= 80% |
| AI 교차검증 | 키워드 상위 5 ∩ AI 상위 10 에서 1건 이상 | 집합 교집합 크기 | >= 70% (쿼리 중 70%가 조건 충족) |
| 에러율 | HTTP 500 응답 비율 | `count(status==500) / total` | 0% |
| 응답 시간 | P95 응답 시간 | 전체 응답 시간의 95번째 백분위 | <= 3초 |

### 성공 기준

```
[PASS 조건] 아래 모든 항목 충족 시 "검증 완료":
  1. 키워드 Recall >= 95%
  2. 키워드 정합성 == 100%
  3. AI 최소 포함 >= 80%
  4. AI 안정성 >= 80%
  5. 에러율 == 0%
  6. 응답 시간 P95 <= 3초
  7. 불변 조건 위반 0건
  8. 잠재 버그 후보 중 Critical 등급 0건
```

---

## 9. 실행 환경

| 항목 | 값 |
|------|-----|
| 테스트 서버 | `tars.giize.com` (실제 서버 API 호출) |
| 키워드 검색 API | `https://tars.giize.com/api/pipeline/smartsearch` |
| AI 검색 API | `https://tars.giize.com/api/rag/search` |
| 정답 데이터 조회 | MongoDB MCP (`tars:27017/docupload.files`) |
| 테스트 프레임워크 | Python pytest + httpx (비동기 HTTP 클라이언트) |
| 테스트 데이터 | 실제 사용자 데이터 (테스트 계정) |
| 실행 위치 | 로컬 (`D:\aims`) 또는 tars 서버 |

### 사전 준비물

```
1. 테스트 사용자의 user_id (ownerId)
2. 해당 사용자의 MongoDB 문서 최소 50건 이상
3. RAG API 키 (~/.aims/.env.shared의 RAG_API_KEY)
4. Python 3.10+, pytest, httpx, pymongo
```

### 테스트 파일 구조 (예정)

```
backend/tests/search/
    conftest.py              # fixture: DB 연결, API 클라이언트, 정답 생성기
    ground_truth.py          # 정답 생성기 (DB 직접 조회)
    test_keyword_recall.py   # 카테고리 1~2: Recall 검증
    test_keyword_filter.py   # 카테고리 3: 고객 필터 정합성
    test_keyword_edge.py     # 카테고리 4~8: 특수문자, 경계값
    test_keyword_logic.py    # 카테고리 9~10: AND/OR, 페이지네이션
    test_ai_inclusion.py     # AI 최소 포함 검증
    test_ai_stability.py     # AI 순위 안정성
    test_ai_cross.py         # AI 교차 검증
    test_ai_negative.py      # AI 역검증
    test_ai_structure.py     # AI 응답 구조 + 캐시
    test_invariants.py       # 불변 조건 10개
    test_target_bugs.py      # 잠재 버그 후보 4건 타겟 검증
    report_generator.py      # 결과 리포트 생성
```

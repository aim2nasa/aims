# 키워드 검색 자동화 테스트 보고서

> 실행일: 2026-04-06
> 테스트 계획: [TEST_PLAN_2026-04-06_search.md](TEST_PLAN_2026-04-06_search.md) (3장: 키워드 검색 테스트)
> 테스트 스크립트: `backend/tests/search/run_search_test.py`
> 상세 로그: `D:\tmp\search_test_report_20260406_034104.txt`

---

## 1. 실행 요약

| 항목 | 값 |
|------|-----|
| 테스트 대상 | `POST /webhook/smartsearch` (document_pipeline) |
| 대상 사용자 | `69875e2b4c2149195032adc6` (문서 1894건) |
| 총 테스트 | 73건 |
| PASS | **73건 (100.0%)** |
| FAIL | **0건** |

---

## 2. 카테고리별 결과

| 카테고리 | 건수 | PASS | FAIL | 검증 내용 |
|----------|:----:|:----:|:----:|-----------|
| filename_recall | 38 | 38 | 0 | displayName 단어로 검색 시 해당 문서 포함 |
| summary_recall | 5 | 5 | 0 | 요약 키워드로 검색 시 해당 문서 포함 (전체 페이지 순회) |
| customer_filter | 10 | 10 | 0 | 고객 필터 시 다른 고객 문서 미포함 |
| edge_case | 10 | 10 | 0 | 특수문자, 빈 쿼리, regex 메타문자, 불용어, 한글 자모 등 |
| and_or_consistency | 5 | 5 | 0 | AND ⊆ OR 수학적 불변 조건 (전체 OR 페이지 순회) |
| pagination | 5 | 5 | 0 | page=0/-1 클램핑, page_size 제한, total 일관성, 중복 없음 |

---

## 3. 발견 및 수정한 버그

### 버그: `limit=1000` 하드 제한 (Critical)

**발견 경위**: 자동화 테스트 1차 실행에서 3건 FAIL
- ANDOR-067: AND 결과 5건이 OR에 미포함 (불변 조건 위반)
- SUMRY-040, 042: 요약 키워드 검색 시 특정 문서 누락

**근본 원인**: `smart_search.py:276`
```python
results = await query_files(mongo_query, projection=..., limit=1000)
```
1894건 문서 사용자가 범용 키워드 검색 시 1001번째 이후 문서가 검색 대상에서 완전 제외.

**수정**:
| 파일 | 변경 |
|------|------|
| `smart_search.py:276` | `limit=1000` → `limit=0` (무제한) |
| `internal-routes.js:272` | `limit=0`을 "제한 없음"으로 허용, 양수 상한 10000 |

**안전성**: projection으로 `full_text`/`docembed` 이미 제외. 2000건 메타데이터 = 수 MB 수준으로 성능 영향 없음.

**수정 후**: 73건 전체 PASS (100%).

---

## 4. 불변 조건 검증 결과

모든 73건 응답에 대해 다음 조건을 검증:

| # | 불변 조건 | 결과 |
|---|-----------|------|
| 1 | 결과 문서의 ownerId == 요청 user_id | PASS |
| 2 | customer_id 필터 시 해당 고객 문서만 반환 | PASS |
| 3 | 점수 내림차순 정렬 | PASS |
| 4 | AND 결과 ⊆ OR 결과 | PASS |
| 5 | HTTP 200 응답 (에러 없음) | PASS |
| 6 | 페이지 간 중복 문서 없음 | PASS |
| 7 | page=1 total == page=2 total | PASS |

---

## 5. 엣지 케이스 검증 상세

| 케이스 | 쿼리 | 기대 | 결과 |
|--------|------|------|------|
| 빈 쿼리 | `""` | 빈 결과, 에러 없음 | PASS |
| 공백만 | `"   "` | 빈 결과, 에러 없음 | PASS |
| 괄호 | `"(주)삼성"` | HTTP 200 | PASS |
| regex `.*` | `".*"` | HTTP 200 (re.escape 처리) | PASS |
| regex `[a-z]+` | `"[a-z]+"` | HTTP 200 | PASS |
| regex `\d+` | `"\\d+"` | HTTP 200 | PASS |
| 불용어만 | `"관련 에서 의"` | 원본 키워드로 검색 | PASS |
| 매우 긴 쿼리 | `"보험 " × 100` (500자+) | HTTP 200 | PASS |
| 중복 키워드 | `"보험 보험 보험"` | 정상 동작 | PASS |
| 한글 자모 | `"ㄱ"` | HTTP 200 | PASS |

---

## 6. 미완료 항목

| 항목 | 상태 | 참조 |
|------|------|------|
| AI 검색 (시맨틱) 테스트 | 미착수 | TEST_PLAN 4장 (11가지 평가 방법 설계 완료) |
| 잠재 버그 후보 타겟 검증 | 미착수 | TEST_PLAN 6장 (customer_relation 시점, baseline 점수 역전 등) |
| 프론트엔드 E2E 검색 테스트 | 미착수 | — |

---

## 7. 결론

키워드 검색은 73건 자동화 테스트를 통해 **파일명/요약 recall, 고객 필터, 엣지 케이스, AND/OR 정합성, 페이지네이션** 모두 검증 완료. `limit=1000` 버그를 발견하여 수정하였고, 수정 후 전체 PASS를 확인하였다.

AI 검색 테스트는 계획 수립 완료 상태이며, 다음 기회에 구현 및 실행 예정.

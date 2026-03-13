# RAG 질문검색 품질 개선 계획서

> **작성일**: 2026-03-13
> **참여 에이전트**: Alex (아키텍트), Gini (품질 검증), PM (기획), UX Designer, Security Auditor, Performance Engineer
> **대상 시스템**: AIMS RAG 질문검색 (`/search?search_mode=semantic`)

---

## 1. 현황 진단 요약

### 1.1 핵심 문제

| # | 문제 | 심각도 | 발견자 |
|---|------|--------|--------|
| 1 | 유사도 1205% 표시 — 점수 정규화 결함 | Critical | Alex, Gini, PM, UX |
| 2 | Entity 검색(파일명)이 Vector 검색(의미)을 완전 압도 | Major | Alex, Gini |
| 3 | Reranker의 `original×2.0` 이중 승수로 점수 오버스케일 | Major | Alex, Gini |
| 4 | 프론트엔드가 `final_score`가 아닌 원본 `score` 사용 | Critical | Gini |
| 5 | user_id 서버 검증 없음 — 다른 설계사 문서 노출 가능 | Critical | Security |
| 6 | 프롬프트 인젝션 방어 미흡 | High | Security |
| 7 | QueryAnalyzer 캐싱 없음 — 동일 쿼리 반복 호출 | High | Performance |
| 8 | 동기 HTTP 호출이 async 이벤트 루프 블로킹 | High | Performance |
| 9 | 정보 계층 역전 — AI 답변/범례가 검색 결과를 밀어냄 | Major | UX |
| 10 | 유사도 5단계 중 2단계 동일 아이콘, emoji 사용 | Major | UX |

### 1.2 점수 흐름 추적 (문제의 근본 원인)

```
Entity Search (파일명 완벽 매칭)
  score = 10.0 + (TF count × 0.1)     → 범위: 0 ~ 무제한

Vector Search (Qdrant 코사인 유사도)   → 범위: 0.0 ~ 1.0

Hybrid 병합 (Entity×0.6 + Vector×0.4)
  = 10.0×0.6 + 0.9×0.4 = 6.36        → 범위: 0 ~ 6.4+

Reranker (original×2.0 + sigmoid(CE))
  = 6.36×2.0 + 0.73 = 13.45          → 범위: 0 ~ 21+

Frontend (score × 100)
  = 13.45 × 100 = 1345%              → 🔴 이상값 노출
```

**근본 원인**: Entity 점수(0~무제한)와 Vector 점수(0~1.0)를 정규화 없이 합산하고, Reranker에서 추가 2배 증폭한 뒤, 프론트엔드가 0~1 범위를 가정하고 백분율 변환.

---

## 2. 개선 항목 및 우선순위

### Phase 1: 즉시 수정 (Critical/High — 재임베딩 불필요)

| ID | 개선 항목 | 담당 | 난이도 | 효과 | 파일 |
|----|---------|------|-------|------|------|
| **P1-1** | Entity 점수 Sigmoid 정규화 (0~1) | Backend | S | ★★★★★ | `hybrid_search.py` |
| **P1-2** | Reranker final_score 단순화 | Backend | S | ★★★★★ | `reranker.py` |
| **P1-3** | 프론트엔드 score → final_score 사용 + clamp | Frontend | S | ★★★★★ | `DocumentSearchView.tsx`, `types.ts` |
| **P1-4** | 하이브리드 가중치 query_type 기반 동적 조정 | Backend | S | ★★★★ | `hybrid_search.py` |
| **P1-5** | Cross-Encoder preview 500→1000자 확대 | Backend | S | ★★★ | `reranker.py` |

**예상 시간**: 2~3시간 (코드 수정 + 테스트 + 배포)
**효과**: 유사도 표시 정상화(0~100%), 의미검색 결과가 실제로 반영됨

#### P1-1: Entity 점수 Sigmoid 정규화

```python
# hybrid_search.py _entity_search() 반환 직전
import math

def normalize_entity_score(raw: float, midpoint: float = 5.0, steepness: float = 0.5) -> float:
    return 1.0 / (1.0 + math.exp(-steepness * (raw - midpoint)))

# raw=0 → 0.08, raw=5 → 0.50, raw=10 → 0.92, raw=20 → 0.99
for r in results:
    r["score"] = normalize_entity_score(r["score"])
```

#### P1-2: Reranker final_score 단순화

```python
# reranker.py — 기존 분기 로직 제거, 단순 가중 합산
result["final_score"] = 0.3 * normalized_original + 0.7 * normalized_score
# normalized_original: 이미 0~1 (P1-1에서 정규화됨)
# normalized_score: sigmoid(cross-encoder) → 0~1
```

#### P1-3: 프론트엔드 score 필드 정리

```typescript
// types.ts — SemanticSearchResultItem에 추가
final_score?: number
rerank_score?: number

// DocumentSearchView.tsx getSimilarityLevel()
const displayScore = Math.min(Math.max(item.final_score ?? item.score ?? 0, 0), 1)
```

#### P1-4: 동적 가중치

| query_type | Entity 가중치 | Vector 가중치 | 근거 |
|-----------|-------------|-------------|------|
| entity | 0.7 | 0.3 | 파일명/태그 매칭 핵심 |
| concept | 0.3 | 0.7 | 의미 검색 핵심 |
| mixed | 0.5 | 0.5 | 균형 |

---

### Phase 2: 성능 최적화 (High — 사용자 체감 속도 개선)

| ID | 개선 항목 | 담당 | 난이도 | 효과 | 파일 |
|----|---------|------|-------|------|------|
| **P2-1** | QueryAnalyzer 결과 LRU 캐시 (TTL 10분) | Backend | S | ★★★★★ | `query_analyzer.py` |
| **P2-2** | 크레딧 체크 `asyncio.to_thread` 감싸기 | Backend | S | ★★★★ | `rag_search.py` |
| **P2-3** | Entity + Vector 검색 병렬화 | Backend | M | ★★★★ | `hybrid_search.py` |
| **P2-4** | 쿼리 임베딩 벡터 LRU 캐시 | Backend | S | ★★★ | `hybrid_search.py` |
| **P2-5** | OpenAI 클라이언트 모듈 레벨 싱글턴 | Backend | S | ★★ | `rag_search.py` |

**예상 효과**:
- 재검색 시 레이턴시 50% 이상 감소 (8초 → 3~4초)
- 동시 사용자 처리 능력 향상

#### P2-1: QueryAnalyzer 캐시 (가장 큰 효과)

```python
# query_analyzer.py
from functools import lru_cache
import hashlib

_query_cache = {}  # {query_hash: (result, timestamp)}
CACHE_TTL = 600    # 10분

def analyze(self, query: str) -> dict:
    key = hashlib.md5(query.encode()).hexdigest()
    if key in _query_cache:
        result, ts = _query_cache[key]
        if time.time() - ts < CACHE_TTL:
            return result

    result = self._call_llm(query)  # 실제 LLM 호출
    _query_cache[key] = (result, time.time())
    return result
```

#### P2-3: Entity + Vector 병렬화

```python
# hybrid_search.py _hybrid_search()
import concurrent.futures

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    entity_future = executor.submit(self._entity_search, query_intent, user_id, customer_ids, top_k * 2)
    vector_future = executor.submit(self._vector_search, query, user_id, customer_ids, top_k * 2)
    entity_results = entity_future.result()
    vector_results = vector_future.result()
```

---

### Phase 3: UX 개선 (Major — 사용자 신뢰도 향상)

| ID | 개선 항목 | 담당 | 난이도 | 효과 | 파일 |
|----|---------|------|-------|------|------|
| **P3-1** | 유사도 3단계 도트 시스템 (5단계→3단계, emoji→CSS) | Frontend | S | ★★★★ | `DocumentSearchView.tsx`, `.results.css` |
| **P3-2** | 정보 계층 재배치 — 검색 결과 우선, 범례 제거 | Frontend | M | ★★★★ | `DocumentSearchView.tsx` |
| **P3-3** | 칼럼 헤더 하드코딩 색상 → CSS 변수 | Frontend | S | ★★★ | `.results.css` |
| **P3-4** | AI 답변 접힌 상태 opacity 0.5→0.85 상향 | Frontend | S | ★★★ | `.results.css` |
| **P3-5** | `#`(인덱스) 칼럼 제거, 형식 칼럼 파일명 통합 | Frontend | M | ★★★ | `DocumentSearchView.tsx`, `.results.css` |
| **P3-6** | "--- 검색 결과 ---" 구분선 제거 | Frontend | S | ★★ | `DocumentSearchView.tsx` |

#### P3-1: 유사도 3단계 도트 시스템

현재 5단계(excellent/high/medium/low/very-low)는 사용자가 구분 불가. Apple 원칙에 따라 3단계로 단순화:

| 등급 | 조건 | 색상 | 라벨 |
|-----|------|------|------|
| 높음 | score ≥ 0.70 | `var(--color-ios-green)` | 높음 |
| 보통 | 0.40 ≤ score < 0.70 | `var(--color-ios-orange)` | 보통 |
| 낮음 | score < 0.40 | `var(--color-text-quaternary)` | 낮음 |

- 백분율 숫자는 제거 (AIMS Tooltip에서만 표시)
- emoji 대신 CSS `border-radius: 50%` 6px 도트
- drop-shadow 제거

#### P3-2: 정보 계층 재배치

**현재** (위→아래):
1. AI 답변 (details) — 큰 공간 차지
2. 설명 텍스트 + 범례 — 추가 공간
3. 칼럼 헤더 + 결과

**개선** (위→아래):
1. AI 답변 1줄 요약 (펼치면 전체, max-height 제한)
2. "N건 검색됨" 한 줄
3. 칼럼 헤더 + 결과 (즉시 보임)

---

### Phase 4: 보안 강화 (Critical/High — 데이터 보호)

| ID | 개선 항목 | 담당 | 난이도 | 효과 | 파일 |
|----|---------|------|-------|------|------|
| **P4-1** | user_id 서버 측 검증 (body 신뢰 금지) | Backend | M | ★★★★★ | `rag_search.py` |
| **P4-2** | user_id=None 시 즉시 403 반환 | Backend | S | ★★★★★ | `rag_search.py` |
| **P4-3** | QueryAnalyzer 프롬프트 인젝션 방어 | Backend | S | ★★★★ | `query_analyzer.py` |
| **P4-4** | LLM 컨텍스트 내 파일명 제어문자 제거 | Backend | S | ★★★ | `rag_search.py` |
| **P4-5** | Rate Limiting 도입 (slowapi) | Backend | M | ★★★ | `rag_search.py` |
| **P4-6** | `/analytics/*` 엔드포인트 접근 통제 | Backend | S | ★★★ | `rag_search.py` |

#### P4-1/P4-2: user_id 검증

**현재**: 클라이언트가 body에 `user_id`를 임의로 전송 → 서버가 그대로 신뢰
**문제**: 타 설계사의 user_id를 넣으면 그 설계사의 모든 문서 검색 가능

**단기 방어** (JWT 도입 전):
- aims_api가 프론트엔드 인증 후 RAG API 호출 시 내부 헤더(`X-Verified-User-Id`)로 전달
- RAG API는 body의 user_id를 무시하고 헤더에서만 추출

**장기 해결**: JWT 인증 도입 (SECURITY_ROADMAP.md에 이미 계획됨)

#### P4-3: 프롬프트 인젝션 방어

```python
# query_analyzer.py — 현재: f-string에 직접 삽입
prompt = f'쿼리: "{query}"'  # ❌ 인젝션 취약

# 개선: system/user 메시지 분리
messages = [
    {"role": "system", "content": "다음 쿼리를 분석해 JSON으로 반환하라. ..."},
    {"role": "user", "content": query}  # ✅ 사용자 입력 격리
]
```

---

### Phase 5: 임베딩/모델 품질 (재임베딩 필요 — 중장기)

| ID | 개선 항목 | 담당 | 난이도 | 효과 | 파일 |
|----|---------|------|-------|------|------|
| **P5-1** | 청크에 메타데이터 프리픽스 추가 | Backend | S | ★★★ | `split_text_into_chunks.py` |
| **P5-2** | 청크 크기 1500→1000자 + 오버랩 200자 | Backend | S | ★★★ | `split_text_into_chunks.py` |
| **P5-3** | Cross-Encoder 다국어 모델 교체 | Backend | M | ★★★★ | `reranker.py`, Dockerfile |
| **P5-4** | text-embedding-3-large 업그레이드 | Backend | M | ★★★ | Qdrant 재구성 필요 |

#### P5-1: 메타데이터 프리픽스 (가장 추천)

```python
# 임베딩 시 청크 앞에 문서명 추가 → 벡터에 문맥 인코딩
prefix = f"[{original_name}] "
chunk_text = prefix + chunk['text']
embedding = embed(chunk_text)
```

**효과**: "이 청크가 어떤 문서에서 왔는지"가 벡터에 반영되어 검색 정확도 향상
**비용**: 재임베딩 필요 (현재 ~985 포인트, 1회 비용 미미)

#### P5-3: 다국어 Cross-Encoder

현재 `ms-marco-MiniLM-L-12-v2`는 영어 중심. 한국어 보험 문서에 대한 재순위화 정확도가 제한적.

**후보**: `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` (다국어 MS MARCO)
**주의**: Docker 이미지 크기 증가 (~500MB 모델 다운로드)

---

## 3. 구현 로드맵

```
Week 1: Phase 1 (점수 정규화) + Phase 2-1,2 (캐싱, async 수정)
  → 유사도 표시 정상화, 검색 속도 개선
  → 배포 후 효과 측정

Week 2: Phase 3 (UX 개선) + Phase 2-3,4,5 (병렬화, 캐싱)
  → 사용자 체감 품질 대폭 향상

Week 3: Phase 4 (보안 강화)
  → 데이터 격리 완성

Week 4+: Phase 5 (임베딩/모델) — 효과 측정 후 결정
  → Phase 1~3 효과가 충분하면 보류 가능
```

---

## 4. 각 에이전트 핵심 의견

### Alex (아키텍트)
> "Phase 1의 4가지 변경(Sigmoid 정규화 + Reranker 단순화 + 동적 가중치 + preview 확대)을 함께 적용하면 **재임베딩 없이** 검색 품질이 크게 개선됩니다. 정규화 후 두 점수 모두 0~1이 되므로 가중치가 실제 의미를 갖게 됩니다."

### Gini (품질 검증)
> "Critical 2건: (1) 프론트엔드가 `score`(원본)를 표시하고 `final_score`를 무시, (2) `getSimilarityLevel()`에 0~1 초과 방어 없음. 이 두 가지만 고쳐도 1205% 문제는 해결됩니다. 단, 근본적으로 점수 정규화(Phase 1)가 선행되어야 의미 있는 수치가 됩니다."

### PM (기획)
> "사용자에게 가장 임팩트 있는 것은 T-1(점수 정규화)과 T-2(답변 내 파일명→검색결과 연동)입니다. 피드백 버튼(`/feedback` API 이미 구현됨)도 추가하면 검색 품질 개선 데이터를 수집할 수 있습니다."

### UX Designer
> "유사도를 3단계 도트로 단순화하고, 범례를 제거하고, 검색 결과를 AI 답변보다 위로 올리면 정보 계층이 올바르게 됩니다. 칼럼 헤더 하드코딩 색상(`#f0f4f8`, `#4a5568`)은 CLAUDE.md CSS 규칙 위반이므로 즉시 수정 필요합니다."

### Security Auditor
> "**Critical**: `user_id`를 클라이언트 body에서 그대로 신뢰 — 타 설계사 문서 전수 노출 가능. `user_id=None`이면 owner_id 필터 자체가 생성되지 않아 전체 데이터 접근 가능. JWT 도입 전 임시로라도 서버 측 검증이 필수입니다."

### Performance Engineer
> "가장 큰 병목은 QueryAnalyzer의 매 요청 LLM 호출(400~1200ms)과 크레딧 체크의 동기 HTTP 호출입니다. LRU 캐시 + `asyncio.to_thread` 두 가지만 적용해도 재검색 시 체감 속도가 절반 이하로 줄어듭니다."

---

## 5. 레이턴시 예상 (Phase 1+2 적용 후)

| 단계 | 현재 | 개선 후 | 비고 |
|------|------|--------|------|
| 크레딧 체크 | 50~200ms (블로킹) | 50~200ms (비블로킹) | asyncio.to_thread |
| QueryAnalyzer | 400~1200ms | **0ms** (캐시 히트) | LRU 캐시 TTL 10분 |
| Entity Search | 10~100ms | 10~100ms | 변경 없음 |
| Vector Search | 200~800ms | **0~800ms** (병렬) | Entity와 병렬 실행 |
| Reranker | 100~500ms | 100~500ms | 변경 없음 |
| LLM 답변 생성 | 1000~5000ms | 1000~5000ms | 외부 API 의존 |
| **총합** | **2~8초** | **1.5~6초** | 재검색 시 더 빠름 |

---

## 6. 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| Sigmoid 정규화 후 midpoint/steepness 조정 필요 | 높음 | 중 | 실제 데이터로 A/B 테스트 후 튜닝 |
| Reranker 단순화로 파일명 매칭 우선순위 약화 | 중 | 중 | 가중치 0.3/0.7 조정 가능 |
| 유사도 3단계로 변경 시 기존 사용자 혼란 | 낮음 | 낮음 | 변경 안내 |
| Cross-Encoder 모델 교체 시 Docker 이미지 크기 증가 | 확실 | 낮음 | Phase 5에서 Phase 1 효과 측정 후 결정 |
| 캐싱 도입 시 stale 결과 반환 | 낮음 | 낮음 | TTL 10분으로 충분히 짧음 |

---

## 7. 측정 기준

### 정량적 지표
- **유사도 점수 범위**: 모든 검색 결과의 score가 0.0~1.0 이내 (100% 이하)
- **검색 레이턴시**: P95 < 5초 (현재 추정 P95 ~8초)
- **재검색 레이턴시**: P95 < 3초 (캐시 히트 시)
- **Cross-Encoder 반영률**: final_score와 rerank_score 간 상관계수 > 0.5

### 정성적 지표
- 사용자가 "검색 결과가 관련 있다"고 느끼는 비율 (피드백 버튼 수집)
- "세무조정계산서 내용 알려줘" → 해당 문서가 상위 3건 내 포함
- 유사도 표시가 직관적으로 이해 가능한지

---

## 8. 관련 파일 경로

| 분류 | 파일 | 주요 변경 |
|------|------|----------|
| Backend | `backend/api/aims_rag_api/hybrid_search.py` | P1-1, P1-4, P2-3, P2-4 |
| Backend | `backend/api/aims_rag_api/reranker.py` | P1-2, P1-5 |
| Backend | `backend/api/aims_rag_api/rag_search.py` | P2-2, P2-5, P4-1~6 |
| Backend | `backend/api/aims_rag_api/query_analyzer.py` | P2-1, P4-3 |
| Frontend | `DocumentSearchView.tsx` | P1-3, P3-1~6 |
| Frontend | `DocumentSearchView.results.css` | P3-1, P3-3, P3-4 |
| Frontend | `entities/search/types.ts` | P1-3 |
| Embedding | `backend/embedding/split_text_into_chunks.py` | P5-1, P5-2 |

---

## 부록 A: 보안 취약점 상세

| ID | 심각도 | 취약점 | OWASP | 위치 |
|----|--------|--------|-------|------|
| SEC-001 | Critical | user_id 미검증 — 타 설계사 문서 노출 | A01 | `rag_search.py:201-208` |
| SEC-002 | Critical | user_id=None 시 데이터 격리 해제 | A01 | `rag_search.py:254-275` |
| SEC-003 | High | QueryAnalyzer 프롬프트 인젝션 | A03 | `query_analyzer.py:39-85` |
| SEC-004 | High | LLM 컨텍스트 내 파일명/문서 인젝션 | A03 | `rag_search.py:362-365` |
| SEC-005 | High | API Rate Limiting 없음 | A04 | `rag_search.py:397-639` |
| SEC-006 | Medium | 파일명 기반 검색 순위 조작 | A04 | `reranker.py:81-95` |
| SEC-007 | Medium | LLM 환각 서버 측 검증 없음 | A09 | `rag_search.py:342-360` |
| SEC-008 | Medium | /analytics/* 사용자 격리 없음 | A01 | `rag_search.py:654-861` |

## 부록 B: 성능 병목 상세

| 순위 | 병목 | 현재 소요 | 개선 방안 | 개선 후 |
|-----|------|----------|----------|--------|
| 1 | QueryAnalyzer LLM 호출 | 400~1200ms | LRU 캐시 | 0ms (히트) |
| 2 | Entity+Vector 순차 실행 | 합산 300~900ms | 병렬화 | max(E,V) |
| 3 | 크레딧 체크 동기 블로킹 | 50~200ms | asyncio.to_thread | 비블로킹 |
| 4 | Cross-Encoder CPU 추론 | 100~500ms | L-6 모델 또는 limit 축소 | 50~250ms |
| 5 | full_text Python 로드 | 10~100ms | MongoDB $text 인덱스 | DB 레벨 |

## 부록 C: UX 개선 상세

| 현재 | 개선 | 근거 |
|------|------|------|
| 유사도 5단계 emoji (🟢🟡🟠🔴) | 3단계 CSS 도트 + 라벨 | Apple HIG, Nielsen 3~4단계 권장 |
| 백분율 숫자 (1205%) | 라벨만 표시, 툴팁에 % | Spotlight은 점수 미표시 |
| AI 답변이 결과 위 (큰 공간) | 1줄 요약 + 접기 | 주 목적은 문서 찾기 |
| 범례 5항목 | 제거 (3단계 도트면 자명) | 공간 절약 |
| `#` 칼럼 50px | 제거 | 정렬 순서가 이미 순위 |
| 헤더 `linear-gradient(#f0f4f8)` | `var(--color-*)` | CLAUDE.md 규칙 |
| 접힌 답변 opacity 0.5 | 0.85 | "비활성" 오인 방지 |

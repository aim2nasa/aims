# ACE 보고서: AI 검색 결과 50건 제한 제거 + Lazy Enrichment

> 이슈 #15 | 2026-04-02

## 배경

AI 검색(semantic 모드)에서 메모리 bursting 방지를 위해 50건 하드 제한 적용 중.
근본 원인은 프론트엔드의 N+1 enrichment — 검색 결과 전체에 대해 Promise.all로 동시 API 호출.

## 핵심 결정

### 왜 Lazy Enrichment인가

- 백엔드는 이미 Qdrant payload에 기본 정보(original_name, preview, dest_path 등)를 포함
- enrichment는 MongoDB에서 추가 메타(summary, overallStatus, customer_relation 등)를 가져오는 것
- **화면에 보이지 않는 건까지 enrich할 필요 없음** → 페이지 단위 lazy enrich가 정답

### 대안과 버린 이유

1. **백엔드 페이지네이션만 적용**: 프론트 전체 enrichment 문제가 남음
2. **가상 스크롤**: 기존 페이지네이션 UI를 전면 교체해야 함 — 과도한 변경
3. **백엔드에서 enriched 결과 반환**: 백엔드-프론트 결합도 증가, 기존 API 구조 변경 필요

## 함정/주의점

- `searchService.ts`의 enrichment 로직은 customer_name 보강까지 포함 — lazy 전환 시 이 흐름도 페이지 단위로 처리해야 함
- `DocumentSearchView`의 정렬은 raw 결과(score, filename 등) 기준이므로 enrichment 전후 무관
- 페이지 이동 시 enrichment 시간(200-500ms 추정) UX 지연 가능 — 스켈레톤/로딩 표시 필요
- AbortController가 이전 페이지 enrichment를 취소해야 함

## 구현 결과

### 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/aims-uix3/src/services/searchService.ts` | searchDocuments()에서 enrichment 제거, enrichPageResults() 신규 메서드 추가 |
| `frontend/aims-uix3/src/contexts/DocumentSearchProvider.tsx` | `top_k: 50` 하드코딩 제거 |
| `frontend/aims-uix3/src/components/DocumentViews/DocumentSearchView/DocumentSearchView.tsx` | lazy enrichment 로직 추가 (캐시 Map, useEffect, enriched paginatedResults 병합) |
| `backend/api/aims_rag_api/rag_search.py` | top_k 상한 `le=100` → `le=500` 완화 |

### 신규 테스트

| 파일 | 테스트 수 |
|------|----------|
| `__tests__/DocumentSearchView.lazy-enrichment.test.tsx` | 11건 (raw 반환, 페이지 enrichment, 실패 처리, abort, customer 보강, score 유지) |

### 검증 결과

- 프론트엔드 빌드: PASS
- 기존 테스트 48건: 전체 PASS (회귀 없음)
- 신규 테스트 11건: 전체 PASS

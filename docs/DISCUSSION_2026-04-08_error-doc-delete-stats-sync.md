# 토의: 오류 문서 삭제 시 프로그레스바 통계 동기화 (#23)

## 날짜
2026-04-08

## 현상
전체 문서 보기에서 에러 문서를 삭제하면 문서 리스트는 즉시 갱신되지만,
상단 탭 카운트(전체/에러)와 프로그레스바(N/M 처리완료)는 갱신되지 않음.

## 원인 분석

### 데이터 흐름
- 삭제 후 `internalRefreshRef.current()` → `actions.refreshDocuments()` 호출
- 이것은 **문서 리스트만** 재조회
- `useDocumentStatistics` 훅은 별도 API(`/api/documents/statistics`)를 사용
- 삭제 API는 SSE `document-list-change` 이벤트를 발송하지 않음
- Freshness Guardian(30초 주기)은 processing/pending > 0일 때만 동작

### 결론
에러 문서만 있는 상태에서 삭제하면 통계 갱신 트리거가 전혀 없음.

## 수정 방향
`onRefreshExpose` 콜백에서 `refreshDocuments()`와 함께
통계 3종(`refreshDocStats`, `refreshBatchStats`, `refreshUnlinkedStats`)도
`Promise.all`로 병렬 호출.

## 수정 파일
- `DocumentLibraryView.tsx`: useDocumentStatistics에서 refresh 추출 + onRefreshExpose에 통합

## 검증
Playwright E2E로 삭제 전후 통계 수치 비교 — 즉시 갱신 확인.

## 추가 발견
에러 탭 필터가 클라이언트 사이드 전용이라 에러 5건 중 현재 페이지에 해당하는 건만 표시됨.
이는 별도 이슈로 분리.

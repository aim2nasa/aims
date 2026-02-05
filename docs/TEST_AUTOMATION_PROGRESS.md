# AIMS 테스트 자동화 진행 기록

> 시작일: 2026-02-05

## 진행 현황

| 배치 | 대상 | 상태 | 완료일 | 커밋 | 테스트 수 |
|------|------|------|--------|------|----------|
| 배치 1 | creditService, documentStatusHelper | 완료 | 2026-02-05 | (커밋 예정) | 79개 |
| 배치 2 | document_pipeline workers | 완료 | 2026-02-05 | (커밋 예정) | 35개 |
| 배치 3 | aims_rag_api 검색 모듈 | 완료 | 2026-02-05 | a44006c0 | 47개 |
| 배치 4 | Frontend Hooks (SSE/채팅) | 완료 | 2026-02-05 | 26787401 | 43개 |
| 배치 5 | ARQueue stub → 실제 구현 | 완료 | 2026-02-05 | (커밋 예정) | 12개 |
| 배치 6 | 오래된 테스트 업데이트 | 대기 | - | - | - |

---

## 배치 5: ARQueue stub → 실제 구현

### 대상 파일
- `frontend/aims-uix3/src/components/DocumentViews/DocumentRegistrationView/__tests__/ARQueue.test.tsx`
  - 기존: 모든 테스트가 `expect(true).toBe(true)` stub

### 완료된 테스트
- [x] ARQueue.test.tsx - stub 제거, 실제 구현 (12개 테스트)

### 테스트 케이스 상세

**ARQueue.test.tsx:**
- 큐 시스템 - 파일 추가, 순차 처리 (2개)
- 동시 처리 방지 - 대기, 완료 후 처리 (2개)
- 캐시 기반 중복 방지 - 캐시 초기화, 같은 해시 중복 감지 (2개)
- 에러 복원력 - 해시 계산 실패 시 다른 파일 계속 처리 (1개)
- 배치 처리 크기 - CONCURRENCY=10 병렬 처리 (1개)
- 빈 입력 처리 - 빈 파일/고객ID 배열 (2개)

### 테스트 대상 함수
- `precomputeFileHashes(files, onProgress)` - 파일 해시 미리 계산
- `prefetchCustomerData(customerIds, onProgress)` - 고객 데이터 프리페치
- `processAnnualReportFile(file, customerId)` - AR 파일 처리 + 중복 감지
- `clearDuplicateCheckCache()` - 중복 체크 캐시 초기화

### 비고
- 기존 stub 테스트 (`expect(true).toBe(true)`) 전면 교체
- `annualReportProcessor.ts`의 실제 큐 로직 테스트
- 기존 annualReportProcessor.test.ts (9개)와 병행 사용

---

## 배치 3: aims_rag_api 검색 모듈

### 대상 파일
- `backend/api/aims_rag_api/query_analyzer.py` - 쿼리 의도 분석
- `backend/api/aims_rag_api/reranker.py` - Cross-Encoder 재순위화
- `backend/api/aims_rag_api/hybrid_search.py` - 하이브리드 검색 엔진

### 완료된 테스트
- [x] test_query_analyzer.py (13개 테스트)
- [x] test_reranker.py (18개 테스트)
- [x] test_hybrid_search.py (16개 테스트)

### 테스트 케이스 상세

**test_query_analyzer.py:**
- QueryAnalyzer 초기화 - OpenAI 클라이언트 생성 (1개)
- analyze() - entity/concept/mixed 쿼리 분류 (3개)
- analyze() - 모델/파라미터 확인, 기본값 설정 (2개)
- 에러 핸들링 - API 오류, JSON 파싱 오류, 타임아웃 (3개)
- 프롬프트 구성 - 쿼리 포함 확인 (1개)
- 통합 시나리오 - 고객 문서, 날짜, 한국어 인명 (3개)

**test_reranker.py:**
- SearchReranker 초기화 - 모델 로딩 (3개)
- rerank() - 기본 재순위화, 빈 결과, top_k 제한 (4개)
- 점수 정규화 - sigmoid 변환 (2개)
- final_score 계산 - 파일명 매칭 우선순위 (4개)
- 에러 핸들링 - predict 오류, null payload (3개)
- 정렬 - final_score 내림차순, 동일 점수 시 doc_id (2개)

**test_hybrid_search.py:**
- HybridSearchEngine 초기화 (1개)
- _entity_search() - 기본 검색, 파일명 매칭, 고객 필터 (4개)
- _vector_search() - 기본 검색, 모델, 에러, 청크 중복 제거 (4개)
- _hybrid_search() - 결과 병합, 점수 합산 (2개)
- search() 라우터 - query_type별 분기 (3개)
- 임베딩 추적 - 응답 저장, 에러 시 초기화 (2개)

### 비고
- 기존 test_rag_search.py (80+개)와 별도로 개별 모듈 테스트 추가
- OpenAI, Qdrant, MongoDB 모두 모킹하여 단위 테스트 실행
- Cross-Encoder 점수 정규화 및 final_score 계산 로직 검증

---

## 배치 4: Frontend Hooks (SSE/채팅)

### 대상 파일
- `frontend/aims-uix3/src/shared/hooks/useChatSSE.ts` - AI 채팅 SSE 스트리밍
- `frontend/aims-uix3/src/hooks/useDocumentStatistics.ts` - 문서 처리 통계
- `frontend/aims-uix3/src/hooks/useBatchId.ts` - 배치 ID 관리

### 완료된 테스트
- [x] useChatSSE.test.ts (20개 테스트)
- [x] useDocumentStatistics.test.ts (15개 테스트)
- [x] useBatchId.test.ts (21개 테스트)

### 테스트 케이스 상세

**useChatSSE.test.ts:**
- 초기 상태 - isLoading, currentResponse, activeTools 등 (2개)
- parseSSE - SSE 데이터 파싱, 잘못된 JSON 처리 (2개)
- sendMessage - 인증, API 호출, HTTP 에러, isLoading (4개)
- SSE 이벤트 처리 - content, session, tool_start, done, error (6개)
- credit_exceeded - 크레딧 초과 정보 설정 및 초기화 (2개)
- rate_limit_retry - 재시도 상태 설정 (1개)
- abort - 요청 중단 (1개)
- onChunk 콜백 - 이벤트별 콜백 호출 (1개)
- 세션 ID - 옵션으로 전달 시 API 포함 (1개)

**useDocumentStatistics.test.ts:**
- 초기화 - enabled 옵션, 하위 호환성 (4개)
- batchId 필터링 - 쿼리 파라미터, 캐시 비활성화 (3개)
- 에러 처리 - errorReporter 보고, silent 모드 (2개)
- refresh - 수동 통계 재조회 (1개)
- isLoading 상태 (1개)
- SSE 구독 - useSSESubscription 파라미터 (1개)
- Freshness Guardian - 30초 폴링 활성화/비활성화 (2개)
- 언마운트 정리 - 타이머 정리 (1개)

**useBatchId.test.ts:**
- useBatchId 훅 - 초기값, 업데이트, 동기화 (5개)
- setBatchId - sessionStorage 저장, 덮어쓰기, 알림 (3개)
- clearBatchId - 삭제, 빈 값 처리, 알림 (3개)
- getBatchId - 현재 값, null, React 외부 사용 (3개)
- 교차 탭 동기화 - storage 이벤트 처리 (2개)
- 언마운트 정리 - 구독 해제 (2개)
- 타입 안정성 - string | null (1개)
- UX 시나리오 - 업로드 사이클, 배치 전환 (2개)

### 비고
- vitest + @testing-library/react 사용
- fetch, SSE, sessionStorage 모킹
- useSyncExternalStore 기반 반응성 테스트

---

## 배치 2: document_pipeline Workers

### 대상 파일
- `backend/api/document_pipeline/workers/upload_worker.py`
- `backend/api/document_pipeline/services/upload_queue_service.py`

### 완료된 테스트
- [x] test_upload_worker.py (17개 테스트)
- [x] test_upload_queue_service.py (18개 테스트)

### 테스트 케이스 상세

**test_upload_worker.py:**
- UploadWorker 초기화 (2개)
- 시작/중지 lifecycle (3개)
- _process_batch() 동시성 제한 (2개)
- _handle_failure() 재시도/실패 처리 (2개)
- get_status() 상태 조회 (1개)
- stop() 중지 (1개)
- 지수 백오프 계산 (1개)

**test_upload_queue_service.py:**
- enqueue() 큐 삽입 (2개)
- claim_next() 원자적 작업 획득 (4개)
- mark_completed() 완료 처리 (2개)
- mark_failed() 실패 처리 (1개)
- reschedule() 재시도 스케줄링 (1개)
- cleanup_stale_jobs() stale 작업 복구 (1개)
- delete_completed_jobs() 오래된 작업 정리 (1개)
- 상수 및 원자성 테스트 (3개)

### 비고
- 로컬 Windows 환경에서 pytest 실행 제한
- CI/CD (GitHub Actions)에서 자동 테스트 실행 예정

---

## 배치 1: Backend Core - 크레딧/상태 서비스

### 대상 파일
- `backend/api/aims_api/lib/creditService.js` (1055줄)
- `backend/api/aims_api/lib/documentStatusHelper.js` (410줄)

### 완료된 테스트
- [x] creditService.test.js (33개 테스트)
- [x] documentStatusHelper.test.js (46개 테스트)

### 테스트 케이스 상세

**creditService.test.js:**
- CREDIT_RATES 상수 검증 (2개)
- calculateOcrCredits() - OCR 크레딧 계산 (5개)
- calculateAiCredits() - AI 크레딧 계산 (5개)
- 예상 크레딧 계산 - 문서 처리 (3개)
- getBonusCreditBalance() - 보너스 잔액 조회 (3개)
- getBonusCreditInfo() - 보너스 상세 정보 (2개)
- 통합 시나리오 - 크레딧 부족/일할계산/credit_pending (9개)
- 회귀 테스트 - 월정액 초과분 차감, 재처리 플래그 (2개)

**documentStatusHelper.test.js:**
- formatBytes() - 바이트 포맷팅 (7개)
- isConvertibleFile() - 변환 대상 확인 (11개)
- CONVERTIBLE_EXTENSIONS 상수 (3개)
- prepareDocumentResponse() - raw 데이터 반환 (4개)
- prepareDocumentResponse() - 상태별 진행률 (4개)
- prepareDocumentResponse() - credit_pending 상태 (2개)
- prepareDocumentResponse() - progress 필드 우선 (2개)
- prepareDocumentResponse() - 에러 상태 (3개)
- prepareDocumentResponse() - 비지원 MIME (2개)
- prepareDocumentResponse() - PDF 프리뷰 (3개)
- 회귀 테스트 - credit_pending, OCR 실패, meta_status null (3개)

### 발견된 이슈
- meta 완료 시 progress는 40%가 아닌 60% (ocr_prep 단계 포함)
- credit_pending 감지를 위해 doc.progress 필드가 설정되어 있어야 함

---

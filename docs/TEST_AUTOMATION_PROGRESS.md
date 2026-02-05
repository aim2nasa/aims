# AIMS 테스트 자동화 진행 기록

> Phase 1: 2026-02-05 (228개) ✅
> Phase 2: 2026-02-05 (506개) ✅
> **총 신규 테스트: 734개**

## 전체 테스트 현황 (2026-02-05 기준)

| 구분 | 통과 | 스킵 | 실패 | 비고 |
|------|------|------|------|------|
| Frontend (Vitest) | 4,291 | 8 | 0 | ✅ |
| Backend aims_api (Jest) | 720 | - | 6 | 기존 테스트 이슈 |
| Backend document_pipeline (pytest) | 216 | - | 20 | 기존 테스트 이슈 |
| **합계** | **5,227** | **8** | **26** | |

**Note**: 실패한 26개 테스트는 Phase 2 이전부터 존재하던 기존 테스트이며, 신규 작성 테스트(734개)는 모두 통과함

## Phase 1 진행 현황 (완료)

| 배치 | 대상 | 상태 | 완료일 | 커밋 | 테스트 수 |
|------|------|------|--------|------|----------|
| 배치 1 | creditService, documentStatusHelper | 완료 | 2026-02-05 | (커밋 예정) | 79개 |
| 배치 2 | document_pipeline workers | 완료 | 2026-02-05 | (커밋 예정) | 35개 |
| 배치 3 | aims_rag_api 검색 모듈 | 완료 | 2026-02-05 | a44006c0 | 47개 |
| 배치 4 | Frontend Hooks (SSE/채팅) | 완료 | 2026-02-05 | 26787401 | 43개 |
| 배치 5 | ARQueue stub → 실제 구현 | 완료 | 2026-02-05 | e6c3a3e7 | 10개 |
| 배치 6 | 오래된 테스트 업데이트 | 완료 | 2026-02-05 | 709ab087 | 14개 |

## Phase 2 진행 현황 (크레딧/과금 집중) ✅ 완료

| 배치 | 대상 | 상태 | 완료일 | 테스트 수 |
|------|------|------|--------|----------|
| 배치 7 | 🔴 tokenUsageService, ocrPricing | ✅ 완료 | 2026-02-05 | 134개 |
| 배치 8 | 🔴 OpenAI 크레딧 체크 서비스 | ✅ 완료 | 2026-02-05 | 51개 |
| 배치 9 | Upstage OCR 서비스 | ✅ 완료 | 2026-02-05 | 24개 |
| 배치 10 | file_service, meta_service | ✅ 완료 | 2026-02-05 | 36개 |
| 배치 11 | Frontend 서비스 (aiUsage, documentTypes, settings, inquiry) | ✅ 완료 | 2026-02-05 | 112개 |
| 배치 12 | Frontend 훅 (useColumnResize, useGlobalShortcuts, useViewerControls) | ✅ 완료 | 2026-02-05 | 61개 |
| 배치 13 | Backend 로깅 (chatHistory, activityLogger, documentTypeClassifier) | ✅ 완료 | 2026-02-05 | 88개 |

**Phase 2 총계: 506개 테스트**

---

## 🔴 배치 8: OpenAI 크레딧 체크 서비스 (CRITICAL - 과금)

### 대상 파일
- `backend/api/document_pipeline/services/openai_service.py`

### 완료된 테스트
- [x] test_openai_service.py (51개 테스트)

### 테스트 케이스 상세

**TestCheckCreditForSummary (21개):**
- 시스템 사용자 처리 - user_id='system', '', None → 항상 허용 (3개)
- 크레딧 충분 - allowed=True, estimated_pages 변환 (4개)
- 크레딧 부족 - allowed=False, reason, days_until_reset (3개)
- API 오류 fail-open - 500, 404, 503 → 허용 (3개)
- 네트워크 예외 fail-open - 연결, 타임아웃 → 허용 (3개)
- 토큰 추정 계산 - 100, 5000, 50000 토큰 → 페이지 변환 (3개)
- API 키 헤더 - x-api-key 포함 확인 (1개)
- 다양한 user_id - 이메일, UUID 형식 (1개)

**TestLogTokenUsage (10개):**
- 성공/실패 반환 - True/False (3개)
- payload 구조 - user_id, source, model, tokens (2개)
- metadata - document_id, workflow (2개)
- null user_id → 'system' (1개)
- API 키 헤더 (1개)
- UUID 형식 request_id (1개)

**TestSummarizeText (15개):**
- 기본 요약/태그 추출 (2개)
- 크레딧 체크 - 부족 시 스킵, 충분 시 진행 (2개)
- 텍스트 truncation - 10000자 초과/이하 (2개)
- OpenAI API 실패 → 에러 응답 (1개)
- owner_id/document_id 전달 (2개)
- 크레딧 체크 스킵 (owner_id 없음) (1개)
- 빈 텍스트, 파싱 fallback (2개)
- max_length, 한글 토큰 추정 (2개)
- 토큰 로깅 호출 (1개)

**TestExtractTags (5개):**
- summarize_text 호출 (1개)
- 에러 시 빈 리스트 (1개)
- None tags 처리 (1개)
- credit_skipped 시 빈 태그 (1개)
- 리스트 타입 반환 (1개)

### 비고
- **fail-open 패턴**: 크레딧 체크 API 실패 시 요약 허용 (서비스 중단 방지)
- **토큰 추정**: 한글 1자 ≈ 2토큰, min(..., 10000)으로 제한
- **과금 정책**: docs/EMBEDDING_CREDIT_POLICY.md 참조

---

## 🔴 배치 7: 토큰/비용 계산 서비스 (CRITICAL - 과금)

### 대상 파일
- `backend/api/aims_api/lib/tokenUsageService.js` (602줄)
- `backend/api/aims_api/lib/ocrPricing.js` (31줄)

### 완료된 테스트
- [x] tokenUsageService.test.js (98개 테스트)
- [x] ocrPricing.test.js (36개 테스트)

### 테스트 케이스 상세

**tokenUsageService.test.js:**

1. **TOKEN_COSTS 상수 검증 (12개)**
   - 필수 모델 존재 확인 (6개)
   - 가격 정확성 검증 (4개)
   - 가격 범위 검증 (2개)

2. **calculateCost() 비용 계산 (22개)**
   - 기본 비용 계산 (4개)
   - 소수점 정밀도 검증 (2개)
   - 0 토큰 입력 처리 (3개)
   - 음수 토큰 방어 (2개)
   - 대량 토큰 계산 (3개)
   - 알 수 없는 모델 처리 (4개)
   - 모델별 비용 비교 (2개)
   - 부동소수점 정밀도 (2개)

3. **logTokenUsage() 로깅 (10개)**
   - 필수/선택 필드 검증 (5개)
   - 토큰 합계 계산 (2개)
   - 비용 자동 계산 (1개)
   - 타임스탬프/반환값 (2개)

4. **getUserTokenUsage() 사용자별 집계 (10개)**
   - 기본/기간 조회 (3개)
   - 소스별 분류 (1개)
   - 빈 결과 처리 (1개)
   - 합계 정확성 (2개)
   - 비용 집계 정밀도 (3개)

5. **getDailyUsage() 일별 통계 (5개)**
6. **getHourlyUsageBySource() 시간별 통계 (5개)**
7. **getTopUsers() 상위 사용자 (5개)**
8. **formatCost(), formatTokens() 포맷팅 (10개)**
9. **ensureIndexes() 인덱스 생성 (3개)**
10. **getSystemOverview() 시스템 전체 통계 (5개)**
11. **getDailyUsageByRange() / getTopUsersWithRange() (6개)**

**ocrPricing.test.js:**

1. **상수 검증 (6개)**
   - OCR_PRICE_PER_PAGE_USD = $0.0015
   - DEFAULT_EXCHANGE_RATE = 1400 KRW/USD
   - 타입/불변성 검증

2. **calculateOCRCost() (30개)**
   - 기본 계산 (1, 10, 100, 1000, 10000 페이지) (5개)
   - 0/음수 페이지 처리 (2개)
   - 소수점 페이지 (2개)
   - 환율 파라미터 (5개)
   - USD/KRW 정밀도 (6개)
   - 부동소수점 정밀도 (2개)
   - 경계값 테스트 (2개)
   - 실제 과금 시나리오 (4개)
   - 반환 값 타입 (2개)

### 비고
- **소수점 정밀도**: USD 6자리, KRW Math.round
- **모델 가격**: gpt-4o-mini, gpt-4o, gpt-4-turbo, text-embedding-3-small
- **과금 시나리오**: 월간 예상 비용 계산 (1000문서×5페이지)

---

## 배치 6: 오래된 테스트 업데이트

### 대상 파일
- `frontend/aims-uix3/src/services/__tests__/DocumentService.test.ts` - 마지막 업데이트 2026-01-09
- `frontend/aims-uix3/src/services/__tests__/DocumentStatusService.test.ts` - 마지막 업데이트 2025-11-02

### 추가된 테스트 케이스

**DocumentService.test.ts (+3개):**
- `deleteAllDocuments()` - 전체 문서 삭제 (개발자 모드)
  - 전체 문서 삭제 API 호출 테스트
  - 삭제된 문서가 없을 때 0 반환 테스트
  - API 에러 전파 테스트

**DocumentStatusService.test.ts (+11개):**
- `extractOriginalFilename()` - 원본 파일명 추출 (displayName 무시)
  - upload.originalName 반환 테스트
  - stages.upload.originalName 반환 테스트
  - 기본 필드 (originalName, filename, file_name, name, title) fallback 테스트
  - 모든 필드 없으면 "Unknown File" 반환 테스트
  - displayName 무시 검증 테스트
  - AR/CRS 파일 원본 파일명 추출 시나리오 테스트

### 비고
- DocumentService: 2026-01-10 이후 추가된 `deleteAllDocuments()` 메서드 테스트 추가
- DocumentStatusService: 2025-11-03 이후 추가된 `extractOriginalFilename()` 메서드 테스트 추가
- AR/CRS displayName 자동 생성 기능과 연계된 원본 파일명 추출 로직 검증

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

## 최종 요약

### 완료된 배치
| Phase | 배치 | 테스트 수 | 주요 내용 |
|-------|------|----------|---------|
| 1 | 배치 1 | 79개 | creditService.js, documentStatusHelper.js |
| 1 | 배치 2 | 35개 | upload_worker.py, upload_queue_service.py |
| 1 | 배치 3 | 47개 | QueryAnalyzer, SearchReranker, HybridSearch |
| 1 | 배치 4 | 43개 | useChatSSE, useDocumentStatistics, useBatchId |
| 1 | 배치 5 | 10개 | ARQueue stub → 실제 구현 |
| 1 | 배치 6 | 14개 | DocumentService, DocumentStatusService 업데이트 |
| **Phase 1 합계** | | **228개** | |
| 2 | 🔴 배치 7 | 134개 | tokenUsageService.js, ocrPricing.js (크레딧/과금) |
| 2 | 🔴 배치 8 | 51개 | openai_service.py 크레딧 체크 (과금) |
| **Phase 2 합계** | | **185개** | |
| **총합** | | **413개** | |

### 커밋 이력
**Phase 1:**
- `2903d388` - 배치 1: creditService, documentStatusHelper
- `a0813fea` - 배치 2: upload_worker, upload_queue_service
- `a44006c0` - 배치 3: aims_rag_api 검색 모듈
- `26787401` - 배치 4: Frontend Hooks
- `e6c3a3e7` - 배치 5: ARQueue 실제 구현
- `709ab087` - 배치 6: 오래된 테스트 업데이트

**Phase 2:**
- (커밋 예정) - 배치 7-8: 크레딧/과금 핵심 서비스

### Phase 2 향후 계획

**배치 9: Upstage OCR 서비스**
- upstage_service.py (25개 예상)

**배치 10: 파일/메타 서비스**
- file_service.py, meta_service.py (35개 예상)

**배치 11: Frontend 서비스**
- aiUsageService.ts, documentTypesService.ts, settingsService.ts (40개 예상)

**배치 12: Frontend 훅**
- useColumnResize.ts, useGlobalShortcuts.ts, useViewerControls.ts (30개 예상)

**배치 13: Backend 로깅/모니터링**
- chatHistoryService.js, activityLogger.js (25개 예상)

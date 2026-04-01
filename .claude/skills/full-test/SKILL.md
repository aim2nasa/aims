---
name: full-test
description: AIMS 전체 테스트 실행. /full-test, 전체 테스트, run all tests, 풀 테스트 요청 시 사용
user_invocable: true
---

# AIMS 전체 테스트 스킬

AIMS 프로젝트의 모든 자동화 테스트를 순차 실행합니다.
CI에서 수행하는 테스트 + 로컬 regression 테스트를 모두 포함합니다.

## 트리거

- `/full-test` (사용자 호출)
- "전체 테스트", "모든 테스트", "run all tests", "풀 테스트"

## 테스트 스위트 구성 (13개)

| # | 스위트 | 프레임워크 | 위치 |
|---|--------|-----------|------|
| 1 | Frontend 단위 테스트 | vitest | `frontend/aims-uix3` |
| 2 | Frontend 타입 체크 | tsc | `frontend/aims-uix3` |
| 3 | Backend aims_api (Jest) | Jest | `backend/api/aims_api` |
| 4 | Backend aims_mcp | vitest | `backend/api/aims_mcp` |
| 5 | Backend document_pipeline (regression) | pytest | `backend/api/document_pipeline` |
| 6 | Backend annual_report_api | pytest | `backend/api/annual_report_api` |
| 7 | Backend embedding (전체) | pytest | `backend/embedding/tests` |
| 8 | AutoClicker regression | pytest | `tools/auto_clicker_v2/tests` |
| 9 | Backend aims_api migration | node | `backend/api/aims_api/tests` |
| 10 | Backend shared/schema import | node | `backend/shared/schema/test` |
| 11 | xPipe 단위 테스트 | pytest | `backend/api/document_pipeline/xpipe/tests` |
| 12 | Backend aims_rag_api (부분) | pytest | `backend/api/aims_rag_api/tests` |
| 13 | document_pipeline poc_legal | pytest | `backend/api/document_pipeline/poc_legal` |

> **참고**: Phase 3 Jest는 `testMatch: "**/__tests__/**/*.test.js"`로 `lib/__tests__/` 8개 파일도 자동 포함.
> **참고**: aims_rag_api의 test_hybrid_search, test_rag_search는 qdrant_client 의존으로 제외. test_query_analyzer, test_reranker만 포함.
> **참고**: Playwright E2E 테스트는 브라우저 + 프리뷰 서버 필요. `--e2e` 옵션으로 별도 실행 가능.
> **로컬 실행 불가 목록**:
> - `backend/api/aims_api/test_data_isolation.py` — 실행 중인 서버(localhost:3010) 필요
> - `backend/api/pdf_proxy/tests/test_thumbnail_api.py` — 실행 중인 서버(localhost:8002) 필요
> - `backend/embedding/test_preprocess_text.py` — `langchain` 모듈 의존 (서버에만 설치)
> - `aims_rag_api/tests/` — Qdrant + 임베딩 모델 의존
> - `SikuliX/MetlifePDF` 테스트 — SikuliX 의존
> - `tools/` 하위 개별 PoC 테스트 — 외부 의존성

## 실행 단계

### Phase 1: Frontend 단위 테스트 (vitest)

```bash
cd /d/aims/frontend/aims-uix3 && npx vitest run 2>&1 | tail -30
```

- `--run` 플래그로 watch 모드 없이 1회 실행
- 출력이 클 수 있으므로 tail로 결과 요약만 표시

### Phase 2: Frontend 타입 체크 (tsc)

```bash
cd /d/aims/frontend/aims-uix3 && npx tsc --noEmit 2>&1 | tail -30
```

- 타입 에러 0개여야 PASS

### Phase 3: Backend aims_api (Jest)

```bash
cd /d/aims/backend/api/aims_api && MONGO_URI=mongodb://100.110.215.65:27017 npx jest 2>&1 | tail -30
```

- MongoDB 연결 필요 (Tailscale 경유)
- 실패 시 `MONGO_URI` 환경변수 확인
- `lib/__tests__/` 8개 파일 포함 (testMatch 패턴 `**/__tests__/**/*.test.js`로 자동 스캔)

### Phase 4: Backend aims_mcp (vitest)

```bash
cd /d/aims/backend/api/aims_mcp && npx vitest run --exclude='**/user-simulation.e2e.test.ts' --exclude='**/__tests__/cross-system/**' --exclude='**/__tests__/conversation/**' --exclude='**/__tests__/cross-platform-consistency.test.ts' --exclude='**/*.e2e.test.ts' 2>&1 | tail -30
```

- E2E/시뮬레이션 테스트 제외 (서버 연동 필요)
- 단위 테스트만 실행

### Phase 5: Backend document_pipeline — Regression 테스트 (pytest)

```bash
cd /d/aims/backend/api/document_pipeline && python -m pytest tests/ -v --tb=short --ignore=tests/smoke_test.py --ignore=tests/generate_fixtures.py 2>&1 | tail -50
```

- smoke_test, generate_fixtures 제외
- 403개 테스트 (Phase 1 회귀 394 + Phase 3 메트릭 9)

### Phase 6: Backend annual_report_api (pytest)

```bash
cd /d/aims/backend/api/annual_report_api && OPENAI_API_KEY=sk-test-mock python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

- Mock API 키 사용 (실제 API 호출 없음)

### Phase 7: Backend embedding — 전체 테스트 (pytest)

```bash
cd /d/aims/backend/embedding && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

- test_self_healing: credit_pending 재확인, OCR 재시도, overallStatus 불일치 수정
- test_chunk_by_doc_type: 문서 유형별 청킹 파라미터 분기 검증
- test_customer_id_in_chunks: customer_id 청킹 메타데이터 전달 검증
- 완전 mock (DB/Redis 연결 없음)

### Phase 8: AutoClicker 단위 테스트 (pytest)

```bash
cd /d/aims/tools/auto_clicker_v2 && python -m pytest tests/test_ac_regression.py tests/test_crs_save_validation.py -v --tb=short 2>&1 | tail -30
```

- 스크롤 회귀 방지 (mouseWheel 사용 확인)
- 좌표 계산/상수 정합성
- CRS 저장 검증 로직
- 포커스 자동 복구 (ensure_browser_focus 14곳 적용)
- PDF 미리보기 중복 팝업 방지 (재클릭 3회/30초 제한)
- 타이틀바 다크모드 (DWM 지연 적용 + SWP_FRAMECHANGED)
- CRS 저장 다이얼로그 Alt+N 포커스 확보

### Phase 9: Backend aims_api migration 테스트 (node)

```bash
cd /d/aims/backend/api/aims_api && npm run test:migration 2>&1 | tail -30
```

- `tests/` 디렉토리의 standalone 테스트 7개 파일을 순차 실행
- 고객 관계 수정, cascade delete, Qdrant 삭제, OCR 자동 재시도, AR/CRS displayName, ObjectId 호환성, fileSize 체크
- Jest가 아닌 `node`로 직접 실행 (assert 기반)
- 외부 의존성 없음 (순수 로직 테스트)

### Phase 10: Backend shared/schema import 테스트 (node)

```bash
cd /d/aims/backend/shared/schema && npm run test 2>&1 | tail -15
```

- CJS import (`dist/cjs/`) + ESM import (`dist/esm/`) 정합성 검증
- `COLLECTIONS`, `CUSTOMER_FIELDS`, `CUSTOMER_TYPES`, `CUSTOMER_STATUS` 상수 확인
- 빌드 결과물(`dist/`)이 없으면 실패 → `npm run build` 선행 필요

### Phase 11: xPipe 단위 테스트 (pytest)

```bash
cd /d/aims/backend/api/document_pipeline/xpipe && python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

- 차세대 문서 파이프라인 엔진 (xPipe) 전체 단위 테스트
- Pipeline, EventBus, AuditLog, QualityGate, CostTracker, Scheduler, Provider 등
- 순수 로직 테스트 (외부 의존성 없음)

### Phase 12: Backend aims_rag_api — 부분 테스트 (pytest)

```bash
cd /d/aims/backend/api/aims_rag_api && python -m pytest tests/test_query_analyzer.py tests/test_reranker.py -v --tb=short 2>&1 | tail -30
```

- QueryAnalyzer: 쿼리 분석 + OpenAI mock
- SearchReranker: 재순위화 + 점수 정규화
- hybrid_search/rag_search는 qdrant_client 의존으로 제외

### Phase 13: document_pipeline poc_legal (pytest)

```bash
cd /d/aims/backend/api/document_pipeline && python -m pytest poc_legal/test_legal_adapter.py -v --tb=short 2>&1 | tail -30
```

- xPipe 이식성 PoC — LegalDomainAdapter 계약 테스트
- 판결문/계약서 감지, 표시명 생성, 메타데이터 추출
- 순수 로직 테스트 (외부 의존성 없음)

## 선택 옵션

### `--e2e`: Playwright E2E 테스트 추가 실행

사용자가 `--e2e` 옵션을 요청하면 Phase 7을 추가로 실행합니다.

```bash
cd /d/aims/frontend/aims-uix3 && npx playwright test tests/a11y --reporter=list 2>&1 | tail -30
```

### `--skip <suite>`: 특정 스위트 건너뛰기

사용자가 특정 스위트를 건너뛰고 싶을 때 사용합니다.
예: `/full-test --skip frontend` → Phase 1, 2 건너뜀

## 대용량 출력 처리

각 스위트의 출력이 30KB를 초과할 수 있으므로:

```bash
command > /d/tmp/test_suite_N.txt 2>&1; echo "EXIT_CODE=$?"
```

실패 시 해당 파일의 마지막 50줄을 표시하여 원인 파악.

## 결과 보고

모든 스위트 완료 후 아래 형태로 보고합니다.

```
## 전체 테스트 결과

| # | 스위트 | 테스트 수 | 결과 | 소요 시간 |
|---|--------|----------|------|----------|
| 1 | Frontend vitest | 4,840 | PASS | 96s |
| 2 | Frontend typecheck | - | PASS | 8s |
| 3 | Backend aims_api (Jest) | 1,196 | PASS | 15s |
| 4 | Backend aims_mcp (vitest) | 802 | PASS | 1s |
| 5 | Backend document_pipeline (pytest) | 735 | PASS | 318s |
| 6 | Backend annual_report_api (pytest) | 92 | PASS | 86s |
| 7 | Backend embedding (pytest) | 43 | PASS | 0.3s |
| 8 | AutoClicker regression (pytest) | 95 | PASS | 0.2s |
| 9 | Backend aims_api migration (node) | 6 | PASS | 0.5s |
| 10 | Backend shared/schema import (node) | 2 | PASS | 0.3s |
| 11 | xPipe 단위 테스트 (pytest) | 377 | PASS | 9s |
| 12 | Backend aims_rag_api (pytest) | 32 | PASS | 14s |
| 13 | document_pipeline poc_legal (pytest) | 31 | PASS | 0.2s |

**총 테스트: ~8,251개 | 전체 PASS | 총 소요: ~9분**
```

실패한 스위트가 있으면:
- 해당 스위트의 에러 출력을 표시
- 실패 원인 분석 제공
- 전체 결과를 FAIL로 표시

## 주의사항

- **출력 리다이렉트 필수**: 각 스위트 출력이 클 수 있음 (CLAUDE.md 규칙)
- **순차 실행**: 각 스위트를 순서대로 실행 (병렬 실행 시 리소스 충돌 가능)
- **실패 시 계속 진행**: 한 스위트가 실패해도 나머지는 계속 실행하여 전체 상태 파악
- **MongoDB 필요**: Phase 3(aims_api)는 MongoDB 연결 필요
- **Node/Python 환경**: Node 20+, Python 3.11+ 필요

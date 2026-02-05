# AIMS 프로젝트 자동화 테스트 현황

> 작성일: 2026-02-05

## 1. 테스트 요약 통계

| 구분 | 프레임워크 | 파일 수 | 위치 |
|------|-----------|--------|------|
| **프론트엔드 유닛/통합** | Vitest | 191개 | `frontend/aims-uix3/src/**/*.test.ts(x)` |
| **프론트엔드 E2E** | Playwright | 28개 | `frontend/aims-uix3/tests/**/*.spec.ts` |
| **aims_api** | Jest | 18개 | `backend/api/aims_api/__tests__/**/*.test.js` |
| **aims_mcp** | Vitest | 172개 | `backend/api/aims_mcp/src/**/*.test.ts` |
| **aims_rag_api** | pytest | 2개 | `backend/api/aims_rag_api/test*.py` |
| **annual_report_api** | pytest | 12개 | `backend/api/annual_report_api/tests/test*.py` |
| **document_pipeline** | - | 0개 | (테스트 스위트 부재) |
| **SikuliX GUI** | SikuliX | 1개 | `tools/MetlifePDF.sikuli/` |
| **통합 테스트** | Jest | 2개 | `tests/backend-api/**/*.test.js` |
| **로드 테스트** | Node.js | 5개 | `tests/load-test/` |
| **총합** | - | **431+개** | - |

---

## 2. 프론트엔드 테스트

### 2.1 유닛/통합 테스트 (Vitest)

- **프레임워크**: Vitest (Vite 기반)
- **테스트 파일 수**: 191개
- **설정 파일**: `vite.config.ts`

**주요 테스트 영역**:
- UI 컴포넌트 (Button, Modal, Input, Dropdown 등)
- 서비스 (DocumentService, CustomerService, ContractService)
- 훅 (useNavigation, useGaps, useDraggable, usePersistedState)
- 유틸리티 (timeUtils, typeConverters, documentTransformers)
- 비즈니스 로직 (AR/CRS 파싱, 고객 중복 방지, 엑셀 검증)

**주요 테스트 파일**:
```
frontend/aims-uix3/src/__tests__/
  ├── App.leftpane-sync.test.tsx
  ├── document-management.regression.test.ts
  ├── recent-changes.test.tsx
  ├── social-login-account.regression.test.ts
  └── ux-improvements.regression.test.ts

frontend/aims-uix3/src/services/__tests__/
  ├── DocumentService.qdrant-deletion.test.ts
  ├── DocumentService.customer-preview-edge-cases.test.ts
  ├── DocumentStatusService.test.ts
  ├── annualReportService.header-validation.test.ts
  ├── customerService.test.ts
  └── contractService.test.ts

frontend/aims-uix3/src/features/batch-upload/__tests__/
  ├── fileValidation.test.ts
  ├── customerMatcher.test.ts
  └── FolderDropZone.test.tsx
```

**테스트 명령어**:
```bash
cd frontend/aims-uix3
npm test              # Vitest 실행
npm run test:ui       # UI 대시보드
npm run test:coverage # 커버리지 리포트
```

**테스트 의존성**:
- vitest: ^3.2.4
- @vitest/coverage-v8: ^3.2.4
- @testing-library/react: ^16.3.0
- @testing-library/jest-dom: ^6.8.0
- @testing-library/user-event: ^14.6.1
- jsdom: ^27.0.0

### 2.2 E2E 테스트 (Playwright)

- **프레임워크**: Playwright
- **테스트 파일 수**: 28개
- **설정 파일**: `playwright.config.ts`

**주요 E2E 테스트**:
```
frontend/aims-uix3/tests/
  ├── e2e/
  │   ├── account-settings.spec.ts
  │   ├── quick-actions.spec.ts
  │   ├── theme-toggle.spec.ts
  │   ├── layout-control.spec.ts
  │   ├── navigation.spec.ts
  │   ├── onboarding-tour.spec.ts
  │   ├── quick-search.spec.ts
  │   ├── customer-relationship.spec.ts
  │   ├── customer-regional.spec.ts
  │   ├── contract-all-view.spec.ts
  │   ├── customer-detail-tabs.spec.ts
  │   ├── ai-assistant.spec.ts
  │   └── multi-customer.spec.ts
  ├── a11y/
  │   └── accessibility.spec.ts
  ├── visual/
  │   └── visual-regression.spec.ts
  └── responsive/
      └── mobile-responsive.spec.ts
```

**테스트 명령어**:
```bash
cd frontend/aims-uix3
npm run build
npm run preview       # 미리보기 서버 시작
npx playwright test   # Playwright 실행
```

**테스트 의존성**:
- @playwright/test: ^1.55.1
- playwright: ^1.55.1
- @axe-core/playwright: ^4.11.0 (접근성 테스트)

---

## 3. 백엔드 테스트

### 3.1 aims_api (Node.js/Express)

- **프레임워크**: Jest
- **테스트 파일 수**: 18개
- **위치**: `backend/api/aims_api/__tests__/`

**주요 테스트 파일**:
```
backend/api/aims_api/__tests__/
  ├── apiEndpoints.test.js
  ├── arDeletion.test.js
  ├── bulkImport.test.js
  ├── cascadingDelete.test.js
  ├── contracts.test.js
  ├── credit-check-simulation.test.js
  ├── customer-isolation.test.js
  ├── customerNameIsolation.test.js
  ├── documentDeletion.test.js
  ├── documents.test.js
  ├── statistics.test.js
  ├── tier-permission.test.js
  ├── ocr-policy.test.js
  ├── pdfConversion.test.js
  ├── prepareDocumentResponse.test.js
  ├── schema-consistency.test.js
  ├── memo-sync.test.js
  └── test-auth.test.js
```

**테스트 명령어**:
```bash
cd backend/api/aims_api
npm run test        # 마이그레이션 + Jest
npm run test:ci     # CI 모드 (MongoDB 필수)
npm run test:watch  # Watch 모드
npm run test:coverage # 커버리지 리포트
```

**Jest 설정** (package.json):
```json
"jest": {
  "testEnvironment": "node",
  "testTimeout": 30000,
  "testMatch": ["**/__tests__/**/*.test.js"]
}
```

**테스트 의존성**:
- jest: ^29.7.0
- supertest: ^7.1.4
- cross-env: ^10.1.0

### 3.2 aims_mcp (TypeScript)

- **프레임워크**: Vitest
- **테스트 파일 수**: 172개 (가장 많음)
- **설정 파일**: `vitest.config.ts`

**주요 테스트 영역**:
- 엣지 케이스 테스트
- 경계값 테스트
- 데이터 변환 테스트
- 코드 검증 테스트

**Vitest 설정**:
```typescript
test: {
  globals: true,
  environment: 'node',
  include: ['src/**/*.test.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
  },
}
```

### 3.3 aims_rag_api (Python/FastAPI)

- **프레임워크**: pytest
- **테스트 파일 수**: 2개

**테스트 파일**:
```
backend/api/aims_rag_api/
  ├── test_hybrid_search.py
  └── tests/test_rag_search.py
```

**테스트 명령어**:
```bash
cd backend/api/aims_rag_api
python -m pytest -v
```

### 3.4 annual_report_api (Python/FastAPI)

- **프레임워크**: pytest
- **테스트 파일 수**: 12개

**테스트 파일**:
```
backend/api/annual_report_api/tests/
  ├── test_api_endpoints.py
  ├── test_ar_result_guarantee.py
  ├── test_background_parsing.py
  ├── test_cleanup_duplicates.py
  ├── test_cr_detector_real_files.py
  ├── test_cr_duplicate_check.py
  ├── test_cr_duplicate_integration.py
  ├── test_queue_manager.py
  └── test_userid_filter.py

backend/api/annual_report_api/
  ├── test_table_extraction.py
  ├── test_table_extractor.py
  └── test_cr_table_extractor.py
```

**테스트 명령어**:
```bash
cd backend/api/annual_report_api
python -m pytest -v
```

### 3.5 document_pipeline (Python/FastAPI)

- **프레임워크**: 없음
- **테스트 파일 수**: 0개
- **상태**: 전용 테스트 스위트 부재 (CI/CD에서 간접 검증)

---

## 4. E2E / GUI 자동화 테스트

### 4.1 SikuliX 테스트

- **위치**: `tools/MetlifePDF.sikuli/`
- **용도**: Metlife 고객 통합 뷰 GUI 자동화 검증

**주요 파일**:
```
tools/MetlifePDF.sikuli/
  ├── verify_customer_integrated_view.py (메인 테스트)
  ├── MetlifeCustomerList.py
  ├── MetlifePDF.py
  ├── screenshots/ (참조 이미지)
  └── debug_log.txt (실행 로그)
```

**실행 방법** (PowerShell):
```powershell
java -jar "C:\SikuliX\sikulixide-2.0.5.jar" -r "D:\aims\tools\MetlifePDF.sikuli\verify_customer_integrated_view.py"
```

### 4.2 통합 테스트

- **위치**: `tests/backend-api/`

**테스트 파일**:
```
tests/backend-api/
  ├── 1-health-check/
  │   └── health-check.test.js
  └── smartsearch/
      ├── smartsearch-automation.test.js
      ├── run-smartsearch-test.bat
      └── run-smartsearch-test.sh
```

### 4.3 로드 테스트

- **위치**: `tests/load-test/`

**테스트 스크립트**:
```
tests/load-test/
  ├── aims-load-test.js
  ├── aims-realistic-load-test.js
  ├── multi-user-load-test.js
  ├── aims-capacity-test.js
  └── create-test-users-and-run.js
```

---

## 5. CI/CD 파이프라인

### 5.1 워크플로우 구성

**위치**: `.github/workflows/`

| 워크플로우 | 파일 | 내용 | 타임아웃 |
|-----------|------|------|---------|
| 메인 | `ci.yml` | 전체 CI 오케스트레이션 | - |
| 프론트엔드 | `ci-frontend.yml` | 타입체크 + Vitest | 10분 |
| 백엔드 | `ci-backend.yml` | Jest (MongoDB) | 10분 |
| Python | `ci-python.yml` | pytest (MongoDB) | 15분 |
| E2E | `ci-e2e.yml` | Playwright + 접근성 | 30분 |

### 5.2 ci-frontend.yml

```yaml
실행 환경: ubuntu-latest
Node.js: 20

단계:
  1. 코드 체크아웃
  2. Node.js 설정
  3. 의존성 설치
  4. 타입 체크 (npm run typecheck)
  5. 유닛 테스트 (npm test -- --run)
```

### 5.3 ci-backend.yml

```yaml
실행 환경: ubuntu-latest
Node.js: 20

서비스:
  - MongoDB 7.0 (포트 27017)

단계:
  1. 코드 체크아웃
  2. Node.js 설정
  3. aims_api 의존성 설치
  4. 백엔드 테스트 실행 (npm run test:ci)
```

### 5.4 ci-python.yml

```yaml
실행 환경: ubuntu-latest
Python: 3.11

서비스:
  - MongoDB 7.0 (포트 27017)

단계:
  1. 코드 체크아웃
  2. Python 설정
  3. 의존성 설치 (annual_report_api, aims_rag_api, pdf_proxy)
  4. annual_report_api 테스트
  5. aims_rag_api 테스트
```

### 5.5 ci-e2e.yml

```yaml
실행 환경: ubuntu-latest
트리거: pull_request (frontend/aims-uix3 경로 변경 시)

단계:
  1. 코드 체크아웃
  2. Node.js 설정
  3. 의존성 설치
  4. Playwright 브라우저 설치 (chromium)
  5. 프로덕션 빌드
  6. 미리보기 서버 시작
  7. 접근성 테스트 (tests/a11y)
  8. 시각적 회귀 테스트 (tests/visual)
  9. 아티팩트 업로드 (보관 7일)
```

---

## 6. 테스트 실행 명령어 요약

### 프론트엔드

```bash
cd frontend/aims-uix3

# Vitest 유닛 테스트
npm test
npm run test:ui
npm run test:coverage

# Playwright E2E
npx playwright test
npx playwright test tests/a11y
npx playwright test tests/visual

# 타입 체크
npm run typecheck
```

### 백엔드 (Node.js)

```bash
cd backend/api/aims_api
npm run test:ci
npm run test:watch
npm run test:coverage
```

### 백엔드 (Python)

```bash
# annual_report_api
cd backend/api/annual_report_api
python -m pytest -v

# aims_rag_api
cd backend/api/aims_rag_api
python -m pytest -v
```

### GUI 테스트 (SikuliX)

```powershell
# PowerShell (Windows)
java -jar "C:\SikuliX\sikulixide-2.0.5.jar" -r "D:\aims\tools\MetlifePDF.sikuli\verify_customer_integrated_view.py"
```

---

## 7. 개선 권장사항

### 7.1 테스트 커버리지 확대 필요

| 서비스 | 현황 | 권장사항 |
|--------|------|---------|
| document_pipeline | 테스트 0개 | 테스트 스위트 추가 필요 |
| aims_rag_api | 테스트 2개 | 커버리지 확대 필요 |
| annual_report_api | 기본 테스트만 | 엣지 케이스 추가 필요 |

### 7.2 테스트 커버리지 강점

| 서비스 | 테스트 수 | 강점 |
|--------|----------|------|
| aims_mcp | 172개 | 가장 철저한 유닛 테스트 |
| 프론트엔드 유닛 | 191개 | 광범위한 컴포넌트/서비스 테스트 |
| 프론트엔드 E2E | 28개 | 사용자 플로우 + 접근성 검증 |
| aims_api | 18개 | 데이터 격리, 삭제, 권한 검증 |

### 7.3 추가 권장사항

1. **document_pipeline 테스트 추가**: 문서 처리 파이프라인 핵심 로직 테스트
2. **aims_rag_api 테스트 확대**: RAG 검색 정확도 테스트
3. **E2E 시나리오 확대**: 복잡한 사용자 플로우 테스트 추가
4. **성능 테스트 자동화**: 로드 테스트를 CI/CD에 통합

---

## 8. 관련 파일 경로

### 설정 파일
- `frontend/aims-uix3/vite.config.ts` - Vitest 설정
- `frontend/aims-uix3/playwright.config.ts` - Playwright 설정
- `backend/api/aims_api/package.json` - Jest 설정
- `backend/api/aims_mcp/vitest.config.ts` - Vitest 설정

### CI/CD 워크플로우
- `.github/workflows/ci.yml`
- `.github/workflows/ci-frontend.yml`
- `.github/workflows/ci-backend.yml`
- `.github/workflows/ci-python.yml`
- `.github/workflows/ci-e2e.yml`

### 테스트 디렉토리
- `frontend/aims-uix3/src/` - 프론트엔드 유닛 테스트
- `frontend/aims-uix3/tests/` - 프론트엔드 E2E 테스트
- `backend/api/aims_api/__tests__/` - aims_api 테스트
- `backend/api/aims_mcp/src/` - aims_mcp 테스트
- `backend/api/annual_report_api/tests/` - annual_report_api 테스트
- `tools/MetlifePDF.sikuli/` - SikuliX GUI 테스트
- `tests/backend-api/` - 통합 테스트
- `tests/load-test/` - 로드 테스트

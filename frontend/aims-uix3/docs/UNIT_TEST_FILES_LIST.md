# 📋 AIMS UIX3 테스트 파일 전체 목록

**작성일**: 2025-10-14
**총 파일 수**: 21개 (Unit Test 11개 + E2E Test 10개)
**총 테스트 수**: 322개 (통과 310개 + Skip 12개)

---

## 🧪 Unit Test (Vitest) - 11개 파일

### 📁 Entities (4개 파일, 176개 테스트)

#### 1. Customer Entity

**`src/entities/customer/model.test.ts`**
- **테스트 수**: 37개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - `getDisplayName`: 표시용 이름 추출 (3개)
  - `getAge`: 나이 계산 및 엣지 케이스 (5개)
  - `sortByName`: 한글 정렬 로직 (3개)
  - `getCustomerTypeText`: 고객 유형 텍스트 (4개)
  - `getCustomerTypeColor`: 고객 유형 색상 (4개)
  - 기타 유틸리티 메서드 (18개)

**`src/entities/customer/schema.test.ts`**
- **테스트 수**: 36개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - `AddressSchema`: 주소 검증 (3개)
  - `PersonalInfoSchema`: 개인정보 검증 (6개)
  - `InsuranceInfoSchema`: 보험정보 검증 (4개)
  - `MetaSchema`: 메타데이터 검증 (4개)
  - `CustomerSchema`: 고객 전체 검증 (3개)
  - `CreateCustomerSchema`: 생성 요청 검증 (3개)
  - `UpdateCustomerSchema`: 수정 요청 검증 (4개)
  - `CustomerSearchQuerySchema`: 검색 쿼리 검증 (5개)
  - `CustomerSearchResponseSchema`: 검색 응답 검증 (4개)

---

#### 2. Document Entity

**`src/entities/document/model.test.ts`**
- **테스트 수**: 70개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - `getDisplayName`: 문서 표시명 (3개)
  - `formatFileSize`: 파일 크기 포맷팅 (7개)
  - `getFileExtension`: 파일 확장자 추출 (6개)
  - `getFileIcon`: SF Symbol 아이콘 선택 (10개)
  - `getFileTypeClass`: CSS 클래스 선택 (9개)
  - `getOCRStatusText`: OCR 상태 텍스트 (4개)
  - `getStatusText`: 문서 상태 텍스트 (3개)
  - `formatUploadDate`: 날짜 포맷팅 (3개)
  - `getFileTypePriority`: 파일 우선순위 (8개)
  - `sortByFilename`: 파일명 정렬 (3개)
  - `sortByUploadDate`: 날짜 정렬 (2개)
  - `sortBySize`: 크기 정렬 (2개)
  - `sortByFileType`: 타입 정렬 (2개)
  - `DocumentTagUtils`: 태그 관리 (8개)

**`src/entities/document/DocumentProcessingModule.test.ts`**
- **테스트 수**: 33개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - `getProcessingStatus`: 처리 상태 확인 (7개)
  - `extractSummary`: 요약 텍스트 추출 (9개)
  - `extractFullText`: 전체 텍스트 추출 (6개)
  - `getCustomerLinkStatus`: 고객 연결 상태 (4개)
  - `getAvailableActions`: 사용 가능한 액션 (4개)
  - 통합 및 엣지 케이스 (3개)

---

### 📁 Controllers (4개 파일, 77개 테스트)

**`src/controllers/useDocumentSearchController.test.ts`**
- **테스트 수**: 18개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - 초기 상태 테스트 (2개)
  - `handleQueryChange`: 검색어 변경 (2개)
  - `handleSearchModeChange`: 검색 모드 변경 (2개)
  - `handleKeywordModeChange`: 키워드 모드 변경 (2개)
  - `handleReset`: 상태 초기화 (1개)
  - `handleSearch` 성공 케이스 (4개)
  - `handleSearch` 에러 케이스 (3개)
  - 통합 시나리오 (2개)

**`src/controllers/useCustomersController.test.tsx`**
- **테스트 수**: 27개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - 초기 상태 테스트 (2개)
  - `loadCustomers`: 고객 로드 (3개)
  - `loadMoreCustomers`: 페이지네이션 (3개)
  - 검색 테스트 (2개)
  - `createCustomer`: 고객 생성 (2개)
  - `updateCustomer`: 고객 수정 (2개)
  - `deleteCustomer`: 고객 삭제 (2개)
  - UI 핸들러 테스트 (7개)
  - 계산된 값 테스트 (4개)

**`src/controllers/useAppleConfirmController.test.ts`**
- **테스트 수**: 18개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - 초기 상태 테스트 (2개)
  - `openModal`: 모달 열기 (3개)
  - `confirm`: 확인 동작 (4개)
  - `cancel`: 취소 동작 (4개)
  - `resetModal`: 모달 리셋 (2개)
  - Promise 기반 플로우 (3개)

**`src/controllers/useDocumentStatusController.test.ts`**
- **테스트 수**: 14개
- **작성일**: 2025-10-14 이전 (기존)
- **상태**: ✅ 통과
- **내용**: 문서 상태 Controller Hook 기본 테스트

---

### 📁 Services (1개 파일, 38개 테스트)

**`src/services/searchService.test.ts`**
- **테스트 수**: 38개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - `getFilePath`: 파일 경로 추출 fallback (5개)
  - `getOriginalName`: 파일명 추출 fallback (5개)
  - `getSummary`: 요약 추출 fallback (5개)
  - `getFullText`: 전체 텍스트 추출 fallback (5개)
  - `searchDocuments`: 시맨틱 검색 (6개)
  - `searchDocumentsKeyword`: 키워드 검색 (6개)
  - 검색 결과 변환 (6개)

---

### 📁 Utils (1개 파일, 19개 테스트)

**`src/utils/downloadHelper.test.ts`**
- **테스트 수**: 19개
- **작성일**: 2025-10-14 (신규)
- **상태**: ✅ 통과
- **내용**:
  - URL 생성 로직 (5개)
  - 파일명 추출 로직 (3개)
  - 다운로드 실행 로직 (4개)
  - 옵션 처리 (4개)
  - 엣지 케이스 (3개)

---

### 📁 Components (1개 파일, 12개 테스트 Skip)

**`src/components/DocumentViews/DocumentStatusView/DocumentStatusView.test.tsx`**
- **테스트 수**: 12개 (모두 skip)
- **작성일**: 2025-10-14 이전 (기존)
- **상태**: ⏭️ Skip (수정 필요)
- **내용**: DocumentStatusView 컴포넌트 통합 테스트
- **Skip 이유**: 컴포넌트 구조 변경으로 수정 필요
- **TODO**: 컴포넌트 구현 확인 후 테스트 업데이트

---

## 🎭 E2E Test (Playwright) - 10개 파일

**위치**: `tests/` 디렉토리
**프레임워크**: Playwright
**실행**: Vitest에서 제외됨 (vite.config.ts의 exclude 설정)
**명령어**: `npx playwright test`

### 1. 주소 검색 테스트

**`tests/address-search-uix2-complete.spec.ts`**
- **내용**: UIX3 주소 검색 완전 테스트 (UIX2 방식)
- **시나리오**: 주소 검색 → 모달 → 검색 → 선택 → 상세주소 입력

---

### 2. 폼 검증 테스트

**`tests/all-fields-save-test.spec.ts`**
- **내용**: 모든 필드 저장 검증
- **시나리오**: 전체 폼 필드 입력 및 저장 테스트

**`tests/no-validation-test.spec.ts`**
- **내용**: 검증 없이 모든 값 저장 테스트
- **시나리오**: 유효성 검사 우회 테스트

---

### 3. 고객 CRUD 테스트

**`tests/customer-crud-simple.spec.ts`**
- **내용**: 고객 CRUD 간단 테스트
- **시나리오**: 기본 생성/조회/수정/삭제 플로우

**`tests/customer-crud-full-test.spec.ts`**
- **내용**: 고객 CRUD 전체 시나리오 테스트
- **시나리오**: 완전한 CRUD 워크플로우

**`tests/customer-crud-10x.spec.ts`**
- **내용**: 고객 CRUD 10회 반복 테스트
- **타임아웃**: 1시간
- **시나리오**: 부하 테스트 (10회 반복)

**`tests/customer-crud-100x.spec.ts`**
- **내용**: 고객 CRUD 100회 반복 테스트
- **타임아웃**: 1시간
- **시나리오**: 고부하 테스트 (100회 반복)

---

### 4. UI 컴포넌트 테스트

**`tests/customer-edit-modal.spec.ts`**
- **내용**: 고객 정보 수정 모달 테스트
- **시나리오**: 모달 열기/닫기, 수정 플로우

**`tests/customer-icons.spec.ts`**
- **내용**: 고객 전체보기 아이콘 테스트
- **시나리오**: 아이콘 렌더링 및 동작 검증

**`tests/menu-icon-colors.spec.ts`**
- **내용**: LeftPane 메뉴 아이콘 색상 테스트
- **시나리오**: 테마별 아이콘 색상 검증

---

## 📊 통계 요약

### Unit Test (Vitest)

| 카테고리 | 파일 수 | 테스트 수 | 상태 | 작성일 |
|---------|---------|-----------|------|--------|
| **Entities** | 4 | 176 | ✅ 100% | 2025-10-14 |
| **Controllers** | 3 | 63 | ✅ 100% | 2025-10-14 |
| **Services** | 1 | 38 | ✅ 100% | 2025-10-14 |
| **Utils** | 1 | 19 | ✅ 100% | 2025-10-14 |
| **기존 Controller** | 1 | 14 | ✅ 100% | 기존 |
| **기존 Component** | 1 | 12 | ⏭️ Skip | 기존 |
| **총계** | **11** | **322** | **96.3%** | - |

**신규 작성 (2025-10-14)**: 296개 테스트 (9개 파일)
**통과**: 310개 (96.3%)
**Skip**: 12개 (3.7%)
**실패**: 0개
**총 코드 라인**: 2,654줄

---

### E2E Test (Playwright)

| 카테고리 | 파일 수 | 설명 |
|---------|---------|------|
| 주소 검색 | 1 | 주소 검색 완전 플로우 |
| 폼 검증 | 2 | 전체 필드 저장, 검증 우회 |
| 고객 CRUD | 4 | Simple, Full, 10회, 100회 반복 |
| UI 컴포넌트 | 3 | 수정 모달, 아이콘, 색상 테스트 |
| **총계** | **10** | Playwright로 실행 |

---

## 🎯 테스트 실행 명령어

### Unit Test (Vitest)

```bash
# 전체 실행
npm test -- --run

# Watch 모드 (개발 중)
npm test

# 커버리지 포함
npm test -- --run --coverage

# 카테고리별 실행
npm test -- src/entities/          # Entities만
npm test -- src/controllers/       # Controllers만
npm test -- src/services/          # Services만
npm test -- src/utils/             # Utils만

# 특정 파일
npm test -- src/entities/customer/model.test.ts

# UI 모드
npm test -- --ui
```

---

### E2E Test (Playwright)

```bash
# 전체 실행
npx playwright test

# UI 모드
npx playwright test --ui

# 특정 파일
npx playwright test tests/customer-crud-simple.spec.ts

# 헤드리스 모드 해제 (브라우저 표시)
npx playwright test --headed

# 디버그 모드
npx playwright test --debug
```

---

## 📈 테스트 커버리지 목표

### 현재 상태 (2025-10-14)
- ✅ **Entities**: 4개 파일, 176개 테스트
- ✅ **Controllers**: 4개 파일, 77개 테스트
- ✅ **Services**: 1개 파일, 38개 테스트
- ✅ **Utils**: 1개 파일, 19개 테스트
- ⏳ **Components**: 1개 파일 (수정 필요)

### 향후 확장 예정
- [ ] API 레이어 테스트 (customerService, documentService)
- [ ] 추가 컴포넌트 테스트
- [ ] 통합 테스트 확대
- [ ] Visual Regression Test

---

## 📝 테스트 파일 명명 규칙

### Unit Test
```
{소스파일명}.test.ts
{소스파일명}.test.tsx

예시:
src/entities/customer/model.ts     → model.test.ts
src/controllers/useCustomers.tsx   → useCustomers.test.tsx
```

### E2E Test
```
{기능명}.spec.ts
{기능명}.spec.tsx

예시:
customer-crud-simple.spec.ts
address-search-complete.spec.ts
```

---

## 🔗 관련 문서

- **테스트 실행 가이드**: `UNIT_TEST_GUIDE.md`
- **프로젝트 완료 보고서**: `UNIT_TEST_COMPLETION_REPORT.md`
- **문제 해결 가이드**: `UNIT_TEST_TROUBLESHOOTING.md`
- **발견된 버그**: `UNIT_TEST_FINDINGS.md`

---

## 📅 이력

| 날짜 | 작업 | 파일 수 | 테스트 수 |
|------|------|---------|-----------|
| 2025-10-14 | 신규 Unit Test 작성 | +9 | +296 |
| 2025-10-14 | 기존 테스트 정리 | - | - |
| 2025-10-14 | E2E 테스트 분리 | -10 (제외) | - |

---

**작성일**: 2025-10-14
**최종 업데이트**: 2025-10-14
**총 테스트 수**: 322개 (Unit 322개 + E2E 10개 파일)
**통과율**: 96.3% (310/322)

---

## 💡 Quick Reference

```bash
# ✅ Unit Test 실행
npm test -- --run                              # 전체
npm test -- src/entities/customer/model.test.ts # 특정 파일

# 🎭 E2E Test 실행
npx playwright test                            # 전체
npx playwright test tests/customer-crud-simple.spec.ts # 특정 파일

# 📊 커버리지
npm test -- --run --coverage

# 🔍 UI 모드
npm test -- --ui                               # Vitest
npx playwright test --ui                       # Playwright
```

**Happy Testing!** 🚀

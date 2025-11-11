# AIMS UIX3 추가 유닛 테스트 계획서

**작성일**: 2025-10-14
**현재 테스트 현황**: 총 310개 (Entity 176개, Controller 63개, Service 38개, Utils 19개, Hooks 14개)

---

## 📊 현재 상태 요약

### 이미 완료된 테스트 영역
- ✅ **Entities** (176 tests): Customer, Document, Search 모델 및 유틸리티
- ✅ **Controllers** (63 tests): useDocumentSearchController, useCustomersController
- ✅ **Services** (38 tests): SearchService, CustomerUtils
- ✅ **Utils** (19 tests): DownloadHelper
- ✅ **Hooks** (14 tests): useCustomerDocumentsController

### 아직 테스트되지 않은 영역

**총 17개 파일** (약 4,752 LOC)

| 카테고리 | 파일명 | 라인 수 | 복잡도 | 우선순위 |
|---------|--------|--------|--------|---------|
| **Services** | DocumentService.ts | 595 | ★★★★★ | HIGH |
| **Services** | DocumentStatusService.ts | 545 | ★★★★★ | HIGH |
| **Stores** | CustomerDocument.ts | 410 | ★★★★★ | HIGH |
| **Utils** | appleConfirm.ts | 395 | ★★★★☆ | MEDIUM |
| **Services** | customerService.ts | 360 | ★★★★☆ | HIGH |
| **Services** | hapticService.ts | 293 | ★★★☆☆ | LOW |
| **Services** | relationshipService.ts | 244 | ★★★☆☆ | MEDIUM |
| **Hooks** | useNavigation.ts | 227 | ★★★☆☆ | MEDIUM |
| **Controllers** | useCustomerRelationshipsController.ts | 200 | ★★★☆☆ | MEDIUM |
| **Hooks** | useCustomerDocument.ts | 164 | ★★★☆☆ | MEDIUM |
| **Hooks** | useDraggable.ts | 144 | ★★☆☆☆ | LOW |
| **Utils** | navigationUtils.ts | 133 | ★★☆☆☆ | LOW |
| **Services** | addressService.ts | 123 | ★★☆☆☆ | MEDIUM |
| **Services** | modalService.ts | 121 | ★★☆☆☆ | LOW |
| **Utils** | hapticFeedback.ts | 103 | ★☆☆☆☆ | LOW |
| **Hooks** | useGaps.ts | ?? | ★☆☆☆☆ | LOW |
| **Controllers** | useDocumentsController.tsx | ?? | ★★★★☆ | HIGH |

---

## 🎯 우선순위 기준

테스트 우선순위는 다음 기준으로 결정:

1. **비즈니스 중요도** - 핵심 도메인 로직 포함 여부
2. **복잡도** - 코드 라인 수, 메서드 개수, 로직 복잡성
3. **영향 범위** - 다른 모듈에 미치는 영향
4. **버그 가능성** - 데이터 변환, 조건 분기, 비동기 처리 등
5. **재사용성** - 프로젝트 전반에서 사용되는 빈도

---

## 📋 Phase 1: HIGH Priority (Core Business Logic)

**목표**: 핵심 비즈니스 로직의 안정성 확보
**예상 테스트 수**: ~180개

### 1.1 DocumentService.ts (595 LOC) - 예상 60개 테스트

**중요도**: ⭐⭐⭐⭐⭐
**복잡도**: 매우 높음
**테스트 범위**:

#### 기본 CRUD 메서드 (20개)
- `getDocuments()` - 페이지네이션, 정렬, 검색 파라미터 처리
- `getDocument()` - ID 검증, 에러 처리
- `createDocument()` - Zod 검증, 응답 파싱
- `updateDocument()` - 부분 업데이트, 검증
- `deleteDocument()` - 소프트 삭제 로직

#### 검색 및 필터링 (15개)
- `searchDocuments()` - 빈 검색어, 특수문자, 공백 처리
- `getDocumentsByCustomer()` - 고객 ID 검증, 빈 결과 처리
- URL 파라미터 구성 로직 (sortBy 매핑 등)

#### 고객-문서 연결 관리 (10개)
- `getCustomerDocuments()` - 복잡한 응답 파싱 로직
- `linkDocumentToCustomer()` - 페이로드 검증
- `unlinkDocumentFromCustomer()` - ID 검증, 에러 처리

#### 유틸리티 메서드 (10개)
- `getDocumentTags()` - 배열 검증, 타입 필터링
- `getDocumentStats()` - 통계 객체 구조 검증
- `uploadDocument()` - FormData 생성, 메타데이터 처리
- `downloadDocument()` - Blob 응답 처리

#### 일괄 처리 (5개)
- `deleteDocuments()` - 병렬 처리, 부분 실패
- `archiveDocuments()` - 상태 변경 검증

---

### 1.2 DocumentStatusService.ts (545 LOC) - 예상 50개 테스트

**중요도**: ⭐⭐⭐⭐⭐
**복잡도**: 매우 높음
**테스트 범위**:

#### API 호출 메서드 (10개)
- `checkHealth()` - HTTP 에러 처리, CORS
- `getRecentDocuments()` - limit 파라미터, 응답 파싱
- `getDocumentStatus()` - 상태 조회, 에러 처리
- `getDocumentDetailViaWebhook()` - n8n 통합

#### 데이터 추출 메서드 (25개)
- `extractFilename()` - 복잡한 fallback 체인 (10개)
- `extractSaveName()` - upload/stages 분기
- `extractFileSize()` - 다양한 필드명 처리
- `extractStatus()` - DocumentProcessingModule 통합
- `extractProgress()` - 복잡한 진행률 계산 로직 (8개)
- `extractUploadedDate()` - 날짜 문자열 정리 ('xxx' 제거)

#### 처리 경로 분석 (10개)
- `analyzeProcessingPath()` - 복잡한 badges/pathType 로직
  - unsupported MIME 처리
  - 페이지 수 제한 체크
  - meta_fulltext vs ocr_normal 분기
  - OCR 상태별 badge 생성

#### 유틸리티 (5개)
- `formatUploadDate()` - 날짜 포맷팅, 에러 처리
- `getStatusLabel()`, `getStatusIcon()` - 상태 매핑

---

### 1.3 CustomerDocument.ts (410 LOC) - 예상 40개 테스트

**중요도**: ⭐⭐⭐⭐⭐
**복잡도**: 매우 높음 (Singleton + Observer 패턴)
**테스트 범위**:

#### Singleton 패턴 (5개)
- `getInstance()` - 단일 인스턴스 보장
- 여러 번 호출 시 동일 인스턴스 반환

#### Observer 패턴 (10개)
- `subscribe()` - 구독 추가, unsubscribe 함수 반환
- `notify()` - 모든 구독자에게 알림
- 여러 구독자 등록 및 제거
- 순환 참조 방지

#### CRUD 메서드 (15개)
- `loadCustomers()` - API 호출, 상태 업데이트, Observer 알림
- `createCustomer()` - 생성 후 상태 업데이트 및 알림
- `updateCustomer()` - 수정 후 로컬 상태 갱신
- `deleteCustomer()` - 삭제 후 필터링
- `refresh()` - 강제 리로드

#### 상태 관리 (10개)
- `getCustomers()`, `getTotal()`, `getHasMore()`
- `getIsLoading()`, `getError()`, `getLastUpdated()`
- `getCustomerById()` - 로컬 검색
- `reset()` - 전체 초기화
- `debug()` - 로깅

---

### 1.4 customerService.ts (360 LOC) - 예상 30개 테스트

**중요도**: ⭐⭐⭐⭐☆
**복잡도**: 높음 (15+ 메서드)
**테스트 범위**:

#### 기본 CRUD (12개)
- `getCustomers()` - 페이지네이션, 검색
- `getCustomer()` - ID 검증
- `createCustomer()` - Zod 검증
- `updateCustomer()` - 부분 업데이트
- `deleteCustomer()` - 소프트 삭제

#### 검색 및 필터링 (8개)
- `searchCustomers()` - 검색 쿼리 처리
- `getCustomersByStatus()` - 상태 필터
- 정렬 파라미터 처리

#### 데이터 관리 (10개)
- `exportCustomers()` - CSV/Excel 내보내기
- `importCustomers()` - 파일 업로드, 검증
- `getCustomerStats()` - 통계 조회

---

### 1.5 useDocumentsController.tsx (LOC 미확인) - 예상 25개 테스트

**중요도**: ⭐⭐⭐⭐☆
**복잡도**: 높음
**테스트 범위**:

#### 초기 상태 (3개)
- 초기값 검증
- 액션 핸들러 제공

#### 문서 로딩 (8개)
- `loadDocuments()` - 성공/실패
- `loadMoreDocuments()` - 페이지네이션
- 로딩 상태 관리

#### CRUD 액션 (8개)
- `createDocument()`, `updateDocument()`, `deleteDocument()`
- 에러 처리

#### UI 핸들러 (6개)
- 검색, 필터, 정렬 변경
- 폼 열기/닫기

---

## 📋 Phase 2: MEDIUM Priority (Supporting Features)

**목표**: 지원 기능 및 UI 로직 안정성 확보
**예상 테스트 수**: ~100개

### 2.1 useCustomerRelationshipsController.ts (200 LOC) - 예상 20개 테스트

**테스트 범위**:
- 초기 상태 및 관계 로딩 (8개)
- 관계 삭제 (4개)
- 관계 타입 라벨 조회 (4개)
- 이벤트 리스너 (relationshipChanged) (4개)

### 2.2 relationshipService.ts (244 LOC) - 예상 18개 테스트

**테스트 범위**:
- `getRelationshipTypes()` - API 호출, 캐싱 (5개)
- `getCustomerRelationships()` - 고객별 관계 조회 (5개)
- `createRelationship()` - 관계 생성, 검증 (4개)
- `deleteRelationship()` - 삭제, 에러 처리 (4개)

### 2.3 addressService.ts (123 LOC) - 예상 15개 테스트

**테스트 범위**:
- `getAddressHistory()` - 주소 이력 조회 (5개)
- `formatAddress()` - 한국 주소 포맷팅 (5개)
- `formatDate()` - 날짜 포맷 (5개)

### 2.4 appleConfirm.ts (395 LOC) - 예상 25개 테스트

**테스트 범위**:
- `showAppleConfirm()` - DOM 조작, Promise 처리 (10개)
- `showOversizedFilesModal()` - 파일 크기 모달 (8개)
- 상태 관리 (isModalOpen) (3개)
- 이벤트 처리 (클릭, ESC) (4개)

### 2.5 useCustomerDocument.ts (164 LOC) - 예상 18개 테스트

**테스트 범위**:
- Document 구독 및 상태 동기화 (8개)
- CRUD 메서드 위임 (8개)
- 메모이제이션 검증 (2개)

### 2.6 useNavigation.ts (227 LOC) - 예상 22개 테스트

**테스트 범위**:
- 휠 네비게이션 (8개)
- 키보드 네비게이션 (10개)
- 순환/비순환 모드 (4개)

---

## 📋 Phase 3: LOW Priority (UI Enhancements)

**목표**: UI 개선 및 피드백 메커니즘 테스트
**예상 테스트 수**: ~60개

### 3.1 hapticService.ts (293 LOC) - 예상 20개 테스트

**테스트 범위**:
- `trigger()` - 햅틱 타입별 패턴 실행 (8개)
- `configure()` - 설정 변경 (4개)
- `isSupported()` - 브라우저 지원 확인 (2개)
- 디바운스 로직 (3개)
- `testSequence()` - 테스트 시퀀스 (3개)

### 3.2 modalService.ts (121 LOC) - 예상 15개 테스트

**테스트 범위**:
- `validateMessage()` - 메시지 검증, 길이 제한 (5개)
- `validateTitle()` - 타이틀 검증 (3개)
- `validateParams()` - 전체 검증 (3개)
- 템플릿 메서드들 (4개)

### 3.3 navigationUtils.ts (133 LOC) - 예상 12개 테스트

### 3.4 hapticFeedback.ts (103 LOC) - 예상 8개 테스트

### 3.5 useDraggable.ts (144 LOC) - 예상 10개 테스트

### 3.6 useGaps.ts - 예상 5개 테스트

---

## 📊 예상 테스트 통계

| Phase | 카테고리 | 파일 수 | 예상 테스트 수 | 예상 소요 시간 |
|-------|---------|--------|---------------|---------------|
| **Phase 1** | HIGH Priority | 5개 | ~205개 | 8-10시간 |
| **Phase 2** | MEDIUM Priority | 6개 | ~118개 | 4-6시간 |
| **Phase 3** | LOW Priority | 6개 | ~70개 | 2-3시간 |
| **총계** | | **17개** | **~393개** | **14-19시간** |

**기존 테스트와 합산 시**: 310 + 393 = **703개 테스트**

---

## 🎯 권장 실행 순서

### Week 1: High Priority Core Services
1. ✅ DocumentService.ts (60 tests)
2. ✅ DocumentStatusService.ts (50 tests)
3. ✅ CustomerDocument.ts (40 tests)

### Week 2: High Priority Controllers & Customer Service
4. ✅ customerService.ts (30 tests)
5. ✅ useDocumentsController.tsx (25 tests)

### Week 3: Medium Priority Supporting Features
6. ✅ appleConfirm.ts (25 tests)
7. ✅ useNavigation.ts (22 tests)
8. ✅ useCustomerRelationshipsController.ts (20 tests)

### Week 4: Medium Priority Services & Hooks
9. ✅ relationshipService.ts (18 tests)
10. ✅ useCustomerDocument.ts (18 tests)
11. ✅ addressService.ts (15 tests)

### Week 5: Low Priority UI & Utils
12. ✅ hapticService.ts (20 tests)
13. ✅ modalService.ts (15 tests)
14. ✅ navigationUtils.ts (12 tests)
15. ✅ useDraggable.ts (10 tests)
16. ✅ hapticFeedback.ts (8 tests)
17. ✅ useGaps.ts (5 tests)

---

## 🔍 테스트 작성 시 주의사항

### 1. DocumentService & DocumentStatusService
- **복잡한 응답 파싱 로직**: fallback 체인의 모든 경로 테스트
- **타입 안정성**: Zod 검증 실패 케이스
- **에러 처리**: HTTP 에러, 네트워크 실패, 타임아웃
- **Edge Cases**: null, undefined, 빈 배열, 빈 객체

### 2. CustomerDocument (Singleton + Observer)
- **Singleton**: 인스턴스 재사용 검증
- **Observer**: 구독/해제 누수 방지
- **동시성**: 여러 구독자 동시 알림
- **상태 일관성**: CRUD 작업 후 상태 동기화

### 3. Controller Hooks
- **React Testing Library**: renderHook 활용
- **비동기 처리**: waitFor, act 사용
- **의존성 주입**: Mock Service 사용
- **재렌더링**: 상태 변경 시 리렌더링 확인

### 4. Service Layer
- **API Mocking**: MSW 또는 vitest.mock 활용
- **에러 시나리오**: 4xx, 5xx 응답 처리
- **데이터 검증**: Zod 스키마 검증 테스트

---

## 📝 테스트 파일 네이밍 규칙

```
src/services/DocumentService.ts
→ src/services/__tests__/DocumentService.test.ts

src/controllers/useDocumentsController.tsx
→ src/controllers/__tests__/useDocumentsController.test.tsx

src/stores/CustomerDocument.ts
→ src/stores/__tests__/CustomerDocument.test.ts
```

---

## 🚀 다음 단계

1. **Phase 1 시작**: DocumentService.ts 테스트부터 착수
2. **지속적 통합**: 각 Phase 완료 시 전체 테스트 수행
3. **커버리지 확인**: 80% 이상 유지 목표
4. **리팩토링**: 테스트 통과 후 코드 개선 기회 탐색

---

**작성자**: Claude (AI Assistant)
**검토 필요**: ✅ 우선순위 조정, 예상 테스트 수 검증
**승인 후**: Phase 1부터 순차적 구현 시작

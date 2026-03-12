# AIMS 코드베이스 확장성 분석 보고서

**작성일**: 2026-03-12
**목적**: 프로젝트 규모 증가에 따른 개발 속도 저하 원인 분석 및 근본 해결책 제시
**검토**: Alex (아키텍트), Gini (품질), PM (비즈니스), Performance (성능) — 2026-03-12

---

## 1. 현황 요약

### 1.1 프로젝트 규모

| 영역 | 파일 수 | LOC (Lines of Code) |
|------|---------|---------------------|
| Frontend (TSX/TS) | 641 | ~202,500 |
| Frontend CSS | 222 | 별도 |
| Backend (JS) | 171 | ~61,800 |
| Backend (PY) | 147+ (venv 제외) | 별도 |
| **합계** | **~1,181+** | **~264,000+** |

### 1.2 빌드/개발 성능

| 항목 | 수치 | 판정 |
|------|------|------|
| Vite 빌드 시간 (tsc + vite) | **~4.4초** | 정상 |
| TypeScript 타입체크 (cold) | **~1.1초** | 정상 |
| 번들 크기 (index.js) | 366KB (gzip 111KB) | 정상 |
| 최대 청크 (ProductSearchModal) | 435KB (gzip 145KB) | **xlsx 번들 포함 — 분리 필요** |
| 전체 테스트 실행 | **98.5초** (4,549 케이스) | **주의 — 선형 증가 예상** |
| CSS HMR | full-reload 강제 (`cssReloadPlugin`) | Windows 안정성 트레이드오프 |

**결론: 빌드 도구는 병목이 아니다. 테스트 실행 시간(98.5초)은 파일 증가에 따라 주시 필요.**

---

## 2. 근본 원인 분석

### 2.1 문제의 계층 구조

> **Alex 아키텍트 검토 결과**: 거대 컴포넌트는 **증상**이지 **원인**이 아니다. 근본 원인은 아키텍처 경계의 부재다.

```
근본 원인 (Root Cause)
├── 아키텍처 경계 부재 — components/ ↔ features/ 양방향 의존
├── 암묵적 이벤트 버스 — CustomEvent 패턴 20곳+ (타입 안전성 0)
├── 상태 관리 4계층 혼재 — Zustand + Context + Controller + useState
└── 증상 (Symptom)
    └── God Component — 23개 파일이 1000줄 이상
        └── 체감 — AI/개발자 속도 저하
```

### 2.2 근본 원인 1: 양방향 의존성

`components/` → `features/` 방향과 `features/` → `components/` 방향 모두 import이 존재.

- `ChatPanel` → customer의 pdfParser import
- `DocumentRegistrationView` → annual-report, batch-upload 등 6개 도메인에서 import (56줄)
- 파일을 쪼개더라도 이 결합도는 줄지 않음

### 2.3 근본 원인 2: 암묵적 이벤트 버스

`window.dispatchEvent(new CustomEvent('customerChanged'))` 등이 최소 20곳에서 사용.

- 디버깅 시 이벤트 발행자-구독자 추적 불가
- TypeScript 타입 안전성 완전 우회
- 리팩토링 시 grep으로도 영향 범위 완전 파악 불가
- ExcelRefiner 하나에서 `customerChanged`, `contractChanged`, `popstate` 3종 발생

### 2.4 근본 원인 3: 상태 관리 혼재

| 계층 | 수량 | 비고 |
|------|------|------|
| Zustand store | 2개 | user, CustomerDocument |
| Context/Provider | 5+개 | DocumentStatusProvider 830줄, hook 63개 — 자체가 God Object |
| Controller hooks | 5+개 | useDocumentsController 등 |
| 컴포넌트 내 useState | 각 파일 수십 개 | 분할해도 이 상태 공유가 병목 |

### 2.5 거대 파일 현황

#### 2000줄 이상 (CRITICAL)

| 파일 | LOC | Hook 호출 수 | 수정빈도(2026) | 현재 분할 상태 |
|------|-----|-------------|----------------|---------------|
| `ContractViews/components/ExcelRefiner.tsx` | 4,633 | ~93 | 낮음 | 단일 파일 |
| `ChatPanel/ChatPanel.tsx` | 3,456 | ~102 | 16회 | 디렉토리 구조 있음 |
| `DocumentRegistrationView/DocumentRegistrationView.tsx` | 3,343 | ~95 | **56회 (1위)** | **부분 분할 완료** (components/, hooks/, services/, types/, utils/) |
| `PersonalFilesView/PersonalFilesView.tsx` | 2,727 | ~111 | 중간 | 단일 파일 |
| `App.tsx` | 2,644 | ~127 | 중간 | AppRouter.tsx(113줄) 이미 분리됨 |
| `DocumentSearchView/DocumentSearchView.tsx` | 2,234 | - | 중간 | 단일 파일 |

> **Gini 검토 결과**: DocumentRegistrationView, DocumentExplorerView, ChatPanel은 이미 디렉토리 구조로 부분 분할됨. 보고서는 "남은 분할 작업"을 명시해야 함.

#### 1000-1999줄 (WARNING) — 17개

| 파일 | LOC | 수정빈도(2026) | 비고 |
|------|-----|----------------|------|
| `ContractsTab.tsx` | 1,902 | - | customer feature |
| `DocumentExplorerView.tsx` | 1,781 | **45회 (2위)** | **부분 분할 완료** (hooks/, components/, types/, utils/) |
| `DocumentsTab.tsx` | 1,732 | 8회 | customer feature |
| `CustomerFullDetailView.tsx` | 1,560 | 3회 | customer feature |
| `DocumentExplorerTree.tsx` | 1,504 | **45회 (공동 2위)** | |
| `CustomerRelationshipView.tsx` | 1,497 | - | |
| `RegionalTreeView.tsx` | 1,378 | - | |
| `DocumentStatusList.tsx` | 1,376 | 7회 | |
| `DocumentLibraryView.tsx` | 1,371 | 9회 | |
| `AccountSettingsView.tsx` | 1,348 | - | |
| `ContractAllView.tsx` | 1,339 | - | |
| `AnnualReportTab.tsx` | 1,303 | - | |
| `NaverMap.tsx` | 1,196 | - | |
| `AllCustomersView.tsx` | 1,148 | - | |
| `CustomerDocumentExplorerView.tsx` | 1,111 | **29회 (4위)** | |
| `CrFileTable.tsx` | 1,064 | - | |
| `ArFileTable.tsx` | 1,047 | - | |

### 2.6 파일 크기 분포

```
0-199줄:    299 파일 (46.7%)  ← 건강한 파일
200-499줄:  229 파일 (35.8%)  ← 허용 범위
500-999줄:   89 파일 (13.9%)  ← 주의 필요
1000-1999줄: 18 파일 (2.8%)   ← 분할 권장
2000줄 이상:   6 파일 (0.9%)   ← 즉시 분할 필요
```

**82.5%의 파일이 500줄 미만**으로 건강한 상태. 문제는 상위 3.7% (24파일)에 집중.

### 2.7 백엔드 — 거대 파일

| 파일 | LOC | 비고 |
|------|-----|------|
| `customers-routes.js` | 4,874 | **BUG-1~4 발생지** — 데이터 정합성 리스크 |
| `documents-routes.js` | 3,217 | 문서 API 전체 |
| `admin-routes.js` | 1,789 | 관리자 API |
| `doc_prep_main.py` | 1,621 | 문서 파이프라인 핵심 |
| `virus-scan-routes.js` | 1,444 | |
| `inquiries-routes.js` | 1,362 | |
| `ocr-usage-routes.js` | 1,346 | |
| `db_writer.py` | 1,325 | |
| `insurance-contracts-routes.js` | 1,257 | |

> **PM 검토 결과**: `customers-routes.js`는 단순한 "큰 파일"이 아니라 **CRITICAL 버그 2건(BUG-1, BUG-2)이 발생한 곳**. 데이터 안전성 관점에서 분할 1순위.

### 2.8 디렉토리별 LOC 분포 (프론트엔드)

```
components/  78,707줄 (39%)  ← 레거시 구조, 거대 파일 집중
features/    39,471줄 (19%)  ← 잘 구조화된 영역
shared/      24,621줄 (12%)
services/    16,282줄 (8%)
hooks/       10,413줄 (5%)
controllers/  4,226줄 (2%)
contexts/     2,587줄 (1%)
stores/       2,010줄 (1%)
기타*        24,183줄 (12%)  ← pages, entities, types, utils, workers, providers 등
                총합: ~202,500줄
```

### 2.9 구조적 기술 부채

| 항목 | 수량 | 위험도 |
|------|------|--------|
| `any` 타입 사용 | ~115곳 | 분할 시 인터페이스 경계에서 타입 오류 폭발 가능 |
| 타입 억제 (`@ts-ignore` 등) | ~23곳 | |
| CustomEvent 이벤트 버스 | ~20곳 | 숨겨진 결합, 디버깅 불가 |
| God Service (`DocumentService.ts`) | 980줄 | 컴포넌트만 분할하면 복잡성이 여기로 이동 |
| God Provider (`DocumentStatusProvider.tsx`) | 830줄, 63 hooks | 자체가 God Object |

---

## 3. 개발 속도 저하 메커니즘

### 3.1 AI 어시스턴트 관점

1. **컨텍스트 로딩 비용**: 3,000줄 파일 수정 시 전체를 읽어야 함
2. **영향 범위 판단 어려움**: 100+ hook + 암묵적 이벤트로 상태 흐름 추적 복잡
3. **Edit 충돌 위험**: 큰 파일일수록 동일 문자열이 여러 곳에 존재
4. **테스트 범위 확대**: 파일 하나 수정해도 관련 없는 기능까지 검증 필요

> **PM 주의**: 이 항목들은 실측 데이터가 아닌 추론이다. AI 컨텍스트 로딩이 체감 개발 속도에서 차지하는 비중은 정량화되지 않았다.

### 3.2 사람(개발자) 관점

1. **코드 탐색 시간**: 원하는 로직 찾기까지 스크롤/검색 반복
2. **머지 충돌 빈도**: 큰 파일에 여러 기능이 있으면 동시 수정 시 충돌
3. **코드 리뷰 부담**: 3,000줄 파일의 diff는 맥락 파악이 어려움
4. **재사용 불가**: 로직이 컴포넌트에 묻혀있어 다른 곳에서 사용 불가

### 3.3 프로세스 관점 (PM 추가)

현재 CLAUDE.md 워크플로우 (설계→Mock 테스트→코드 수정→ALL PASS→Gini 검수→시뮬레이션→사용자 확인)의 단계 수 자체도 속도에 영향을 줄 수 있다. 이 워크플로우는 품질 보장에 필수적이나, 리팩토링에도 동일 사이클을 적용해야 하므로 "수정 시 병행 분할" 전략의 실제 비용이 증가한다.

---

## 4. 해결 전략

### 4.0 대안 비교 (PM 권고로 추가)

코드 분할만이 유일한 해결책이 아니다. 대안들과 비교 후 최적 조합을 선택한다.

| 전략 | 비용 | 효과 | 리스크 | 적용 시기 |
|------|------|------|--------|-----------|
| **A. 코드 분할** | 높음 | 높음 | 회귀 버그 | 수정 시 병행 |
| **B. 파일 내 섹션 인덱스** | 매우 낮음 | 중간 | 없음 | **즉시** |
| **C. 이벤트 버스 → Query 무효화** | 중간 | 높음 | 중간 | Phase 0 |
| **D. Zustand 상태 격리** | 중간 | 높음 | 중간 | Phase 1과 병행 |
| **E. 회귀 테스트 커버리지 강화** | 중간 | 높음 (간접) | 없음 | 상시 |
| **F. 번들 최적화** | 낮음 | 중간 (런타임) | 낮음 | 즉시 |

**권장 조합**: B (즉시) → C (선행) → A+D (점진적) → E (상시)

### 4.1 전략 개요: 점진적 분할 (Strangler Fig Pattern)

전면 리팩토링은 위험하다. **수정이 필요한 시점에 해당 파일만 분할**하는 점진적 접근이 안전하다.

> **주의**: CLAUDE.md "PoC 필수 원칙"에 따라, 첫 번째 분할은 소규모 파일에서 PoC를 수행하고 결과를 검증한 후 본격 진행한다.

### 4.2 프론트엔드 — 컴포넌트 분할

#### 현재 상태 인식

이미 부분 분할된 파일이 다수 존재한다:
- `DocumentRegistrationView/` — components/, hooks/, services/, types/, utils/ 하위 존재
- `DocumentExplorerView/` — hooks/, components/, types/, utils/ 하위 존재
- `ChatPanel/` — 디렉토리 구조 존재

**이들의 남은 작업은 메인 파일(3,000줄+)에서 조합 로직(orchestration)을 더 분리하는 것이다.**

#### 패턴 A: 커스텀 훅 추출 (가장 안전)

비즈니스 로직이 포함된 `useEffect + useState` 조합을 추출한다. 단순 memoization hook(`useMemo`, `useCallback`, `useRef`)은 추출 대상이 아니다.

```
Before:
  ChatPanel.tsx (3,456줄)

After:
  ChatPanel.tsx (500줄, 조합/렌더링만)
  hooks/useChatMessages.ts (메시지 CRUD + 쿼리)
  hooks/useChatInput.ts (입력 상태 + 전송 로직)
  hooks/useChatTools.ts (도구 호출 처리)
```

> **Alex 주의**: hook 추출 시 공유 상태가 많으면 prop drilling이 심화된다. 관련 상태가 3개 이상의 추출 hook에서 필요하면 Zustand store로 올리는 것을 고려한다.

#### 패턴 B: 서브 컴포넌트 추출

이미 서브 컴포넌트가 존재하는 파일(DocumentRegistrationView 등)은 메인 파일의 조합 로직을 더 분리한다.

#### 패턴 C: Feature 모듈화 (중장기)

`components/` 아래의 도메인별 뷰를 `features/`로 이동.

> **Alex 경고**: 현재 components ↔ features 양방향 의존이 존재하므로, 이동 시 순환 참조 위험이 있다. 의존성 그래프 분석이 선행되어야 한다.

### 4.3 백엔드 — 라우트 분할

```
Before:
  customers-routes.js (4,874줄)

After:
  customers/
    index.js (라우터 조합)
    routes/
      crud.js (CRUD 기본 동작)
      documents.js (고객-문서 관계)
      relationships.js (가족/법인 관계)
      search.js (검색/필터)
    services/
      customerService.js (비즈니스 로직)
```

### 4.4 App.tsx 분할

App.tsx는 2,644줄이지만 `AppRouter.tsx`(113줄)는 이미 분리됨. 나머지는 사이드바 네비게이션 + 뷰 전환 로직 + 모달/팝업 제어가 주를 이룸.

```
Before:
  App.tsx (2,644줄, ~127 hooks)

After:
  App.tsx (300~400줄, 프로바이더 조합 + 레이아웃)
  layouts/
    MainLayout.tsx (사이드바 + 헤더 + 콘텐츠)
  providers/
    AppProviders.tsx (프로바이더 묶음)
```

> 200줄로 줄이기는 비현실적. 300~400줄이 현실적 목표.

### 4.5 이벤트 버스 제거 (Alex Phase 0 제안)

`window.dispatchEvent(new CustomEvent(...))` 패턴을 TanStack Query의 `queryClient.invalidateQueries()`로 교체.

**이것을 먼저 하지 않으면 컴포넌트 분할 시 숨겨진 의존성 때문에 회귀 버그 발생.**

### 4.6 번들 최적화 (Performance 제안)

| 이슈 | 현재 | 개선 방향 |
|------|------|-----------|
| ProductSearchModal 435KB | `@aims/excel-refiner-core`의 xlsx 전체 번들 포함 | `fetchInsuranceProducts`를 별도 진입점으로 분리 |
| CorporateContractsTab 191KB | 정적 import | lazy import로 전환 |

---

## 5. 실행 계획 (합동 토론 합의안)

> **5명 전원 합의**: 전면 리팩토링 금지. 이벤트 버스 제거가 모든 분할의 선행 조건. 수정 시 병행 분할(Strangler Fig).

---

### W1: Quick Wins — 즉시 실행 (리스크 0~낮음)

#### QW-1. `aiAssistantDataChanged` 데드 이벤트 리스너 제거 — DONE
- **발행처 0곳, 리스너만 2곳** — 완전한 데드 코드
- 파일: `AllCustomersView.tsx` (useEffect 11줄), `useRightPaneContent.ts` (useEffect 19줄)
- 작업: addEventListener/removeEventListener + 핸들러 함수 삭제
- 비용: 30분 | 리스크: 없음
- **결과**: 빌드 PASS, Gini PASS, 소스 내 `aiAssistantDataChanged` 0건 확인

#### QW-2. xlsx 번들 분리 (ProductSearchModal 435KB → 2.67KB) ✅ DONE
- **원인**: `ProductSearchModal`이 `@aims/excel-refiner-core`에서 `fetchInsuranceProducts`만 사용하지만, 같은 진입점이 xlsx(~300KB)를 포함
- 작업:
  1. `excel-refiner-core/src/api.ts` 신규 생성 — xlsx-free 엔트리포인트 (`fetchInsuranceProducts` + `InsuranceProduct` 타입만 export)
  2. `excel-refiner-core/package.json`에 `"./api"` sub-path export 추가
  3. `useValidation.ts`에서 `fetchInsuranceProducts` 함수 정의를 `api.ts`로 이동, re-export로 호환성 유지
  4. `ProductSearchModal.tsx`의 import를 `@aims/excel-refiner-core/api`로 변경
- **결과**: `ProductSearchModal.js` **435.78KB → 2.67KB (99.4% 절감)**
  - xlsx는 실제 사용처인 `ContractImportView`(528KB)에 올바르게 번들링됨
  - 기존 `@aims/excel-refiner-core` import 경로 호환성 100% 유지
- 빌드 PASS, Gini PASS (Minor 2건: 중복 import 수정 완료, 회귀 방지 테스트는 비용 대비 불필요 판단)

#### QW-3. 섹션 인덱스 주석 추가 (2000줄+ 6파일) ⏭️ SKIP
- 대상: ExcelRefiner, ChatPanel, DocumentRegistrationView, PersonalFilesView, App, DocumentSearchView
- **SKIP 사유**: 라인 번호가 수정마다 틀려지므로 유지보수 비용 ≠ 0. VS Code Outline/Symbol Search가 더 정확. 근본 해결은 파일 분할(W7+)이며, 목차 주석은 미봉책.
- Alex 의견 채택, PM 의견 기각

---

### W2: Phase 0-A — 이벤트 버스 PoC (1개 이벤트)

#### 작업: `customerChanged` 이벤트 → TanStack Query 무효화 PoC

**현재 상태 (Alex 전수 조사 결과)**:

| 이벤트 | dispatch 위치 | listen 위치 | Query 교체 |
|--------|-------------|-------------|-----------|
| `customerChanged` | customerService(3), ExcelRefiner(3), CustomerEditModal, CustomerRegistrationView, useCustomerRegistrationController | AllCustomersView, CustomerManagementView, CustomerRelationshipView(2), QuickActionsView | **YES** |
| `contractChanged` | contractService, ContractAllView(2), ExcelRefiner, customerService | ContractAllView, ContractManagementView, ContractsTab, QuickActionsView | **YES** |
| `documentChanged` | customerService(1) | QuickActionsView | **YES** |
| `relationshipChanged` | relationshipService(2), QuickFamilyAssignPanel | CustomerRelationshipView, RelationshipsTab, useCustomerRelationshipsController | **YES** |
| `documentLinked` | DocumentLinkModal | DocumentExplorerView, DocumentLibraryView(2), DocumentsTab | **YES** |
| `refresh-document-library` | DocumentLibraryView | DocumentExplorerView, DocumentLibraryView(2) | **YES** |
| `customerStatusFilterChange` | customerService(2) | AllCustomersView | Zustand store |
| `aiAssistantPopupClosed` | ChatPanel (팝업) | App.tsx | **보존** (크로스 윈도우) |
| `aiAssistantOpenInMain` | ChatPanel (팝업) | App.tsx | **보존** (크로스 윈도우) |
| `show-onboarding-tour` | 외부 함수 | 자기 자신 | ref/콜백 |
| `show-rightclick-guide` | 외부 함수 | 자기 자신 | ref/콜백 |

- **교체 대상**: 7종 ~25곳 (데이터 동기화 이벤트)
- **보존**: 2종 (크로스 윈도우 통신, 대안 없음)
- **기타**: 2종 (자기 참조, 선택적 교체)

**PoC 범위**: `customerChanged` 1개만 교체 ✅ DONE

**구현 결과**:
- `queryClient.ts`에 `invalidateQueries.customerChanged()` 중앙 헬퍼 추가 — customers/relationships 4개 queryKey 일괄 무효화
- dispatch 9곳 → `invalidateQueries.customerChanged()` 1줄로 통합 (CustomerRegistrationView, CustomerEditModal, useCustomerRegistrationController, customerService 3곳, ExcelRefiner 3곳)
- listener 3곳 제거 (CustomerManagementView 전체 제거, QuickActionsView customerChanged만 제거)
- 레거시 호환: `CustomerRelationshipView`가 TanStack Query 미사용이므로 중앙 함수에서 `dispatchEvent('customerChanged')` 유지 → 해당 뷰 TQ 전환 시 제거 예정
- 유령 테스트(`data-refresh.test.tsx`) 삭제, queryClient mock 4개 파일 추가로 테스트 격리 보장
- **테스트 220 passed / 0 failed, 빌드 PASS, Gini PASS**

---

### W3~4: Phase 0-B — 이벤트 버스 본격 교체

> PoC 승인 후 진행

**Gini 제안 단계적 교체 순서 (난이도 순)**:

| 단계 | 이벤트 | 발행/구독 | 난이도 |
|------|--------|-----------|--------|
| 0-B1 | `documentChanged`, `relationshipChanged` | 각 1~3곳 | 낮음 |
| 0-B2 | `documentLinked`, `refresh-document-library` | 각 2~4곳 | 낮음 |
| 0-B3 | `customerChanged` (PoC에서 완료) | 검증 확인 | 완료 |
| 0-B4 | `contractChanged` | 5곳 (교차 구독) | 중간 |
| 0-B5 | `customerStatusFilterChange` | Zustand store 신설 | 중간 |

- queryClient.ts에 `contracts` 쿼리 키 + 무효화 헬퍼 추가 필요
- 각 단계마다: 빌드 PASS + 관련 기능 수동 테스트
- 비용: 총 1~2주 | 리스크: 중간 (PoC로 패턴 검증 후 리스크 감소)

---

### W5~6: Phase 1-BE — customers-routes.js 분할

**5명 합의: 데이터 안전성 관점에서 프론트엔드 분할보다 우선**

| 분할 파일 | 포함 라우트 | 예상 LOC |
|-----------|------------|----------|
| `customer-crud.js` | GET/POST/PUT/DELETE, restore, check-name, bulk, stats | ~1,600 |
| `customer-documents.js` | documents CRUD, document-hashes, stream | ~800 |
| `customer-ar-crs.js` | annual-report/*, customer-review/* | ~1,200 |
| `customer-streams.js` | SSE 스트림 엔드포인트 5개 | ~400 |
| `customer-webhooks.js` | webhooks/*, notify/* | ~400 |
| `customer-misc.js` | address-history, memos, set-folder | ~450 |
| `index.js` | 라우터 조합, 공통 미들웨어 | ~100 |

- **핵심**: 외부 API 경로 변경 없음 (Express Router mount 경로 유지)
- 비용: 3~5일 | 리스크: 높음 → 반드시 pytest 회귀 테스트 전수 실행
- 선행: BUG-1~4 상태 확인 (PM 확인: 수정 완료 상태)

---

### W7+: Phase 1-FE — 프론트엔드 컴포넌트 분할 (수정 시 병행)

| 순위 | 파일 | LOC | 수정빈도 | 비고 |
|------|------|-----|---------|------|
| 1 | `DocumentRegistrationView.tsx` | 3,343 | 56회 | 이미 부분 분할됨 → 조합 로직 추가 분리 |
| 2 | `DocumentExplorerView.tsx` | 1,781 | 45회 | 이미 부분 분할됨 |
| 3 | `DocumentExplorerTree.tsx` | 1,504 | 45회 | Explorer와 연동 |
| 4 | `App.tsx` | 2,644 | 중간 | AppRouter.tsx 이미 분리됨 → layouts/ + providers/ |
| 5 | `ChatPanel.tsx` | 3,456 | 16회 | AI 기능 확장 시 |

**수정 요청이 들어올 때만 해당 파일 분할 병행**. 별도 리팩토링 스프린트 불필요.

---

### Phase 3: 장기 (여유 스프린트)

- 상태 관리 단일화 (4계층 → Zustand + Context 2계층)
- `any` 타입 115곳 정리 (분할 시 자연스럽게 드러남)
- Feature 간 의존성 최소화 (shared를 통한 간접 참조)
- Lazy loading 세분화 (탭/모달 단위) — CorporateContractsTab은 카운트 API 분리 후 재검토

---

### 하지 않을 것 (명시적 제외)

| 파일 | LOC | 이유 |
|------|-----|------|
| `ExcelRefiner.tsx` | 4,633 | 수정 빈도 낮음, ROI 불명확 |
| `RegionalTreeView.tsx` | 1,378 | 비즈니스 임팩트 낮음 |
| `AccountSettingsView.tsx` | 1,348 | 수정 빈도 낮음 |
| `NaverMap.tsx` | 1,196 | 독립적 기능, 수정 불필요 |
| `PersonalFilesView.tsx` | 2,727 | 수정 빈도 실측 후 재판단 |

---

### 이견 사항 (미합의)

| 주제 | 찬성 | 반대 | 결론 |
|------|------|------|------|
| 섹션 인덱스 주석 | PM (비용 0) | Alex (유지보수 부채) | **사용자 판단** |
| 이벤트 버스 교체 범위 | Alex (전체 25곳) | PM (분할 대상 파일만) | **PoC 후 결정** |
| CorporateContractsTab lazy 전환 | Performance (번들 절감) | PM (UX 저하) | **카운트 API 분리 후 재검토** |
| 테스트 시간 즉시 개선 | Performance (98.5초 병목) | PM (현재 허용 범위) | **프로파일링 후 판단** |

---

## 6. 기대 효과

| 항목 | 현재 | 분할 후 |
|------|------|---------|
| AI 파일 분석 시간 | 3,000줄 전체 읽기 | 300~500줄만 읽기 |
| 수정 영향 범위 | 파일 내 100+ hook 전체 | 관련 hook/컴포넌트만 |
| Edit 정확도 | 중복 문자열로 실패 가능 | 작은 파일에서 정확 타겟 |
| 테스트 범위 | 파일 전체 검증 | 변경된 모듈만 검증 |
| 숨겨진 결합 | CustomEvent 20곳 | Query 무효화로 명시적 |
| 데이터 안전성 | 4,874줄 단일 라우트 | 도메인별 분리로 리스크 격리 |

> **측정 필요**: 위 효과는 정성적 기대치이며 정량 데이터가 없다. 분할 전후의 기능 추가/버그 수정 소요 시간, PR당 변경 파일 수를 실측하여 효과를 검증해야 한다.

---

## 7. 분할 시 안전 절차

### 7.1 필수 테스트 전략 (Gini 제안)

1. **분할 전 스냅샷 테스트 작성**: 현재 렌더링 결과 캡처 → 분할 후 동일 결과 확인
2. **Hook 추출 시 단위 테스트**: `renderHook`으로 상태 초기값, 전이, 에러 경로 검증
3. **단계별 빌드 검증**: 각 분할 단위마다 `npm run build` + `npm run typecheck` PASS 확인
4. **CSS 오버라이드 확인**: `grep "클래스명" **/*.css`로 부모 뷰 오버라이드 누락 점검
5. **기존 테스트 ALL PASS**: 새로 깨진 테스트 0

### 7.2 분할 완료 판정 기준

- 분할 전 스냅샷 = 분할 후 스냅샷
- `npm run build` PASS (에러 0)
- `npm run typecheck` PASS
- 기존 테스트 ALL PASS
- Gini 검수 PASS

### 7.3 주의사항

1. **한번에 전체 리팩토링 금지**: 기능 회귀 위험. 반드시 점진적 수행
2. **import 경로 변경 최소화**: barrel export(index.ts)로 외부 영향 차단. 단, App.tsx는 barrel export 없으므로 HIGH RISK
3. **CSS 동반 이동**: 전역 CSS(`shared/styles/`)에서 해당 컴포넌트를 참조하는지 반드시 확인
4. **CustomEvent 정리 선행**: 이벤트 버스가 남아있는 파일은 분할 전 Query 무효화로 교체
5. **`any` 타입 경계 주의**: 분할 시 인터페이스 경계에서 `any`가 타입 오류로 드러남 — 미리 타입 정의 필요
6. **상태 공유 단절 주의**: hook 밀도 높은 파일(PersonalFilesView 111개)은 단순 추출 불가 — Zustand/Context 도입 검토

---

## 8. 참고: 잘 구조화된 영역 (모범 사례)

`features/customer/`와 `features/batch-upload/`는 이미 좋은 구조를 갖고 있다:

```
features/batch-upload/
  api/           ← API 호출 분리
  components/    ← UI 컴포넌트
  hooks/         ← 상태 로직
  types/         ← 타입 정의
  utils/         ← 유틸리티
  __tests__/     ← 테스트
```

이 패턴을 `components/` 아래 거대 뷰에 확산하면 된다. 단, 이미 부분 분할된 파일(DocumentRegistrationView, DocumentExplorerView)은 메인 파일의 조합 로직을 더 분리하는 것이 핵심이다.

---

## 부록 A: 에이전트 1차 검토 회의록 (2026-03-12)

### Alex (아키텍트)
- 진단 수정: God Component는 증상, 양방향 의존성 + 이벤트 버스 + 상태 혼재가 근본 원인
- Phase 0 추가 권고: 이벤트 버스 정리가 분할의 선행 조건
- 수정빈도 재측정: DocumentRegistrationView 56회(1위), DocumentExplorerView/Tree 각 45회(2위)

### Gini (품질)
- 수치 검증: Frontend LOC 133K→202K 수정, Backend JS LOC 106K→62K 수정
- 현재 분할 상태 반영 요구: 3개 파일이 이미 부분 분할됨
- 테스트 전략 구체화: 스냅샷 테스트 + Hook 단위 테스트 + 단계별 빌드 검증

### PM (비즈니스)
- 문제 정의 보강: 실측 데이터 없는 추론에 의존
- 대안 분석 추가: 코드 분할 외 5가지 대안 비교 필요
- 우선순위 재정의: customers-routes.js를 BE-1순위로 (데이터 안전성)
- "2-3배 향상" 삭제 → 정성적 기대치로 수정

### Performance (성능)
- 테스트 실행 시간 추가: 98.5초 (4,549 케이스) — 빌드보다 이것이 실제 병목
- ProductSearchModal 원인 분석: xlsx 전체 번들 포함 — 진입점 분리 권고
- CorporateContractsTab: 정적 import → lazy import 전환 권고

---

## 부록 B: 합동 토론 결과 (2026-03-12, 2차 회의)

### 5명 전원 합의 사항

1. **이벤트 버스 제거가 모든 분할의 선행 조건** — 없이 분할하면 숨겨진 의존성으로 회귀 버그 불가피
2. **customers-routes.js는 데이터 안전성 이유로 FE 분할보다 우선** — 단순히 "큰 파일"이 아니라 CRITICAL 버그 발생지
3. **전면 리팩토링 금지** — Strangler Fig 패턴 (수정 시 병행 분할)
4. **ExcelRefiner.tsx 분할 제외** — 수정 빈도 낮아 ROI 없음
5. **컴포넌트 분할은 긴급 과제가 아님** — 수정 요청 시 자연스럽게 병행

### Alex 최종 기여
- CustomEvent 전수 조사: 11종 이벤트, 25곳 dispatch, 20곳 listen 완전 매핑
- 7종은 Query 무효화로 교체 가능, 2종은 크로스 윈도우로 보존 필수
- customers-routes.js 8개 파일 분할 설계 (52개 엔드포인트 도메인별 분류)

### Gini 최종 기여
- Phase 0 세분화 제안: 전체 제거(Alex안) → 그룹별 단계적 교체(Gini안)로 리스크 관리
- DocumentRegistrationView 분할 시 필요 테스트 목록 구체화 (4 카테고리)
- DocumentStatusProvider.tsx(830줄, 63 hooks) — 분할의 숨겨진 병목으로 식별

### PM 최종 기여
- 주 단위 로드맵: W1(Quick Wins) → W2(PoC) → W3~4(이벤트 버스) → W5~6(BE 분할) → W7+(FE 수정 시 병행)
- "컴포넌트 분할 자체는 긴급 과제가 아님" — 운영 서비스 회귀 버그 비용 > 리팩토링 편익
- 배치 업로드 hang 버그 마무리가 최우선 (진행 중 작업 닫기)

### Performance 최종 기여
- xlsx 번들 분리 구체적 코드 변경 제시 (excel-refiner-core 서브 경로 추가)
- CorporateContractsTab lazy 전환의 제약 발견: `onCorporateContractCountChange` 때문에 항상 렌더링 필수 → 카운트 API 분리 후 재검토
- 테스트 환경 개선안: `environmentMatchGlobs`로 순수 로직 테스트 node 환경 분리

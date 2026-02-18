# CSS 아키텍처 리팩토링 진행 기록

> **이 문서는 context 부족 시 복구용입니다. 매 단계마다 업데이트합니다.**
> **새 세션에서 이 파일을 읽고 이어서 진행하세요.**

---

## 프로젝트 목표

CSS 구조를 리팩토링하여 디자인 구현 시 발생하던 specificity 충돌/God Object/하드코딩 문제를 근본적으로 해결.

**핵심 원칙**: 디자인은 1px도 변하지 않으면서 내부 구조만 정리

**참고 문서**: `docs/CSS_REFACTORING_QA.md`, `docs/CSS_ARCHITECTURE_DIAGNOSIS_AND_PLAN.md`

---

## 현재 상태

| 항목 | 값 |
|------|-----|
| **main HEAD** | `9cdd5c2d` (원본 상태, 디자인 보존) |
| **백업 브랜치** | `css-architecture-backup` (이전 시도 8개 커밋 보존) |
| **현재 단계** | **준비 완료 - Playwright baseline 28개 캡처 성공** |
| **dev 서버** | `https://localhost:5177` |

---

## Phase 계획

| Phase | 내용 | 상태 | 커밋 |
|-------|------|------|------|
| 준비 | Playwright baseline 스크린샷 캡처 | **완료** (28개 전체 통과) | - |
| Phase 0 | grid-template-columns Single Source + flex-wrap 감사 | **완료** (29/29 Playwright 통과) | `93e89f0f` |
| Phase 1 | @layer 구조 도입 (specificity 제어) | **완료** (29/29 Playwright 통과) | `be58fed0` |
| Phase 2 | God Object 해체 (Context Via Props) | **완료** (29/29 Playwright 통과) | `e0da7b53` |
| Phase 3 | 대형 CSS 파일 분할 (500줄 Hard Limit) | **완료** (29/29 Playwright 통과) | `6ff96824` |
| Phase 4 | !important 제거 + 하드코딩 색상 정리 | 대기 | - |
| Phase 5 | 문서화 + 스킬 등록 | 대기 | - |

---

## 준비 단계: Playwright Baseline 캡처 (완료)

### 결과 요약

| 항목 | 값 |
|------|-----|
| **테스트 수** | 28개 (1 setup + 28 visual) |
| **전체 통과** | 29/29 passed |
| **실행 시간** | ~9.2분 (테스트당 ~20초) |
| **스냅샷 위치** | `tests/__snapshots__/visual/` |

### 로그인 방식
- **API 직접 호출**: `POST /api/dev/ensure-user` + `{email: 'aim2nasa@gmail.com'}` (곽승철 계정)
- **storageState**: 1회 로그인 → `tests/.auth/storageState.json` 저장 → 전체 테스트 재사용
- **속도**: 매번 로그인(~1.6분/테스트) → storageState(~20초/테스트), **5.6배 개선**

### 뷰 네비게이션 방식
- **addInitScript**: React 초기화 전에 `localStorage.setItem('aims_active_document_view', viewKey)` 설정
- **URL ?view= 파라미터 사용 불가**: storageState의 `aims_active_document_view: 'customers'`가 URL 파라미터를 덮어쓰는 경합 조건 발생
- **근본 원인**: `useState(persistentState.activeDocumentView)` 초기값이 localStorage에서 오지만, mount useEffect의 URL 파라미터 처리와 activeDocumentView 변경 effect가 경합

### 캡처 대상 (28개)

| # | 범주 | 뷰 이름 | 파일명 |
|---|------|---------|--------|
| 01 | 페이지 | 전체 고객 보기 | `01-customers-all.png` |
| 02 | 페이지 | 지역별 고객 보기 | `02-customers-regional.png` |
| 03 | 페이지 | 관계별 고객 보기 | `03-customers-relationship.png` |
| 04 | 페이지 | 고객 계약·문서 등록 | `04-documents-register.png` |
| 05 | 페이지 | 전체 문서 보기 | `05-documents-library.png` |
| 06 | 페이지 | 문서 탐색기 | `06-documents-explorer.png` |
| 07 | 페이지 | 상세 문서검색 | `07-documents-search.png` |
| 08 | 페이지 | 전체 계약 보기 | `08-contracts-all.png` |
| 09 | 페이지 | 고객 일괄등록 | `09-customers-batch.png` |
| 10 | 페이지 | 문서 일괄등록 | `10-documents-batch.png` |
| 11 | 페이지 | 계정 설정 | `11-account-settings.png` |
| 12 | 페이지 | FAQ | `12-faq.png` |
| 13 | 페이지 | 공지사항 | `13-notice.png` |
| 14 | 페이지 | 고객 상세 - RightPane | `14-customer-detail.png` |
| 15 | 페이지 | LeftPane 메뉴 | `15-leftpane.png` |
| 16 | 페이지 | Header 영역 | `16-header.png` |
| 17 | 다크모드 | 전체 고객 (dark) | `17-customers-all-dark.png` |
| 18 | 다크모드 | 전체 문서 (dark) | `18-documents-library-dark.png` |
| 19 | 다크모드 | 전체 계약 (dark) | `19-contracts-all-dark.png` |
| 20 | 모달 | 고객 정보 수정 모달 | `20-modal-customer-edit.png` |
| 21 | 모달 | 가족 관계 추가 모달 | `21-modal-family-relation.png` |
| 22 | 모달 | 지역별 고객 도움말 | `22-modal-help-regional.png` |
| 23 | 모달 | 관계별 고객 도움말 | `23-modal-help-relationship.png` |
| 24 | 모달 | 전체 계약 도움말 | `24-modal-help-contracts.png` |
| 25 | 모달 | 고객 계약·문서 등록 도움말 | `25-modal-help-doc-register.png` |
| 26 | 모달 | 문서 일괄등록 도움말 | `26-modal-help-batch-upload.png` |
| 27 | 다크모달 | 고객 정보 수정 (dark) | `27-modal-customer-edit-dark.png` |
| 28 | 다크모달 | 지역별 도움말 (dark) | `28-modal-help-regional-dark.png` |

### 테스트 실행 방법

```bash
cd frontend/aims-uix3

# Baseline 생성 (최초 또는 디자인 변경 후)
npx playwright test tests/visual/css-refactor-regression.spec.ts --update-snapshots

# 비교 실행 (CSS 리팩토링 후 검증)
npx playwright test tests/visual/css-refactor-regression.spec.ts

# 특정 테스트만 실행
npx playwright test tests/visual/css-refactor-regression.spec.ts -g "14. 고객 상세"
```

### 관련 파일

| 파일 | 용도 |
|------|------|
| `tests/visual/css-refactor-regression.spec.ts` | 28개 시각적 회귀 테스트 |
| `tests/auth.setup.ts` | storageState 생성 (1회 로그인) |
| `tests/fixtures/auth.ts` | API 기반 로그인 로직 |
| `playwright.config.ts` | Playwright 설정 (storageState, 프로젝트 구조) |
| `tests/__snapshots__/visual/` | Baseline 스크린샷 |
| `tests/.auth/storageState.json` | 인증 상태 (gitignored) |

---

## 이전 시도에서 배운 교훈

1. **시각적 검증 없이 일괄 진행 금지** → 매 Phase마다 스크린샷 비교 필수
2. **@layer 래핑 시 @import 위치 주의** → @import는 반드시 @layer 밖에
3. **Phase 4-2 색상 치환 시 false positive 주의** → var() fallback, CSS 변수 정의 라인 제외
4. **CFD.css cross-component selector 이전 시** → compact variant CSS에 grid-template-columns 빠뜨리지 않기
5. **tokens.css에 --color-error-light 누락** → 이미 수정됨 (ea2dc13c)
6. **URL ?view= 파라미터 + storageState 경합** → addInitScript로 localStorage 선설정 필요

---

## 각 Phase 완료 조건

1. `npm run build` 성공
2. Playwright 스크린샷 비교 통과 (baseline과 pixel-level 동일)
3. 실패 시 → 원인 분석 → 수정 → 재검증 (통과할 때까지 반복)
4. 통과 후 → 커밋 → 이 문서 업데이트 → 다음 Phase

---

## Phase 0: grid-template-columns Single Source + flex-wrap 감사 (완료)

### 핵심 변경: `--grid-cols` CSS 변수 패턴 도입

**Before (4~8곳에서 grid-template-columns 정의)**:
```
header → grid-template-columns: A B C;
header:has(checkbox) → grid-template-columns: 28px A B C;
row → grid-template-columns: A B C;
row:has(checkbox) → grid-template-columns: 28px A B C;
(CFD에서 동일 4곳 반복)
```

**After (--grid-cols 1~2곳만 정의)**:
```
header/row → --grid-cols: A B C; grid-template-columns: var(--grid-cols);
header:has(checkbox)/row:has(checkbox) → grid-template-columns: 28px var(--grid-cols);
(CFD에서는 --grid-cols만 오버라이드)
```

### 수정된 파일 (6개)

| 파일 | 변경 내용 |
|------|-----------|
| `CustomerReviewTab.css` | header/row에 `--grid-cols` 변수 도입, checkbox는 `28px var(--grid-cols)` |
| `AnnualReportTab.css` | 동일 패턴 적용 |
| `ContractsTab.css` | 동일 패턴 적용 |
| `DocumentsTab.css` | 동일 패턴 적용 |
| `CustomerFullDetailView.css` | 4개 탭 모두 `grid-template-columns` → `--grid-cols` 오버라이드로 변경 |
| `CustomerFullDetailView.css` | ContractsTab 동일 값 중복 제거 (grid-template-columns 라인 삭제) |

### 효과

| 테이블 | Before (칼럼 추가 시 수정 필요) | After |
|--------|-------------------------------|-------|
| CustomerReviewTab | 8곳 (컴포넌트 4 + CFD 4) | **2곳** (컴포넌트 1 + CFD 1) |
| AnnualReportTab | 8곳 | **2곳** |
| ContractsTab | 4곳 (컴포넌트 2 + CFD 2) | **1곳** (CFD 제거, 컴포넌트만) |
| DocumentsTab | 4곳 | **2곳** |

### flex-wrap 감사 결과

| 파일 | 판정 | 사유 |
|------|------|------|
| InitialFilterBar | ✅ 이미 Grid 전환 완료 | 커밋 89b61961 |
| CustomerSelectorModal | ✅ 이미 Grid 전환 완료 | - |
| QuickFamilyAssignPanel | ✅ flex-wrap 유지 | 가변 버튼 수(14/26/10) + 혼합 위젯, 모달 내 예측 가능 |
| 기타 (DocumentStatusStats 등) | ✅ 안전 | 의도적 래핑 설계 |

### 검증

| 항목 | 결과 |
|------|------|
| `npm run build` | ✅ 성공 (3.17s) |
| Playwright 28개 테스트 | ✅ **29/29 passed** (9.3min) |

---

## Phase 1: @layer 구조 도입 (완료)

### 핵심 변경: 156개 CSS 파일에 CSS Cascade Layers 도입

**Layer 순서** (낮은 → 높은 우선순위):
```
@layer reset, tokens, theme, base, utilities, components, views, responsive;
```

**Layer 할당**:
| Layer | 파일 수 | 대표 파일 |
|-------|---------|-----------|
| reset | 1 | index.css (CSS reset) |
| tokens | 1 | tokens.css |
| theme | 2 | theme.css, modal-variables.css |
| base | 2 | system.css, typography.css |
| utilities | 6 | utilities.css, layout.css, components.css(shared), document-badges.css, column-resize.css, viewer-common.css |
| components | 141 | 모든 컴포넌트 CSS |
| views | 1 | CustomerFullDetailView.css |
| responsive | 2 | responsive.css, phone-landscape.css |

### Vite 빌드 문제 해결

**문제**: Vite의 CSS 번들링은 모듈 의존성 그래프 순서를 사용. 컴포넌트 CSS(@layer components)가 index.css(@layer 순서 선언)보다 먼저 출력되어 layer 우선순위가 역전됨.

**해결**: `vite-plugins/css-layer-order-plugin.js` 생성
- `generateBundle` 훅: 프로덕션 빌드 CSS 맨 앞에 @layer 순서 선언 삽입
- `transformIndexHtml` 훅: 개발 서버에서 `<style>` 태그로 @layer 순서 보장

### 생성된 파일

| 파일 | 용도 |
|------|------|
| `vite-plugins/css-layer-order-plugin.js` | Vite 빌드 시 @layer 순서 선언 삽입 |
| `scripts/wrap-css-layers.mjs` | CSS @layer 래핑 자동화 스크립트 |
| `scripts/analyze-built-css.mjs` | 빌드 CSS @layer 순서 분석 도구 |

### 검증

| 항목 | 결과 |
|------|------|
| `npm run build` | ✅ 성공 |
| Playwright 28개 테스트 | ✅ **29/29 passed** |
| 빌드 CSS @layer 순서 | ✅ position 0에 순서 선언 확인 |

---

## Phase 2: God Object 해체 (완료)

### 핵심 변경: CFD.css 크로스 컴포넌트 오버라이드를 자식 CSS 파일로 이전

**전략**: 각 자식 CSS 파일에 `@layer views { }` 블록을 추가하여 CFD 컨텍스트 오버라이드를 이전.
- Phase 1에서 도입된 @layer 시스템 활용 (views > components 우선순위)
- 자식 컴포넌트가 자신의 모든 스타일을 소유 (default + CFD context)

**CFD.css 축소 결과**:
| 항목 | Before | After | 변경 |
|------|--------|-------|------|
| CustomerFullDetailView.css | 2,807줄 | 1,597줄 | **-43%** (-1,210줄) |

**이전된 오버라이드 그룹**:

| 그룹 | 이전 목적지 | 내용 |
|------|------------|------|
| G1 (관계 테이블) | RelationshipsTab.css | compact row height, font, colors |
| G2 (메모 필드) | MemosTab.css | full-height layout |
| G3 (보험계약) | ContractsTab.css | layout, grid, pagination, dropdown |
| G4 (공유 페이지네이션) | 각 탭 CSS (3곳) | pagination button 공통 스타일 |
| G5 (문서) | DocumentsTab.css | layout, grid, search, pagination |
| G6 (AR/CRS 보고서) | AnnualReportTab.css | table, sort, empty state, pagination |
| G7 (타이포그래피) | 각 탭 CSS | 12px/11px/10px 정규화 |
| G8 (헤더 셀) | AnnualReportTab.css | header cell font override |
| G9 (중복) | **삭제** | Group 7과 동일 내용 (duplicate 제거) |

**수정된 파일**:
| 파일 | Before | After | 변경 |
|------|--------|-------|------|
| CustomerFullDetailView.css | 2,807 | 1,597 | -1,210줄 (own layout only) |
| ContractsTab.css | 1,784 | 2,100 | +316줄 (+@layer views) |
| DocumentsTab.css | 1,252 | 1,617 | +365줄 (+@layer views) |
| AnnualReportTab.css | 1,079 | 1,572 | +493줄 (+@layer views) |
| RelationshipsTab.css | 307 | 433 | +126줄 (+@layer views) |
| MemosTab.css | 85 | 112 | +27줄 (+@layer views) |

**생성된 파일**:
- `scripts/migrate-cfd-overrides.mjs` — CFD 오버라이드 마이그레이션 자동화 스크립트

### 효과

| Before | After |
|--------|-------|
| 칼럼 추가 시 2개 파일 수정 필요 | **1개 파일만 수정** |
| CFD.css가 10개+ 자식 컴포넌트 제어 | CFD.css는 자체 레이아웃만 |
| 3-class 체인 specificity 전쟁 | @layer views가 자연스럽게 승리 |
| Group 9 중복 33줄 | **삭제됨** |

### 검증

| 항목 | 결과 |
|------|------|
| `npm run build` | ✅ 성공 (3.47s) |
| Playwright 28개 테스트 | ✅ **29/29 passed** (9.1min) |

---

## Phase 3: 대형 CSS 파일 분할 (완료)

### 핵심 변경: 20개 대형 CSS 파일을 85개 소형 파일로 분할

**자동화 스크립트**: `scripts/split-css-file.mjs` (analyze/dry-run/execute 3모드)

**분할 명명 규칙**: `OriginalName.section-name.css`
| 접미사 | 용도 |
|--------|------|
| `.layout.css` | 루트 컨테이너, flex/grid 구조 |
| `.header.css` | 헤더/툴바 영역 |
| `.table.css` | 데이터 그리드/테이블 |
| `.list.css` | 리스트 컨테이너와 아이템 |
| `.states.css` | 로딩/에러/빈 상태 |
| `.modals.css` | 모달 다이얼로그 |
| `.responsive.css` | @media 쿼리 블록 |
| `.cfd-overrides.css` | @layer views 블록 (CFD 컨텍스트) |

### Tier 1: 초대형 파일 (2000줄+, 4개 → 25개)

| 원본 파일 | 줄 수 | 분할 수 | 분할 파일 |
|-----------|-------|---------|----------|
| ExcelRefiner.css | 2768 | 7 | layout, wizard, sheets, editing, table, modals, results |
| DocumentSearchView.css | 2501 | 6 | search, controls, table, results, guide, responsive |
| ContractsTab.css | 2099 | 6 | layout, ar-accordion, ar-history, cr-history, responsive, cfd-overrides |
| ChatPanel.css | 2050 | 6 | layout, sessions, welcome, input, extras, responsive |

### Tier 2: 대형 파일 (1500~2000줄, 8개 → 34개)

| 원본 파일 | 줄 수 | 분할 수 | 분할 파일 |
|-----------|-------|---------|----------|
| AccountSettingsView.css | 1949 | 5 | profile, settings, storage, cards, data |
| DocumentExplorerView.css | 1883 | 5 | toolbar, tree, features, datejump, mobile |
| DocumentStatusList.css | 1787 | 4 | header, cells, responsive, badges |
| InquiryView.css | 1647 | 4 | list, form, messages, extras |
| DocumentsTab.css | 1616 | 4 | layout, features, extras, cfd-overrides |
| CustomerFullDetailView.css | 1596 | 4 | layout, customer-info, tabs, mobile |
| AnnualReportTab.css | 1571 | 4 | layout, table, states, cfd-overrides |
| PersonalFilesView.css | 1545 | 4 | layout, list, icons, controls |

### Tier 3: 중형 파일 (1000~1500줄, 8개 → 26개)

| 원본 파일 | 줄 수 | 분할 수 | 분할 파일 |
|-----------|-------|---------|----------|
| FileList.css | 1379 | 4 | layout, icons, compact, compact-icons |
| DocumentLibraryView.css | 1377 | 4 | header, list, icons, mobile |
| BatchArMappingModal.css | 1206 | 3 | layout, content, results |
| ContractAllView.css | 1198 | 3 | header, rows, modes |
| AllCustomersView.css | 1184 | 3 | header, items, delete |
| CustomMenu.css | 1157 | 3 | menu, states, colors |
| Header.css | 1073 | 3 | layout, mobile, extras |
| CustomerReviewModal.css | 1070 | 3 | layout, compact, mobile |

### 분할 제외 (인프라 파일)

| 파일 | 줄 수 | 제외 사유 |
|------|-------|----------|
| SFSymbol.css | ~1560 | 아이콘 SVG 정의, 원자적 콘텐츠 |
| components.css | ~1450 | 공유 유틸리티 |
| tokens.css | ~1375 | 디자인 토큰 변수 |
| layout.css | ~948 | 레이아웃 시스템 |
| theme.css | ~554 | 테마 변수 |

### 크로스 디렉터리 import 수동 수정

스크립트의 `findAllTsxImporters()`가 탐색하지 못한 3건:
1. `src/pages/CustomerReviewPage.tsx` → CustomerReviewModal 분할 import 수동 업데이트
2. `src/components/.../BatchCrMappingModal.tsx` → BatchArMappingModal 분할 import 수동 업데이트
3. `src/index.css` → `@import Header.css` → 3개 분할 @import로 수동 업데이트

### 수정된 파일 요약

| 유형 | 파일 수 |
|------|---------|
| CSS 삭제 (원본) | 20개 |
| CSS 생성 (분할) | 85개 |
| TSX import 수정 | ~24개 |
| CSS @import 수정 | 1개 (index.css) |
| 스크립트 생성 | 1개 (split-css-file.mjs) |

### 검증

| 항목 | Tier 1 | Tier 2 | Tier 3 |
|------|--------|--------|--------|
| 모든 분할 파일 ≤500줄 | ✅ | ✅ | ✅ |
| `npm run build` | ✅ 성공 | ✅ 성공 | ✅ 성공 |
| Playwright | ✅ 29/29 | ✅ 29/29 | ✅ 29/29 |

---

## 다음 단계: Phase 4

- !important 제거 + 하드코딩 색상 정리
- `docs/CSS_ARCHITECTURE_DIAGNOSIS_AND_PLAN.md` 참고

---

## 변경 로그

| 시간 | 내용 |
|------|------|
| 2026-02-18 01:30 | 문서 생성, 준비 단계 시작 |
| 2026-02-18 06:00 | Playwright baseline 28개 전체 통과 (9.2분, storageState + addInitScript 방식) |
| 2026-02-18 08:10 | Phase 0 완료: --grid-cols 패턴 도입 (6파일), 29/29 Playwright 통과 |
| 2026-02-18 08:24 | Phase 0 커밋: `93e89f0f` refactor: --grid-cols CSS 변수 Single Source 패턴 도입 |
| 2026-02-18 09:00 | Phase 1 시작: CSS 구조 분석 (156개 파일, @import 3개 파일) |
| 2026-02-18 10:00 | 자동화 스크립트로 156개 파일 @layer 래핑 완료 |
| 2026-02-18 10:30 | Vite 빌드 순서 문제 발견 (24/29 실패) → css-layer-order-plugin.js로 해결 |
| 2026-02-18 11:30 | Phase 1 완료: Playwright 29/29 전체 통과 |
| 2026-02-18 12:00 | Phase 1 커밋: `be58fed0` refactor: 156개 CSS 파일에 @layer 구조 도입 |
| 2026-02-18 13:00 | Phase 2 시작: CFD.css 크로스 컴포넌트 오버라이드 분석 (12개 그룹 식별) |
| 2026-02-18 14:00 | 마이그레이션 스크립트 작성 + 실행 (CFD 2807→1597줄, 6개 자식 파일 업데이트) |
| 2026-02-18 14:30 | npm run build 성공 + Playwright 29/29 전체 통과 — Phase 2 완료 |
| 2026-02-18 14:45 | Phase 2 커밋: `e0da7b53` |
| 2026-02-18 15:00 | Phase 3 계획 수립 완료, 구현 시작 |
| 2026-02-18 15:30 | split-css-file.mjs 스크립트 작성 (analyze/dry-run/execute 3모드) |
| 2026-02-18 16:00 | Tier 1 완료: 4개 초대형 → 25개 분할, Playwright 29/29 통과 |
| 2026-02-18 17:00 | Tier 2 완료: 8개 대형 → 34개 분할, Playwright 29/29 통과 |
| 2026-02-18 18:00 | Tier 3 완료: 8개 중형 → 26개 분할, Playwright 29/29 통과 |
| 2026-02-18 18:30 | Phase 3 전체 완료 (20개 → 85개), 커밋 대기 |
| 2026-02-18 19:55 | Phase 3 커밋 완료: `6ff96824` (132 files, +33656/-32687) |

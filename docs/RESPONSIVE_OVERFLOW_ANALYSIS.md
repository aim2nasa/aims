# 반응형 오버플로 대상 분석 보고서

> 작성일: 2026-03-16
> 목적: CSS Container Query / JS 오버플로 감지가 필요한 대상 식별
> 리뷰: Dana(UX), Alex(아키텍처), Gini(QA), Sora(보험설계사) 4인 리뷰 반영

---

## 1. 현재 코드베이스 반응형 인프라

| 항목 | 현황 | 비고 |
|------|------|------|
| CSS Container Query | **3곳 사용 중** | RegionalTreeView, CustomerFullDetailView (layout, customer-info) |
| ResizeObserver | 8곳 사용 중 | 높이 계산, PDF 뷰어, 지도 등 |
| useDeviceOrientation 훅 | 1곳 | `isMobileLayout`, `isPhoneLandscape` 감지 |
| 수평 스크롤 (`overflow-x: auto`) | 30곳+ | 초성 필터바, FAQ 필터, 테이블 등 |
| 브라우저 타겟 | ES2022 | Container Query 지원 (Chrome 105+, Safari 16+) |
| CSS Cascade Layers | 전역 사용 | `@layer views`, `@layer components` — Container Query 배치 시 주의 필요 |

### 기존 Container Query 사용 예시

```css
/* RegionalTreeView.css — @layer 내부에 container-type, @container 규칙은 @layer 밖 */
.regional-tree-stats { container-type: inline-size; }
@container (max-width: 900px) { /* 레이아웃 변경 */ }

/* CustomerFullDetailView.layout.css — @container는 @layer 밖에 배치 */
/* (주석 원문: "@layer 밖에 배치 — @container는 레이어 내부에서 동작이 불안정") */
.customer-full-detail__section { container-type: inline-size; }
@container (max-width: 500px) { /* 탭 라벨 축약 */ }

/* CustomerFullDetailView.customer-info.css — @layer 내부 (같은 스코프) */
.customer-full-detail__section-content--customer-info { container-type: inline-size; }
@container (max-width: 350px) { /* 2칼럼 */ }
@container (max-width: 200px) { /* 1칼럼 */ }
```

---

## 2. 오버플로 위험 대상

### 위험도: BROKEN (콘텐츠 잘림)

#### #1 CustomerFullDetailView 액션 버튼 (모바일 768px 이하)

- **파일**: `CustomerFullDetailView.mobile.css` (L206-215)
- **CSS**: `flex-wrap: nowrap` + `overflow-x: hidden`
- **버튼 수**: 2~7개 (고객 유형, 개발자 모드에 따라 가변)
  - 기본: 정보 수정 (1개)
  - 법인: + 관계자 추가 (2개)
  - 가족대표: + 가족 추가 (2~3개)
  - 휴면 고객: + 휴면 해제 (3개)
  - 개발자 모드: + 휴면 처리 + 영구 삭제 (최대 7개)
- **문제**: `overflow-x: hidden`으로 인해 컨테이너 밖 버튼이 **보이지 않음**
- **재현**: 모바일에서 법인+가족대표 고객 열기 → 우측 버튼 잘림
- **사용 빈도**: **매우 높음** — 고객 상세는 설계사가 매일 사용하는 핵심 화면 (Sora)
- **중복 선언 주의** (Gini): 동일 셀렉터가 3개 파일에 존재
  - `CustomerFullDetailView.mobile.css` L208
  - `CustomerFullDetailView.tabs.css` L353
  - `shared/styles/utilities.css` L161 (unlayered — 최고 우선순위)

#### #2 Phone Landscape 액션 버튼

- **파일**: `shared/styles/phone-landscape.css` (L67-75)
- **CSS**: `flex-wrap: nowrap` + `overflow-x: hidden` + `padding: 2px 8px` + `gap: 4px`
- **버튼 수**: #1과 동일 (2~7개)
- **문제**: 가로모드에서 세로 공간 절약 위해 초컴팩트 → 버튼 잘림 동일
- **사용 빈도**: **낮음** — 보험 설계사가 폰 가로모드를 거의 사용하지 않음 (Sora)
- **중첩 overflow 주의** (Gini): 부모 `.customer-full-detail__content`(L25)에도 `overflow-x: hidden` → 자식만 수정해도 부모가 잘라냄

#### #3 PersonalFilesView 브레드크럼

- **파일**: `PersonalFilesView.layout.css` (L263-270)
- **CSS**: `flex-wrap: nowrap` + `overflow: hidden`
- **항목 수**: 가변 (폴더 깊이에 비례)
- **문제**: 깊은 폴더 경로 시 뒤쪽 항목이 잘림
- **사용 빈도**: **낮음** — 3단계 이상 중첩 폴더를 만드는 설계사가 드묾 (Sora)
- **추가 조사 필요** (Gini):
  - `.breadcrumb-ellipsis` 클래스가 L294에 존재 → 의도된 말줄임 패턴일 가능성
  - 전역 `shared/ui/Breadcrumb/Breadcrumb.css` L26-27에도 동일 패턴 → PersonalFilesView만의 문제가 아닌 전역 컴포넌트 이슈

---

### 위험도: RISKY (넘칠 가능성 있음)

#### #4 CustomerDetailView 액션 버튼 (RightPane)

- **파일**: `CustomerDetailView.css` (L41-55)
- **CSS**: `flex-wrap: nowrap` + overflow 미지정 (기본 visible)
- **버튼 수**: 2~6개
- **문제**: 넘침은 발생하지만 잘리지는 않음 (visible). RightPane 폭에 따라 위험도 변동
- **사용 빈도**: **높음** — 법인/가족 고객에서 3~4개 버튼이 흔함 (Sora)
- **중복 선언 주의** (Gini): `shared/styles/utilities.css` L149-154에 동일 셀렉터가 unlayered로 존재 → Container Query를 `@layer` 안에 구현하면 무력화

#### #5 Document Explorer 툴바

- **파일**: `DocumentExplorerView.toolbar.css` (L35-43)
- **CSS**: `flex-wrap: nowrap` (데스크톱) → 모바일 `flex-wrap: wrap` 전환
- **항목 수**: 6개+ (검색, 모드칩, 정렬, 액션, 통계)
- **문제**: **480px 이하**에서만 wrap 적용. 480~768px 태블릿 구간은 wrap 미적용 (Gini)
- **사용 빈도**: 중간

#### #6 Excel Refiner 테이블 헤더

- **파일**: `ExcelRefiner.table.css` (L198-205)
- **CSS**: `flex-wrap: nowrap` + `white-space: nowrap`
- **문제**: 긴 칼럼명 시 헤더 텍스트 넘침 가능. 테이블 자체가 수평 스크롤이므로 영향 제한적
- **사용 빈도**: 낮음

---

### 위험도: SAFE (이미 올바르게 처리됨)

| 위치 | 처리 방식 |
|------|-----------|
| 초성 필터바 (AllCustomersView 등) | `overflow-x: auto` 수평 스크롤 |
| 고객 선택 모달 초성 필터 | `overflow-x: auto` + `-webkit-overflow-scrolling: touch` |
| FAQ 필터 (모바일) | `overflow-x: auto` |
| ContractAllView 결과 헤더 | `flex-wrap: wrap` |
| 로그인 계정 전환 | 2~4개 버튼, 중앙 정렬 → 실질적 넘침 없음 |
| Document Search Bar | `overflow: visible` (드롭다운 허용 의도) |

---

## 3. 권장 해법

### 핵심 원칙 (리뷰 반영)

> **"아이콘만 표시"와 "수평 스크롤"은 40~60대 사용자에게 사실상 "안 보이는 것"과 같다.**
> — Sora(보험설계사 18년차)

- 아이콘만 표시: 발견성(Discoverability) 상실. "가족 추가"와 "관계자 추가"를 아이콘으로 구분 불가 (Dana)
- 수평 스크롤: 사용자 45%가 발견 못함. 터치 환경에서 스크롤바 미표시 (Dana)
- 위험 동작(영구 삭제)은 텍스트 제거 금지 — UX Anti-pattern (Dana)

### 해법 A: "더보기" 메뉴 패턴 (권장)

**핵심 버튼 1~2개만 항상 표시 + 나머지는 오버플로 메뉴(···)로 묶기**

```
[정보 수정] [관계자 추가] [···]
                              ↓ 클릭 시
                          ┌──────────┐
                          │ 가족 추가  │
                          │ 휴면 해제  │
                          │ 휴면 처리  │
                          │ 영구 삭제  │
                          └──────────┘
```

- 항상 텍스트가 보이므로 발견성 유지
- 버튼 수에 관계없이 레이아웃 안정
- 40~60대 사용자에게 직관적 — "더보기"는 익숙한 패턴 (Sora)
- JS 구현 필요 (버튼 수 기반 분기 또는 ResizeObserver로 오버플로 감지)

**버튼 우선순위** (Sora 기준):
1. 정보 수정 — 항상 표시
2. 관계자/가족 추가 — 자주 사용, 가능하면 표시
3. 휴면 해제 — 휴면 고객일 때만 표시
4. 휴면 처리, 영구 삭제 — 드물게 사용, "더보기"에 적합

### 해법 B: Container Query + 축약 텍스트 (대안)

Container Query로 공간 기준 단계적 축소. 아이콘만 표시 대신 **축약 텍스트** 단계를 추가.

```
1단계: 컨테이너 충분  → 아이콘 + 텍스트  ("👤 관계자 추가")
2단계: 컨테이너 부족  → 아이콘 + 축약    ("👤 추가")
3단계: 더 부족       → 아이콘만 + 44px 터치타겟 보장
4단계: 극단적 (개발자 모드 7개 등) → "더보기" 메뉴 Fallback
```

#### 구현 시 기술적 주의사항 (Alex/Gini)

1. **`@layer` 배치**: `container-type`은 `@layer` 내부, `@container` 규칙은 `@layer` **밖**에 배치 (기존 layout.css 패턴 준수)
2. **텍스트 숨김 방식**: `font-size: 0` 대신 `display: none` 사용 (기존 탭 레이블 축약 패턴과 일관)
3. **중복 셀렉터 전수 확인**: `grep "customer-full-detail__actions" **/*.css` → 3개 파일 동시 수정 필수
4. **중첩 overflow 해결**: phone-landscape.css 수정 시 부모 `.customer-full-detail__content`(L25)의 `overflow-x: hidden`도 함께 변경
5. **Tooltip 충돌 PoC**: `container-type: inline-size` 추가 시 상위에 이미 `container-type`이 존재 → Tooltip `position: fixed/absolute` 흡수 위험. 구현 전 반드시 PoC 검증
6. **가변 breakpoint**: 버튼 2~7개에 단일 breakpoint(280px)는 범용적이지 않음 → 버튼 수에 따라 동적 대응 필요
7. **터치 타겟 보장**: 아이콘 전환 시 `min-width: 44px`, `min-height: 44px` 명시 필수 (기존 44px 미달 이슈 악화 방지)
8. **전환 애니메이션**: 텍스트↔아이콘 전환 시 `transition` 적용하여 급격한 레이아웃 변화 방지

### 해법 C: 브레드크럼 — 중간 경로 축약 (업계 표준)

`overflow-x: auto`(수평 스크롤) 대신 **중간 경로 축약** 패턴 적용.

```
홈 > ... > 하위폴더 > 현재폴더
         ↓ "..." 클릭 시 드롭다운으로 전체 경로 표시
```

- macOS Finder, Windows Explorer, Google Drive의 표준 패턴 (Dana)
- 현재 위치(마지막 항목)가 항상 보임 → 정보 계층 유지
- `overflow-x: auto`와 `text-overflow: ellipsis`는 **상호 배타적** (Alex) → 수평 스크롤+말줄임 병행 불가
- JS 로직 필요 (깊이 3 이상일 때 중간 항목을 `...`으로 축약)
- 전역 `shared/ui/Breadcrumb` 컴포넌트에 적용하면 모든 뷰에서 해결 (Gini)

---

## 4. 우선순위 (심각도 x 사용 빈도)

| 순위 | 대상 | 위험도 | 사용 빈도 | 해법 | 난이도 |
|------|------|--------|-----------|------|--------|
| 1 | CustomerFullDetailView 모바일 액션 | BROKEN | **매우 높음** | 해법 A(더보기) 또는 B(Container Query) | 중간 |
| 2 | CustomerDetailView 액션 (RightPane) | RISKY | **높음** | 해법 A 또는 B (동일 패턴) | 중간 |
| 3 | Phone Landscape 액션 | BROKEN | 낮음 | #1과 동일 (중첩 overflow 추가 수정) | 중간 |
| 4 | PersonalFilesView 브레드크럼 | BROKEN | 낮음 | 해법 C (중간 경로 축약) | 중간 |
| 5 | Document Explorer 툴바 | RISKY | 중간 | 480~768px 구간 wrap 추가 | 낮음 |
| 6 | Excel Refiner 헤더 | RISKY | 낮음 | 테이블 스크롤로 이미 커버 | 불필요 |

---

## 5. 검증 전략

| 대상 | 검증 방법 |
|------|----------|
| #1/#2 버튼 잘림 | Playwright: 법인+가족대표 고객 열기 → 뷰포트 360px → 마지막 버튼 가시성 `isVisible()` 확인 |
| #3 브레드크럼 | Playwright: 3단계 폴더 진입 → `.breadcrumb-ellipsis` 존재 및 클릭 가능 확인 |
| Container Query 적용 후 | Playwright: Tooltip hover → `getBoundingClientRect()`로 뷰포트 기준 위치 확인 (흡수 여부) |
| "더보기" 메뉴 | Playwright: 뷰포트 360px → "···" 버튼 클릭 → 드롭다운 내 버튼 전체 가시성 확인 |
| 중첩 overflow 수정 | DevTools 계산값 확인: 부모/자식 모두 `overflow: visible` 전파 여부 |
| 중복 셀렉터 충돌 | `grep "customer-full-detail__actions" **/*.css` → 수정 후 모든 파일에서 일관성 확인 |

---

## 부록: 4인 리뷰 요약

### Dana (UX)
- "아이콘만 표시"는 발견성 상실 — 축약 텍스트 단계 추가 권장
- 수평 스크롤에 페이드 힌트 또는 인디케이터 필수
- 위험 동작(삭제)은 텍스트 제거 금지
- 브레드크럼은 중간 경로 축약이 업계 표준

### Alex (아키텍처)
- `@container`는 `@layer` 밖에 배치 (기존 패턴)
- `font-size: 0` 대신 `display: none` (기존 탭 축약 패턴 일관성)
- `overflow-x: auto` + `text-overflow: ellipsis` 병행 불가
- `container-type` 추가 시 Tooltip position 흡수 위험 → PoC 필수

### Gini (QA) — FAIL 판정
- 동일 셀렉터 3개 파일 중복 → 전수 수정 필수
- 중첩 `overflow-x: hidden` → 부모 + 자식 동시 수정 필요
- 전역 Breadcrumb 컴포넌트 미분석 → 범위 확장 필요
- 테스트 전략 전무 → 검증 계획 추가 필요

### Sora (보험설계사 18년차)
- 고객 상세는 매일 쓰는 핵심 화면 → 1순위 맞음
- 폰 가로모드 거의 안 씀 → 우선순위 하향
- 아이콘만 표시는 못 알아봄 → "글자가 써 있어야 안심하고 누릅니다"
- 수평 스크롤도 인지 못함 → "더보기(···)" 메뉴가 최선
- 핵심 버튼(정보 수정) 항상 표시 + 나머지 더보기로 묶기

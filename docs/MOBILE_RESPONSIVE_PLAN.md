# AIMS 모바일 반응형 최적화

## 목표

iPhone / Android 브라우저에서 AIMS를 최적의 UI로 제공한다.
현실적인 것부터 시작하여 반복적으로 개선한다.

## 피드백 루프

```
[계획] → [구현] → [DevTools 시뮬레이션 확인] → [실기기 확인] → [피드백 반영] → 반복
```

**확인 방법:**
- Chrome DevTools `Ctrl+Shift+M` → iPhone 14 Pro (393x852) / Galaxy S21 (360x800)
- `localhost:5177`에서 바로 확인
- 실기기: 같은 네트워크에서 `http://{PC IP}:5177`로 접속

---

## 현황 분석

### 이미 갖춰진 인프라
- viewport meta tag 설정 완료
- CSS 미디어 쿼리 101개 (768px 기준 30개 파일)
- 768px 이하: LeftPane/RightPane 숨김, CenterPane만 표시
- HamburgerButton 44x44px (iOS 터치 표준)
- iOS Safe Area, 100dvh 대응 완료

### 핵심 문제점
| 문제 | 영향 |
|------|------|
| Header 검색바 320px 고정 | 375px 화면에서 overflow |
| 모바일 목록에서 핵심 정보 누락 | 고객 전화/이메일, 문서 업로드일 등 미표시 |
| 테이블 폰트/패딩만 축소 | 가독성 부족, 터치 타겟 부족 |
| 모달 데스크톱 크기 | 모바일에서 넘침 |

---

## Phase 1: 기반 (레이아웃 + 네비게이션)

**목표**: 모바일에서 기본적으로 깨지지 않는 화면

| 항목 | 상태 | 파일 | 내용 |
|------|------|------|------|
| 1-1. 모바일 CSS 변수 | ✅ 완료 | `tokens.css` | 480px 이하 브레이크포인트 추가 |
| 1-2. Header 반응형 | ✅ 완료 | `Header.css`, `QuickSearch.css` | 검색바 가변, 헤더 48px 축소 |
| 1-3. Breadcrumb 숨김 | ✅ 완료 | `CenterPaneView.css` | 480px 이하 숨김 |
| 1-4. CenterPane 패딩 | ✅ 완료 | `CenterPaneView.css` | 24px→12px, 마진 0, 라운드 제거 |
| 1-5. 빌드 검증 | ✅ 완료 | - | npm run build 통과 |

### 현재 값 → 변경 값

| 요소 | 데스크톱 | 모바일 (<=768px) 현재 | 모바일 (<=480px) 목표 |
|------|---------|---------------------|---------------------|
| Header 높이 | 60px | 60px | 48px |
| 검색바 width | 320px | 240px | min(240px, calc(100vw-160px)) |
| CenterPane padding | 24px | 20px | 12px |
| Breadcrumb | 표시 | 표시 | 숨김 |
| 제목 폰트 | 15px | 13px | 13px |

---

## Phase 2: 전체 문서 보기 (카드형 레이아웃)

**목표**: 480px 이하에서 테이블→카드 전환

| 항목 | 상태 | 파일 | 내용 |
|------|------|------|------|
| 2-1. 카드형 레이아웃 | ✅ 완료 | `DocumentStatusList.css` | CSS Grid 3행 카드 (아이콘+파일명 / 크기·타입·날짜 / 상태·고객) |
| 2-2. 헤더 축소 | ✅ 완료 | `DocumentLibraryView.css` | 검색바 전체폭, 헤더 세로 스택 |
| 2-3. 컬럼헤더 숨김 | ✅ 완료 | `DocumentStatusList.css` | 카드에서 컬럼 헤더 불필요 |
| 2-4. 문서유형 드롭다운 숨김 | ✅ 완료 | `DocumentStatusList.css` | 모바일에서 select 불필요 (아이콘+MIME으로 충분) |
| 2-5. 빌드 검증 | ✅ 완료 | - | npm run build 통과 |

### 카드 레이아웃 구조 (480px 이하)

```
┌─────────────────────────────────┐
│ [icon] 파일명.pdf          [▶️]  │  ← Row 1: 아이콘 + 파일명 + 액션
│ 266KB · PDF · 2026.02.03       │  ← Row 2: 크기 · 타입 · 날짜
│ ✅ 완료 · 홍길동                 │  ← Row 3: 상태 · 고객
└─────────────────────────────────┘
```

### 기술 구현
- CSS Grid `grid-template-columns: 24px auto auto auto 1fr auto`
- 3행 (`grid-template-rows: auto auto auto`)
- 각 자식 요소에 명시적 `grid-row` / `grid-column` 할당
- 삭제/일괄연결 모드: 체크박스 칼럼 추가 (7칼럼)
- 터치 타겟: 액션 버튼 32px, 카드 최소 높이 44px

## Phase 3: 전체 고객 보기 (카드형 레이아웃)

**목표**: 480px 이하에서 고객 테이블→카드 전환

| 항목 | 상태 | 파일 | 내용 |
|------|------|------|------|
| 3-1. 고객 카드 | ✅ 완료 | `AllCustomersView.css` | CSS Grid 2행 카드 (아이콘+이름+상태 / 전화·성별·생년월일) |
| 3-2. 컬럼헤더 숨김 | ✅ 완료 | `AllCustomersView.css` | 카드에서 컬럼 헤더 불필요 |
| 3-3. 불필요 칼럼 숨김 | ✅ 완료 | `AllCustomersView.css` | 이메일·주소·등록일 모바일에서 숨김 |
| 3-4. 컨테이너 패딩 축소 | ✅ 완료 | `AllCustomersView.css` | 16px→8px |
| 3-5. 빌드 검증 | ✅ 완료 | - | npm run build 통과 |

### 카드 레이아웃 구조 (480px 이하)

```
┌─────────────────────────────────┐
│ [👤] 홍길동               활성  │  ← Row 1: 아이콘 + 이름 + 상태
│ 010-1234-5678 · 남 · 1990.01.01│  ← Row 2: 전화 · 성별 · 생년월일
└─────────────────────────────────┘
```

## Phase 3.5: 모바일 레이아웃 핵심 (LeftPane 드로어 전환)

**목표**: 768px 이하에서 LeftPane 숨김 → 드로어 오버레이, CenterPane 전체폭

| 항목 | 상태 | 파일 | 내용 |
|------|------|------|------|
| 3.5-1. `isMobileView` 상태 | ✅ 완료 | `App.tsx` | `window.innerWidth <= 768` 감지 + resize 연동 |
| 3.5-2. `layoutDimensions` 분기 | ✅ 완료 | `App.tsx` | 모바일: leftPane=0, centerPane=전체폭 |
| 3.5-3. 모바일 드로어 | ✅ 완료 | `App.tsx`, `layout.css` | LeftPane → 슬라이드인 오버레이 + 백드롭 |
| 3.5-4. Header 햄버거 버튼 | ✅ 완료 | `HeaderView.tsx`, `Header.css` | 모바일에서 ☰ 버튼 → 드로어 토글 |
| 3.5-5. 빌드 검증 | ✅ 완료 | - | npm run build 통과 |

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| `App.tsx` | `isMobileView`, `mobileDrawerOpen` 상태, layoutDimensions 모바일 분기, LeftPane 조건부 렌더링 |
| `Header.types.ts` | `isMobile`, `isMobileDrawerOpen`, `onMobileMenuToggle` props 추가 |
| `HeaderView.tsx` | 모바일 햄버거 SVG 버튼 렌더링 |
| `layout.css` | `.mobile-drawer-backdrop`, `.layout-leftpane--mobile-drawer`, `.layout-leftpane--mobile-open` |
| `Header.css` | `.header-mobile-menu-btn`, 모바일 disclosure indicator 숨김 |

---

## Phase 4: 문서 등록 화면

| 항목 | 상태 | 파일 |
|------|------|------|
| 4-1. 패딩/크기 조정 | ⬜ 대기 | `DocumentRegistrationView.css` |
| 4-2. 매핑 모달 전체화면 | ⬜ 대기 | `BatchArMappingModal`, `BatchCrMappingModal` |

## Phase 5: 모달/공통 컴포넌트

| 항목 | 상태 | 파일 |
|------|------|------|
| 5-1. DraggableModal | ⬜ 대기 | `DraggableModal.css` |
| 5-2. Modal | ⬜ 대기 | `Modal.css` |
| 5-3. Button 터치 최적화 | ⬜ 대기 | - |

## Phase 6: 나머지 화면

| 항목 | 상태 |
|------|------|
| 6-1. 고객 상세 뷰 | ⬜ 대기 |
| 6-2. 계약 관리 뷰 | ⬜ 대기 |
| 6-3. 문서 탐색 뷰 | ⬜ 대기 |
| 6-4. AI 어시스턴트 | ⬜ 대기 |
| 6-5. 설정 페이지 | ⬜ 대기 |

---

## 설계 철학: One Codebase, Responsive UI

### 핵심 원칙

**"모바일과 PC 환경 모든 브라우저에서 통하는 하나의 UI 코드"**

하나의 코드베이스로 모바일(iPhone/Android)과 데스크톱(Windows/Mac) 브라우저 모두 최적의 UX를 제공한다. 별도의 모바일 앱이나 분기된 코드 없이, **반응형(Responsive) 디자인**으로 해결한다.

### 아키텍처 결정

| 결정 | 이유 |
|------|------|
| **반응형 하이브리드** | CSS 미디어 쿼리 + JS 뷰포트 감지 조합 |
| **CSS Grid 미디어 쿼리는 미사용** | 실제 레이아웃이 absolute positioning + JS 계산 기반 |
| **JS `isMobileView` 상태** | inline style이 CSS보다 우선하므로, `layoutDimensions`를 JS에서 분기 |
| **모바일 드로어 패턴** | LeftPane → 슬라이드인 오버레이 (iOS 표준 사이드바 패턴) |

### 왜 "반응형 하이브리드"인가?

AIMS의 데스크톱 레이아웃은 **absolute positioning + JavaScript 계산** 방식이다:

```
[LeftPane 250px] [CenterPane calc()] [BRB] [RightPane calc()]
        ↑ JS가 width/left를 pixel 단위로 계산하여 inline style 적용
```

순수 CSS 미디어 쿼리만으로는 inline style을 override할 수 없다 (`!important` 금지 원칙). 따라서:

1. **JS 레이어**: `isMobileView` 상태로 `layoutDimensions` 분기 (모바일: leftPane=0, centerPane=전체폭)
2. **CSS 레이어**: 드로어 애니메이션, 카드형 레이아웃, 패딩 조정

이 조합으로 **하나의 코드**가 768px 기준으로 자동 전환된다:

```
🖥️ 데스크톱 (>768px)          📱 모바일 (≤768px)
┌────┬──────────┬─────┐      ┌────────────────────┐
│Left│ Center   │Right│      │ ☰  AIMS  🔍  👤    │ ← 햄버거 메뉴
│Pane│ Pane     │Pane │  →   ├────────────────────┤
│    │          │     │      │                    │
│    │          │     │      │   CenterPane       │ ← 전체폭
│    │          │     │      │   (Full Width)     │
└────┴──────────┴─────┘      └────────────────────┘
```

### 구현 원칙

1. **CSS-only 우선**: 스타일링(패딩, 카드, 폰트)은 미디어 쿼리로 해결
2. **JS는 레이아웃 분기만**: `layoutDimensions`의 값만 변경, 새 로직 최소화
3. **기존 변수 활용**: `tokens.css`의 CSS 변수 오버라이드
4. **점진적 개선**: Phase별 배포 가능한 단위로 작업
5. **데스크톱 영향 없음**: 모바일 분기는 `isMobileView` 조건 내에서만
6. **Phase별 피드백**: 구현 → DevTools 확인 → 실기기 확인 → 반복
7. **터치 최적화**: 44px 최소 터치 타겟, `-webkit-tap-highlight-color: transparent`

---

## 변경 이력

| 날짜 | Phase | 내용 | 커밋 |
|------|-------|------|------|
| 2026-02-04 | - | 계획 수립 | - |
| 2026-02-04 | 1 | 기반 레이아웃 완료 (Header/CenterPane/Breadcrumb) | `b25359f5` |
| 2026-02-04 | 2 | 전체 문서 보기 카드형 레이아웃 완료 | `529bd13c` |
| 2026-02-04 | 3 | 전체 고객 보기 카드형 레이아웃 완료 | `75404110` |
| 2026-02-04 | 3.5 | 모바일 LeftPane→드로어, CenterPane 전체폭, Header 햄버거 | - |

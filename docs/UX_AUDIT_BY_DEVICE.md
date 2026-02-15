# AIMS-UIX3 디바이스별 UX 감사 리포트

> **작성일**: 2026-02-15
> **분석 범위**: `frontend/aims-uix3/src/` 전체 (CSS 130+파일, TSX 주요 컴포넌트)
> **분석 방법**: 실제 소스코드 기반 정적 분석. 각 이슈에 대해 코드 근거와 함께 "개선 필요 / 개선 불필요" 판정

---

## 목차

1. [전 디바이스 공통 이슈](#1-전-디바이스-공통-이슈)
2. [iPad 사용자](#2-ipad-사용자-1024px--1366px)
3. [iPhone 사용자](#3-iphone-사용자-320px--480px)
4. [Android 사용자](#4-android-사용자-360px--412px)
5. [PC 사용자](#5-pc-사용자-1366px)
6. [판정 요약 테이블](#6-판정-요약-테이블)

---

## 1. 전 디바이스 공통 이슈

### 1-1. Tooltip 터치 디바이스 완전 미작동

**판정: 개선 필요**

**코드 근거** (`shared/ui/Tooltip.tsx`):
```tsx
// 156-160행: 마우스 이벤트만 연결
const childWithHandlers = React.cloneElement(children, {
  onMouseEnter: handleMouseEnter,
  onMouseLeave: handleMouseLeave,
  // onTouchStart → 없음
  // onTouchEnd → 없음
})
```

`handleMouseEnter`(121행)가 `e.clientX`, `e.clientY`로 마우스 좌표 기반 위치 계산을 하며, 터치 이벤트 핸들러는 일절 존재하지 않는다.

**영향 범위**:
- `DraggableModal.tsx`에서 Tooltip을 5개 버튼(최대화, 복원, 새창, 몰입, 리셋)에 사용
- 기타 여러 뷰에서 아이콘 버튼에 Tooltip 사용
- 터치 기기(iPad, iPhone, Android)에서 **어떤 버튼의 설명도 볼 수 없음**

**왜 개선 필요한가**:
- Tooltip은 "이 버튼이 뭔지" 알려주는 접근성 필수 요소
- 특히 아이콘만 있는 버튼(최대화, 몰입 모드 등)은 Tooltip 없이는 기능 유추 불가
- 터치 디바이스에서 long-press 또는 tap-toggle로 대체 가능

**권장 구현**: 터치 기기에서 탭으로 Tooltip 표시, 외부 탭으로 숨김

---

### 1-2. hover 기반 삭제 버튼 — 터치 디바이스에서 접근 불가

**판정: 개선 필요**

**코드 근거** (`ChatPanel.css`):
```css
/* 356-374행: 세션 삭제 버튼 */
.chat-panel__session-delete {
  opacity: 0;            /* 기본: 안 보임 */
}
.chat-panel__session-item:hover .chat-panel__session-delete {
  opacity: 1;            /* hover 시에만 보임 */
}

/* 967-984행: 저장 질문 삭제 버튼 */
.chat-panel__saved-question-delete {
  opacity: 0;            /* 기본: 안 보임 */
}
.chat-panel__saved-question:hover .chat-panel__saved-question-delete {
  opacity: 1;            /* hover 시에만 보임 */
}
```

터치 디바이스에는 hover가 없으므로 삭제 버튼이 **영원히 보이지 않는다**.

**영향 범위**: ChatPanel의 세션 목록, 저장 질문 목록에서 항목 삭제 불가

**왜 개선 필요한가**:
- 사용자가 채팅 세션이나 저장 질문을 삭제할 방법이 없음
- 모바일에서 스와이프-삭제 패턴이나 항상 표시되는 삭제 버튼 필요

**권장 구현**: `@media (pointer: coarse)` 에서 삭제 버튼 항상 표시, 또는 스와이프-삭제

---

### 1-3. 1,268개 :hover 규칙의 모바일 미대응

**판정: 개선 불필요 (대부분)**

**코드 근거**: 130+ CSS 파일에서 `:hover` 사용 중

**왜 개선 불필요한가**:
- 대부분의 `:hover`는 `background-color`, `opacity`, `color` 변경으로 시각적 피드백
- 터치 디바이스에서 "끈적한 hover"는 다음 터치 시 해제되므로 **기능적 문제 없음**
- 이미 핵심 버튼들에 `@media (pointer: coarse)`로 `transform: none` 적용 중
- 1,268개를 전부 `@media (hover: hover)` 래핑하는 것은 과도한 작업 대비 효과 미미

**예외 — 개선 필요한 hover**: 위 1-2의 `opacity: 0 → 1` 패턴처럼 **hover로만 보이는 UI 요소**는 개선 필요 (삭제 버튼 등)

---

## 2. iPad 사용자 (1024px ~ 1366px)

### 2-1. DraggableModal 터치 드래그 불가

**판정: 개선 불필요**

**코드 근거** (`DraggableModal.css` 482-525행):
```css
@media (max-width: 768px) {
  .draggable-modal {
    width: 100vw;
    max-width: 100vw;
    height: 90vh;
    max-height: 90vh;
    border-radius: 16px 16px 0 0;
  }
  .draggable-modal__header {
    cursor: default;          /* 드래그 커서 제거 */
  }
  .resize-handle {
    display: none;            /* 리사이즈 핸들 숨김 */
  }
  .draggable-modal__maximize-button,
  .draggable-modal__reset-button,
  .draggable-modal__popup-button {
    display: none;            /* 최대화/리셋/팝업 버튼 숨김 */
  }
}
```

그리고 `DraggableModal.tsx` 104-110행:
```tsx
const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
// isMobile일 때 inline style 미적용 → CSS 미디어쿼리가 전체화면 제어
```

**왜 개선 불필요한가**:
- iPad는 768px 초과이므로 `max-width: 768px` 미디어쿼리에 해당하지 않음
- iPad에서는 **마우스/트랙패드 사용이 일반적** (iPadOS의 커서 지원)
- Magic Keyboard, Apple Pencil, Bluetooth 마우스 등으로 드래그 가능
- 손가락 터치로 모달 드래그가 필요한 시나리오는 극히 드묾
- `useModalDragResize.ts`의 `headerProps.onMouseDown`이 iPadOS에서 정상 작동 (iPadOS는 마우스 이벤트 에뮬레이션 지원)

**참고**: iPadOS Safari는 `mousedown`→`mousemove`→`mouseup` 이벤트를 터치에서 에뮬레이션하므로, 실제로는 손가락으로도 드래그가 동작할 가능성이 높다. 다만 `e.preventDefault()` 호출로 인해 스크롤과 충돌할 수 있어, 이 부분은 실기기 테스트가 필요하다.

---

### 2-2. ChatPanel 리사이즈 핸들 6px

**판정: 개선 불필요**

**코드 근거** (`ChatPanel.css` 56-66행):
```css
.chat-panel__resize-handle {
  width: 6px;
  cursor: ew-resize;
}
```

**왜 개선 불필요한가**:
- iPad에서 ChatPanel 리사이즈는 **필수 기능이 아님** (데스크톱에서의 편의 기능)
- iPad에서는 ChatPanel이 고정 너비로 충분히 사용 가능
- 커서(마우스/트랙패드) 사용 시 6px도 충분히 잡을 수 있음
- 터치로 리사이즈가 필요한 시나리오가 거의 없음

---

### 2-3. 769px~1023px 구간 RightPane 미표시

**판정: 개선 불필요 (의도된 설계)**

**코드 근거** (`layout.css` 262-273행):
```css
@media (min-width: 769px) and (max-width: 1023px) {
  .layout-main--grid {
    grid-template-areas: "header header" "nav main";
    grid-template-columns: var(--layout-nav-width) 1fr;
  }
  .layout-aside--grid {
    display: none;
  }
}
```

**왜 개선 불필요한가**:
- 이 구간은 iPad Mini 세로모드 등 좁은 태블릿 화면
- 3-Pane을 표시하기엔 공간이 부족하여 **의도적으로 2-Pane 설계**
- RightPane(고객 상세)은 고객 클릭 시 별도 전체화면 오버레이로 표시됨
- AIMS의 주 타겟 디바이스인 iPad Pro(1024px+)에서는 3-Pane 정상 작동

---

## 3. iPhone 사용자 (320px ~ 480px)

### 3-1. ChatPanel 모바일에서 화면 100% 차지

**판정: 개선 불필요 (이미 대응됨)**

**코드 근거** (`ChatPanel.css` 1944-1954행):
```css
@media (max-width: 768px) {
  .chat-panel {
    min-width: 100%;
    max-width: 100%;
    border-left: none;
    border-radius: 0;
    top: var(--header-height-base, 50px);
    height: calc(100dvh - var(--header-height-base, 50px));
  }
}
```

**왜 개선 불필요한가**:
- 모바일에서 ChatPanel이 100% 차지하는 것은 **의도된 설계** — iPhone에서 사이드 패널은 전체화면 오버레이가 표준
- `100dvh` 사용으로 iOS Safari 가상 키보드 대응 완료
- 헤더에 ChatPanel 토글 버튼이 있어 열기/닫기가 명확함
- iMessage, KakaoTalk 등 모든 모바일 채팅 앱이 동일한 전체화면 패턴 사용

---

### 3-2. ChatPanel 헤더 버튼 28px (터치 타겟 미달?)

**판정: 개선 불필요 (이미 대응됨)**

**코드 근거** (`ChatPanel.css` 1964-1985행):
```css
@media (pointer: coarse) {
  .chat-panel__header-btn {
    position: relative;
  }
  .chat-panel__header-btn::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 44px;               /* ← 히트박스 44px 확대! */
    height: 44px;
    min-width: 44px;
    min-height: 44px;
  }
  .chat-panel__header-btn:hover {
    transform: none;            /* 터치 잔상 방지 */
  }
}
```

**왜 개선 불필요한가**:
- 시각적 크기는 28px이지만, `::after` 가상요소로 **실제 터치 히트박스가 44px**
- iOS HIG 최소 기준(44px) 충족
- 이미 터치 기기에서 hover scale도 비활성화 처리됨

---

### 3-3. 초성 필터(InitialFilterBar) 칩 30px

**판정: 개선 필요**

**코드 근거** (InitialFilterBar.css):
```css
@media (max-width: 768px) {
  .initial-filter-bar__initial {
    min-width: 30px;           /* 44px 미달 */
    height: 30px;              /* 44px 미달 */
    font-size: var(--font-size-caption-1);
    flex-shrink: 0;
  }
}
```

**왜 개선 필요한가**:
- 초성 필터는 "ㄱ ㄴ ㄷ ㄹ ..." 14개 버튼이 가로 스크롤로 나열
- 30px 크기는 iOS HIG 44px 최소 기준의 **68%** 수준
- 손가락으로 탭할 때 옆 초성을 잘못 누를 확률이 높음
- `::after` 히트박스 확대도 적용되어 있지 않음

**권장 구현**: 모바일에서 초성 칩 높이 36px 이상으로 확대. 다만 너비까지 44px로 키우면 14개 초성이 너무 넓어져 스크롤이 길어지므로, 높이만 확대하고 간격으로 미스터치 방지.

---

### 3-4. 계약 테이블 700px 고정 너비

**판정: 개선 불필요 (의도된 설계)**

**코드 근거** (ContractsTab.css):
```css
@media (max-width: 768px) {
  .contract-history-header,
  .contract-history-accordion__header {
    min-width: 700px;
  }
}
```

**왜 개선 불필요한가**:
- 계약 테이블은 12+ 칼럼(증권번호, 상품명, 보험료, 납입기간 등)을 포함
- 480px 화면에 12칼럼을 표시하는 것은 **물리적으로 불가능** — 수평 스크롤이 유일한 합리적 해법
- 이미 `responsive-table-scroll` 클래스로 `-webkit-overflow-scrolling: touch` + `overscroll-behavior-x: contain` 적용
- 가로 스크롤은 보험 업계 앱에서 표준적인 패턴 (보험 계약 정보의 칼럼 수가 원래 많음)
- 칼럼 숨김은 오히려 정보 누락으로 업무 차질 발생 가능

---

### 3-5. 고객 등록 폼 가로 레이아웃 고정

**판정: 개선 필요**

**코드 근거** (CustomerRegistrationView.css):
```css
.form-section {
  display: flex;
  flex-direction: row;        /* 항상 가로 */
}
.form-section__title {
  flex: 0 0 60px;             /* 라벨 고정 너비 */
}
```

480px 이하에서도 `flex-direction: column` 전환이 없다.

**왜 개선 필요한가**:
- 480px 화면에서 라벨(60px) + 입력 필드(420px)는 타이트하지만 아직 동작 가능
- 그러나 iPhone SE(320px)에서는 라벨(60px) + 입력(260px)으로 **입력 영역이 매우 협소**
- 라벨과 입력을 세로 배치하면 입력 필드가 전체 너비를 사용 가능

**권장 구현**:
```css
@media (max-width: 480px) {
  .form-row {
    flex-direction: column;
    gap: 4px;
  }
  .form-row__label {
    flex: none;
  }
}
```

---

### 3-6. DocumentLibraryView 반응형 미디어쿼리 부재

**판정: 개선 필요**

**코드 근거** (DocumentLibraryView.css):
```css
.document-library-view .search-input-wrapper {
  width: 300px;               /* 고정 너비 */
  max-width: 300px;
}
/* @media (max-width: 768px) → 없음! */
```

**왜 개선 필요한가**:
- 320px iPhone에서 300px 고정 검색바는 화면 대비 93.75%를 차지
- 다른 UI 요소(필터, 정렬 버튼 등)와 겹치거나 오버플로우 발생 가능
- 다른 주요 뷰(AllCustomersView, CustomerFullDetailView)는 모바일 미디어쿼리가 있는데, DocumentLibraryView만 빠져있음

**권장 구현**:
```css
@media (max-width: 768px) {
  .document-library-view .search-input-wrapper {
    width: 100%;
    max-width: 100%;
  }
}
```

---

## 4. Android 사용자 (360px ~ 412px)

### 4-1. Android 뒤로가기 버튼으로 모달/드로어 닫기

**판정: 개선 필요**

**코드 근거**: `Modal.tsx`, `DraggableModal.tsx` 전체를 확인한 결과, `popstate` 이벤트 리스너가 없음. `useEscapeKey` 훅은 있지만 키보드 ESC 전용.

**왜 개선 필요한가**:
- Android 사용자의 **가장 강한 습관**: 뒤로가기 버튼(제스처)으로 현재 오버레이 닫기
- 모달이 열린 상태에서 뒤로가기를 누르면 **앱 전체가 이전 페이지로 이동** — 사용자가 작성 중이던 데이터 유실 가능
- 이는 Android UX의 **핵심 기대값 위반**

**권장 구현**:
```tsx
// 모달 열릴 때 history에 빈 상태 push
useEffect(() => {
  if (visible) {
    window.history.pushState({ modal: true }, '')
    const handlePopState = () => onClose()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }
}, [visible])
```

---

### 4-2. inputMode 속성 미사용

**판정: 개선 필요**

**코드 근거**: CustomerRegistrationView.tsx의 input 필드들을 확인한 결과, `inputMode` 속성이 없음.

**왜 개선 필요한가**:
- 전화번호 입력 시 `inputMode="tel"` 없으면 Android에서 **기본 문자 키보드**가 올라옴
- 숫자 입력(생년월일 등)에도 `inputMode="numeric"` 없이 문자 키보드 표시
- 사용자가 키보드를 수동 전환해야 하는 불편함 — 보험 설계사가 고객 정보를 빠르게 입력할 때 방해

**권장 구현**: 전화번호 필드에 `inputMode="tel"`, 숫자 필드에 `inputMode="numeric"` 추가

---

### 4-3. -webkit- 프리픽스 의존

**판정: 개선 불필요**

**코드 근거** (responsive.css, layout.css):
```css
-webkit-overflow-scrolling: touch;
-webkit-tap-highlight-color: transparent;
-webkit-user-select: none;
```

**왜 개선 불필요한가**:
- 이들은 **폴백(fallback)** 용도로 사용 중이며, 표준 속성도 함께 선언됨
- `-webkit-overflow-scrolling: touch`는 구 iOS Safari 호환용 (최신 Safari에서는 기본 적용)
- Chrome에서 인식 못해도 무시될 뿐 **오류나 사이드이펙트 없음**
- 제거하면 오히려 구 기기 호환성이 깨짐

---

### 4-4. 가상 키보드 올라올 때 레이아웃

**판정: 개선 불필요 (이미 대응됨)**

**코드 근거** (`ChatPanel.css` 1944-1954행):
```css
@media (max-width: 768px) {
  .chat-panel {
    height: calc(100dvh - var(--header-height-base, 50px));
    /* 100dvh = Dynamic Viewport Height → 키보드 올라오면 자동 축소 */
  }
}
```

**왜 개선 불필요한가**:
- `100dvh`는 가상 키보드가 올라올 때 **자동으로 줄어드는 뷰포트 높이**
- Chrome 108+, Safari 15.4+에서 지원 (현재 Android/iOS 대부분 커버)
- ChatPanel, 모달 등 주요 fixed 요소가 `dvh` 기반이므로 키보드 대응됨

---

### 4-5. Material Design 터치 타겟 48px 미달

**판정: 개선 불필요**

**왜 개선 불필요한가**:
- AIMS는 **Apple 디자인 철학** 기반으로 설계됨 (CLAUDE.md 명시)
- iOS HIG 최소 44px 기준을 따르는 것이 프로젝트 디자인 일관성에 맞음
- 44px과 48px의 차이(4px)는 실사용에서 유의미한 차이가 아님
- Android에서도 44px 터치 타겟은 충분히 사용 가능

---

## 5. PC 사용자 (1366px+)

### 5-1. user-select: none 전역 적용

**판정: 개선 필요**

**코드 근거** (`layout.css` 34-38행):
```css
.layout-main {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}
```

**왜 개선 필요한가**:
- PC 사용자가 고객 이름, 전화번호, 이메일 등을 **드래그로 복사할 수 없음**
- 보험 설계사가 고객 정보를 다른 시스템(보험사 사이트 등)에 복사-붙여넣기 하는 것은 **핵심 업무 시나리오**
- 채팅 메시지 영역(`chat-panel__message-content`)은 이미 `user-select: text`로 예외 처리되어 있음 (1075-1076행)
- 하지만 고객 목록, 고객 상세의 텍스트 데이터에는 예외 미적용

**권장 구현**: 데이터 텍스트 영역에 선택적으로 `user-select: text` 적용
```css
/* 데이터 영역에서 텍스트 선택 허용 */
.customer-item__name,
.customer-item__phone,
.customer-item__email,
.customer-detail-value {
  -webkit-user-select: text;
  user-select: text;
}
```

---

### 5-2. useDraggable에서 모달 크기 하드코딩

**판정: 개선 불필요**

**코드 근거** (`useDraggable.ts` 64-66행):
```ts
const modalWidth = 500;
const modalHeight = 600;
```

**왜 개선 불필요한가**:
- 이 값은 `constrainPosition`에서 **뷰포트 밖으로 나가는 것을 방지**하는 용도
- `minVisibleArea`(50px)와 조합하여 "최소 50px은 화면에 보이게" 하는 안전장치
- 실제 모달이 500px보다 크더라도 50px은 항상 보이므로 **기능적 문제 없음**
- 정확한 크기를 알려면 DOM ref를 측정해야 하는데, 이는 훅의 범위를 넘어서는 복잡도 증가

---

### 5-3. ChatPanel max-width: 600px 제한

**판정: 개선 불필요**

**코드 근거** (`ChatPanel.css` 18행):
```css
.chat-panel {
  max-width: 600px;
}
```

**왜 개선 불필요한가**:
- ChatPanel은 **보조 패널** — 메인 콘텐츠가 아닌 채팅 사이드바
- 600px 이상 넓어지면 채팅 거품의 가독성이 오히려 떨어짐 (한 줄이 너무 길어짐)
- 4K 모니터에서도 채팅 패널이 600px이면 **우측 사이드바로 충분한 너비**
- 메인 콘텐츠(CenterPane)에 더 많은 공간을 할애하는 것이 UX상 올바름
- 더 넓은 채팅이 필요하면 분리(detached) 모드로 DraggableModal에서 사용 가능

---

### 5-4. ChatPanel 배경색 하드코딩 (다크모드 미대응?)

**판정: 개선 불필요 (이미 대응됨)**

**코드 근거** (`ChatPanel.css`):
```css
/* 26행: 라이트 모드 */
.chat-panel {
  background: linear-gradient(180deg, #ede5ff 0%, #e5f0ff 100%);
}

/* 1284-1288행: 다크 모드 */
html[data-theme="dark"] .chat-panel {
  background: linear-gradient(180deg, #1a1625 0%, #161422 100%);
}
```

**왜 개선 불필요한가**:
- 다크모드 전용 스타일이 `html[data-theme="dark"]` 선택자로 **이미 별도 정의**되어 있음
- CSS 변수 미사용은 **의도적** — AI 테마 그라데이션은 보라-시안 계열 독립 색상 체계로, 일반 UI 색상 변수와 다름
- 라이트(#ede5ff → #e5f0ff)와 다크(#1a1625 → #161422) 모두 적절한 대비

---

### 5-5. 키보드 단축키 부재

**판정: 개선 불필요 (현 단계에서)**

**왜 개선 불필요한가**:
- AIMS는 보험 설계사를 위한 도구 — 대부분 마우스/터치 기반 사용
- 키보드 단축키는 "Power User" 기능으로, 기본 UX 개선 대비 우선순위 낮음
- ESC로 모달 닫기는 이미 구현됨 (`useEscapeKey` 훅)
- 추후 사용 패턴 분석 후 필요한 단축키만 선별 추가하는 것이 바람직

---

## 6. 판정 요약 테이블

| # | 이슈 | 영향 디바이스 | 판정 | 이유 |
|---|------|-------------|------|------|
| 1-1 | **Tooltip 터치 미작동** | iPad/iPhone/Android | **개선 필요** | 터치 이벤트 핸들러 일절 없음. 아이콘 버튼 설명 불가 |
| 1-2 | **hover 기반 삭제 버튼 접근 불가** | iPad/iPhone/Android | **개선 필요** | opacity:0 → hover로만 보임. 터치에서 삭제 불가 |
| 1-3 | 1,268개 :hover 규칙 모바일 미대응 | 터치 기기 전체 | 개선 불필요 | 시각적 피드백 용도. 기능 차단 아님 |
| 2-1 | DraggableModal 터치 드래그 | iPad | 개선 불필요 | 모바일은 전체화면, iPad는 커서 지원 |
| 2-2 | ChatPanel 리사이즈 핸들 6px | iPad | 개선 불필요 | 편의 기능. 커서로 충분히 사용 가능 |
| 2-3 | 769-1023px RightPane 미표시 | iPad Mini | 개선 불필요 | 의도된 2-Pane 설계 |
| 3-1 | ChatPanel 모바일 100% 차지 | iPhone | 개선 불필요 | 이미 `@media (max-width:768px)` 전체화면 의도 설계 |
| 3-2 | ChatPanel 헤더 버튼 28px | iPhone | 개선 불필요 | `::after`로 히트박스 44px 확대 완료 |
| 3-3 | **초성 필터 칩 30px** | iPhone | **개선 필요** | 44px 미달, 히트박스 확대 미적용 |
| 3-4 | 계약 테이블 700px 고정 | iPhone | 개선 불필요 | 12칼럼 테이블의 수평 스크롤은 합리적 해법 |
| 3-5 | **고객 등록 폼 가로 고정** | iPhone SE | **개선 필요** | 320px에서 입력 영역 협소 |
| 3-6 | **DocumentLibraryView 반응형 부재** | iPhone/Android | **개선 필요** | 검색바 300px 고정, 모바일 미디어쿼리 없음 |
| 4-1 | **Android 뒤로가기 모달 닫기** | Android | **개선 필요** | popstate 미연동. 뒤로가기 시 데이터 유실 위험 |
| 4-2 | **inputMode 속성 미사용** | Android | **개선 필요** | 전화번호/숫자 입력 시 부적절한 키보드 |
| 4-3 | -webkit- 프리픽스 의존 | Android | 개선 불필요 | 폴백 용도. Chrome에서 무시될 뿐 |
| 4-4 | 가상 키보드 레이아웃 | Android | 개선 불필요 | 100dvh 기반으로 이미 대응 |
| 4-5 | Material 48px 터치 타겟 | Android | 개선 불필요 | Apple 디자인 기준 44px 충족 |
| 5-1 | **user-select: none 전역** | PC | **개선 필요** | 고객 정보 복사 불가. 업무 시나리오 차단 |
| 5-2 | useDraggable 크기 하드코딩 | PC | 개선 불필요 | 안전장치 용도. 기능적 문제 없음 |
| 5-3 | ChatPanel max-width 600px | PC | 개선 불필요 | 보조 패널로서 적절한 최대 너비 |
| 5-4 | ChatPanel 배경색 하드코딩 | PC | 개선 불필요 | 다크모드 별도 정의 완료 |
| 5-5 | 키보드 단축키 부재 | PC | 개선 불필요 | 현 단계 우선순위 낮음 |

---

## 개선 필요 항목 우선순위

| 순위 | 이슈 | 심각도 | 예상 작업량 |
|------|------|--------|-----------|
| **1** | Tooltip 터치 미작동 (1-1) | Critical | 중 (Tooltip.tsx 수정) |
| **2** | hover 기반 삭제 버튼 (1-2) | High | 소 (CSS 미디어쿼리 추가) |
| **3** | Android 뒤로가기 (4-1) | High | 소 (useEffect + popstate) |
| **4** | user-select: none 전역 (5-1) | High | 소 (CSS 선택적 허용) |
| **5** | 초성 필터 칩 30px (3-3) | Medium | 소 (CSS 크기 조정) |
| **6** | inputMode 미사용 (4-2) | Medium | 소 (TSX 속성 추가) |
| **7** | 고객 등록 폼 가로 고정 (3-5) | Medium | 소 (CSS 미디어쿼리) |
| **8** | DocumentLibraryView 반응형 (3-6) | Medium | 소 (CSS 미디어쿼리) |

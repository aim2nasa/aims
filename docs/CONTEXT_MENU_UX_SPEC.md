# 컨텍스트 메뉴 UX 명세서

> AIMS UIX3 마우스 우클릭 컨텍스트 메뉴 최적화 설계

## 1. 개요

### 1.1 목표
앱 전체에서 마우스 우클릭 시 **맥락에 맞는 컨텍스트 메뉴**를 제공하여 사용자 경험 최적화

### 1.2 현재 상태
- PersonalFilesView에만 커스텀 컨텍스트 메뉴 구현
- 다른 영역은 브라우저 기본 메뉴 차단만 (App.tsx)
- 사용자가 우클릭해도 반응 없음 → **"기능이 없다"** 인식

### 1.3 해결 방향
| 문제 | 해결 |
|------|------|
| 우클릭 무반응 | 영역별 맞춤 메뉴 제공 |
| 기능 발견 어려움 | 우클릭으로 가능한 액션 노출 |
| 학습 곡선 | 공통 Help로 맥락별 도움말 |

---

## 2. 디자인 원칙 (Apple HIG)

### 2.1 핵심 원칙

| 원칙 | 적용 |
|------|------|
| **Clarity** | 명확한 아이콘 + 간결한 레이블 |
| **Deference** | 콘텐츠 방해 최소화, 반투명 배경 |
| **Depth** | 그림자 + 블러로 계층 표현 |

### 2.2 일관성 규칙
- 모든 컨텍스트 메뉴는 **동일한 시각적 스타일** 적용
- **공통 Help 항목**은 항상 메뉴 하단에 배치
- 위험한 액션(삭제 등)은 **빨간색**으로 구분
- 단축키가 있는 항목은 **우측에 표시**

---

## 3. 영역별 메뉴 상세

### 3.1 문서 목록 (DocumentLibraryView, DocumentSearchView)

#### 문서 행 선택 시
```
┌─────────────────────────┐
│ 👁️ 미리보기         Space│
│ ℹ️ 상세 정보        ⌘+I │
│ 📝 AI 요약              │
├─────────────────────────┤
│ ⬇️ 다운로드         ⌘+D │
│ 🔗 링크 복사            │
│ ↗️ 공유...              │
├─────────────────────────┤
│ 👤 고객 연결...         │
│ 📁 이동...              │
├─────────────────────────┤
│ 🗑️ 삭제                 │  ← danger
├─────────────────────────┤
│ ❓ 문서 관리 도움말     │  ← help
└─────────────────────────┘
```

#### 빈 공간 우클릭 시
```
┌─────────────────────────┐
│ ⬆️ 문서 업로드...   ⌘+U │
│ 📁 새 폴더       ⌘+⇧+N  │
├─────────────────────────┤
│ 🔄 새로고침        ⌘+R  │
│ ☑️ 전체 선택       ⌘+A  │
├─────────────────────────┤
│ ❓ 문서 관리 도움말     │
└─────────────────────────┘
```

---

### 3.2 고객 목록 (CustomerAllView, CustomerManagementView)

#### 고객 행 선택 시
```
┌─────────────────────────┐
│ 👤 고객 상세보기   Enter │
│ 📋 전체 정보 보기 ⌘+Enter│
├─────────────────────────┤
│ 📞 전화하기             │
│ 💬 문자 보내기          │
│ ✉️ 이메일 보내기        │
├─────────────────────────┤
│ 📄 연결된 문서 보기     │
│ ⬆️ 문서 업로드...       │
├─────────────────────────┤
│ 👥 관계자 추가...       │
│ 📂 그룹에 추가...       │
├─────────────────────────┤
│ 📦 휴면 처리            │
│ 🗑️ 삭제                 │  ← danger
├─────────────────────────┤
│ ❓ 고객 관리 도움말     │
└─────────────────────────┘
```

#### 빈 공간 우클릭 시
```
┌─────────────────────────┐
│ 👤 새 고객 등록     ⌘+N │
│ 📥 엑셀로 가져오기...   │
├─────────────────────────┤
│ 🔄 새로고침        ⌘+R  │
│ 🔽 필터...              │
├─────────────────────────┤
│ ❓ 고객 관리 도움말     │
└─────────────────────────┘
```

---

### 3.3 계약 목록 (ContractAllView)

#### 계약 행 선택 시
```
┌─────────────────────────┐
│ 📋 계약 상세보기        │
│ 👤 계약자 정보 보기     │
├─────────────────────────┤
│ 📄 증권 보기            │
│ 📎 문서 첨부...         │
├─────────────────────────┤
│ 🔄 상태 변경...         │
│ 📝 메모 추가...         │
├─────────────────────────┤
│ ❓ 계약 관리 도움말     │
└─────────────────────────┘
```

---

### 3.4 사이드바 메뉴 (CustomMenu)

#### 메뉴 항목 우클릭 시
```
┌─────────────────────────┐
│ ↗️ 새 탭에서 열기       │
│ 📌 상단에 고정          │
├─────────────────────────┤
│ 👁️‍🗨️ 메뉴에서 숨기기      │
├─────────────────────────┤
│ ❓ 메뉴 사용법          │
└─────────────────────────┘
```

#### 최근 검색 고객 우클릭 시
```
┌─────────────────────────┐
│ 👤 고객 정보 열기       │
├─────────────────────────┤
│ ✕ 목록에서 제거        │
│ 🗑️ 기록 모두 지우기     │  ← danger
└─────────────────────────┘
```

---

### 3.5 헤더 영역

#### 사용자 프로필 우클릭 시
```
┌─────────────────────────┐
│ ⚙️ 계정 설정            │
│ 👤 프로필 편집          │
├─────────────────────────┤
│ 🌓 테마 변경            │
│ 📐 레이아웃 설정        │
├─────────────────────────┤
│ 🚪 로그아웃             │
└─────────────────────────┘
```

#### 빠른 검색 영역 우클릭 시
```
┌─────────────────────────┐
│ 🔍 고급 검색...         │
├─────────────────────────┤
│ 🕐 검색 기록 지우기     │
├─────────────────────────┤
│ ❓ 빠른 검색 팁         │
└─────────────────────────┘
```

---

### 3.6 기본 컨텍스트 메뉴 (빈 공간)

어떤 특정 요소도 선택되지 않은 영역에서 우클릭 시:

```
┌─────────────────────────┐
│ ← 뒤로 가기       Alt+← │
│ → 앞으로 가기     Alt+→ │
│ 🔄 새로고침        ⌘+R  │
├─────────────────────────┤
│ 🔍 빠른 검색       ⌘+K  │
│ 📄 문서 등록     ⌘+⇧+D  │
│ 👤 고객 등록     ⌘+⇧+C  │
├─────────────────────────┤
│ ❓ 도움말               │
└─────────────────────────┘
```

---

## 4. Help 시스템

### 4.1 맥락별 도움말 콘텐츠

| 컨텍스트 키 | 제목 | 주요 내용 |
|------------|------|----------|
| `documents-library` | 문서 보관함 | 검색, 필터, 고객 연결 방법, 단축키 |
| `documents-search` | 문서 검색 | AI 검색, 키워드 검색, 필터 사용법 |
| `customers-all` | 고객 전체보기 | 정렬, 휴면 처리, 관계자 설정 |
| `customers-regional` | 지역별 고객 | 지도 사용법, 지역 필터 |
| `contracts-all` | 계약 전체보기 | 계약 등록, 엑셀 가져오기 |
| `sidebar` | 메뉴 사용법 | 접기/펼치기, 단축키, 커스터마이징 |
| `header-search` | 빠른 검색 팁 | 검색 문법, 필터, 자동완성 |

### 4.2 도움말 패널 구조

```
┌──────────────────────────────────┐
│ ❓ 문서 보관함                 ✕ │
├──────────────────────────────────┤
│ 업로드된 모든 문서를 관리하는    │
│ 공간입니다.                      │
│                                  │
│ 💡 팁                           │
│ • 더블클릭으로 미리보기          │
│ • 드래그로 폴더 이동             │
│ • 파일명/고객명/내용 검색        │
│                                  │
│ ⌨️ 단축키                       │
│ Space    선택 문서 미리보기      │
│ ⌘+D      다운로드               │
│ ⌘+I      상세 정보              │
│ Delete   삭제                    │
└──────────────────────────────────┘
```

---

## 5. 스타일 명세

### 5.1 메뉴 컨테이너

```css
.context-menu {
  /* 크기 */
  min-width: 180px;
  max-width: 280px;

  /* 배경 */
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);  /* 12px */

  /* 그림자 + 블러 */
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);

  /* 레이아웃 */
  padding: var(--spacing-1);  /* 4px */
  z-index: var(--z-index-modal);

  /* 애니메이션 */
  animation: contextMenuFadeIn 0.15s ease-out;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

### 5.2 메뉴 아이템

```css
.context-menu-item {
  /* 레이아웃 */
  display: flex;
  align-items: center;
  gap: var(--spacing-2);  /* 8px */
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);  /* 8px 12px */

  /* 스타일 */
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);  /* 6px */
  cursor: pointer;

  /* 타이포그래피 */
  font-size: var(--font-size-footnote);  /* 13px */
  color: var(--color-text-primary);
  text-align: left;

  /* 전환 */
  transition: background var(--duration-fast) ease-out;
}

.context-menu-item:hover {
  background: var(--color-bg-active);
}

.context-menu-item:active {
  background: var(--color-primary-alpha-20);
}

.context-menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### 5.3 아이콘 & 단축키

```css
/* 아이콘 */
.context-menu-item__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.context-menu-item:hover .context-menu-item__icon {
  color: var(--color-text-primary);
}

/* 단축키 */
.context-menu-item__shortcut {
  font-size: var(--font-size-caption-2);  /* 11px */
  color: var(--color-text-quaternary);
  margin-left: auto;
  padding-left: var(--spacing-4);
}
```

### 5.4 위험 액션 (삭제 등)

```css
.context-menu-item--danger {
  color: var(--color-error);
}

.context-menu-item--danger .context-menu-item__icon {
  color: var(--color-error);
}

.context-menu-item--danger:hover {
  background: var(--color-error);
  color: white;
}

.context-menu-item--danger:hover .context-menu-item__icon {
  color: white;
}
```

### 5.5 구분선 & 섹션

```css
/* 구분선 */
.context-menu__divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-1) var(--spacing-2);
}

/* 섹션 타이틀 */
.context-menu__section-title {
  font-size: var(--font-size-caption-2);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--spacing-1) var(--spacing-3);
}
```

### 5.6 Help 버튼

```css
.context-menu__help {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);

  width: 100%;
  padding: var(--spacing-2);
  margin-top: var(--spacing-1);

  background: var(--color-bg-secondary);
  border: none;
  border-radius: var(--radius-sm);

  font-size: var(--font-size-caption-1);
  color: var(--color-primary);
  cursor: pointer;
}

.context-menu__help:hover {
  background: var(--color-primary-alpha-10);
}
```

---

## 6. 컴포넌트 구조

### 6.1 파일 구조

```
src/shared/ui/ContextMenu/
├── ContextMenu.tsx           # 메인 컴포넌트
├── ContextMenu.css           # 스타일
├── ContextMenuItem.tsx       # 개별 메뉴 아이템
├── ContextMenuDivider.tsx    # 구분선
├── ContextMenuSection.tsx    # 섹션 그룹
├── hooks/
│   ├── useContextMenu.ts     # 상태 관리 훅
│   └── useContextMenuPosition.ts  # 화면 경계 처리
├── types.ts                  # 타입 정의
└── index.ts                  # 배럴 export
```

### 6.2 핵심 타입

```typescript
interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onClick?: () => void
  submenu?: ContextMenuItem[]
}

interface ContextMenuSection {
  id: string
  title?: string
  items: ContextMenuItem[]
}

interface ContextMenuProps {
  visible: boolean
  position: { x: number; y: number }
  sections: ContextMenuSection[]
  onClose: () => void
  showHelp?: boolean
  helpContext?: string
  onHelpClick?: (context: string) => void
}
```

---

## 7. 구현 우선순위

### Phase 1: 기반 구축
1. 공통 ContextMenu 컴포넌트 생성
2. useContextMenu 훅 구현
3. 화면 경계 처리 로직

### Phase 2: 주요 영역 적용
4. 문서 목록 (DocumentLibraryView)
5. 고객 목록 (CustomerAllView)
6. PersonalFilesView → 공통 컴포넌트 마이그레이션

### Phase 3: 부가 기능
7. 계약 목록, 사이드바, 헤더
8. Help 시스템 연동
9. 키보드 네비게이션

---

## 8. 접근성 (A11y)

### 8.1 ARIA 속성
```html
<div role="menu" aria-label="문서 액션">
  <button role="menuitem" aria-haspopup="false">
    미리보기
  </button>
  <button role="menuitem" aria-haspopup="true" aria-expanded="false">
    공유...
  </button>
</div>
```

### 8.2 키보드 네비게이션
| 키 | 동작 |
|----|------|
| `↑` / `↓` | 항목 간 이동 |
| `Enter` / `Space` | 선택 실행 |
| `Escape` | 메뉴 닫기 |
| `→` | 서브메뉴 열기 |
| `←` | 서브메뉴 닫기 |

---

## 9. 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2025-12-12 | 1.0 | 최초 작성 - UX 명세 정의 |

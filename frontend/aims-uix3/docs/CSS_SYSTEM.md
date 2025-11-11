# AIMS UIX-3 CSS System Documentation

> **Version**: 1.1.0 | **Last Updated**: 2025-10-14

## 📋 Overview

AIMS UIX-3의 CSS 시스템은 **중복 제거**, **테마 지원**, **확장성**을 핵심으로 합니다.
모든 스타일은 공용 클래스와 CSS 변수 기반으로 구성됩니다.

## 🎯 Core Principles

### 1. 절대 금지 사항 🚫

- **!important 사용 금지** - CSS specificity로 구조적 해결
- **정적 인라인 스타일 금지** - `<div style={{color: '#fff'}}>` ❌
- **하드코딩된 색상 금지** - CSS 변수 사용 필수
- **컴포넌트별 중복 스타일 금지** - 공용 클래스 활용

**예외:** 유틸리티 클래스(`.!hidden`) 또는 런타임 동적 계산(`transform: translate(${x}px)`)만 허용

### 2. 반드시 준수할 원칙 ✅

```css
/* ✅ 필수 - CSS 변수 사용 */
.my-component {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

/* ✅ 필수 - 공용 클래스 활용 */
<div className="content-pane hover-subtle">

/* ✅ 필수 - 테마 반응형 설계 */
:root { --color-bg-primary: #f5f6f7; }
html[data-theme="dark"] { --color-bg-primary: #374151; }
```

## 🏗️ CSS Architecture Layers

### 🎨 Color Token System: 3-Level Hierarchy

AIMS UIX3는 Design Token 업계 표준인 **3-레벨 계층 구조**를 사용합니다.

#### **Level 1: Primitive Tokens (원시 토큰)**
> **위치**: `src/shared/design/tokens.css`
> **목적**: iOS/macOS System Colors 원본 정의

```css
/* iOS System Colors - Light Mode */
--color-ios-blue: #007aff;           /* iOS systemBlue */
--color-ios-green: #34c759;          /* iOS systemGreen */
--color-ios-orange: #ff9500;         /* iOS systemOrange */
--color-ios-purple: #af52de;         /* iOS systemPurple */
--color-ios-teal: #5ac8fa;           /* iOS systemTeal */
--color-ios-red: #ff3b30;            /* iOS systemRed */

/* iOS System Colors - Dark Mode */
--color-ios-blue-dark: #0a84ff;
--color-ios-green-dark: #30d158;
--color-ios-orange-dark: #ff9f0a;
--color-ios-purple-dark: #bf5af2;
--color-ios-teal-dark: #64d2ff;
--color-ios-red-dark: #ff453a;
```

#### **Level 2: Semantic Tokens (시맨틱 토큰)**
> **위치**: `src/shared/design/tokens.css`
> **목적**: 도메인별 의미 부여 (재사용 가능)

```css
/* 문서 관리 도메인 */
--color-icon-doc-register: #ff9500;  /* 문서 등록 - Orange */
--color-icon-doc-library: #af52de;   /* 문서 라이브러리 - Purple */
--color-icon-doc-search: #007aff;    /* 문서 검색 - Blue */
--color-icon-doc-status: #ff3b30;    /* 문서 처리 현황 - Red */
```

#### **Level 3: Component Tokens (컴포넌트 토큰)**
> **위치**: `src/components/CustomMenu/CustomMenu.css`
> **목적**: 컴포넌트 전용 (컨텍스트 의존)

```css
/* 고객 관리 섹션 - SF Symbol 아이콘 색상 */
--color-menu-icon-user: var(--color-ios-blue);        /* person */
--color-menu-icon-list: var(--color-ios-green);       /* list-bullet */
--color-menu-icon-location: var(--color-ios-orange);  /* location */
--color-menu-icon-team: var(--color-ios-purple);      /* person-2 */
```

---

### Layer 1: Design Tokens

**색상, 간격, 타이포그래피 등 디자인 토큰을 CSS 변수로 정의**

| Category | Light Theme | Dark Theme |
|----------|-------------|------------|
| **배경** | `--color-bg-primary: #f5f6f7` | `#374151` |
| | `--color-bg-secondary: #ffffff` | `#4b5563` |
| **텍스트** | `--color-text-primary: #1a1a1a` | `#f9fafb` |
| | `--color-text-secondary: #6b7280` | `#d1d5db` |
| **액션** | `--color-primary: #3b82f6` | `#2563eb` |
| | `--color-danger: #ef4444` | `#f87171` |
| **간격** | `--spacing-sm: 8px`, `--spacing-md: 16px`, `--spacing-lg: 24px` | |
| **타이포** | `--font-size-sm: 14px`, `--font-size-md: 16px`, `--font-size-lg: 18px` | |
| **모서리** | `--radius-sm: 4px`, `--radius-md: 6px`, `--radius-lg: 8px` | |
| **전환** | `--transition-fast: 150ms`, `--transition-normal: 250ms` | |

전체 토큰 목록: `src/shared/design/tokens.css` 참조

### Layer 2: Theme System

테마 전환: `html[data-theme="dark"]`로 CSS 변수 재정의

```css
html[data-theme="dark"] {
  --color-bg-primary: #374151;
  --color-text-primary: #f9fafb;
  /* ... */
}
```

### Layer 3: Utility Classes

Tailwind 스타일 유틸리티 클래스 제공 (예시)

- **Layout**: `.flex`, `.grid`, `.gap-md`
- **Spacing**: `.p-md`, `.m-lg`, `.mx-auto`
- **Typography**: `.text-primary`, `.text-sm`, `.font-semibold`
- **Border**: `.border`, `.rounded-md`

전체 목록: `src/shared/styles/utilities.css` 참조

### Layer 4: Layout Classes

공용 레이아웃 패턴 클래스

- **Containers**: `.main-container`, `.content-pane`, `.side-panel`
- **Grid**: `.grid`, `.grid-cols-2`, `.grid-cols-3` (반응형 지원)
- **Responsive**: `.mobile-hidden`, `.mobile-only`

### Layer 5: Component Classes

재사용 가능한 컴포넌트 스타일

- **Interactive**: `.hover-subtle`, `.hover-lift`, `.selected-item`, `.disabled-state`
- **Focus**: `.focus-ring`
- **Status**: `.status-active`, `.status-error`
- **Cards**: `.card-basic`, `.card-elevated`, `.card-interactive`

## 🎨 Menu Icon Color System

### 메뉴 아이콘 색상 가이드

AIMS UIX3의 메뉴 시스템은 두 가지 색상 적용 방식을 사용합니다.

#### 1️⃣ **고객 관리 섹션** - SF Symbol 직접 매핑

```css
/* CustomMenu.css에서 SF Symbol 클래스에 직접 색상 적용 */
.sf-symbol--person { color: var(--color-menu-icon-user); }
.sf-symbol--list-bullet { color: var(--color-menu-icon-list); }
.sf-symbol--location { color: var(--color-menu-icon-location); }
.sf-symbol--person-2 { color: var(--color-menu-icon-team); }
```

**TSX 사용 예시:**
```tsx
<SFSymbol name="person" />  {/* 자동으로 Blue 적용 */}
<SFSymbol name="list-bullet" />  {/* 자동으로 Green 적용 */}
```

#### 2️⃣ **문서 관리 섹션** - 래퍼 클래스 방식

```css
/* CustomMenu.css의 래퍼 클래스 */
.menu-icon-orange { color: var(--color-icon-doc-register); }  /* #ff9500 */
.menu-icon-purple { color: var(--color-icon-doc-library); }   /* #af52de */
.menu-icon-blue { color: var(--color-icon-doc-search); }      /* #007aff */
.menu-icon-red { color: var(--color-icon-doc-status); }       /* #ff3b30 */
```

**TSX 사용 예시:**
```tsx
<span className="menu-icon-orange">
  <SFSymbol name="doc-badge-plus" />
</span>
<span className="menu-icon-purple">
  <SFSymbol name="books-vertical" />
</span>
```

### 아이콘 색상 매핑표

| 섹션 | 아이콘 | SF Symbol | 색상 | Light | Dark |
|------|--------|-----------|------|-------|------|
| 고객 관리 | 고객 관리 | `person` | Blue | #007aff | #0a84ff |
| | 전체보기 | `list-bullet` | Green | #34c759 | #30d158 |
| | 지역별 보기 | `location` | Orange | #ff9500 | #ff9f0a |
| | 관계별 보기 | `person-2` | Purple | #af52de | #bf5af2 |
| | 고객 등록 | `person-fill-badge-plus` | Green | #34c759 | #30d158 |
| 문서 관리 | 문서 등록 | `doc-badge-plus` | Orange | #ff9500 | #ff9f0a |
| | 문서 라이브러리 | `books-vertical` | Purple | #af52de | #bf5af2 |
| | 문서 검색 | `search-bold` | Blue | #007aff | #0a84ff |
| | 문서 처리 현황 | `chart-bar` | Red | #ff3b30 | #ff453a |

### 선택 상태

모든 메뉴 아이콘은 선택 시 흰색으로 통일됩니다.

```css
.custom-menu-item.selected .sf-symbol--person,
.custom-menu-item.selected .sf-symbol--list-bullet,
/* ... */ {
  color: var(--color-neutral-0);  /* #ffffff */
}
```

---

## 🎨 Component-Specific Styles

컴포넌트별 CSS는 고유 기능만 정의, 공용 클래스 조합 우선

```css
/* CustomersPage.css - 예시 */
.customer-card__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}
```

## 🔄 Theme Switching

**ThemeManager 클래스**: `document.documentElement.setAttribute('data-theme', theme)`
**React Hook**: `useTheme()` - theme, changeTheme, toggleTheme 제공

자세한 구현: `src/shared/lib/theme.ts`, `src/shared/hooks/useTheme.ts` 참조

## 📏 Responsive Design

**Breakpoints**: Mobile-first (640px, 768px, 1024px, 1280px, 1536px)
**Classes**: `.md:grid-cols-2`, `.lg:text-lg` 등 반응형 클래스 지원

## 🧪 Testing

**Playwright 활용 권장** - CSS 변경사항 자동 검증

```bash
npx playwright test tests/css/
```

테스트 항목: 포커스 스타일, 테마 전환, 하드코딩 색상 검증, 스크린샷 비교

## ✅ Quality Checklist

### 새 컴포넌트
- [ ] !important 사용 금지
- [ ] 정적 인라인 스타일 금지
- [ ] CSS 변수 활용
- [ ] 공용 클래스 재사용
- [ ] 반응형 디자인
- [ ] 다크모드 테스트
- [ ] Playwright 테스트

### 코드 리뷰
- [ ] !important 없음
- [ ] CSS 변수 사용
- [ ] 중복 제거
- [ ] 테마 반응형
- [ ] 브라우저 호환성

---

## 📝 Changelog

### v1.1.0 (2025-10-14)
- ✨ **추가**: Color Token System 3-Level Hierarchy 문서화
- ✨ **추가**: Menu Icon Color System 가이드
- ✨ **추가**: iOS System Colors (Light/Dark) 매핑표
- 📚 **문서화**: SF Symbol 아이콘별 색상 적용 방식 설명

### v1.0.0 (2025-09-15)
- 🎉 **초기 버전**: CSS 시스템 기본 구조 문서화

---

**Version**: 1.1.0 | **Last Updated**: 2025-10-14
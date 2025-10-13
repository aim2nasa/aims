# AIMS UIX-3 CSS System Documentation

> **Version**: 1.0.0 | **Last Updated**: 2025-09-15

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

**Version**: 1.0.0 | **Last Updated**: 2025-09-15
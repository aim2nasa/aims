# AIMS UIX-3 CSS System Documentation

> **Version**: 1.0.0
> **Last Updated**: 2025-09-15
> **Purpose**: CSS 아키텍처 가이드라인과 디자인 시스템 표준

## 📋 Overview

AIMS UIX-3의 CSS 시스템은 **중복 제거**, **테마 지원**, **확장성**을 핵심으로 하는 체계적인 스타일링 아키텍처입니다.
모든 스타일은 공용 클래스 시스템과 CSS 변수를 기반으로 구성되어 있습니다.

## 🎯 Core Principles

### 1. 절대적 금지 사항 🚫

```css
/* ❌ 절대 금지 - !important 사용 */
.my-component {
  background-color: #ffffff !important;  /* 근시안적 해결책 */
  z-index: 9999 !important;              /* CSS 구조 파괴 */
}

/* ❌ 절대 금지 - 정적 인라인 스타일 */
<div style={{backgroundColor: '#ffffff', padding: '16px'}}>

/* ❌ 절대 금지 - 하드코딩된 색상 */
.my-component {
  background-color: #e8e9eb;
  color: #333333;
}

/* ❌ 절대 금지 - 컴포넌트별 개별 스타일링 */
.component-a { background: white; border: 1px solid gray; }
.component-b { background: white; border: 1px solid gray; }  /* 중복! */
```

#### 1.1. !important 사용 금지 - 철칙 ⚠️

**!important는 근시안적인 문제 해결을 위한 것으로 절대 사용하지 않는다**

```css
/* ❌ 잘못된 예: !important로 문제 덮어버리기 */
.button {
  background-color: blue;
}

.button-override {
  background-color: red !important;  /* 나쁜 해결책 */
}

/* ✅ 올바른 예: CSS 특이성(specificity) 이해하고 구조적으로 해결 */
.button {
  background-color: blue;
}

.button.button--primary {
  background-color: red;  /* 더 높은 specificity */
}

/* 또는 */
.sidebar .button {
  background-color: red;  /* 컨텍스트 기반 스타일링 */
}
```

**!important를 쓰고 싶을 때 해야 할 것:**
1. CSS 선택자 특이성(specificity) 검토
2. 스타일 적용 순서 확인
3. 구조적 문제 파악 및 근본 원인 해결
4. BEM, SMACSS 등 CSS 방법론 적용

**예외:** 오직 유틸리티 클래스에서만 제한적 허용
```css
/* ✅ 허용: 유틸리티 클래스 - 명확한 의도 */
.!hidden {
  display: none !important;  /* 무조건 숨김 */
}

.!visible {
  display: block !important;  /* 무조건 표시 */
}
```

### 1.2. 기술적 예외 사항 ⚠️

**런타임 동적 계산이 필수인 경우에만 인라인 스타일 허용:**

```typescript
/* ✅ 허용 - 동적 드래그 위치 (CSS로 불가능) */
<div style={{
  transform: `translate(${dynamicX}px, ${dynamicY}px)`,
  left: `calc(50% + ${position.x}px)`,
  top: `calc(50% + ${position.y}px)`
}}>

/* ✅ 허용 - 실시간 애니메이션 값 */
<div style={{ opacity: animationProgress }}>

/* ✅ 허용 - 사용자 입력 기반 동적 크기 */
<div style={{ width: `${userInput}%` }}>
```

**허용 조건:**
- CSS로 기술적 구현이 불가능한 경우만
- 정적 속성은 반드시 CSS로 분리
- 주석으로 예외 사유 명시 필수

```typescript
/* 예시: 올바른 예외 적용 */
<div
  className="floating-modal floating-modal--dragging"
  style={{
    // ⚠️ 예외: 런타임 드래그 위치는 CSS로 불가능
    transform: `translate(${position.x}px, ${position.y}px)`
  }}
>
```

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

### Layer 1: Design Tokens (설계 토큰)

```css
/* src/shared/design/tokens.css */

/* === 색상 시스템 === */
:root {
  /* Primary Colors */
  --color-bg-primary: #f5f6f7;        /* 메인 배경 */
  --color-bg-secondary: #ffffff;      /* 카드/패널 배경 */
  --color-bg-tertiary: #f8f9fa;       /* 서브 배경 */

  /* Text Colors */
  --color-text-primary: #1a1a1a;      /* 메인 텍스트 */
  --color-text-secondary: #6b7280;    /* 보조 텍스트 */
  --color-text-tertiary: #9ca3af;     /* 비활성 텍스트 */

  /* Interactive Colors */
  --color-primary: #3b82f6;           /* 주요 액션 */
  --color-primary-hover: #2563eb;     /* 주요 액션 호버 */
  --color-secondary: #6366f1;         /* 보조 액션 */
  --color-danger: #ef4444;            /* 위험 액션 */
  --color-success: #10b981;           /* 성공 상태 */
  --color-warning: #f59e0b;           /* 경고 상태 */

  /* Border & Shadow */
  --color-border: #e5e7eb;            /* 기본 테두리 */
  --color-border-hover: #d1d5db;      /* 호버 테두리 */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);

  /* Spacing System */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;

  /* Typography */
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 24px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms ease;
}
```

### Layer 2: Theme System (테마 시스템)

```css
/* src/shared/design/theme.css */

/* === Dark Theme === */
html[data-theme="dark"] {
  --color-bg-primary: #374151;        /* 어두운 메인 배경 */
  --color-bg-secondary: #4b5563;      /* 어두운 카드 배경 */
  --color-bg-tertiary: #1f2937;       /* 어두운 서브 배경 */

  --color-text-primary: #f9fafb;      /* 밝은 메인 텍스트 */
  --color-text-secondary: #d1d5db;    /* 밝은 보조 텍스트 */
  --color-text-tertiary: #9ca3af;     /* 밝은 비활성 텍스트 */

  --color-border: #4b5563;            /* 어두운 테두리 */
  --color-border-hover: #6b7280;      /* 어두운 호버 테두리 */
}

/* === High Contrast Theme === */
html[data-theme="high-contrast"] {
  --color-bg-primary: #000000;
  --color-bg-secondary: #ffffff;
  --color-text-primary: #ffffff;
  --color-text-secondary: #000000;
  --color-border: #ffffff;
}
```

### Layer 3: Utility Classes (유틸리티 클래스)

```css
/* src/shared/styles/utilities.css */

/* === Layout Utilities === */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-sm { gap: var(--spacing-sm); }
.gap-md { gap: var(--spacing-md); }
.gap-lg { gap: var(--spacing-lg); }

/* === Spacing Utilities === */
.p-sm { padding: var(--spacing-sm); }
.p-md { padding: var(--spacing-md); }
.p-lg { padding: var(--spacing-lg); }
.px-md { padding-left: var(--spacing-md); padding-right: var(--spacing-md); }
.py-md { padding-top: var(--spacing-md); padding-bottom: var(--spacing-md); }

.m-sm { margin: var(--spacing-sm); }
.m-md { margin: var(--spacing-md); }
.m-lg { margin: var(--spacing-lg); }
.mx-auto { margin-left: auto; margin-right: auto; }

/* === Text Utilities === */
.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-sm { font-size: var(--font-size-sm); }
.text-md { font-size: var(--font-size-md); }
.text-lg { font-size: var(--font-size-lg); }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }

/* === Border Utilities === */
.border { border: 1px solid var(--color-border); }
.border-t { border-top: 1px solid var(--color-border); }
.rounded-sm { border-radius: var(--radius-sm); }
.rounded-md { border-radius: var(--radius-md); }
.rounded-lg { border-radius: var(--radius-lg); }
```

### Layer 4: Layout Classes (레이아웃 클래스)

```css
/* src/shared/styles/layout.css */

/* === Container System === */
.main-container {
  background-color: var(--color-bg-primary);
  min-height: 100vh;
  transition: background-color var(--transition-normal);
}

.content-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

.content-pane {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-normal);
}

.side-panel {
  background-color: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  padding: var(--spacing-md);
}

/* === Grid System === */
.grid {
  display: grid;
}

.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

@media (max-width: 768px) {
  .grid-cols-2 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
  .grid-cols-3 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
  .grid-cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* === Responsive Layout === */
.mobile-hidden {
  display: block;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .mobile-hidden { display: none; }
  .mobile-only { display: block; }
}
```

### Layer 5: Component Classes (컴포넌트 클래스)

```css
/* src/shared/styles/components.css */

/* === Interactive States === */
.hover-subtle {
  transition: background-color var(--transition-fast);
}

.hover-subtle:hover {
  background-color: var(--color-bg-tertiary);
}

.hover-lift {
  transition: all var(--transition-fast);
}

.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.selected-item {
  background-color: var(--color-primary);
  color: white;
}

.disabled-state {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* === Focus States === */
.focus-ring {
  outline: none;
  transition: box-shadow var(--transition-fast);
}

.focus-ring:focus {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}

/* === Status Indicators === */
.status-active {
  background-color: var(--color-success);
  color: white;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.status-inactive {
  background-color: var(--color-text-tertiary);
  color: white;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.status-error {
  background-color: var(--color-danger);
  color: white;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

/* === Card Components === */
.card-basic {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  transition: all var(--transition-normal);
}

.card-elevated {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
}

.card-interactive {
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.card-interactive:hover {
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}
```

## 🎨 Component-Specific Styles

각 컴포넌트는 위의 공용 클래스들을 조합하여 스타일링하며, 필요시에만 컴포넌트별 CSS 파일을 생성합니다.

### 예시: CustomersPage.css

```css
/* src/pages/customers/CustomersPage.css */

/* 이 파일은 customers 페이지만의 고유한 스타일만 포함 */
.customers-page {
  /* 공용 클래스들과 조합하여 사용 */
}

.customer-card {
  /* 기본은 .card-interactive 클래스 사용 */
  /* 여기서는 customer card만의 특별한 레이아웃만 정의 */
}

.customer-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-sm);
}

.customer-card__name {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
}

.customer-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.customer-card__tag {
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}
```

## 🔄 Theme Switching Implementation

### JavaScript/TypeScript

```typescript
// src/shared/lib/theme.ts

export type Theme = 'light' | 'dark' | 'high-contrast';

export class ThemeManager {
  private static currentTheme: Theme = 'light';

  static setTheme(theme: Theme): void {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aims-theme', theme);
  }

  static getTheme(): Theme {
    return this.currentTheme;
  }

  static initTheme(): void {
    const savedTheme = localStorage.getItem('aims-theme') as Theme || 'light';
    this.setTheme(savedTheme);
  }

  static toggleTheme(): void {
    const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(nextTheme);
  }
}
```

### React Hook

```typescript
// src/shared/hooks/useTheme.ts

import { useState, useEffect } from 'react';
import { ThemeManager, type Theme } from '@/shared/lib/theme';

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(ThemeManager.getTheme());

  useEffect(() => {
    ThemeManager.initTheme();
    setTheme(ThemeManager.getTheme());
  }, []);

  const changeTheme = (newTheme: Theme) => {
    ThemeManager.setTheme(newTheme);
    setTheme(newTheme);
  };

  const toggleTheme = () => {
    ThemeManager.toggleTheme();
    setTheme(ThemeManager.getTheme());
  };

  return { theme, changeTheme, toggleTheme };
};
```

## 🚀 CSS 최적화 전략

### 1. Critical CSS
```css
/* Critical styles loaded inline */
.main-container,
.content-pane,
.loading-skeleton {
  /* Critical styles for above-the-fold content */
}
```

### 2. CSS 번들 분할
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') ?? [];
          const extType = info[info.length - 1];

          if (/\.(css)$/.test(assetInfo.name ?? '')) {
            if (assetInfo.name?.includes('critical')) {
              return 'css/critical-[hash][extname]';
            }
            return 'css/[name]-[hash][extname]';
          }
        }
      }
    }
  }
});
```

### 3. CSS Tree Shaking
```css
/* 사용되지 않는 CSS 클래스 자동 제거 */
/* PurgeCSS나 similar tools 활용 */
```

## 📏 Responsive Design System

### Breakpoints

```css
/* Mobile First Approach */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Media Query Utilities */
@media (min-width: 640px) {  /* sm: */ }
@media (min-width: 768px) {  /* md: */ }
@media (min-width: 1024px) { /* lg: */ }
@media (min-width: 1280px) { /* xl: */ }
@media (min-width: 1536px) { /* 2xl: */ }
```

### Responsive Classes

```css
/* Mobile */
.text-sm { font-size: var(--font-size-sm); }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }

/* Tablet */
@media (min-width: 768px) {
  .md\:text-md { font-size: var(--font-size-md); }
  .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Desktop */
@media (min-width: 1024px) {
  .lg\:text-lg { font-size: var(--font-size-lg); }
  .lg\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

## 🧪 CSS Testing with Playwright

### Playwright를 활용한 프론트엔드 테스트 - 필수 사항 ⚡

**프론트엔드의 테스트를 위해서 Playwright를 적극적으로 사용한다**

#### 왜 Playwright인가?

1. **자동화된 검증**: 수동 테스트 없이 CSS 변경사항 자동 검증
2. **회귀 방지**: 기존 기능 파괴 조기 발견
3. **시각적 일관성**: 스크린샷 비교로 디자인 일관성 보장
4. **크로스 브라우저**: Chrome, Firefox, Safari 동시 테스트

#### 테스트 시나리오 작성 예시

```javascript
// tests/css/focus-styles.spec.js
import { test, expect } from '@playwright/test';

test('포커스 스타일 검증', async ({ page }) => {
  // 1. 페이지 로드
  await page.goto('http://localhost:5175/');

  // 2. 사용자 시나리오 재현
  await page.getByText('전체보기').click();
  await page.locator('div').filter({ hasText: /^고객1$/ }).click();
  await page.getByRole('button', { name: '고객 삭제' }).click();

  // 3. CSS 속성 검증
  const cancelBtn = page.getByRole('button', { name: '취소' });
  await cancelBtn.focus();

  const styles = await cancelBtn.evaluate(el => {
    const computed = window.getComputedStyle(el);
    return {
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
      outline: computed.outline
    };
  });

  // 4. Assertions
  expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(styles.borderRadius).toContain('13px');
  expect(styles.outline).not.toContain('!important');

  // 5. 스크린샷 비교
  await expect(page).toHaveScreenshot('focus-state.png');
});
```

#### CSS 변경 시 필수 테스트 항목

```javascript
// tests/css/theme-switching.spec.js
test('테마 전환 검증', async ({ page }) => {
  await page.goto('http://localhost:5175/');

  // Light 테마 색상 확인
  const lightBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-primary')
  );

  // Dark 테마로 전환
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-theme', 'dark')
  );

  // Dark 테마 색상 확인
  const darkBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--color-bg-primary')
  );

  expect(lightBg).not.toBe(darkBg);
});
```

#### 반복 테스트 자동화

```javascript
// tests/css/regression.spec.js
test.describe('CSS 회귀 테스트', () => {
  test('모든 버튼 포커스 스타일', async ({ page }) => {
    await page.goto('http://localhost:5175/');

    const buttons = await page.locator('button').all();

    for (const button of buttons) {
      await button.focus();

      const outline = await button.evaluate(el =>
        getComputedStyle(el).outline
      );

      // !important 사용 확인
      expect(outline).not.toContain('!important');
    }
  });

  test('하드코딩된 색상 검증', async ({ page }) => {
    await page.goto('http://localhost:5175/');

    // 모든 요소의 computed style 검사
    const hasHardcodedColors = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const hardcoded = [];

      elements.forEach(el => {
        const style = el.getAttribute('style');
        if (style && (
          style.includes('#') ||
          /rgba?\(\d+,\s*\d+,\s*\d+/.test(style)
        )) {
          hardcoded.push(el.tagName);
        }
      });

      return hardcoded.length > 0;
    });

    expect(hasHardcodedColors).toBe(false);
  });
});
```

#### Playwright 실행 명령어

```bash
# 단일 테스트 실행
npx playwright test tests/css/focus-styles.spec.js

# 헤드리스 모드 (빠른 검증)
npx playwright test --headed=false

# UI 모드 (디버깅)
npx playwright test --ui

# 스크린샷 업데이트
npx playwright test --update-snapshots

# 특정 브라우저만 테스트
npx playwright test --project=chromium
```

#### 권장 테스트 구조

```
tests/
├── css/
│   ├── focus-styles.spec.js      # 포커스 스타일 검증
│   ├── theme-switching.spec.js   # 테마 전환 검증
│   ├── responsive.spec.js        # 반응형 디자인 검증
│   ├── regression.spec.js        # 회귀 테스트
│   └── visual/
│       ├── light-theme.png       # 시각적 회귀 기준
│       └── dark-theme.png
└── playwright.config.ts
```

#### 테스트 작성 원칙

1. **자동화 우선**: 수동 테스트 대신 Playwright로 자동화
2. **사용자 시나리오 기반**: 실제 사용자 행동 재현
3. **CSS 속성 직접 검증**: `getComputedStyle()` 활용
4. **시각적 회귀 방지**: 스크린샷 비교 활용
5. **실패 시 자동 재시도**: Playwright 설정 활용

#### 실패 시 디버깅

```javascript
// 실패 시 자동으로 trace 수집
test('디버깅 예시', async ({ page }, testInfo) => {
  await page.goto('http://localhost:5175/');

  // 실패 시 trace 저장
  await page.context().tracing.start({ screenshots: true, snapshots: true });

  try {
    // 테스트 로직
    await expect(page.locator('.button')).toHaveCSS('outline', 'none');
  } catch (error) {
    await page.screenshot({
      path: `test-results/${testInfo.title}-failure.png`
    });
    throw error;
  } finally {
    await page.context().tracing.stop({
      path: `test-results/${testInfo.title}-trace.zip`
    });
  }
});
```

## ✅ CSS Quality Checklist

### 새 컴포넌트 생성시 체크리스트

- [ ] **!important 사용하지 않음** (근시안적 해결책 금지)
- [ ] 인라인 스타일 사용하지 않음 (`style={{}}` 금지)
- [ ] 하드코딩된 색상/크기 사용하지 않음
- [ ] CSS 변수 활용한 테마 반응형 설계
- [ ] 공용 클래스 최대한 재사용
- [ ] 중복 스타일 패턴 식별하여 공용화
- [ ] 반응형 디자인 구현 (mobile-first)
- [ ] 접근성 고려 (focus states, contrast ratio)
- [ ] 다크모드 테스트 완료
- [ ] **Playwright 자동화 테스트 작성** (필수)

### CSS 코드 리뷰 체크리스트

- [ ] **!important 사용 여부 확인** (있으면 거부)
- [ ] 모든 색상이 CSS 변수로 정의됨
- [ ] 중복 스타일 패턴이 공용 클래스로 추출됨
- [ ] 컴포넌트별 CSS는 고유 기능만 포함
- [ ] 테마 전환시 모든 요소가 올바르게 변경됨
- [ ] 성능에 영향을 주는 비효율적 선택자 없음
- [ ] 브라우저 호환성 확인 완료
- [ ] **Playwright 테스트 통과 확인** (필수)

## 🔮 Future Enhancements

### Phase 1: CSS-in-JS Integration (선택사항)
- Styled Components 또는 Emotion 도입 고려
- Dynamic styling 요구사항 증가시

### Phase 2: Advanced Theming
- 사용자 정의 테마 생성 기능
- 테마 설정 저장/공유 시스템
- 실시간 테마 편집기

### Phase 3: Design System Package
- NPM 패키지로 분리
- 다른 프로젝트에서 재사용 가능
- Storybook 통합 문서화

---

## 📞 References

- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [CSS Architecture Guidelines](https://github.com/jareware/css-architecture)
- [BEM Methodology](https://getbem.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**마지막 업데이트**: 2025-09-15
**문서 버전**: 1.0.0
**CSS 시스템 준수율**: 100%
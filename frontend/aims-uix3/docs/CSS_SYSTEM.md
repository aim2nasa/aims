# AIMS UIX-3 CSS System Documentation

> **Version**: 2.0.0 | **Last Updated**: 2026-02-18

## Overview

AIMS UIX-3의 CSS 시스템은 **CSS Cascade Layers**, **디자인 토큰**, **Single Source of Truth** 패턴을 기반으로 구성됩니다.

| 항목 | 값 |
|------|-----|
| CSS 파일 수 | ~221개 |
| 총 줄 수 | ~64,500줄 |
| 파일당 최대 줄 수 | **500줄 (Hard Limit)** |
| !important 사용 | **0건** |
| @layer 적용 | **전체 파일** |

---

## 1. CSS Cascade Layers (@layer)

### Layer 순서 (낮은 -> 높은 우선순위)

```css
@layer reset, tokens, theme, base, utilities, components, views, responsive;
```

| Layer | 우선순위 | 용도 | 대표 파일 |
|-------|---------|------|-----------|
| `reset` | 1 (최저) | CSS 리셋 | `index.css` |
| `tokens` | 2 | 디자인 토큰 (CSS 변수 정의) | `tokens.css` |
| `theme` | 3 | 테마 변수 (다크모드 오버라이드) | `theme.css`, `modal-variables.css` |
| `base` | 4 | 시스템 기본 스타일 | `system.css`, `typography.css` |
| `utilities` | 5 | 공유 유틸리티 | `utilities.css`, `layout.css`, `components.css` |
| `components` | 6 | 컴포넌트 CSS | 모든 컴포넌트별 CSS (~200개) |
| `views` | 7 | 뷰 컨텍스트 오버라이드 | 자식 컴포넌트의 `@layer views {}` 블록 |
| `responsive` | 8 (최고) | 반응형 | `responsive.css`, `phone-landscape.css` |

### 사용 규칙

```css
/* 컴포넌트 CSS 파일 - @layer components로 래핑 */
@layer components {
  .my-component {
    color: var(--color-text-primary);
  }
}

/* 뷰 컨텍스트 오버라이드 - @layer views로 래핑 */
/* (CustomerFullDetailView 내부에서만 적용되는 스타일) */
@layer views {
  .customer-full-detail__section-content .my-component {
    font-size: 12px;
  }
}
```

### @layer views 패턴 (Context Override)

부모 뷰(CustomerFullDetailView 등)에서 자식 컴포넌트 스타일을 오버라이드해야 할 때, **자식 CSS 파일 내부**에 `@layer views {}` 블록을 추가합니다.

```
Before (God Object 패턴 - 금지):
  CustomerFullDetailView.css에서 자식 10개+ 컴포넌트를 직접 제어 (2,800줄)

After (Context Via Props 패턴 - 필수):
  각 자식 CSS 파일에 @layer views {} 블록 추가
  → 자식이 자신의 모든 스타일(기본 + 뷰 컨텍스트)을 소유
```

### Vite 빌드 호환

Vite의 CSS 번들링은 모듈 의존성 그래프 순서를 사용합니다. `vite-plugins/css-layer-order-plugin.js`가 빌드 CSS 맨 앞에 @layer 순서 선언을 삽입하여 올바른 계층 순서를 보장합니다.

---

## 2. 절대 금지 사항

| 금지 | 대안 | 이유 |
|------|------|------|
| `!important` | @layer 순서 / 셀렉터 specificity 조정 | @layer 시스템이 우선순위를 자연스럽게 해결 |
| HEX 색상 직접 사용 (`#ffffff`) | `var(--color-*)` | 테마 대응 불가 |
| `rgba()` 직접 사용 | `var(--color-*-alpha-XX)` | 토큰 일관성 |
| inline style 색상값 | className 사용 | |
| `font-weight: 500` | 400 또는 600만 사용 | |
| 500줄 초과 CSS 파일 | 분할 필수 | 유지보수 불가 |

**예외**: 카카오/네이버 등 브랜드 가이드라인 고정값, `var(--xxx, rgba(...))` 형태의 fallback, box-shadow의 미세 rgba

---

## 3. --grid-cols Single Source 패턴

테이블 grid-template-columns를 **한 곳에서만 정의**하는 패턴입니다.

### Before (칼럼 추가 시 4~8곳 수정 필요)

```css
.table-header { grid-template-columns: 1fr 80px 120px; }
.table-header:has(.checkbox) { grid-template-columns: 28px 1fr 80px 120px; }
.table-row { grid-template-columns: 1fr 80px 120px; }
.table-row:has(.checkbox) { grid-template-columns: 28px 1fr 80px 120px; }
/* CFD에서 동일 4곳 반복... */
```

### After (칼럼 추가 시 1~2곳만 수정)

```css
/* 컴포넌트 CSS - 칼럼 정의 (Single Source) */
.table-header,
.table-row {
  --grid-cols: 1fr 80px 120px;
  grid-template-columns: var(--grid-cols);
}

/* checkbox 있을 때 - 자동 확장 */
.table-header:has(.checkbox),
.table-row:has(.checkbox) {
  grid-template-columns: 28px var(--grid-cols);
}

/* CFD 컨텍스트 오버라이드 - --grid-cols만 변경 */
@layer views {
  .customer-full-detail .table-header,
  .customer-full-detail .table-row {
    --grid-cols: 1fr 60px 100px;
  }
}
```

**칼럼 추가 시**: `--grid-cols` 값만 수정하면 header, row, checkbox 변형 모두 자동 반영

---

## 4. CSS 파일 분할 규칙

### 500줄 Hard Limit

모든 CSS 파일은 **500줄 이하**를 유지해야 합니다. 초과 시 분할 필수.

### 분할 명명 규칙

`OriginalName.section-name.css` 형식을 사용합니다.

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

### import 관리

분할 후 TSX 파일에서 개별 import:

```tsx
// Before
import './ChatPanel.css';

// After
import './ChatPanel.layout.css';
import './ChatPanel.sessions.css';
import './ChatPanel.welcome.css';
import './ChatPanel.input.css';
import './ChatPanel.extras.css';
import './ChatPanel.responsive.css';
```

### 자동화 도구

```bash
# 분석 (dry-run)
node scripts/split-css-file.mjs src/components/MyComponent/MyComponent.css --dry-run

# 실행
node scripts/split-css-file.mjs src/components/MyComponent/MyComponent.css --execute
```

---

## 5. Color Token System (3-Level Hierarchy)

### Level 1: Primitive Tokens (원시 토큰)

> **위치**: `src/shared/design/tokens.css`

```css
/* iOS System Colors */
--color-ios-blue: #007aff;
--color-ios-green: #34c759;
--color-ios-orange: #ff9500;
--color-ios-purple: #af52de;
--color-ios-red: #ff3b30;

/* iOS System Colors - Light/Dark aliases */
--color-ios-orange-light: #ff9500;
--color-ios-red-light: #ff3b30;
--color-ios-red-dark: #ff453a;
--color-ios-gray-light: #8e8e93;
--color-ios-gray-dark: #636366;

/* ChatPanel / AI Assistant Purple Theme */
--color-chat-accent: #8b5cf6;
--color-chat-accent-light: #a78bfa;
--color-chat-accent-alpha-05 ~ alpha-80: rgba(139, 92, 246, 0.05~0.8);
--color-chat-cyan-alpha-10 ~ alpha-20: rgba(6, 182, 212, 0.1~0.2);

/* Error scale */
--color-error-400: #f87171;
```

### Level 2: Semantic Tokens (시맨틱 토큰)

> **위치**: `src/shared/design/tokens.css`

```css
--color-icon-doc-register: #ff9500;  /* 문서 등록 - Orange */
--color-icon-doc-library: #af52de;   /* 문서 라이브러리 - Purple */
--color-icon-doc-search: #007aff;    /* 문서 검색 - Blue */
--color-icon-doc-status: #ff3b30;    /* 문서 처리 현황 - Red */
```

### Level 3: Component Tokens (컴포넌트 토큰)

> **위치**: 해당 컴포넌트 CSS 파일 내 `@layer components {}` 블록

```css
--color-menu-icon-user: var(--color-ios-blue);
--color-menu-icon-list: var(--color-ios-green);
```

### CSS 변수 정의 위치

| 대상 | 정의 위치 |
|------|-----------|
| 전역 디자인 토큰 | `src/shared/design/tokens.css` |
| 테마 오버라이드 | `src/shared/design/theme.css` |
| 모달 변수 | `src/shared/design/modal-variables.css` |
| 컴포넌트 전용 변수 | 해당 컴포넌트 CSS 파일 |

---

## 6. 디자인 토큰 Quick Reference

### 배경

| 변수 | 용도 |
|------|------|
| `--color-bg-primary` | 메인 배경 |
| `--color-bg-secondary` | 카드/섹션 배경 |
| `--color-bg-tertiary` | 보조 영역 배경 |
| `--color-surface` | 컨테이너 표면 |

### 텍스트

| 변수 | 용도 |
|------|------|
| `--color-text-primary` | 본문 텍스트 |
| `--color-text-secondary` | 보조 텍스트 |
| `--color-text-tertiary` | 비활성 텍스트 |

### 상태

| 변수 | 용도 |
|------|------|
| `--color-primary` | 주요 강조색 |
| `--color-accent` | 보조 강조색 |
| `--color-success` | 성공 |
| `--color-warning` | 경고 |
| `--color-error` | 에러 |
| `--color-error-400` | 에러 (밝은 톤) |

### 테두리

| 변수 | 용도 |
|------|------|
| `--color-border` | 기본 테두리 |
| `--color-border-light` | 밝은 테두리 |

전체 토큰 목록: `src/shared/design/tokens.css` 참조

---

## 7. 타이포그래피 (Dense System)

| 용도 | 크기 | weight |
|------|------|--------|
| 섹션 제목 | 13px | 600 |
| 테이블 데이터 | 12px | 400 |
| 테이블 헤더 | 11px | 600 |
| 배지 | 10px | 400 |

- `font-weight: 500` **사용 금지** (400 또는 600만 허용)

---

## 8. 아이콘 규칙

| 항목 | 값 |
|------|-----|
| 최대 크기 (BODY) | 17px |
| LeftPane/CenterPane 제목 | ~20.8px (1.3em) |
| 배경 | `transparent` (투명) |
| 호버 효과 | `opacity` + `scale`만 허용 |

- 호버 시 배경색 변경 **금지**
- SFSymbol 미정의 시 직접 SVG 사용 (`fill="currentColor"`)

---

## 9. Theme System

테마 전환: `html[data-theme="dark"]`로 CSS 변수 재정의

```css
html[data-theme="dark"] {
  --color-bg-primary: #374151;
  --color-text-primary: #f9fafb;
}
```

- **ThemeManager 클래스**: `document.documentElement.setAttribute('data-theme', theme)`
- **React Hook**: `useTheme()` - theme, changeTheme, toggleTheme 제공
- 구현: `src/shared/lib/theme.ts`, `src/shared/hooks/useTheme.ts`

---

## 10. Playwright 시각적 회귀 테스트

CSS 변경 시 디자인 변화가 없는지 자동 검증합니다.

```bash
cd frontend/aims-uix3

# Baseline 생성 (최초 또는 의도적 디자인 변경 후)
npx playwright test tests/visual/css-refactor-regression.spec.ts --update-snapshots

# 비교 실행 (CSS 리팩토링 후 검증)
npx playwright test tests/visual/css-refactor-regression.spec.ts
```

| 항목 | 값 |
|------|-----|
| 테스트 수 | 28개 (+ 1 setup) |
| 실행 시간 | ~9분 |
| 스냅샷 위치 | `tests/__snapshots__/visual/` |

---

## 11. 파일 구조

```
src/
  index.css                         # @layer 순서 선언 + CSS 리셋
  shared/
    design/
      tokens.css                    # @layer tokens - 디자인 토큰
      theme.css                     # @layer theme - 다크모드 오버라이드
      modal-variables.css           # @layer theme - 모달 변수
      system.css                    # @layer base - 시스템 기본 스타일
    styles/
      typography.css                # @layer base - 타이포그래피
      utilities.css                 # @layer utilities - 유틸리티 클래스
      layout.css                    # @layer utilities - 레이아웃 시스템
      components.css                # @layer utilities - 공유 컴포넌트
      responsive.css                # @layer responsive - 반응형
      phone-landscape.css           # @layer responsive - 가로 모드
  components/
    ComponentName/
      ComponentName.css             # @layer components - 컴포넌트 스타일
      ComponentName.layout.css      # (분할 시) 레이아웃 부분
      ComponentName.table.css       # (분할 시) 테이블 부분
      ComponentName.cfd-overrides.css  # (분할 시) @layer views 블록

vite-plugins/
  css-layer-order-plugin.js         # 빌드 시 @layer 순서 보장

scripts/
  split-css-file.mjs                # CSS 파일 분할 자동화
  wrap-css-layers.mjs               # @layer 래핑 자동화
  analyze-built-css.mjs             # 빌드 CSS 분석
```

---

## 12. Quality Checklist

### 새 CSS 파일 작성 시

- [ ] `@layer components { }` 또는 적절한 layer로 래핑
- [ ] 500줄 이하 유지
- [ ] `!important` 미사용
- [ ] 하드코딩 색상 없음 (CSS 변수 사용)
- [ ] 다크모드 테스트 완료
- [ ] 부모 뷰 오버라이드 필요 시 `@layer views {}` 사용

### 테이블 컴포넌트 칼럼 추가 시

- [ ] `--grid-cols` 변수 값만 수정 (1곳)
- [ ] 뷰 컨텍스트 오버라이드가 있으면 해당 `@layer views`도 수정
- [ ] Grep으로 `grid-template-columns` 사용처 전수 검색

### 코드 리뷰

- [ ] `!important` 0건
- [ ] CSS 변수 사용
- [ ] 500줄 제한 준수
- [ ] @layer 래핑 확인
- [ ] 중복 셀렉터 없음

---

## Changelog

### v2.0.0 (2026-02-18) - CSS 아키텍처 리팩토링

Phase 0~4 리팩토링 결과를 반영한 전면 개정:

- **@layer 시스템**: 8개 Cascade Layer로 specificity 제어 (Phase 1)
- **--grid-cols 패턴**: 테이블 칼럼 Single Source of Truth (Phase 0)
- **God Object 해체**: CFD.css 2,807줄 -> 1,597줄, 자식 CSS가 `@layer views` 블록 소유 (Phase 2)
- **파일 분할**: 20개 대형 -> 85개 소형 (500줄 Hard Limit) (Phase 3)
- **!important 제거**: 28건 -> 0건, 하드코딩 색상 ~200건 토큰화 (Phase 4)
- **Vite 플러그인**: `css-layer-order-plugin.js` 추가 (빌드 @layer 순서 보장)
- **Playwright 회귀 테스트**: 28개 시각적 검증 테스트 추가

### v1.1.0 (2025-10-14)

- Color Token System 3-Level Hierarchy 문서화
- Menu Icon Color System 가이드
- iOS System Colors (Light/Dark) 매핑표

### v1.0.0 (2025-09-15)

- CSS 시스템 기본 구조 문서화

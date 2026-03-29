---
name: css-rules
description: AIMS CSS 작성 규칙. 스타일 수정, CSS 작성, 색상 변경 작업 시 자동 사용
---

# AIMS CSS 작성 규칙

이 스킬은 AIMS 프로젝트의 CSS 코딩 규칙을 적용합니다.

## 절대 금지 사항

| 금지 | 대안 |
|------|------|
| `!important` | @layer 순서 / 셀렉터 specificity 조정 |
| HEX 색상 직접 사용 (`#ffffff`) | `var(--color-*)` CSS 변수 |
| `rgba()`, `rgb()` 직접 사용 | `var(--color-*-alpha-XX)` CSS 변수 |
| inline style 색상값 | className 사용 |
| `font-weight: 500` | 400 또는 600만 사용 |
| 500줄 초과 CSS 파일 | 분할 필수 |

**예외**: 카카오/네이버 브랜드 가이드라인 고정값, `var(--xxx, rgba(...))` 형태의 fallback, box-shadow의 미세 rgba

## @layer 필수 래핑

**모든 CSS 파일은 @layer로 래핑해야 합니다.**

```css
/* 컴포넌트 CSS → @layer components */
@layer components {
  .my-component { ... }
}

/* 뷰 컨텍스트 오버라이드 → @layer views */
@layer views {
  .parent-view .my-component { ... }
}
```

### Layer 순서 (낮은 → 높은 우선순위)

```
reset → tokens → theme → base → utilities → components → views → responsive
```

| Layer | 용도 |
|-------|------|
| `components` | 컴포넌트 기본 스타일 |
| `views` | 부모 뷰에서 자식 컴포넌트 오버라이드 |
| `responsive` | @media 쿼리 |

### !important 대신 @layer 활용

```css
/* 잘못됨 - !important */
.modal { z-index: 9999 !important; }

/* 올바름 - @layer views가 @layer components보다 높은 우선순위 */
@layer views {
  .parent .modal { z-index: 9999; }
}
```

## CSS 변수 정의 위치

| 대상 | 정의 위치 |
|------|-----------|
| 전역 디자인 토큰 | `src/shared/design/tokens.css` |
| 테마 오버라이드 | `src/shared/design/theme.css` |
| 모달 변수 | `src/shared/design/modal-variables.css` |
| 컴포넌트 전용 변수 | 해당 컴포넌트 CSS 파일 |

새 색상이 필요한 경우:
1. `tokens.css`에 변수 추가
2. 컴포넌트에서 `var(--새변수)` 사용

## --grid-cols 패턴 (테이블 컴포넌트)

테이블 칼럼은 **`--grid-cols` CSS 변수로 1곳에서만 정의**합니다.

```css
/* 컴포넌트 CSS - 칼럼 정의 (Single Source) */
.table-header, .table-row {
  --grid-cols: 1fr 80px 120px;
  grid-template-columns: var(--grid-cols);
}

/* checkbox 변형 - 자동 확장 */
.table-header:has(.checkbox), .table-row:has(.checkbox) {
  grid-template-columns: 28px var(--grid-cols);
}
```

**칼럼 추가 시**: `--grid-cols` 값만 수정 (1~2곳)

## CSS 파일 분할 규칙

### 500줄 Hard Limit

모든 CSS 파일은 **500줄 이하**를 유지합니다.

### 분할 명명 규칙: `OriginalName.section-name.css`

| 접미사 | 용도 |
|--------|------|
| `.layout.css` | 루트 컨테이너, flex/grid 구조 |
| `.header.css` | 헤더/툴바 영역 |
| `.table.css` | 데이터 그리드/테이블 |
| `.list.css` | 리스트 컨테이너와 아이템 |
| `.states.css` | 로딩/에러/빈 상태 |
| `.modals.css` | 모달 다이얼로그 |
| `.responsive.css` | @media 쿼리 블록 |
| `.cfd-overrides.css` | @layer views 블록 |

## 아이콘 규칙

| 항목 | 값 |
|------|-----|
| 최대 크기 (BODY) | 17px |
| LeftPane/CenterPane 제목 | ~20.8px (1.3em) |
| 배경 | `transparent` (투명) |
| 호버 효과 | `opacity` + `scale`만 허용 |

호버 시 배경색 변경 **금지**

## 타이포그래피 (Dense System)

| 용도 | 크기 | weight |
|------|------|--------|
| 섹션 제목 | 13px | 600 |
| 테이블 데이터 | 12px | 400 |
| 테이블 헤더 | 11px | 600 |
| 배지 | 10px | 400 |

## 자주 사용하는 CSS 변수

```css
/* 배경 */
var(--color-bg-primary)
var(--color-bg-secondary)
var(--color-bg-tertiary)
var(--color-surface)

/* 텍스트 */
var(--color-text-primary)
var(--color-text-secondary)
var(--color-text-tertiary)

/* 테두리 */
var(--color-border)
var(--color-border-light)

/* 강조 */
var(--color-primary)
var(--color-accent)

/* 상태 */
var(--color-success)
var(--color-warning)
var(--color-error)
var(--color-error-400)

/* ChatPanel */
var(--color-chat-accent)
var(--color-chat-accent-light)
var(--color-chat-accent-alpha-XX)

/* iOS */
var(--color-ios-orange-light)
var(--color-ios-red-light)
var(--color-ios-gray-light)
```

## 칼럼 추가 시 체크리스트

1. `--grid-cols` 값 수정 (컴포넌트 CSS)
2. `@layer views` 블록에서도 `--grid-cols` 수정 (있을 경우)
3. `grep "grid-template-columns"` 로 다른 오버라이드 확인
4. Playwright 시각적 회귀 테스트 실행

## 캐싱 문제 해결

```bash
rm -rf node_modules/.vite dist .vite
npm run dev
# 브라우저: Ctrl+Shift+R (하드 새로고침)
```

## 반응형 CSS 작성 규칙 (PC 개발 → 모바일 자동 대응)

PC 기준으로 개발하되, 아래 규칙을 지키면 별도 mobile.css 없이 모바일에서도 동작한다.

### 필수 패턴

| BAD (모바일 깨짐) | GOOD (자동 대응) | 설명 |
|-------------------|-------------------|------|
| `width: 400px` | `width: min(400px, 100%)` | 화면보다 안 넘침 |
| `padding: 24px` | `padding: clamp(12px, 2vw, 24px)` | 작은 화면에서 축소 |
| `gap: 20px` | `gap: clamp(8px, 1.5vw, 20px)` | 작은 화면에서 축소 |
| `grid-template-columns: 1fr 1fr 1fr` | `grid-template-columns: repeat(auto-fit, minmax(250px, 1fr))` | 자동 줄바꿈 |
| 넓은 테이블 그대로 노출 | `.responsive-table-scroll` 래퍼 사용 | 가로 스크롤 |

### 핵심 CSS 함수

```css
/* min() — 최대 크기 제한하되 화면보다 안 넘침 */
width: min(600px, 100%);

/* clamp() — 최소~최대 범위 내 유동 크기 */
padding: clamp(8px, 2vw, 24px);
font-size: clamp(12px, 1.4vw, 15px);

/* auto-fit + minmax — 자동 반응형 그리드 */
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
```

### 글로벌 자동 적용 (responsive.css)

아래는 이미 글로벌로 적용되어 있으므로 **별도 처리 불필요**:

| 항목 | 자동 적용 내용 |
|------|--------------|
| iOS 자동줌 방지 | 모바일에서 input/textarea/select `font-size: max(16px, inherit)` |
| 터치 타겟 | `pointer: coarse` 기기에서 모든 button `min-height: 44px` |
| 가로 스크롤 방지 | `body { overflow-x: hidden }` |
| 이미지 오버플로 | `img, video, iframe { max-width: 100% }` |

### 금지 사항

- 고정 `width` (px)를 `min()` 래핑 없이 사용 금지
- mobile.css를 새로 만들지 않음 (기존 파일은 유지)
- `@media (max-width: ...)` 대신 위 패턴으로 해결 가능한 경우 미디어 쿼리 추가 금지

## 상세 문서

`frontend/aims-uix3/docs/CSS_SYSTEM.md` 참조

---
name: css-rules
description: AIMS CSS 작성 규칙. 스타일 수정, CSS 작성, 색상 변경 작업 시 자동 사용
---

# AIMS CSS 작성 규칙

이 스킬은 AIMS 프로젝트의 CSS 코딩 규칙을 적용합니다.

## 절대 금지 사항

| 금지 | 대안 |
|------|------|
| `#ffffff`, `#000000` 등 HEX 색상 | `var(--color-*)` CSS 변수 |
| `rgba()`, `rgb()` 직접 사용 | `var(--color-*)` CSS 변수 |
| `!important` | 선택자 우선순위 조정 |
| inline style 색상값 | className 사용 |
| 컴포넌트별 CSS 변수 정의 | `variables.css`에서만 정의 |

## CSS 변수 정의 위치

**유일한 정의 파일**: `frontend/aims-uix3/src/styles/variables.css`

새 색상이 필요한 경우:
1. `variables.css`에 변수 추가
2. 컴포넌트에서 `var(--새변수)` 사용

## 아이콘 규칙

| 항목 | 값 |
|------|-----|
| 최대 크기 (BODY) | 17px |
| LeftPane/CenterPane 제목 | ~20.8px (1.3em) |
| 배경 | `transparent` (투명) |
| 호버 효과 | `opacity` + `scale`만 허용 |

**호버 시 금지**: 배경색 변경

## font-weight 규칙

| 허용 | 금지 |
|------|------|
| 400, 600 | 500 |

`font-weight: 500` 사용 금지

## 타이포그래피 (Dense System)

| 용도 | 크기 | weight |
|------|------|--------|
| 섹션 제목 | 13px | 600 |
| 테이블 데이터 | 12px | 400 |
| 테이블 헤더 | 11px | 600 |
| 배지 | 10px | 400 |

## 자주 사용하는 CSS 변수 예시

```css
/* 배경 */
var(--color-background)
var(--color-background-secondary)
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
```

## 위반 예시와 수정

### 위반 1: HEX 색상 직접 사용
```css
/* 잘못됨 */
.button { background: #007AFF; }

/* 올바름 */
.button { background: var(--color-primary); }
```

### 위반 2: !important 사용
```css
/* 잘못됨 */
.modal { z-index: 9999 !important; }

/* 올바름 - 선택자 구체화 */
.app .modal-container .modal { z-index: 9999; }
```

### 위반 3: inline style 색상
```tsx
/* 잘못됨 */
<div style={{ color: '#333' }}>텍스트</div>

/* 올바름 */
<div className="text-primary">텍스트</div>
```

## 캐싱 문제 해결

아이콘이나 스타일이 반영되지 않을 때:
```bash
rm -rf node_modules/.vite dist .vite
npm run dev
# 브라우저: Ctrl+Shift+R (하드 새로고침)
```

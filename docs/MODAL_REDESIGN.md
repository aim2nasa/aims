# AIMS 모달 디자인 체계 재설계 설계서

> **Designer**: Dana (UX/UI)
> **Date**: 2026.03.14
> **Version**: 1.0
> **Status**: 설계 완료 — 구현 승인 대기

---

## 1. 현재 문제 분석

### 1-1. Alert과 Sheet의 미분리 (Critical)

iOS HIG는 Alert과 Sheet를 명확히 구분합니다:

| 구분 | iOS Alert | iOS Sheet |
|------|-----------|-----------|
| 용도 | 짧은 확인/경고 메시지 | 복잡한 콘텐츠, 폼, 목록 |
| PC | 화면 중앙, 컴팩트 | 화면 중앙, 넓은 폭 |
| 모바일 | **화면 중앙, 컴팩트 유지** | **하단에서 올라오는 시트** |
| 크기 | 내용에 맞게 최소화 | 콘텐츠에 따라 유동적 |

**현재 문제**: `Modal.css`의 `@media (max-width: 480px)` 규칙이 `.modal` 전체에 적용되어, AppleConfirmModal(Alert)까지 하단 시트로 변환됨. "정말 삭제하시겠습니까?"가 화면 하단 전체 너비로 올라오는 것은 iOS에서 절대 볼 수 없는 패턴.

### 1-2. min-width 오버플로우 (Critical)

`AppleConfirmModal.css`의 `min-width: 420px`이 375px 모바일 화면보다 넓음. 480px 미디어쿼리에서 `min-width: 260px`으로 오버라이드하지만, **481px~420px 구간**에서 여전히 오버플로우.

### 1-3. 모달 내 버튼 과대 (Major)

Button `size="md"` — `min-height: 44px`, `padding: spacing-3 spacing-4`. 일반 페이지에는 적절하지만 컴팩트한 Alert에서는 과도. Alert 전체 높이 대비 버튼 영역이 **약 35~40%** 차지 (iOS Alert 기준 25%).

### 1-4. 이중 패딩 구조 (Minor)

AppleConfirmModal은 `modal__content` 패딩(24px) 위에 자체 header/body 패딩(20px)을 추가 적용. `modal__footer` 패딩 위에 `apple-confirm-modal__actions` 패딩 중첩. 여백 과도.

---

## 2. 설계 원칙

1. **Alert과 Sheet는 다른 패턴**: Modal이 `variant`로 구분, 모바일 동작이 분기
2. **내용이 크기를 결정**: Alert은 메시지 길이에 맞게 축소, 화면 너비를 넘지 않음
3. **터치 타겟은 플랫폼에 맞게**: PC는 시각적 컴팩트, 모바일은 44px 터치 타겟 유지
4. **하위 호환 우선**: 기존 27개 AppleConfirmModal + 30개+ Modal 사용처 변경 없이 동작

---

## 3. Modal 컴포넌트 변경

### 3-1. Props 추가

```typescript
variant?: 'sheet' | 'alert'  // 기본값: 'sheet'
```

- `variant="sheet"` (기본값): 현재 동작과 **완전히 동일**. 하위 호환 100%
- `variant="alert"`: 모바일에서 하단 시트 변환 **하지 않음**. 항상 중앙 배치

### 3-2. className 적용

```tsx
// Modal.tsx
<div className={`modal-backdrop modal-backdrop--${variant}`}>
  <div className={`modal modal--${size} modal--${variant} ${className}`}>
```

backdrop에도 variant 클래스 직접 부여 → `:has()` 선택자 불필요 (브라우저 호환성 확보).

### 3-3. Modal.css 변경

480px 미디어쿼리를 variant별로 분기:

```css
@media (max-width: 480px) {
  /* Sheet만 하단 시트로 전환 */
  .modal-backdrop--sheet {
    align-items: flex-end;
    padding: 0;
  }
  .modal--sheet {
    width: 100vw;
    max-width: 100vw;
    max-height: 90vh;
    margin: 0;
    border-radius: 16px 16px 0 0;
    animation: modalSlideUp var(--duration-moderate) var(--easing-ios-spring);
  }
  .modal--sheet .modal__header { padding: var(--spacing-4) var(--spacing-5); }
  .modal--sheet .modal__content { padding: var(--spacing-4) var(--spacing-5); }
  .modal--sheet .modal__footer {
    padding: var(--spacing-4) var(--spacing-5);
    padding-bottom: max(var(--spacing-4), env(safe-area-inset-bottom));
  }

  /* Alert은 중앙 유지 — backdrop 기본값(center)이 적용됨 */
  .modal--alert {
    max-width: 300px;
    border-radius: 13px;
  }
}

/* landscape: variant별 분기 */
@media (orientation: landscape) and (max-height: 600px) {
  .modal-backdrop { padding: 4px; }
  .modal--sheet { max-height: calc(100dvh - 8px); }
  .modal--alert { max-height: calc(100dvh - 32px); }
}
```

---

## 4. AppleConfirmModal 변경

### 4-1. variant 전달

```tsx
<Modal ... variant="alert" size="sm">
```

이 한 줄로 모바일에서 중앙 배치.

### 4-2. 크기 조정

| 속성 | 현재 | 변경 |
|------|------|------|
| `max-width` | `500px` | `340px` (iOS Alert 표준 270pt의 웹 적용) |
| `min-width` | `420px` | **제거** |
| 480px 이하 | 별도 오버라이드 | **제거** (Alert은 중앙이므로 불필요) |

### 4-3. 이중 패딩 해소

```css
/* modal__content 패딩 제거 — AppleConfirmModal이 자체 제어 */
.apple-confirm-modal .modal__content { padding: 0; }
.apple-confirm-modal .modal__footer { padding: 0; border-top: none; }

/* Alert 자체 패딩 (iOS Alert 기준) */
.apple-confirm-modal__header { padding: 20px 16px 4px 16px; }
.apple-confirm-modal__body { padding: 0 16px 16px 16px; }
.apple-confirm-modal__actions { padding: 0 16px 16px 16px; gap: 8px; }
```

### 4-4. Button size 변경

```tsx
// md → sm
<Button variant="ghost" size="sm" ...>취소</Button>
<Button variant="destructive" size="sm" ...>삭제</Button>
```

---

## 5. 버튼 디자인 (모달 내)

### 5-1. Alert 내 버튼 — CSS 오버라이드

Button 컴포넌트 자체는 변경하지 않음. 모달 컨텍스트에서 CSS 오버라이드.

```css
/* PC: 컴팩트 */
.apple-confirm-modal__actions .button {
  min-height: 34px;
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
}

/* 모바일: 터치 타겟 유지 */
@media (max-width: 768px) {
  .apple-confirm-modal__actions .button {
    min-height: 44px;
    padding: 10px 16px;
    font-size: 15px;
  }
}

/* iOS Alert 규칙: 주요 액션은 semibold */
.apple-confirm-modal__actions .button--primary,
.apple-confirm-modal__actions .button--destructive { font-weight: 600; }
.apple-confirm-modal__actions .button--ghost { font-weight: 400; }
```

### 5-2. Sheet 모달 내 버튼

변경 없음. Sheet는 콘텐츠 모달이므로 `size="md"` 유지.

---

## 6. Breakpoint별 동작 요약

| Breakpoint | Alert | Sheet |
|------------|-------|-------|
| **>768px (PC)** | 중앙, max 340px, 버튼 34px | 중앙, size별 max-width, 버튼 44px |
| **481~768px (태블릿)** | 중앙, max 340px, 버튼 44px | 중앙, size별 max-width |
| **≤480px (모바일)** | **중앙, max 300px** | 하단 시트, 전체 폭 |
| **폰 가로** | 중앙, max-height 최대화 | 중앙, max-height 최대화 |

---

## 7. 구현 파일 목록

| 파일 | 변경 | 규모 |
|------|------|------|
| `shared/ui/Modal/Modal.tsx` | `variant` prop 추가, backdrop/modal에 variant 클래스 | ~5행 |
| `shared/ui/Modal/Modal.css` | 480px 규칙을 variant별 분기 | ~25행 |
| `AppleConfirmModal.tsx` | `variant="alert"`, Button `size="sm"` | 3행 |
| `AppleConfirmModal.css` | min-width 제거, max-width 조정, 이중 패딩 해소, 버튼 크기 | ~30행 |

**변경하지 않는 파일**: Button.tsx/css, useAppleConfirmController.ts, 기존 27개 AppleConfirmModal 사용처, 기존 30개+ Modal 사용처

---

## 8. 하위 호환 영향 분석

### Modal 사용처 (30개+)
**영향 없음**. `variant` 기본값이 `'sheet'`이므로 기존 모든 사용처는 동일하게 동작.

### AppleConfirmModal 사용처 (27개 파일)
**코드 변경 없음**. 내부에서 `variant="alert"` 전달하므로 외부 사용처 수정 불필요.

### 시각적 변화

| 환경 | 기존 | 변경 후 |
|------|------|---------|
| PC + Alert | 중앙, 420~500px | 중앙, max 340px (더 컴팩트) |
| PC + Alert 버튼 | 높이 44px | **높이 34px** |
| PC + Sheet | 중앙, size별 | **동일** |
| 모바일 + Alert | **하단 시트, 전체 폭** | **중앙, max 300px** |
| 모바일 + Alert 버튼 | 높이 44px | **높이 44px** (터치 유지) |
| 모바일 + Sheet | 하단 시트 | **동일** |

---

## 9. 성공 기준

| 항목 | 기준 |
|------|------|
| PC Alert | 화면 중앙, 340px 이하, 버튼 34px |
| 모바일 Alert | 화면 중앙, 300px 이하, 화면 밖 오버플로우 없음 |
| 모바일 Sheet | 하단 시트 (기존 동작 유지) |
| PC 버튼 | 시각적 컴팩트 (34px) |
| 모바일 버튼 | 터치 타겟 44px 유지 |
| 하위 호환 | 기존 사용처 코드 변경 0건 |
| Playwright 검증 | PC + 모바일(375px) 메모 삭제 모달 스크린샷 확인 |

# 컨텍스트 메뉴 아이콘 색상 구현 가이드

## 📋 개요

내 파일 페이지(PersonalFilesView)의 컨텍스트 메뉴에 아이콘을 표시하고 각 아이콘에 고유한 색상을 적용하는 작업은 예상보다 많은 시행착오를 거쳤습니다. 이 문서는 왜 어려웠는지, 어떻게 해결했는지, 그리고 Playwright 자동화 테스트를 통해 어떻게 검증했는지를 기록합니다.

## 🎯 최종 목표

- **이름 변경** 아이콘: 파란색 (연필)
- **이동** 아이콘: 주황색 (폴더)
- **새 폴더** 아이콘: 녹색 (폴더+플러스)
- **삭제** 아이콘: 빨간색 (휴지통)

## 🚧 직면한 문제들

### 1. SFSymbol 아이콘 미정의 문제

**문제**: `pencil`과 `folder.badge.plus` 아이콘이 SFSymbol.css에 정의되지 않음

```tsx
// ❌ 표시되지 않는 아이콘
<SFSymbol name="pencil" size={13} />
<SFSymbol name="folder.badge.plus" size={13} />
```

**증상**: Playwright 테스트에서 `shapeBeforeContent: "none"` 확인

```typescript
// Playwright 테스트 결과
이름 변경 아이콘 before content: "none"  // ❌ 정의 안됨
이동 아이콘 before content: ""  // ✅ 정의됨 (folder)
새 폴더 아이콘 before content: "none"  // ❌ 정의 안됨
삭제 아이콘 before content: ""  // ✅ 정의됨 (trash)
```

**해결**: SFSymbol 컴포넌트 대신 직접 SVG 구현

```tsx
// ✅ 직접 SVG 구현
<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
  <path d="M11.5 1.5l3 3-8 8H3.5v-3l8-8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"/>
  <path d="M9.5 3.5l3 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"/>
</svg>
```

### 2. CSS 변수 존재하지 않음

**문제**: 처음에는 `-600` suffix가 붙은 CSS 변수를 사용하려 했으나, 실제로는 존재하지 않음

```css
/* ❌ 존재하지 않는 변수 */
--color-info-600
--color-warning-600
--color-success-600
```

**증상**: 색상이 적용되지 않고 기본 텍스트 색상(`rgb(17, 24, 39)`)으로 표시됨

**해결**: `tokens.css`에 실제로 정의된 변수 사용

```css
/* ✅ 실제 존재하는 변수 (tokens.css) */
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-error: #ef4444;
--color-info: #3b82f6;
```

### 3. 여러 CSS 접근 방법 실패

다음 방법들을 모두 시도했으나 실패:

#### 시도 1: `:nth-child()` 선택자
```css
/* ❌ 실패 - nth-child는 모든 자식 요소를 카운트 */
.context-menu-item:nth-child(1) svg {
  color: var(--color-info);
}
```

**문제**: 제목(`<h3>`)도 카운트되어 순서가 틀어짐

#### 시도 2: 클래스명 추가
```tsx
/* ❌ 실패 - 색상 적용 안됨 */
<button className="context-menu-item rename-item">
```

#### 시도 3: `!important` 사용
```css
/* ❌ 실패 + CLAUDE.md 위반 */
.rename-item svg {
  color: var(--color-info) !important;
}
```

**문제**: CLAUDE.md 규칙 위반 + 여전히 색상 적용 안됨

#### 시도 4: span wrapper
```tsx
/* ❌ 실패 */
<span style={{ color: 'var(--color-info)' }}>
  <svg>...</svg>
</span>
```

**문제**: CLAUDE.md 규칙 위반 (inline style) + 색상 적용 안됨

### 4. SVG Color Inheritance 이해 부족

**문제**: SVG `<path>` 요소의 `stroke` 속성을 CSS로 직접 설정하려 했으나 작동하지 않음

```css
/* ❌ 실패 - SVG path의 stroke를 CSS로 직접 제어 불가 */
.context-menu-icon--rename path {
  stroke: var(--color-info);
}
```

**Playwright 테스트 결과**: `pathStroke: "none"`

**해결**: SVG 요소에 `color` 속성 설정 → `currentColor`가 자동 상속

```css
/* ✅ 성공 - SVG 요소에 color 설정 */
.context-menu-icon--rename svg {
  color: var(--color-info);
}
```

```tsx
/* SVG에서 currentColor 사용 */
<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
  <path d="..." stroke="currentColor" />
</svg>
```

**핵심**: `stroke="currentColor"`가 부모의 `color` CSS 속성을 상속받음

## ✅ 최종 해결 방법

### 1. TSX 코드: 직접 SVG 구현 + semantic 클래스명

```tsx
// PersonalFilesView.tsx
<button className="context-menu-item" onClick={handleRenameClick}>
  <span className="context-menu-icon context-menu-icon--rename">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M11.5 1.5l3 3-8 8H3.5v-3l8-8z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"/>
      <path d="M9.5 3.5l3 3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"/>
    </svg>
  </span>
  <span>이름 변경</span>
</button>

<button className="context-menu-item" onClick={handleMoveClick}>
  <span className="context-menu-icon context-menu-icon--move">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h4l1.5-1.5h6.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
            stroke="currentColor"
            strokeWidth="1.2"/>
    </svg>
  </span>
  <span>이동...</span>
</button>

{selectedItem.type === 'folder' && (
  <button className="context-menu-item" onClick={handleNewFolderFromContext}>
    <span className="context-menu-icon context-menu-icon--new">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M2 4h4l1.5-1.5h6.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
              stroke="currentColor"
              strokeWidth="1.2"/>
        <path d="M8 7v4M6 9h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"/>
      </svg>
    </span>
    <span>새 폴더</span>
  </button>
)}

<button className="context-menu-item danger" onClick={handleDeleteClick}>
  <span className="context-menu-icon">
    <SFSymbol name="trash" size={13} />
  </span>
  <span>삭제</span>
</button>
```

**핵심 포인트**:
- `stroke="currentColor"` 사용 (부모의 color 상속)
- semantic 클래스명 (`context-menu-icon--rename`, `--move`, `--new`)
- inline style 사용 안함 (CLAUDE.md 준수)

### 2. CSS 코드: SVG 요소에 color 속성 적용

```css
/* PersonalFilesView.css */

/* 아이콘 레이아웃 */
.context-menu-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 아이콘 색상 */
.context-menu-icon--rename svg {
  color: var(--color-info);  /* 파란색 #3b82f6 */
}

.context-menu-icon--move svg {
  color: var(--color-warning);  /* 주황색 #f59e0b */
}

.context-menu-icon--new svg {
  color: var(--color-success);  /* 녹색 #22c55e */
}

/* 삭제 버튼은 기존 .danger 클래스 사용 */
.context-menu-item.danger .context-menu-icon {
  color: var(--color-error);  /* 빨간색 #ef4444 */
}
```

**핵심 포인트**:
- SVG 요소에 `color` 속성 설정
- `currentColor`가 이 색상을 자동으로 상속
- CSS 변수 사용 (테마 전환 대응)

## 🤖 Playwright 자동화 테스트

### 테스트 목적

1. 아이콘이 실제로 표시되는지 확인
2. 각 아이콘이 고유한 색상을 가지는지 확인
3. 4개의 서로 다른 색상이 적용되었는지 검증

### 테스트 코드

```typescript
// context-menu-icon-colors-final.spec.ts
import { test, expect } from '@playwright/test'

test('컨텍스트 메뉴 아이콘 색상 검증', async ({ page }) => {
  // 1. 페이지 접속 및 로그인
  await page.goto('http://localhost:5177/login')

  const emailInput = page.locator('input[type="email"]')
  await emailInput.fill('rossi@giize.com')

  const passwordInput = page.locator('input[type="password"]')
  await passwordInput.fill('....')

  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/home', { timeout: 10000 })

  // 2. 내 파일 페이지로 이동
  await page.locator('button.main-menu-item:has-text("내 파일")').click()
  await page.waitForSelector('.personal-files-page', { timeout: 10000 })

  // 3. 컨텍스트 메뉴 열기
  const firstFolder = page.locator('.file-item.folder').first()
  await firstFolder.click({ button: 'right' })
  await page.waitForSelector('.context-menu', { timeout: 5000 })

  // 4. 각 아이콘의 색상 확인
  const colors = []

  // 이름 변경 아이콘 (파란색)
  const renameIcon = page.locator('.context-menu-icon--rename svg')
  const renameColor = await renameIcon.evaluate(el =>
    window.getComputedStyle(el).color
  )
  colors.push(renameColor)
  console.log('이름 변경 아이콘 색상:', renameColor)
  expect(renameColor).toBe('rgb(59, 130, 246)')  // #3b82f6

  // 이동 아이콘 (주황색)
  const moveIcon = page.locator('.context-menu-icon--move svg')
  const moveColor = await moveIcon.evaluate(el =>
    window.getComputedStyle(el).color
  )
  colors.push(moveColor)
  console.log('이동 아이콘 색상:', moveColor)
  expect(moveColor).toBe('rgb(245, 158, 11)')  // #f59e0b

  // 새 폴더 아이콘 (녹색)
  const newIcon = page.locator('.context-menu-icon--new svg')
  const newColor = await newIcon.evaluate(el =>
    window.getComputedStyle(el).color
  )
  colors.push(newColor)
  console.log('새 폴더 아이콘 색상:', newColor)
  expect(newColor).toBe('rgb(34, 197, 94)')  // #22c55e

  // 삭제 아이콘 (빨간색)
  const deleteIcon = page.locator('.context-menu-item.danger .context-menu-icon')
  const deleteColor = await deleteIcon.evaluate(el =>
    window.getComputedStyle(el).color
  )
  colors.push(deleteColor)
  console.log('삭제 아이콘 색상:', deleteColor)
  expect(deleteColor).toBe('rgb(220, 38, 38)')  // #dc2626

  // 5. 4개의 고유한 색상 검증
  const uniqueColors = new Set(colors)
  console.log('고유 색상 개수:', uniqueColors.size, '/ 4')
  expect(uniqueColors.size).toBe(4)
})
```

### 테스트 실행 결과

```
✅ 이름 변경 아이콘 색상: rgb(59, 130, 246)   (파란색)
✅ 이동 아이콘 색상: rgb(245, 158, 11)        (주황색)
✅ 새 폴더 아이콘 색상: rgb(34, 197, 94)      (녹색)
✅ 삭제 아이콘 색상: rgb(220, 38, 38)         (빨간색)
✅ 고유 색상 개수: 4 / 4

Test: 컨텍스트 메뉴 아이콘 색상 검증
Status: PASSED ✅
```

### 테스트가 검증한 것

1. **아이콘 표시 확인**: 모든 SVG 요소가 DOM에 존재
2. **색상 적용 확인**: `getComputedStyle()`로 실제 렌더링된 색상 확인
3. **고유 색상 확인**: 4개의 서로 다른 색상이 적용됨
4. **정확한 색상값 확인**: RGB 값이 예상과 정확히 일치

## 📚 배운 점

### 1. SFSymbol 의존성 위험

- SFSymbol.css에 정의되지 않은 아이콘은 표시되지 않음
- 중요한 아이콘은 직접 SVG로 구현하는 것이 안전
- 13px 크기 준수 (CLAUDE.md 아이콘 크기 규칙)

### 2. CSS 변수 정확성의 중요성

- 추측하지 말고 `tokens.css`에서 정확한 변수명 확인 필요
- `-600` suffix는 존재하지 않음 (일반적인 Tailwind 컨벤션과 다름)

### 3. SVG 색상 제어 방법

- SVG 요소에 `color` 속성 설정
- `stroke="currentColor"` 또는 `fill="currentColor"` 사용
- 직접 `stroke` 속성을 CSS로 제어하려 하면 실패

### 4. Playwright의 강력함

- 실제 렌더링된 결과를 검증 가능
- 코드만 보고 판단하는 것보다 훨씬 정확
- 색상값을 RGB로 정확히 확인 가능

### 5. CLAUDE.md 규칙 준수

- inline style 금지
- `!important` 금지
- CSS 변수 사용 필수
- 하드코딩 금지

## 🎯 체크리스트

다른 컴포넌트에서 유사한 작업을 할 때 참고:

- [ ] SFSymbol.css에 아이콘이 정의되어 있는가?
  - 없으면 직접 SVG 구현
- [ ] CSS 변수가 `tokens.css`에 실제로 존재하는가?
  - 추측하지 말고 파일 확인
- [ ] SVG에 `stroke="currentColor"` 또는 `fill="currentColor"` 사용했는가?
- [ ] CSS에서 SVG 요소에 `color` 속성 설정했는가?
- [ ] inline style 사용하지 않았는가? (CLAUDE.md 위반)
- [ ] `!important` 사용하지 않았는가? (CLAUDE.md 위반)
- [ ] Playwright 테스트로 실제 렌더링 결과 검증했는가?
- [ ] 4개 이상의 고유한 색상이 적용되었는가?

## 🔗 관련 파일

- **구현 파일**:
  - [PersonalFilesView.tsx](../frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.tsx) (lines 2082-2111)
  - [PersonalFilesView.css](../frontend/aims-uix3/src/components/DocumentViews/PersonalFilesView/PersonalFilesView.css) (lines 732-750)
- **CSS 변수 정의**: [tokens.css](../frontend/aims-uix3/src/shared/design/tokens.css)
- **테스트 파일**: 디버깅 완료 후 삭제됨
- **커밋**: `feat: 내 파일 컨텍스트 메뉴 아이콘 색상 추가` (v0.45.0)

## 📝 결론

컨텍스트 메뉴 아이콘 색상 구현은 다음 요소들의 정확한 이해가 필요했습니다:

1. SFSymbol 시스템의 한계와 대안
2. CSS 변수의 정확한 이름
3. SVG 색상 상속 메커니즘 (`currentColor`)
4. CLAUDE.md 코딩 규칙 준수
5. Playwright를 통한 객관적 검증

특히 **Playwright 자동화 테스트**는 "코드만 보고 판단"하는 것이 아니라 **실제 브라우저에서 렌더링된 결과**를 확인할 수 있게 해주어, 여러 시행착오 끝에 최종적으로 문제를 해결하는 데 결정적인 역할을 했습니다.

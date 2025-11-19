# AIMS 검색창 디자인 표준

**작성일**: 2025-11-19
**버전**: 1.0.0
**레퍼런스**: DocumentLibraryView 검색창 (커밋 00edb8e0)

## 📋 목차

1. [개요](#개요)
2. [디자인 원칙](#디자인-원칙)
3. [표준 구조](#표준-구조)
4. [CSS 규칙](#css-규칙)
5. [적용 예시](#적용-예시)
6. [다른 View 적용 방법](#다른-view-적용-방법)
7. [테스트 방법](#테스트-방법)
8. [체크리스트](#체크리스트)

---

## 개요

AIMS 프로젝트의 모든 검색창은 **일관된 디자인과 동작**을 유지해야 합니다.

### 목적

- ✅ 모든 검색창의 시각적 일관성 보장
- ✅ 하드 리프레시 후에도 디자인 유지 (캐싱 문제 방지)
- ✅ CSS 변수 사용으로 테마 전환 지원
- ✅ 유지보수성 향상

### 적용 범위

- 문서 라이브러리 검색창 ✅ (완료)
- 고객 검색창
- 문서 검색창
- 기타 모든 검색 UI

---

## 디자인 원칙

### 핵심 철학

1. **아이콘이 input 내부에 위치** (margin 사용 금지)
2. **절대 위치 (absolute positioning)** 사용으로 일관성 보장
3. **투명 wrapper** + **경계선 있는 input**
4. **CSS 변수**로 테마 대응
5. **Specificity**로 스타일 충돌 방지

### ⚠️ 중요: 변경 가능 vs 불가능 속성

이 표준을 따르면 **모든 검색창이 동일한 디자인**을 유지합니다.

#### ✅ 변경 가능한 속성 (View별로 조정 가능)

| 속성 | 설명 | 예시 |
|------|------|------|
| `width`, `max-width` | 검색창 폭 | 고객 검색: 400px, 문서 검색: 300px |
| `min-width` | 최소 폭 | 반응형 레이아웃에 따라 조정 |
| `flex-shrink` | 축소 비율 | 헤더 공간에 따라 조정 |

#### ❌ 변경 불가능한 속성 (절대 표준)

| 속성 | 표준값 | 이유 |
|------|--------|------|
| Icon `position` | `absolute` | 하드 리프레시 일관성 보장 |
| Icon `left` | `10px` | 모든 검색창에서 동일한 아이콘 위치 |
| Icon `top` | `50%` + `translateY(-50%)` | 세로 중앙 정렬 |
| Input `padding-left` | `26px` | 아이콘(10px) + 여백(16px) 공간 확보 |
| Input `border` | `1px solid rgba(0, 0, 0, 0.12)` | 미세한 경계선 표준 |
| Wrapper `background-color` | `transparent` | 투명 배경 표준 |
| Wrapper `position` | `relative` | 자식 absolute의 기준점 |
| Wrapper `overflow` | `visible` | 아이콘 잘림 방지 |

**핵심**: 폭은 View마다 다를 수 있지만, 아이콘 위치와 input 패딩은 절대 변경 금지!

### 왜 이렇게 설계했는가?

#### 문제: margin-right 방식의 한계
```css
/* ❌ 이전 방식 - 불안정 */
.search-icon {
  margin-right: 4px;  /* 상대 위치 */
}
```
- **문제점**: 하드 리프레시 시 아이콘이 붙었다 떨어졌다 함
- **원인**: 브라우저 렌더링 순서에 따라 margin 계산이 달라짐

#### 해결: absolute positioning
```css
/* ✅ 새 방식 - 안정적 */
.search-icon {
  position: absolute;
  left: 10px;  /* 고정 위치 */
  top: 50%;
  transform: translateY(-50%);
}

.search-input {
  padding-left: 26px;  /* 아이콘 공간 확보 */
}
```
- **장점**: 30번 하드 리프레시 후에도 100% 일관된 위치
- **검증**: Playwright E2E 테스트 통과

---

## 표준 구조

### HTML 구조

```tsx
<div className="[view-name] .search-input-wrapper">
  {/* 아이콘 - absolute 위치 */}
  <SFSymbol
    name="magnifyingglass"
    size={SFSymbolSize.CAPTION_1}
    className="search-icon"
    decorative={true}
  />

  {/* Input - padding-left로 아이콘 공간 확보 */}
  <input
    type="text"
    className="search-input"
    placeholder="검색..."
    value={searchQuery}
    onChange={handleSearch}
  />

  {/* Clear 버튼 (옵션) */}
  {searchQuery && (
    <button
      className="search-clear-button"
      onClick={handleClear}
      aria-label="검색어 지우기"
    >
      <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_1} />
    </button>
  )}
</div>
```

### 필수 클래스명

| 클래스명 | 역할 | 필수 여부 |
|---------|------|----------|
| `.search-input-wrapper` | 컨테이너 | ✅ 필수 |
| `.search-icon` | 검색 아이콘 | ✅ 필수 |
| `.search-input` | 입력 필드 | ✅ 필수 |
| `.search-clear-button` | 지우기 버튼 | ⚪ 옵션 |

---

## CSS 규칙

### 1. Wrapper 스타일

```css
.[view-name] .search-input-wrapper {
  position: relative;  /* ❌ 표준: 자식 absolute 위치의 기준 */
  display: flex;
  align-items: center;
  width: 300px;        /* ✅ 변경 가능: View별로 조정 (200px ~ 500px 등) */
  max-width: 300px;    /* ✅ 변경 가능: View별로 조정 */
  background-color: transparent;  /* ❌ 표준: 투명 */
  border-radius: 10px;
  padding: 6px 8px;
  transition: background-color 0.2s ease-out;
  flex-shrink: 1;      /* ✅ 변경 가능: 반응형에 따라 조정 */
  min-width: 0;        /* ✅ 변경 가능: View별로 조정 */
  overflow: visible;   /* ❌ 표준: 아이콘 잘림 방지 */
}

html[data-theme="dark"] .[view-name] .search-input-wrapper {
  background-color: transparent;  /* ❌ 표준: 투명 */
}

.[view-name] .search-input-wrapper:focus-within {
  background-color: transparent;  /* ❌ 표준: focus 시에도 투명 유지 */
}

html[data-theme="dark"] .[view-name] .search-input-wrapper:focus-within {
  background-color: transparent;  /* ❌ 표준: focus 시에도 투명 유지 */
}
```

**핵심 포인트:**
- ❌ **표준 (변경 불가)**:
  - `position: relative` - 자식 absolute의 기준점
  - `background-color: transparent` - 모든 상태에서 투명
  - `overflow: visible` - 아이콘 잘림 방지
- ✅ **변경 가능**:
  - `width`, `max-width` - View별로 폭 조정 가능
  - `flex-shrink`, `min-width` - 레이아웃에 따라 조정 가능

### 2. Icon 스타일 (핵심!)

**⚠️ Icon은 모든 속성이 표준 (변경 불가)입니다!**

```css
.[view-name] .search-icon {
  position: absolute;  /* ❌ 표준: 절대 위치 */
  left: 10px;          /* ❌ 표준: 고정 좌표 */
  top: 50%;            /* ❌ 표준: 세로 중앙 */
  transform: translateY(-50%);  /* ❌ 표준: 정확한 중앙 정렬 */
  color: var(--color-ios-text-quaternary-light);  /* ❌ 표준: CSS 변수 */
  pointer-events: none;  /* ❌ 표준: 클릭 이벤트 무시 */
  z-index: 1;  /* ❌ 표준: input 위에 표시 */
}

html[data-theme="dark"] .[view-name] .search-icon {
  color: var(--color-ios-text-quaternary-dark);  /* ❌ 표준: CSS 변수 */
}
```

**절대 금지:**
```css
/* ❌ margin 사용 절대 금지 - 일관성 파괴 */
.search-icon {
  margin-right: 4px;  /* 절대 사용하지 말 것! */
}

/* ❌ 상대 위치 절대 금지 - 캐싱 문제 발생 */
.search-icon {
  position: relative;  /* 절대 사용하지 말 것! */
}

/* ❌ left 값 변경 절대 금지 - 모든 검색창에서 동일해야 함 */
.search-icon {
  left: 15px;  /* 절대 사용하지 말 것! 10px만 사용! */
}
```

### 3. Input 스타일

```css
.[view-name] .search-input {
  flex: 1;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);  /* ❌ 표준: 미세한 경계선 */
  border-radius: 8px;
  background: transparent;                /* ❌ 표준: 투명 배경 */
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-weight: 400;
  color: var(--color-ios-text-primary-light);  /* ❌ 표준: CSS 변수 */
  outline: none;
  padding: 4px 8px 4px 26px;             /* ❌ 표준: 왼쪽 26px로 아이콘 공간 확보 */
  transition: border-color 0.2s ease-out;
}

html[data-theme="dark"] .[view-name] .search-input {
  color: var(--color-ios-text-primary-dark);          /* ❌ 표준: CSS 변수 */
  border-color: rgba(255, 255, 255, 0.12);  /* ❌ 표준: 다크 모드 경계선 */
}

.[view-name] .search-input::placeholder {
  color: var(--color-ios-text-placeholder-light);     /* ❌ 표준: CSS 변수 */
  font-weight: 400;
}

html[data-theme="dark"] .[view-name] .search-input::placeholder {
  color: var(--color-ios-text-placeholder-dark);      /* ❌ 표준: CSS 변수 */
}
```

**핵심 포인트:**
- ❌ **표준 (변경 불가)**:
  - `padding-left: 26px` - 아이콘(10px) + 여백(16px) = 26px (절대 변경 금지!)
  - `border: 1px solid rgba(0, 0, 0, 0.12)` - 미세한 경계선
  - `background: transparent` - 투명 배경
  - CSS 변수 사용 (테마 전환 지원)

### 4. CSS Specificity

**반드시 View 이름을 접두사로 사용:**

```css
/* ✅ 올바른 방법 - 충돌 없음 */
.document-library-view .search-input-wrapper { }
.customer-list-view .search-input-wrapper { }
.document-search-view .search-input-wrapper { }

/* ❌ 잘못된 방법 - 다른 View와 충돌 */
.search-input-wrapper { }
```

**이유**: 여러 View에서 `.search-input-wrapper` 클래스를 사용하므로 충돌 방지 필수!

---

## 적용 예시

### DocumentLibraryView (레퍼런스)

**파일**: `DocumentLibraryView.css` (라인 69-128)

```css
/* Wrapper */
.document-library-view .search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 300px;
  max-width: 300px;
  background-color: transparent;
  border-radius: 10px;
  padding: 6px 8px;
  transition: background-color 0.2s ease-out;
  flex-shrink: 1;
  min-width: 0;
  overflow: visible;
}

html[data-theme="dark"] .document-library-view .search-input-wrapper {
  background-color: transparent;
}

.document-library-view .search-input-wrapper:focus-within {
  background-color: transparent;
}

html[data-theme="dark"] .document-library-view .search-input-wrapper:focus-within {
  background-color: transparent;
}

/* Icon */
.document-library-view .search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-ios-text-quaternary-light);
  pointer-events: none;
  z-index: 1;
}

html[data-theme="dark"] .document-library-view .search-icon {
  color: var(--color-ios-text-quaternary-dark);
}

/* Input */
.document-library-view .search-input {
  flex: 1;
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-weight: 400;
  color: var(--color-ios-text-primary-light);
  outline: none;
  padding: 4px 8px 4px 26px;
  transition: border-color 0.2s ease-out;
}

html[data-theme="dark"] .document-library-view .search-input {
  color: var(--color-ios-text-primary-dark);
  border-color: rgba(255, 255, 255, 0.12);
}
```

**검증 결과:**
- ✅ Playwright E2E 테스트 2개 통과
- ✅ 30번 하드 리프레시 후에도 일관된 디자인

---

## 다른 View 적용 방법

### Step 1: CSS 복사 및 수정

1. `DocumentLibraryView.css`에서 검색창 CSS 복사
2. View 이름 변경 + 필요시 폭 조정:
   ```css
   /* Before (문서 라이브러리 - 300px) */
   .document-library-view .search-input-wrapper {
     width: 300px;
     max-width: 300px;
     /* ... 나머지 속성 동일 ... */
   }

   /* After (고객 검색 - 400px로 확장) */
   .customer-list-view .search-input-wrapper {
     width: 400px;          /* ✅ View별로 조정 가능 */
     max-width: 400px;      /* ✅ View별로 조정 가능 */
     /* ... 나머지 속성은 절대 변경 금지! ... */
   }
   ```

3. **중요**: Icon과 Input 스타일은 절대 변경하지 말 것!
   ```css
   /* ✅ 이 부분은 완전히 동일하게 복사 */
   .customer-list-view .search-icon {
     position: absolute;
     left: 10px;          /* ❌ 변경 금지! */
     top: 50%;
     transform: translateY(-50%);
     /* ... */
   }

   .customer-list-view .search-input {
     padding: 4px 8px 4px 26px;  /* ❌ 변경 금지! */
     border: 1px solid rgba(0, 0, 0, 0.12);  /* ❌ 변경 금지! */
     /* ... */
   }
   ```

### Step 2: HTML 구조 적용

```tsx
// [YourView].tsx
<div className="customer-list-view">
  <div className="search-input-wrapper">
    <SFSymbol
      name="magnifyingglass"
      size={SFSymbolSize.CAPTION_1}
      className="search-icon"
      decorative={true}
    />
    <input
      type="text"
      className="search-input"
      placeholder="고객 검색..."
      value={searchQuery}
      onChange={handleSearch}
    />
  </div>
</div>
```

### Step 3: 테스트 작성 (권장)

Playwright 테스트를 작성하여 일관성 검증:

```typescript
// tests/[view-name]-search-consistency.spec.ts
import { test, expect } from '@playwright/test';

test('검색창이 30번 리프레시 후에도 일관된 디자인', async ({ page }) => {
  await page.goto('http://localhost:5179');
  await page.click('text=[View 이름]');
  await page.waitForTimeout(1000);

  const searchIcon = page.locator('.search-icon');
  const searchInput = page.locator('.search-input');

  // 초기 검증
  const iconPosition = await searchIcon.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return {
      position: style.position,
      left: style.left
    };
  });

  const inputPadding = await searchInput.evaluate((el) => {
    return window.getComputedStyle(el).paddingLeft;
  });

  expect(iconPosition.position).toBe('absolute');
  expect(iconPosition.left).toBe('10px');
  expect(inputPadding).toBe('26px');

  // 30번 리프레시 테스트
  for (let i = 1; i <= 30; i++) {
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('text=[View 이름]');
    await page.waitForTimeout(1000);

    const newIconPosition = await searchIcon.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        position: style.position,
        left: style.left
      };
    });

    const newInputPadding = await searchInput.evaluate((el) => {
      return window.getComputedStyle(el).paddingLeft;
    });

    expect(newIconPosition.position).toBe('absolute');
    expect(newIconPosition.left).toBe('10px');
    expect(newInputPadding).toBe('26px');
  }

  console.log('✅ 30번의 리프레시 모두 일관된 디자인 확인!');
});
```

---

## 테스트 방법

### 수동 테스트

1. **브라우저에서 확인**
   - 브라우저에서 해당 View 열기
   - 검색창의 아이콘이 input 내부 왼쪽에 위치하는지 확인
   - 경계선이 input에만 표시되는지 확인

2. **하드 리프레시 테스트**
   - Ctrl+Shift+R 3-5번 실행
   - 아이콘 위치가 변하지 않는지 확인
   - 경계선이 사라지지 않는지 확인

3. **테마 전환 테스트**
   - 라이트/다크 모드 전환
   - 색상이 자연스럽게 전환되는지 확인

### 자동 테스트 (Playwright)

```bash
# 특정 View 검색창 테스트
npx playwright test [view-name]-search-consistency.spec.ts --headed

# 모든 검색창 테스트
npx playwright test *search-consistency* --headed
```

**예시:**
```bash
# 문서 라이브러리 검색창 테스트
cd frontend/aims-uix3
npx playwright test search-input-consistency.spec.ts --headed --timeout=180000
```

---

## 체크리스트

새로운 검색창을 구현하거나 수정할 때 아래 체크리스트를 확인하세요.

### HTML 구조
- [ ] `.search-input-wrapper` 클래스 사용
- [ ] `.search-icon` 클래스 사용
- [ ] `.search-input` 클래스 사용
- [ ] View 이름을 wrapper의 부모 클래스로 사용

### CSS 규칙
- [ ] Icon: `position: absolute` + `left: 10px`
- [ ] Icon: `top: 50%` + `transform: translateY(-50%)`
- [ ] Input: `padding-left: 26px`
- [ ] Input: `border: 1px solid rgba()` 사용
- [ ] Wrapper: `background-color: transparent`
- [ ] Wrapper: `position: relative`
- [ ] Wrapper: `overflow: visible`

### CSS 변수 사용
- [ ] 색상값 하드코딩 없음
- [ ] `var(--color-*)` CSS 변수 사용
- [ ] 라이트/다크 모드 모두 지원

### 금지사항 확인
- [ ] ❌ `margin-right` 사용 안 함
- [ ] ❌ Icon에 `position: relative` 사용 안 함
- [ ] ❌ `!important` 사용 안 함
- [ ] ❌ 색상 하드코딩 안 함

### CSS Specificity
- [ ] View 이름을 접두사로 사용 (`.document-library-view .search-input-wrapper`)
- [ ] 다른 View와 충돌하지 않음

### 테스트
- [ ] 브라우저에서 수동 테스트 완료
- [ ] 하드 리프레시 3-5번 후 일관성 확인
- [ ] 테마 전환 테스트 완료
- [ ] (권장) Playwright 자동 테스트 작성

### CLAUDE.md 규칙 준수
- [ ] 하드코딩 금지 규칙 준수
- [ ] !important 사용 금지 규칙 준수
- [ ] 최소한 수정 원칙 준수
- [ ] CSS 변수 사용 원칙 준수

---

## 트러블슈팅

### 문제: 아이콘이 하드 리프레시 후 위치가 변함

**원인**: `margin-right` 같은 상대 위치 사용

**해결**:
```css
/* ❌ Before */
.search-icon {
  margin-right: 4px;
}

/* ✅ After */
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.search-input {
  padding-left: 26px;
}
```

### 문제: 다른 View의 검색창 CSS와 충돌

**원인**: CSS 선택자 specificity 부족

**해결**:
```css
/* ❌ Before */
.search-input-wrapper { }

/* ✅ After */
.your-view-name .search-input-wrapper { }
```

### 문제: 테마 전환 시 색상이 변하지 않음

**원인**: CSS 변수 대신 하드코딩된 색상 사용

**해결**:
```css
/* ❌ Before */
.search-icon {
  color: #888;
}

/* ✅ After */
.search-icon {
  color: var(--color-ios-text-quaternary-light);
}

html[data-theme="dark"] .search-icon {
  color: var(--color-ios-text-quaternary-dark);
}
```

### 문제: Vite 개발 서버에서 CSS 변경사항이 반영 안 됨

**원인**: Vite 캐시 문제

**해결**:
```bash
cd frontend/aims-uix3
rm -rf node_modules/.vite dist .vite
npm run dev
```

브라우저에서 Ctrl+Shift+R (하드 리프레시)

---

## 버전 히스토리

| 버전 | 날짜 | 변경사항 |
|------|------|---------|
| 1.0.0 | 2025-11-19 | 초기 문서 작성 (DocumentLibraryView 기준) |

---

## 참고 문서

- [CLAUDE.md](../CLAUDE.md) - 프로젝트 개발 규칙
- [CSS_SYSTEM.md](../frontend/aims-uix3/CSS_SYSTEM.md) - CSS 변수 시스템
- [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](./ICON_IMPLEMENTATION_TROUBLESHOOTING.md) - 아이콘 구현 가이드
- [DocumentLibraryView.css](../frontend/aims-uix3/src/components/DocumentViews/DocumentLibraryView/DocumentLibraryView.css) - 레퍼런스 구현

---

**이 문서는 AIMS 프로젝트의 모든 검색창 구현 시 반드시 따라야 하는 표준입니다.**

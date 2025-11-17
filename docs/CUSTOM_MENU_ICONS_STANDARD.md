# CustomMenu 아이콘 표준 문서

## 📋 개요

이 문서는 AIMS UIX3의 CustomMenu에서 사용되는 모든 아이콘의 **표준 구현 패턴**을 정의합니다.

**핵심 원칙: 절대적인 일관성 (Zero Exception Policy)**
- 모든 아이콘은 **동일한 포맷**을 따라야 합니다
- 예외나 특수 케이스는 **절대 허용되지 않습니다**
- 일관성은 유지보수성의 핵심입니다

## 🎯 표준 패턴

CustomMenu의 모든 아이콘은 **SFSymbol 컴포넌트**를 통해 구현되며, 내부적으로 **CSS mask + SVG path** 방식을 사용합니다.

### 필수 구현 형식

```css
.sf-symbol--{icon-name} .sf-symbol__shape::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: {value}em;
  height: {value}em;

  /* 테마 색상 자동 상속 */
  background: currentColor;

  /* SVG 경로를 mask로 적용 */
  mask: url("data:image/svg+xml,{svg-path}") no-repeat center;
  mask-size: contain;
  -webkit-mask: url("data:image/svg+xml,{svg-path}") no-repeat center;
  -webkit-mask-size: contain;
}

.sf-symbol--{icon-name} .sf-symbol__shape::after {
  content: none;
}
```

## ✅ 올바른 구현 예시

### 1. 폴더 아이콘 (folder)

```css
/* FOLDER SYMBOL - 폴더 아이콘 */
.sf-symbol--folder .sf-symbol__shape::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0.8em;
  height: 0.7em;

  /* iOS 표준 폴더 아이콘 */
  background: currentColor;
  mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M1.5 3.5C1.5 2.67157 2.17157 2 3 2H6.08579C6.351 2 6.60536 2.10536 6.79289 2.29289L7.70711 3.20711C7.89464 3.39464 8.149 3.5 8.41421 3.5H13C13.8284 3.5 14.5 4.17157 14.5 5V12.5C14.5 13.3284 13.8284 14 13 14H3C2.17157 14 1.5 13.3284 1.5 12.5V3.5Z'/%3e%3c/svg%3e") no-repeat center;
  mask-size: contain;
  -webkit-mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M1.5 3.5C1.5 2.67157 2.17157 2 3 2H6.08579C6.351 2 6.60536 2.10536 6.79289 2.29289L7.70711 3.20711C7.89464 3.39464 8.149 3.5 8.41421 3.5H13C13.8284 3.5 14.5 4.17157 14.5 5V12.5C14.5 13.3284 13.8284 14 13 14H3C2.17157 14 1.5 13.3284 1.5 12.5V3.5Z'/%3e%3c/svg%3e") no-repeat center;
  -webkit-mask-size: contain;
}

.sf-symbol--folder .sf-symbol__shape::after {
  content: none;
}
```

### 2. 문서 아이콘 (doc)

```css
/* DOC SYMBOL - 문서 아이콘 */
.sf-symbol--doc .sf-symbol__shape::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0.7em;
  height: 0.9em;

  /* iOS 표준 문서 아이콘 */
  background: currentColor;
  mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 18'%3e%3cpath d='M2 0C0.89543 0 0 0.89543 0 2V16C0 17.1046 0.89543 18 2 18H12C13.1046 18 14 17.1046 14 16V5.41421C14 4.88378 13.7893 4.37507 13.4142 4L10 0.585786C9.62493 0.210714 9.11622 0 8.58579 0H2ZM8 1.5V5C8 5.55228 8.44772 6 9 6H12.5L8 1.5Z'/%3e%3c/svg%3e") no-repeat center;
  mask-size: contain;
  -webkit-mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 18'%3e%3cpath d='M2 0C0.89543 0 0 0.89543 0 2V16C0 17.1046 0.89543 18 2 18H12C13.1046 18 14 17.1046 14 16V5.41421C14 4.88378 13.7893 4.37507 13.4142 4L10 0.585786C9.62493 0.210714 9.11622 0 8.58579 0H2ZM8 1.5V5C8 5.55228 8.44772 6 9 6H12.5L8 1.5Z'/%3e%3c/svg%3e") no-repeat center;
  -webkit-mask-size: contain;
}

.sf-symbol--doc .sf-symbol__shape::after {
  content: none;
}
```

### 3. 검색 아이콘 (magnifyingglass)

```css
/* MAGNIFYINGGLASS SYMBOL - 검색 아이콘 */
.sf-symbol--magnifyingglass .sf-symbol__shape::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0.9em;
  height: 0.9em;

  /* iOS 표준 돋보기 아이콘 */
  background: currentColor;
  mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'%3e%3cpath d='M8 0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16C9.84871 16 11.551 15.3729 12.9056 14.3199L16.2929 17.7071C16.6834 18.0976 17.3166 18.0976 17.7071 17.7071C18.0976 17.3166 18.0976 16.6834 17.7071 16.2929L14.3199 12.9056C15.3729 11.551 16 9.84871 16 8C16 3.58172 12.4183 0 8 0ZM2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8Z'/%3e%3c/svg%3e") no-repeat center;
  mask-size: contain;
  -webkit-mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'%3e%3cpath d='M8 0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16C9.84871 16 11.551 15.3729 12.9056 14.3199L16.2929 17.7071C16.6834 18.0976 17.3166 18.0976 17.7071 17.7071C18.0976 17.3166 18.0976 16.6834 17.7071 16.2929L14.3199 12.9056C15.3729 11.551 16 9.84871 16 8C16 3.58172 12.4183 0 8 0ZM2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8Z'/%3e%3c/svg%3e") no-repeat center;
  -webkit-mask-size: contain;
}

.sf-symbol--magnifyingglass .sf-symbol__shape::after {
  content: none;
}
```

## 🔧 CustomMenu에서 아이콘 사용하기

```typescript
// src/components/CustomMenu/CustomMenu.tsx

import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '@/components/SFSymbol/SFSymbol';

const MenuIcons = {
  // ✅ 올바른 구현 - SFSymbol 컴포넌트 사용
  Folder: () => (
    <SFSymbol
      name="folder"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),

  Search: () => (
    <SFSymbol
      name="magnifyingglass"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  ),

  Library: () => (
    <SFSymbol
      name="doc"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  )
};
```

## ❌ 금지된 구현 방식

### 1. Raw SVG 직접 사용 금지

```typescript
// ❌ 절대 금지 - 일관성 파괴
const MenuIcons = {
  Folder: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="..." fill="currentColor"/>
    </svg>
  )
};
```

**이유**:
- SFSymbol 시스템과 일관성 없음
- 테마 대응이 불완전할 수 있음
- 유지보수 어려움

### 2. Emoji 사용 금지

```css
/* ❌ 절대 금지 - 브라우저/OS별 렌더링 차이 */
.sf-symbol--folder .sf-symbol__shape::before {
  content: '📁';
  font-size: 1em;
}
```

**이유**:
- 브라우저/OS별 렌더링이 다름
- 크기 조절이 일관적이지 않음
- 테마 색상 적용 불가능

### 3. 크기 조작 (font-size 변경) 금지

```css
/* ❌ 절대 금지 - 인위적 조작 */
.sf-symbol--folder .sf-symbol__shape::before {
  content: '📁';
  font-size: 0.85em; /* 특정 아이콘만 크기 조작 */
}
```

**이유**:
- 예외 케이스 생성
- 유지보수 복잡도 증가
- 일관성 원칙 위배

## 📝 새 아이콘 추가 가이드

### 1단계: SVG 경로 준비

iOS SF Symbols 또는 표준 아이콘 라이브러리에서 SVG path를 가져옵니다.

```xml
<!-- 예시: 별 아이콘 -->
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>
  <path d='M8 0L10.4 5.6L16 6.4L12 10.8L13.2 16L8 13.6L2.8 16L4 10.8L0 6.4L5.6 5.6L8 0Z'/>
</svg>
```

### 2단계: URL 인코딩

SVG를 data URI 형식으로 인코딩합니다 (온라인 도구 사용 또는 수동).

```
data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M8 0L10.4 5.6L16 6.4L12 10.8L13.2 16L8 13.6L2.8 16L4 10.8L0 6.4L5.6 5.6L8 0Z'/%3e%3c/svg%3e
```

### 3단계: SFSymbol.css에 정의 추가

```css
/* STAR SYMBOL - 별 아이콘 */
.sf-symbol--star .sf-symbol__shape::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 0.8em;
  height: 0.8em;

  background: currentColor;
  mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M8 0L10.4 5.6L16 6.4L12 10.8L13.2 16L8 13.6L2.8 16L4 10.8L0 6.4L5.6 5.6L8 0Z'/%3e%3c/svg%3e") no-repeat center;
  mask-size: contain;
  -webkit-mask: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath d='M8 0L10.4 5.6L16 6.4L12 10.8L13.2 16L8 13.6L2.8 16L4 10.8L0 6.4L5.6 5.6L8 0Z'/%3e%3c/svg%3e") no-repeat center;
  -webkit-mask-size: contain;
}

.sf-symbol--star .sf-symbol__shape::after {
  content: none;
}
```

### 4단계: CustomMenu.tsx에서 사용

```typescript
const MenuIcons = {
  Star: () => (
    <SFSymbol
      name="star"
      size={SFSymbolSize.CALLOUT}
      weight={SFSymbolWeight.MEDIUM}
    />
  )
};
```

### 5단계: 검증

Playwright 테스트를 실행하여 일관성을 검증합니다:

```bash
cd frontend/aims-uix3
npx playwright test tests/menu-icon-spacing.spec.ts
```

**검증 항목**:
- [ ] 모든 아이콘 크기가 16px 컨테이너 내에서 동일
- [ ] 아이콘-텍스트 간격이 4px로 일관됨
- [ ] content: '' 사용 (emoji 아님)
- [ ] background: currentColor 사용
- [ ] mask: url() 사용

## 🎯 크기 가이드라인

아이콘의 `width`와 `height`는 em 단위를 사용하며, 아이콘의 시각적 균형을 위해 다를 수 있습니다:

| 아이콘 타입 | width | height | 비고 |
|-----------|-------|--------|------|
| 정사각형 (검색, 별) | 0.8-0.9em | 0.8-0.9em | 시각적으로 균형잡힌 크기 |
| 세로형 (문서) | 0.7em | 0.9em | 세로로 긴 형태 |
| 가로형 (폴더) | 0.8em | 0.7em | 가로로 넓은 형태 |

**중요**: 최종 렌더링 크기는 16px 컨테이너 내에서 모두 일관되어야 합니다.

## 🔍 일관성 검증

### 자동화된 테스트

`tests/menu-icon-spacing.spec.ts`는 다음을 검증합니다:
- 모든 아이콘의 bounding box 크기
- 아이콘과 텍스트 사이 간격
- 시각적 정렬 상태

```bash
# 테스트 실행
npx playwright test tests/menu-icon-spacing.spec.ts

# 브라우저 모드로 시각적 확인
npx playwright test tests/menu-icon-spacing.spec.ts --headed
```

### 수동 검증 체크리스트

새 아이콘 추가 시 반드시 확인:
- [ ] SFSymbol.css에 표준 패턴으로 정의됨
- [ ] content: '' (빈 문자열) 사용
- [ ] background: currentColor 사용
- [ ] mask와 -webkit-mask 모두 정의
- [ ] ::after에 content: none 설정
- [ ] CustomMenu.tsx에서 SFSymbol 컴포넌트로 사용
- [ ] size={SFSymbolSize.CALLOUT} 사용
- [ ] weight={SFSymbolWeight.MEDIUM} 사용
- [ ] Playwright 테스트 통과
- [ ] Light/Dark 테마 모두에서 정상 렌더링

## 📚 관련 파일

- **아이콘 정의**: `frontend/aims-uix3/src/components/SFSymbol/SFSymbol.css`
- **아이콘 사용**: `frontend/aims-uix3/src/components/CustomMenu/CustomMenu.tsx`
- **스타일**: `frontend/aims-uix3/src/components/CustomMenu/CustomMenu.css`
- **검증 테스트**: `frontend/aims-uix3/tests/menu-icon-spacing.spec.ts`

## 💡 핵심 철학

> **"일관성을 위해서라면 모든 것을 다시 작성할 용의가 있다."**

- 예외는 기술부채입니다
- 특수 케이스는 유지보수 복잡도를 기하급수적으로 증가시킵니다
- 모든 아이콘이 동일한 패턴을 따를 때 코드는 예측 가능하고 안정적입니다

**잘못된 접근**: "이 아이콘만 특별히 처리하면 되겠지"
**올바른 접근**: "모든 아이콘이 동일한 방식으로 작동하도록 하자"

---

**작성일**: 2025-01-17
**최종 수정**: 2025-01-17
**버전**: 1.0.0

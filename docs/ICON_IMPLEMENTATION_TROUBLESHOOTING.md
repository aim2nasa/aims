# 아이콘 구현 트러블슈팅 가이드

**작성일**: 2025-11-05 | **관련 커밋**: a63fa97

---

## 🚀 빠른 시작 체크리스트

```
시작 전:
□ AllCustomersView에서 동일 항목 아이콘 확인
□ SVG 코드 그대로 복사 (SFSymbol보다 안정적)

구현:
□ 아이콘은 헤더에만, 데이터 행에는 X
□ 크기 13px (16px 이하 필수)
□ CSS 변수로 색상 지정 (하드코딩 금지)
□ iOS System Colors 사용

테스트:
□ Ctrl+Shift+R (하드 리프레시)
□ 라이트/다크 모드 확인

커밋 전:
□ npm test && npm run build
□ git diff로 불필요한 변경 없는지 확인
```

---

## 1. 아이콘이 표시되지 않는 문제

### 문제 구분

**A. 아이콘 이름 불일치** (구현 오류)
```bash
# 확인 방법
grep -n "person-3-fill" frontend/aims-uix3/src/components/SFSymbol/SFSymbol.css
# 없으면 → 이름 오류
```

**B. CSS 캐싱 문제** (브라우저 문제)
- **해결**: Ctrl+Shift+R 또는 `rm -rf node_modules/.vite && npm run dev`
- **참고**: [CSS_ICON_CACHING_ISSUE.md](./CSS_ICON_CACHING_ISSUE.md)

---

## 2. 자주 하는 실수

### ❌ 잘못된 구현

```tsx
// 1. 데이터 행에 아이콘 (X)
<div className="cell-name">
  <svg>{/* 불필요 */}</svg>
  홍길동
</div>

// 2. 크기 초과 (X)
<svg width="20" height="20">  // 16px 초과!

// 3. 색상 하드코딩 (X)
.icon { color: #3b82f6; }
```

### ✅ 올바른 구현

```tsx
// 1. 헤더에만 아이콘
<div className="table-header">
  <div className="header-name">
    <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
      {/* AllCustomersView에서 복사한 SVG */}
    </svg>
    <span>이름</span>
  </div>
</div>

// 2. CSS 변수 사용
.header-name .header-icon-svg {
  color: var(--color-icon-blue);
}
```

---

## 3. 트러블슈팅 플로우

```
아이콘이 안 보여요
  ↓
F12 → Elements 탭에서 DOM 확인
  ↓
있나요?
  ├─ YES → CSS 문제
  │   ├─ color/display 속성 확인
  │   └─ Ctrl+Shift+R
  │
  └─ NO → 코드 문제
      ├─ 조건부 렌더링 확인
      └─ 아이콘 이름 확인
```

---

## 4. 필수 규칙

### 크기
- **최대 16px** (LeftPane CustomMenu 기준)
- 권장: 13px

### 색상
- iOS System Colors 사용
- `var(--color-icon-blue)`, `var(--color-icon-green)` 등
- 하드코딩 절대 금지

### 위치
- 테이블 헤더에만
- 데이터 행에는 X

### 참조
- AllCustomersView와 동일 항목은 같은 아이콘
- SVG 코드 그대로 복사

---

## 5. 신규 아이콘 추가 절차

```bash
# 1. AllCustomersView에서 SVG 복사
# 2. 헤더에만 추가
# 3. CSS 변수로 색상 지정
# 4. Ctrl+Shift+R로 확인
# 5. 테스트
npm test && npm run build
# 6. 커밋 (사용자 승인 후)
```

---

## 6. 절대 금지

```
❌ SFSymbol.css에 없는 이름
❌ 데이터 행에 아이콘
❌ 16px 초과 크기
❌ 색상값 하드코딩 (#ffffff, rgba())
❌ filter: grayscale()
❌ 캐싱 문제를 코드 문제로 착각
```

---

## 7. 실제 사례 교훈

**CustomerSelectorModal 작업 (커밋 a63fa97)**

1. ❌ SFSymbol 이모지 → 이름 불일치
2. ❌ 이름 수정 → 캐싱 문제
3. ❌ 데이터 행에 표시 → 헤더로 이동
4. ❌ 흑백 표시 → 컬러로 변경
5. ❌ 스타일 불일치 → AllCustomersView 참조
6. ✅ **SVG + 헤더 + CSS 변수** → 성공

**교훈**: 처음부터 AllCustomersView 참조하고 SVG 사용하면 시행착오 없음!

---

## 관련 문서

- **[CSS_ICON_CACHING_ISSUE.md](./CSS_ICON_CACHING_ISSUE.md)**: CSS 캐싱 문제
- **[CLAUDE.md](../CLAUDE.md)**: 전체 개발 규칙
- **[CSS_SYSTEM.md](../frontend/aims-uix3/CSS_SYSTEM.md)**: CSS 변수 시스템

# 계정 설정 편집 버튼 아이콘 및 툴팁 문제 해결

**작성일**: 2025-11-07
**관련 커밋**: TBD
**문제 발생 위치**: `AccountSettingsModal.tsx`

---

## 🔴 문제 상황

사용자가 계정 설정 모달의 편집 버튼에서 다음 두 가지 문제를 발견:

1. **편집 버튼 아이콘이 표시되지 않음**
2. **툴팁이 AIMS 스타일이 아님** (브라우저 기본 `title` 속성)

---

## 🔍 근본 원인 분석

### 문제 1: 아이콘 미표시

**원인**: SFSymbol 컴포넌트를 사용했으나, 해당 아이콘이 정의되지 않음

```tsx
// ❌ 잘못된 코드
<SFSymbol
  name="pencil.circle.fill"  // ← SFSymbol.css에 존재하지 않는 아이콘
  size={SFSymbolSize.BODY}
  weight={SFSymbolWeight.REGULAR}
/>
```

**확인 방법**:
```bash
grep -n "pencil" frontend/aims-uix3/src/components/SFSymbol/SFSymbol.css
# 결과: 아무것도 없음
```

**교훈**: SFSymbol을 사용하기 전에 반드시 `SFSymbol.css`에 정의되어 있는지 확인해야 함!

---

### 문제 2: 툴팁 스타일 문제

**원인**: Tooltip import 방식 오류

```tsx
// ❌ 잘못된 import (default export로 착각)
import Tooltip from '@/shared/ui/Tooltip'

// ✅ 올바른 import (named export)
import { Tooltip } from '@/shared/ui/Tooltip'
```

**Tooltip.tsx 코드 확인**:
```tsx
// Tooltip.tsx에서 named export 사용
export const Tooltip: React.FC<TooltipProps> = ({ ... }) => { ... }
```

---

## ✅ 해결 방법

### 1단계: SFSymbol 대신 SVG 직접 사용

**AIMS 프로젝트 원칙 (ICON_IMPLEMENTATION_TROUBLESHOOTING.md 참조)**:
- SFSymbol보다 **SVG 직접 사용**이 더 안정적
- **AllCustomersView 또는 DocumentLibraryView에서 동일 아이콘 복사**

**DocumentLibraryView에서 편집 아이콘 SVG 복사**:

```tsx
// DocumentLibraryView.tsx:161-163
<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1 1-3.667 9-9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"/>
</svg>
```

---

### 2단계: Tooltip import 수정

```tsx
// Before
import Tooltip from '@/shared/ui/Tooltip'

// After
import { Tooltip } from '@/shared/ui/Tooltip'
```

---

### 3단계: 최종 코드

```tsx
// AccountSettingsModal.tsx
import { Tooltip } from '@/shared/ui/Tooltip'

// ...

{!isEditing && (
  <Tooltip content="편집">
    <button
      className="account-settings__edit-button"
      onClick={handleStartEdit}
      aria-label="편집"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1 1-3.667 9-9z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"/>
      </svg>
    </button>
  </Tooltip>
)}
```

---

## 📋 해결 결과

### Before (문제 상태)
- ❌ 아이콘 미표시
- ❌ 브라우저 기본 툴팁 (title 속성)
- ❌ AIMS 디자인 시스템 미준수

### After (해결 완료)
- ✅ **DocumentLibraryView와 동일한 펜 아이콘** 표시
- ✅ **AIMS iOS 스타일 툴팁** 적용 (다크모드 지원)
- ✅ **14x14px** 크기 (16px 이하 규칙 준수)
- ✅ **CSS 변수 색상** (`currentColor` → `var(--color-accent-blue)`)
- ✅ **AIMS 전체에서 통일된 디자인**

---

## 🎯 핵심 교훈

### 1. 아이콘 구현 시 필수 체크리스트

```
□ SFSymbol 사용 전 SFSymbol.css 확인
□ 없으면 SVG 직접 사용 (더 안정적)
□ AllCustomersView/DocumentLibraryView에서 동일 항목 복사
□ 크기 16px 이하
□ CSS 변수로 색상 지정
```

### 2. Tooltip 사용 시 주의사항

```tsx
// ✅ 올바른 사용법
import { Tooltip } from '@/shared/ui/Tooltip'

<Tooltip content="텍스트">
  <button>...</button>
</Tooltip>
```

**금지사항**:
- ❌ 브라우저 `title` 속성 사용
- ❌ 커스텀 툴팁 직접 구현
- ❌ Default import로 Tooltip 가져오기

### 3. 반복되는 문제 방지

**이 문제는 이전에도 여러 번 발생**했습니다:
- CustomerSelectorModal (커밋 a63fa97)
- 기타 모달 구현 시

**해결책**:
- **ICON_IMPLEMENTATION_TROUBLESHOOTING.md 필독**
- **AllCustomersView/DocumentLibraryView 참조**
- **SVG 직접 사용**

---

## 🔗 관련 문서

- [ICON_IMPLEMENTATION_TROUBLESHOOTING.md](./ICON_IMPLEMENTATION_TROUBLESHOOTING.md)
- [CSS_ICON_CACHING_ISSUE.md](./CSS_ICON_CACHING_ISSUE.md)
- [CLAUDE.md](../CLAUDE.md) - 아이콘 크기 규칙 (16px 이하)
- [AIMS_TOOLTIP_STANDARD.md](../CLAUDE.md) - 툴팁 표준 (섹션 찾기)

---

## 📝 수정된 파일

```
D:/aims/frontend/aims-uix3/src/features/AccountSettings/
├── AccountSettingsModal.tsx  - SVG 아이콘 + Tooltip import 수정
└── AccountSettingsModal.css  - 편집 버튼 스타일 (투명 배경, 호버 효과)
```

---

## ✅ 검증 완료

- ✅ 브라우저에서 시각적 확인 완료
- ✅ 아이콘 표시 정상
- ✅ 툴팁 AIMS 스타일 적용
- ✅ 호버 효과 정상 작동
- ✅ 편집 모드 전환 정상

---

## 🚀 향후 방지책

### 개발 시 자동 검증

```bash
# 1. SFSymbol 사용 전 확인
grep -n "아이콘이름" frontend/aims-uix3/src/components/SFSymbol/SFSymbol.css

# 2. Tooltip import 검증
grep -n "import.*Tooltip" src/features/**/*.tsx

# 3. 아이콘 크기 검증 (16px 초과 방지)
grep -rn 'width="[2-9][0-9]"' src/features/
grep -rn 'SFSymbolSize.TITLE' src/features/
```

### Code Review 체크리스트

- [ ] SFSymbol 사용 시 정의 여부 확인
- [ ] Tooltip named export로 import
- [ ] 아이콘 크기 16px 이하
- [ ] AllCustomersView/DocumentLibraryView와 일관성

---

**최종 업데이트**: 2025-11-07
**해결 시간**: 약 20분
**근본 원인**: SFSymbol 미정의 + Tooltip import 오류

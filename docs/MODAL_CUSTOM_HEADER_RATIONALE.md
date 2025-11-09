# 모달 커스텀 헤더 사용 이유

**작성일**: 2025-01-09
**버전**: 1.0.0
**관련 커밋**: 5526140 (feat: 모든 모달 X 버튼 통일 및 서브틀한 스타일 적용)

## 📋 개요

AIMS 프로젝트의 19개 Portal 모달 중 3개는 `showHeader={false}`로 설정하고 커스텀 헤더를 직접 구현합니다. 이 문서는 왜 이 3개 모달이 베이스 컴포넌트(Modal/DraggableModal)의 기본 헤더를 상속받지 않고 커스텀 헤더를 사용하는지, 그리고 왜 이것이 최선의 선택인지 설명합니다.

## 🎯 모달 분류

### 자동 상속 모달 (16개)
- Modal 또는 DraggableModal 베이스 컴포넌트 사용
- `showHeader={true}` (기본값)
- X 버튼 자동 포함

**예시:**
```tsx
<Modal
  visible={isOpen}
  onClose={handleClose}
  title="문서 메모"
  size="md"
>
  {/* 내용 */}
</Modal>
```

### 커스텀 헤더 모달 (3개)
- `showHeader={false}` 설정
- 자체 헤더 구현
- X 버튼 직접 구현

**모달 목록:**
1. CustomerEditModal (고객 정보 수정)
2. AddressSearchModal (주소 검색)
3. AddressArchiveModal (주소 보관소)

---

## 🔍 각 모달의 커스텀 헤더 사용 이유

### 1. CustomerEditModal - 구조적 불가능

**이유**: 헤더와 컨텐츠 사이에 탭 네비게이션이 필요

**구조:**
```
┌─────────────────────────┐
│ 헤더: "고객 정보 수정"   │
├─────────────────────────┤
│ ┌─┐ ┌─┐ ┌─┐ ┌─┐        │ ← 탭 네비게이션 (헤더와 컨텐츠 사이!)
│ │ │ │ │ │ │ │ │        │
│ └─┘ └─┘ └─┘ └─┘        │
├─────────────────────────┤
│                         │
│   컨텐츠 (현재 탭)      │
│                         │
└─────────────────────────┘
```

**Modal 기본 구조 vs 필요한 구조:**
```tsx
// Modal 기본 구조 (불가능)
Header → Content → Footer

// CustomerEditModal 필요 구조 (4단계)
Header → Tabs → Content → Footer
```

**코드:**
```tsx
<Modal
  showHeader={false}  // 기본 헤더 사용 불가
  backdropClosable={true}
>
  {/* 커스텀 헤더 */}
  <div className="customer-edit-modal-header">
    <h2>고객 정보 수정</h2>
    <button onClick={onClose}>X</button>
  </div>

  {/* 탭 네비게이션 - 이것 때문에 커스텀 헤더 필요! */}
  <div className="customer-edit-modal-tabs">
    <button>기본 정보</button>
    <button>연락처 정보</button>
    <button>주소 정보</button>
    <button>보험 정보</button>
  </div>

  {/* 현재 탭 컨텐츠 */}
  {renderTabContent()}
</Modal>
```

**결론**: Modal에 `headerSlot`이나 `afterHeader` prop을 추가하지 않는 한 불가능.

---

### 2. AddressSearchModal - 커스텀 레이아웃

**이유**: 제목 안에 아이콘을 인라인으로 배치하는 특수한 UI

**구조:**
```tsx
// 필요한 구조
<h2>
  <svg>📍</svg>  {/* 아이콘이 제목 안에 인라인 */}
  주소 검색
</h2>

// Modal 기본 구조 (불가능)
<h2>{title}</h2>  {/* title은 string 또는 ReactNode */
```

**코드:**
```tsx
<Modal showHeader={false}>
  {/* 커스텀 헤더 */}
  <div className="address-search-modal__header">
    <h2>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
      주소 검색
    </h2>
    <button onClick={onClose}>X</button>
  </div>
</Modal>
```

**CSS 차이:**
```css
/* 커스텀 스타일 */
.address-search-modal__header {
  display: flex;
  align-items: center;
  justify-content: center;  /* 중앙 정렬 */
  padding: 12px 16px;       /* 컴팩트 패딩 */
  border-bottom: 0.5px solid var(--color-border);
}

.address-search-modal__header h2 {
  font-size: var(--font-size-footnote); /* 13px - 작은 크기 */
  display: flex;
  align-items: center;
  gap: 6px;
}

/* vs Modal 기본 스타일 */
.modal__header {
  padding: 16px 20px;  /* 더 큰 패딩 */
  justify-content: space-between;  /* 양끝 정렬 */
}

.modal__title {
  font-size: var(--font-size-lg);  /* 더 큰 폰트 */
}
```

**결론**: 디자인 요구사항이 Modal 기본 스타일과 근본적으로 다름.

---

### 3. AddressArchiveModal - 동적 콘텐츠 + 커스텀 스타일

**이유**: 이모지 + 동적 변수 조합 + 특수 스타일링

**현재 구조:**
```tsx
<Modal showHeader={false}>
  <div className="address-archive-modal__header">
    <h2>
      🏠 {customerName}님의 주소 보관소
    </h2>
    <button onClick={onClose}>X</button>
  </div>
</Modal>
```

**대안 가능 여부:**
```tsx
// ✅ 이론적으로는 가능
<Modal title={`🏠 ${customerName}님의 주소 보관소`}>
  {/* 내용 */}
</Modal>

// ❌ 하지만 CSS 스타일 차이 때문에 문제
```

**CSS 차이:**
```css
/* 커스텀 스타일 - 특수 레이아웃 */
.address-archive-modal__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.address-archive-modal__title {
  font-size: var(--font-size-body);  /* 14px */
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;  /* 이모지와 텍스트 간격 */
}
```

**결론**: title prop으로 가능하지만 CSS 오버라이드 필요. 현재 구현이 더 명확함.

---

## 🤔 왜 상속으로 통일하면 안 되는가?

### 시도 가능한 대안들

#### 1. Modal에 headerContent prop 추가
```tsx
interface ModalProps {
  headerContent?: ReactNode  // ← 이것 추가
  title?: React.ReactNode
  // ...
}
```

**문제점:**
- API 복잡도 증가 (title vs headerContent 혼란)
- 조건부 렌더링 로직 복잡해짐
- 기존 16개 모달에 영향 없지만 일관성 깨짐

#### 2. Modal에 renderHeader prop 추가
```tsx
interface ModalProps {
  renderHeader?: (props: HeaderProps) => ReactNode
  // ...
}
```

**문제점:**
- React 패턴 중 가장 복잡한 형태
- TypeScript 타입 정의 복잡도 증가
- 테스트 어려움

#### 3. AddressArchiveModal만 변경
```tsx
<Modal title={`🏠 ${customerName}님의 주소 보관소`}>
```

**문제점:**
- 1개만 변경 → 일관성 없음
- 나머지 2개는 여전히 커스텀 헤더
- CSS 오버라이드 필요

---

## ✅ 현재 구현이 최선인 이유

### 1. 명확성 (Clarity)
```tsx
// 현재: 명확함
<Modal showHeader={false}>
  <div className="custom-header">...</div>
</Modal>

// 대안: 헷갈림
<Modal
  title="제목"
  headerContent={<div>...</div>}  // ← 둘 다 있으면?
>
```

### 2. 유지보수성
- 각 모달의 특수 기능이 명확히 보임
- CSS 충돌 없음
- 수정 시 다른 모달에 영향 없음

### 3. 일관성
- 3개 모달 모두 같은 패턴 사용
- `showHeader={false}` → 커스텀 헤더
- 16개 모달은 `showHeader={true}` (기본값) → 자동 상속

### 4. X 버튼 통일
**이미 해결됨:**
- 3개 모달: TSX에서 SVG 직접 구현 + CSS로 스타일 통일
- 16개 모달: 베이스 컴포넌트에서 자동 상속
- **결과**: 19개 모달 전체가 동일한 X 버튼 (11px, opacity 0.25 → 0.8)

---

## 📊 비교표

| 모달 | showHeader | 이유 | 상속 가능 여부 |
|------|-----------|------|---------------|
| CustomerEditModal | false | 탭 네비게이션 필요 | ❌ 구조적 불가능 |
| AddressSearchModal | false | 인라인 아이콘 + 커스텀 스타일 | ❌ 레이아웃 차이 |
| AddressArchiveModal | false | 동적 콘텐츠 + 커스텀 스타일 | ⚠️ 가능하지만 비권장 |
| 나머지 16개 | true | 표준 레이아웃 | ✅ 자동 상속 |

---

## 🎯 결론

**현재 구현 (3개 커스텀 + 16개 자동 상속)이 가장 합리적입니다.**

**이유:**
1. ✅ **기능 보존** - 각 모달의 특수 레이아웃/기능 유지
2. ✅ **단순성** - Modal API 복잡도 증가 없음
3. ✅ **명확성** - showHeader={false} 패턴 명확
4. ✅ **유지보수성** - 수정 시 다른 모달에 영향 없음
5. ✅ **일관성** - X 버튼은 이미 19개 모달 전체 통일됨

**핵심 원칙:**
> "복잡한 통일보다 명확한 예외가 낫다."

---

## 📝 관련 문서

- [모달 리팩토링 요약](./MODAL_REFACTORING_SUMMARY_20251106.md)
- [CLAUDE.md - 모달 시스템](../CLAUDE.md#-aims-모달-계층-구조)
- 커밋: `5526140` - feat: 모든 모달 X 버튼 통일 및 서브틀한 스타일 적용

---

## 🔄 향후 개선 방향

현재 구조를 유지하되, 필요 시 고려사항:

1. **CSS 공통 변수 추출**
   - 헤더 패딩, 폰트 크기 등을 CSS 변수로 통일
   - 각 모달은 필요 시 오버라이드

2. **X 버튼 컴포넌트화 (선택사항)**
   ```tsx
   // shared/ui/CloseButton.tsx
   export const CloseButton = ({ onClick }) => (
     <button className="close-button" onClick={onClick}>
       <svg width="11" height="11">...</svg>
     </button>
   )
   ```
   - 장점: 코드 중복 제거
   - 단점: 임포트 추가, 컴포넌트 계층 증가

3. **문서화 유지**
   - 새 모달 추가 시 이 문서 참조
   - 커스텀 헤더가 정말 필요한지 검토

# AIMS UIX-3 Component Development Guide

> **Version**: 1.0.0 | **Last Updated**: 2025-09-15

## 📋 Overview

AIMS UIX-3 컴포넌트 개발 표준과 패턴 가이드.
**Document-Controller-View** 아키텍처 기반.

## 🎯 Core Principles

### 1. 관심사 분리
- **Controller**: 비즈니스 로직 (`useCustomersController`)
- **View**: 순수 렌더링 (`<CustomerPageView />`)

### 2. Props 인터페이스
- 명확한 타입 정의 (`Customer`, `onEdit?: () => void`)
- `any` 타입 금지
- 인라인 스타일 props 금지

### 3. 합성 우선
- `children`, `header`, `footer` props로 유연한 조합
- 상속보다 조합

## 🏗️ Architecture Patterns

### Pattern 1: Document-Controller-View

**Document**: Entity 타입 + Service (API 로직)
**Controller**: Custom Hook (비즈니스 로직, state 관리)
**View**: Pure Component (렌더링만)

```typescript
// Controller
const useCustomersController = () => {
  return { customers, isLoading, loadCustomers, ... };
};

// View
const CustomersPage = () => {
  const controller = useCustomersController();
  return <div>{/* UI */}</div>;
};
```

### Pattern 2: Compound Component

```typescript
<CustomerCard>
  <CustomerCard.Header />
  <CustomerCard.Content />
  <CustomerCard.Actions />
</CustomerCard>
```

### Pattern 3: Render Props

```typescript
<DataList
  data={items}
  renderItem={(item) => <ItemCard item={item} />}
  renderEmpty={() => <EmptyState />}
/>
```

## 🧩 Common Components

### 1. LoadingSkeleton
- Props: `lines`, `showAvatar`, `showActions`
- 표준 로딩 UI

### 2. EmptyState
- Props: `icon`, `title`, `message`, `action`
- 빈 상태 표시

### 3. ErrorBoundary
- 에러 발생 시 폴백 UI
- `componentDidCatch`로 에러 로깅

## 🎨 Styling

### 1. 클래스 조합
```typescript
const classes = ['card-interactive', 'hover-lift', className]
  .filter(Boolean).join(' ');
```

### 2. 조건부 스타일
```typescript
<span className={`status-badge status-${status}`}>
```

### 3. 반응형
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
```

**금지**: 정적 인라인 스타일
**허용**: 동적 계산 (`transform: translate(${x}px)`)

## ⚡ Performance

### 1. React.memo
- 불필요한 리렌더링 방지
- 커스텀 비교 함수 (선택)

### 2. useCallback, useMemo
- 콜백 메모이제이션
- 계산값 캐싱

### 3. Virtualization
- `react-window` 활용
- 대용량 리스트 최적화

## 🧪 Testing

### Component Test
- Jest + React Testing Library
- Props, 이벤트, 렌더링 검증

### Hook Test
- `@testing-library/react-hooks`
- 비즈니스 로직 검증

## ♿ Accessibility

### 키보드
- `tabIndex`, `onKeyPress`
- Enter/Space 키 지원

### ARIA
- `role`, `aria-label`, `aria-describedby`
- 스크린 리더 지원

## 📝 Documentation

### TSDoc
```typescript
/**
 * @param props - 컴포넌트 props
 * @returns 렌더링된 컴포넌트
 */
```

### Storybook
- 다양한 상태 스토리
- Interactive 문서화

## ✅ Quality Checklist

### 새 컴포넌트
- [ ] Document-Controller-View 패턴
- [ ] 타입 안전 Props
- [ ] 정적 인라인 스타일 금지
- [ ] CSS 변수 활용
- [ ] React.memo/useCallback 최적화
- [ ] 키보드/ARIA 지원
- [ ] 단위 테스트
- [ ] TSDoc + Storybook

### 리뷰
- [ ] TypeScript/ESLint 통과
- [ ] 재사용 가능 구조
- [ ] 명확한 네이밍
- [ ] 문서화 완료

---

**Version**: 1.0.0 | **Last Updated**: 2025-09-15
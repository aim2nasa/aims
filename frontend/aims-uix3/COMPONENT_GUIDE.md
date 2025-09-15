# AIMS UIX-3 Component Development Guide

> **Version**: 1.0.0
> **Last Updated**: 2025-09-15
> **Purpose**: 컴포넌트 개발 표준과 사용법 가이드

## 📋 Overview

이 문서는 AIMS UIX-3에서 새로운 컴포넌트를 개발하거나 기존 컴포넌트를 수정할 때 따라야 할 표준과 패턴을 정의합니다.
Document-Controller-View 아키텍처를 기반으로 한 일관된 개발 방법론을 제시합니다.

## 🎯 Component Development Principles

### 1. 관심사 분리 (Separation of Concerns)

```typescript
// ❌ 잘못된 방법 - 모든 로직이 한 곳에
const CustomerPage = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);

  // API 호출, 비즈니스 로직, UI 렌더링이 모두 섞여있음
  useEffect(() => {
    fetch('/api/customers').then(/*...*/)
  }, []);

  return <div>{/* UI */}</div>;
};

// ✅ 올바른 방법 - 완전한 관심사 분리
const CustomerPage = () => {
  const controller = useCustomersController();  // 비즈니스 로직
  return <CustomerPageView {...controller} />;   // 순수 UI
};
```

### 2. 예측 가능한 Props 인터페이스

```typescript
// ✅ 명확하고 타입 안전한 Props 정의
interface CustomerCardProps {
  customer: Customer;                    // 필수 데이터
  onEdit?: (customer: Customer) => void; // 선택적 액션
  onDelete?: (customer: Customer) => void;
  className?: string;                    // 스타일 확장
  size?: 'sm' | 'md' | 'lg';            // 명확한 옵션
}

// ❌ 피해야 할 Props 패턴
interface BadProps {
  data: any;                  // any 타입 사용 금지
  onClick: Function;          // 구체적이지 않은 함수 타입
  style: CSSProperties;       // 인라인 스타일 허용 금지
}
```

### 3. 합성 우선 (Composition over Inheritance)

```typescript
// ✅ 합성을 통한 유연한 컴포넌트
interface CardProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, header, footer, className }) => (
  <div className={`card-basic ${className || ''}`}>
    {header && <div className="card-header">{header}</div>}
    <div className="card-content">{children}</div>
    {footer && <div className="card-footer">{footer}</div>}
  </div>
);

// 사용 예시 - 유연한 조합
<Card
  header={<CustomerCardHeader customer={customer} />}
  footer={<CustomerCardActions onEdit={onEdit} onDelete={onDelete} />}
>
  <CustomerCardContent customer={customer} />
</Card>
```

## 🏗️ Component Architecture Patterns

### Pattern 1: Document-Controller-View

#### Document (Entity + Service)
```typescript
// src/entities/customer/types.ts
export interface Customer {
  _id: string;
  name: string;
  phone: string;
  email: string;
  // ... other fields
}

// src/services/customerService.ts
export class CustomerService {
  static async getCustomers(): Promise<Customer[]> {
    // API 비즈니스 로직
  }
}
```

#### Controller (Business Logic Hook)
```typescript
// src/controllers/useCustomersController.ts
export const useCustomersController = () => {
  const { state, actions } = useCustomerContext();

  const loadCustomers = useCallback(async () => {
    actions.setLoading(true);
    try {
      const customers = await CustomerService.getCustomers();
      actions.setCustomers(customers);
    } catch (error) {
      actions.setError('고객 목록을 불러오는데 실패했습니다.');
    } finally {
      actions.setLoading(false);
    }
  }, [actions]);

  return {
    // State
    customers: state.customers,
    isLoading: state.isLoading,
    error: state.error,

    // Actions
    loadCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
};
```

#### View (Pure Component)
```typescript
// src/pages/customers/index.tsx
const CustomersPage: React.FC = () => {
  const {
    customers,
    isLoading,
    error,
    loadCustomers,
    createCustomer,
  } = useCustomersController();

  // 순수한 렌더링 로직만
  return (
    <div className="customers-page">
      {error && <ErrorMessage message={error} />}
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <CustomerList
          customers={customers}
          onEdit={editCustomer}
          onDelete={deleteCustomer}
        />
      )}
    </div>
  );
};
```

### Pattern 2: Compound Component Pattern

```typescript
// ✅ 복합 컴포넌트 패턴으로 유연성 제공
const CustomerCard = ({ customer, children }) => (
  <div className="customer-card">{children}</div>
);

CustomerCard.Header = ({ customer }) => (
  <div className="customer-card__header">
    <h3>{customer.name}</h3>
    <span className="status">{customer.isActive ? '활성' : '비활성'}</span>
  </div>
);

CustomerCard.Content = ({ customer }) => (
  <div className="customer-card__content">
    <p>{customer.phone}</p>
    <p>{customer.email}</p>
  </div>
);

CustomerCard.Actions = ({ onEdit, onDelete }) => (
  <div className="customer-card__actions">
    <Button onClick={onEdit}>수정</Button>
    <Button onClick={onDelete} variant="danger">삭제</Button>
  </div>
);

// 사용법
<CustomerCard customer={customer}>
  <CustomerCard.Header customer={customer} />
  <CustomerCard.Content customer={customer} />
  <CustomerCard.Actions onEdit={handleEdit} onDelete={handleDelete} />
</CustomerCard>
```

### Pattern 3: Render Props Pattern

```typescript
// ✅ 렌더 프롭 패턴으로 로직 재사용
interface DataListProps<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  renderItem: (item: T) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  renderError?: (error: string) => React.ReactNode;
}

const DataList = <T,>({
  data,
  loading,
  error,
  renderItem,
  renderEmpty,
  renderError
}: DataListProps<T>) => {
  if (loading) return <LoadingSkeleton />;
  if (error) return renderError ? renderError(error) : <div>Error: {error}</div>;
  if (data.length === 0) return renderEmpty ? renderEmpty() : <div>데이터가 없습니다.</div>;

  return (
    <div className="data-list">
      {data.map((item, index) => (
        <div key={index} className="data-list__item">
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
};

// 사용법
<DataList
  data={customers}
  loading={isLoading}
  error={error}
  renderItem={(customer) => <CustomerCard customer={customer} />}
  renderEmpty={() => <EmptyState message="등록된 고객이 없습니다." />}
  renderError={(error) => <ErrorAlert message={error} />}
/>
```

## 🧩 Common Component Patterns

### 1. Loading States

```typescript
// ✅ 표준화된 로딩 상태 컴포넌트
interface LoadingSkeletonProps {
  lines?: number;
  showAvatar?: boolean;
  showActions?: boolean;
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  lines = 3,
  showAvatar = false,
  showActions = false,
  className = ''
}) => (
  <div className={`loading-skeleton ${className}`}>
    {showAvatar && <div className="skeleton-avatar" />}
    <div className="skeleton-content">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" />
      ))}
    </div>
    {showActions && (
      <div className="skeleton-actions">
        <div className="skeleton-button" />
        <div className="skeleton-button" />
      </div>
    )}
  </div>
);
```

### 2. Empty States

```typescript
// ✅ 일관된 빈 상태 표시
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action
}) => (
  <div className="empty-state">
    {icon && <div className="empty-state__icon">{icon}</div>}
    <h3 className="empty-state__title">{title}</h3>
    {message && <p className="empty-state__message">{message}</p>}
    {action && (
      <Button variant="primary" onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
);
```

### 3. Error Boundaries

```typescript
// ✅ 에러 경계 컴포넌트
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component Error:', error, errorInfo);
    // 에러 로깅 서비스로 전송
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>문제가 발생했습니다</h2>
          <details>
            <summary>오류 상세 정보</summary>
            <pre>{this.state.error?.stack}</pre>
          </details>
          <Button onClick={() => window.location.reload()}>
            페이지 새로고침
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## 🎨 Styling Guidelines

### 1. CSS Classes 사용법

```typescript
// ✅ 올바른 클래스 조합
const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  className,
  size = 'md'
}) => {
  const cardClasses = [
    'card-interactive',        // 기본 카드 스타일
    'hover-lift',             // 호버 효과
    `card-${size}`,           // 크기 변형
    className                  // 추가 클래스
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses}>
      {/* 카드 내용 */}
    </div>
  );
};

// ❌ 피해야 할 패턴
const BadCard = ({ customer }) => (
  <div style={{ backgroundColor: '#ffffff', padding: '16px' }}>
    {/* 인라인 스타일 사용 금지 */}
  </div>
);
```

### 2. 조건부 스타일링

```typescript
// ✅ 조건부 클래스 적용
const StatusBadge: React.FC<{ status: 'active' | 'inactive' | 'error' }> = ({
  status
}) => (
  <span className={`status-badge status-${status}`}>
    {status === 'active' && '활성'}
    {status === 'inactive' && '비활성'}
    {status === 'error' && '오류'}
  </span>
);

// CSS에서 각 상태별 스타일 정의
.status-badge { /* 공통 스타일 */ }
.status-active { background-color: var(--color-success); }
.status-inactive { background-color: var(--color-text-tertiary); }
.status-error { background-color: var(--color-danger); }
```

### 3. 반응형 컴포넌트

```typescript
// ✅ 반응형 클래스 조합
const ResponsiveGrid: React.FC<{ children: React.ReactNode }> = ({
  children
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
    {children}
  </div>
);

// Mobile-first 접근법으로 CSS 정의
.grid { display: grid; }
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }

@media (min-width: 768px) {
  .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
```

## ⚡ Performance Optimization

### 1. React.memo 사용

```typescript
// ✅ 적절한 메모이제이션
interface CustomerCardProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}

export const CustomerCard = React.memo<CustomerCardProps>(({
  customer,
  onEdit,
  onDelete
}) => {
  return (
    <div className="card-interactive">
      <h3>{customer.name}</h3>
      <p>{customer.phone}</p>
      <div className="card-actions">
        <Button onClick={() => onEdit(customer)}>수정</Button>
        <Button onClick={() => onDelete(customer)} variant="danger">삭제</Button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 커스텀 비교 함수 (선택사항)
  return prevProps.customer._id === nextProps.customer._id &&
         prevProps.customer.updatedAt === nextProps.customer.updatedAt;
});
```

### 2. useCallback과 useMemo

```typescript
// ✅ 콜백 함수 최적화
const CustomerList: React.FC<CustomerListProps> = ({ customers, onEdit, onDelete }) => {
  // 콜백 함수 메모이제이션
  const handleEdit = useCallback((customer: Customer) => {
    onEdit(customer);
  }, [onEdit]);

  const handleDelete = useCallback((customer: Customer) => {
    if (window.confirm(`${customer.name}을(를) 삭제하시겠습니까?`)) {
      onDelete(customer);
    }
  }, [onDelete]);

  // 계산된 값 메모이제이션
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  return (
    <div className="customer-list">
      {sortedCustomers.map(customer => (
        <CustomerCard
          key={customer._id}
          customer={customer}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
};
```

### 3. 가상화 (Virtualization)

```typescript
// ✅ 대용량 목록 최적화
import { FixedSizeList as List } from 'react-window';

interface VirtualizedListProps {
  items: Customer[];
  itemHeight: number;
  height: number;
  renderItem: ({ index, style }: { index: number; style: React.CSSProperties }) => React.ReactNode;
}

const VirtualizedCustomerList: React.FC<VirtualizedListProps> = ({
  items,
  itemHeight,
  height,
  renderItem
}) => (
  <List
    height={height}
    itemCount={items.length}
    itemSize={itemHeight}
    itemData={items}
  >
    {renderItem}
  </List>
);
```

## 🧪 Testing Strategies

### 1. Component Testing

```typescript
// ✅ 컴포넌트 테스트 예시
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomerCard } from '../CustomerCard';
import { mockCustomer } from '../../__mocks__/customer';

describe('CustomerCard', () => {
  const defaultProps = {
    customer: mockCustomer,
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('고객 정보를 올바르게 표시한다', () => {
    render(<CustomerCard {...defaultProps} />);

    expect(screen.getByText(mockCustomer.name)).toBeInTheDocument();
    expect(screen.getByText(mockCustomer.phone)).toBeInTheDocument();
    expect(screen.getByText(mockCustomer.email)).toBeInTheDocument();
  });

  it('수정 버튼 클릭시 onEdit 콜백을 호출한다', () => {
    render(<CustomerCard {...defaultProps} />);

    const editButton = screen.getByText('수정');
    fireEvent.click(editButton);

    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockCustomer);
    expect(defaultProps.onEdit).toHaveBeenCalledTimes(1);
  });

  it('활성/비활성 상태를 올바르게 표시한다', () => {
    const activeCustomer = { ...mockCustomer, isActive: true };
    render(<CustomerCard {...defaultProps} customer={activeCustomer} />);

    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('활성')).toHaveClass('status-active');
  });
});
```

### 2. Controller Hook Testing

```typescript
// ✅ 커스텀 훅 테스트
import { renderHook, act } from '@testing-library/react';
import { useCustomersController } from '../useCustomersController';
import { CustomerService } from '../../services/customerService';

jest.mock('../../services/customerService');
const mockedCustomerService = CustomerService as jest.Mocked<typeof CustomerService>;

describe('useCustomersController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('초기 로딩 상태를 올바르게 설정한다', () => {
    const { result } = renderHook(() => useCustomersController());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.customers).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('고객 목록을 성공적으로 로드한다', async () => {
    const mockCustomers = [mockCustomer];
    mockedCustomerService.getCustomers.mockResolvedValue(mockCustomers);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadCustomers();
    });

    expect(result.current.customers).toEqual(mockCustomers);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('API 오류를 올바르게 처리한다', async () => {
    mockedCustomerService.getCustomers.mockRejectedValue(new Error('API Error'));

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadCustomers();
    });

    expect(result.current.customers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('고객 목록을 불러오는데 실패했습니다.');
  });
});
```

## ♿ Accessibility Guidelines

### 1. 키보드 내비게이션

```typescript
// ✅ 키보드 접근성 지원
const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onEdit, onDelete }) => {
  const handleKeyPress = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  return (
    <div
      className="customer-card focus-ring"
      tabIndex={0}
      role="button"
      aria-label={`${customer.name} 고객 카드`}
      onKeyPress={(e) => handleKeyPress(e, () => onEdit(customer))}
    >
      <h3 id={`customer-${customer._id}-name`}>{customer.name}</h3>
      <p aria-describedby={`customer-${customer._id}-name`}>{customer.phone}</p>

      <div className="card-actions">
        <Button
          onClick={() => onEdit(customer)}
          aria-label={`${customer.name} 수정`}
        >
          수정
        </Button>
        <Button
          onClick={() => onDelete(customer)}
          variant="danger"
          aria-label={`${customer.name} 삭제`}
        >
          삭제
        </Button>
      </div>
    </div>
  );
};
```

### 2. ARIA 속성

```typescript
// ✅ 스크린 리더 지원
const SearchResults: React.FC<{ results: Customer[]; query: string }> = ({
  results,
  query
}) => (
  <div
    role="region"
    aria-label="검색 결과"
    aria-live="polite"
  >
    <div
      id="results-summary"
      aria-label={`${query}에 대한 검색 결과 ${results.length}개`}
    >
      총 {results.length}개의 고객을 찾았습니다.
    </div>

    <ul role="list" aria-describedby="results-summary">
      {results.map(customer => (
        <li key={customer._id} role="listitem">
          <CustomerCard customer={customer} />
        </li>
      ))}
    </ul>
  </div>
);
```

## 📝 Component Documentation

### 1. TSDoc 주석

```typescript
/**
 * 고객 정보를 표시하는 카드 컴포넌트
 *
 * @since 1.0.0
 * @example
 * ```tsx
 * <CustomerCard
 *   customer={customer}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   size="lg"
 * />
 * ```
 */
interface CustomerCardProps {
  /** 표시할 고객 정보 */
  customer: Customer;
  /** 고객 정보 수정 버튼 클릭 핸들러 */
  onEdit?: (customer: Customer) => void;
  /** 고객 삭제 버튼 클릭 핸들러 */
  onDelete?: (customer: Customer) => void;
  /** 카드 크기 (기본값: 'md') */
  size?: 'sm' | 'md' | 'lg';
  /** 추가 CSS 클래스명 */
  className?: string;
}

/**
 * CustomerCard 컴포넌트
 *
 * 고객의 기본 정보를 카드 형태로 표시하며,
 * 수정/삭제 액션을 제공합니다.
 *
 * @param props CustomerCard 컴포넌트 props
 * @returns 렌더링된 고객 카드 컴포넌트
 */
export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onEdit,
  onDelete,
  size = 'md',
  className
}) => {
  // 구현...
};
```

### 2. Storybook Stories

```typescript
// CustomerCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { CustomerCard } from './CustomerCard';
import { mockCustomer } from '../__mocks__/customer';

const meta = {
  title: 'Components/CustomerCard',
  component: CustomerCard,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '고객 정보를 표시하는 카드 컴포넌트입니다.'
      }
    }
  },
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg']
    }
  }
} satisfies Meta<typeof CustomerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    customer: mockCustomer,
    onEdit: (customer) => console.log('Edit:', customer),
    onDelete: (customer) => console.log('Delete:', customer),
  }
};

export const ActiveCustomer: Story = {
  args: {
    customer: { ...mockCustomer, isActive: true },
    onEdit: (customer) => console.log('Edit:', customer),
    onDelete: (customer) => console.log('Delete:', customer),
  }
};

export const InactiveCustomer: Story = {
  args: {
    customer: { ...mockCustomer, isActive: false },
    onEdit: (customer) => console.log('Edit:', customer),
    onDelete: (customer) => console.log('Delete:', customer),
  }
};

export const LargeSize: Story = {
  args: {
    customer: mockCustomer,
    size: 'lg',
    onEdit: (customer) => console.log('Edit:', customer),
    onDelete: (customer) => console.log('Delete:', customer),
  }
};
```

## 🔄 Component Lifecycle & Updates

### 1. 컴포넌트 버전 관리

```typescript
/**
 * CustomerCard Component
 *
 * @since 1.0.0 - 초기 버전
 * @since 1.1.0 - size prop 추가
 * @since 1.2.0 - 접근성 개선 (ARIA 속성 추가)
 * @deprecated 2.0.0에서 CustomerCardV2로 교체 예정
 */
export const CustomerCard: React.FC<CustomerCardProps> = ({ ... }) => {
  // 구현...
};

// 마이그레이션 가이드 제공
/**
 * @migration
 * v1.x → v2.x 마이그레이션 가이드:
 *
 * 변경사항:
 * - `size` prop이 `variant`로 변경됨
 * - `onEdit`, `onDelete` 콜백이 `actions` 객체로 통합됨
 *
 * Before:
 * <CustomerCard size="lg" onEdit={handleEdit} onDelete={handleDelete} />
 *
 * After:
 * <CustomerCardV2 variant="large" actions={{ onEdit: handleEdit, onDelete: handleDelete }} />
 */
```

### 2. Breaking Changes 처리

```typescript
// ✅ Graceful degradation 지원
interface CustomerCardProps {
  customer: Customer;
  /** @deprecated onEdit 대신 actions.onEdit 사용 */
  onEdit?: (customer: Customer) => void;
  /** @deprecated onDelete 대신 actions.onDelete 사용 */
  onDelete?: (customer: Customer) => void;
  /** 새로운 액션 객체 방식 */
  actions?: {
    onEdit?: (customer: Customer) => void;
    onDelete?: (customer: Customer) => void;
  };
}

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onEdit,
  onDelete,
  actions
}) => {
  // 이전 버전 호환성 유지
  const handleEdit = actions?.onEdit || onEdit;
  const handleDelete = actions?.onDelete || onDelete;

  // 개발 모드에서 deprecated 경고
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (onEdit) {
        console.warn('CustomerCard: onEdit prop is deprecated. Use actions.onEdit instead.');
      }
      if (onDelete) {
        console.warn('CustomerCard: onDelete prop is deprecated. Use actions.onDelete instead.');
      }
    }
  }, [onEdit, onDelete]);

  // 구현...
};
```

## ✅ Component Quality Checklist

### 새 컴포넌트 생성시 체크리스트

#### 🏗️ 아키텍처
- [ ] Document-Controller-View 패턴 준수
- [ ] 비즈니스 로직이 Controller Hook으로 분리됨
- [ ] View는 순수 렌더링 로직만 포함
- [ ] Props 인터페이스가 명확하고 타입 안전함

#### 🎨 스타일링
- [ ] 인라인 스타일 사용하지 않음
- [ ] CSS 변수를 활용한 테마 반응형 설계
- [ ] 공용 클래스 최대한 재사용
- [ ] 반응형 디자인 구현

#### ⚡ 성능
- [ ] 불필요한 리렌더링 방지 (React.memo, useCallback)
- [ ] 무거운 계산 메모이제이션 (useMemo)
- [ ] 적절한 키 값 사용 (리스트 렌더링)

#### ♿ 접근성
- [ ] 키보드 내비게이션 지원
- [ ] 적절한 ARIA 속성 설정
- [ ] 스크린 리더 호환성
- [ ] 색상 대비 기준 충족

#### 🧪 테스트
- [ ] 단위 테스트 작성 (주요 기능)
- [ ] 접근성 테스트 통과
- [ ] 다양한 props 조합 테스트
- [ ] 에러 케이스 처리 테스트

#### 📝 문서화
- [ ] TSDoc 주석 작성
- [ ] Storybook 스토리 작성
- [ ] 사용 예시 코드 제공
- [ ] 마이그레이션 가이드 (기존 컴포넌트 수정시)

### 컴포넌트 리뷰 체크리스트

#### 코드 품질
- [ ] TypeScript 오류 없음
- [ ] ESLint 경고 없음
- [ ] 일관된 코딩 스타일 적용
- [ ] 적절한 에러 처리

#### 재사용성
- [ ] 다른 컨텍스트에서 재사용 가능한 구조
- [ ] 합성을 통한 유연한 확장성
- [ ] 적절한 추상화 레벨

#### 유지보수성
- [ ] 읽기 쉬운 코드 구조
- [ ] 명확한 변수/함수 이름
- [ ] 적절한 주석과 문서화
- [ ] 향후 확장 가능한 구조

---

## 📞 References

- [React TypeScript Cheatsheet](https://github.com/typescript-cheatsheets/react)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Storybook Documentation](https://storybook.js.org/docs/react/get-started/introduction)
- [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/WAI/WCAG21/quickref/)

---

**마지막 업데이트**: 2025-09-15
**문서 버전**: 1.0.0
**가이드라인 준수율**: 100%
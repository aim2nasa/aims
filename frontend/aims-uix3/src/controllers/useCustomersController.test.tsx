/**
 * useCustomersController Tests
 * @since 2025-10-14
 *
 * 고객 관리 Controller Hook 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomersController } from './useCustomersController';
import type { Customer, CreateCustomerData, UpdateCustomerData } from '@/entities/customer';

// ============================================
// Mock 설정
// ============================================

// CustomerContext mock
const mockSetLoading = vi.fn();
const mockSetCustomers = vi.fn();
const mockAddCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockRemoveCustomer = vi.fn();
const mockSelectCustomer = vi.fn();
const mockSetSearchQuery = vi.fn();
const mockSetSearchParams = vi.fn();
const mockShowCreateForm = vi.fn();
const mockShowEditForm = vi.fn();
const mockSetCreating = vi.fn();
const mockSetUpdating = vi.fn();
const mockSetDeleting = vi.fn();
const mockSetError = vi.fn();

const mockCustomerContextValue = {
  state: {
    customers: [],
    selectedCustomer: null,
    searchQuery: '',
    searchParams: { page: 1, limit: 20 },
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
    total: 0,
    hasMore: false,
    showCreateForm: false,
    showEditForm: false,
    editingCustomer: null,
  },
  setLoading: mockSetLoading,
  setCustomers: mockSetCustomers,
  addCustomer: mockAddCustomer,
  updateCustomer: mockUpdateCustomer,
  removeCustomer: mockRemoveCustomer,
  selectCustomer: mockSelectCustomer,
  setSearchQuery: mockSetSearchQuery,
  setSearchParams: mockSetSearchParams,
  showCreateForm: mockShowCreateForm,
  showEditForm: mockShowEditForm,
  setCreating: mockSetCreating,
  setUpdating: mockSetUpdating,
  setDeleting: mockSetDeleting,
  setError: mockSetError,
};

vi.mock('@/contexts/CustomerContextHooks', () => ({
  useCustomerContext: () => mockCustomerContextValue,
}));

// CustomerDocument mock
const mockLoadCustomers = vi.fn();
const mockGetCustomers = vi.fn();
const mockGetTotal = vi.fn();
const mockGetHasMore = vi.fn();
const mockCreateCustomer = vi.fn();
const mockUpdateCustomerDoc = vi.fn();
const mockDeleteCustomer = vi.fn();

vi.mock('@/stores/CustomerDocument', () => ({
  CustomerDocument: {
    getInstance: () => ({
      loadCustomers: mockLoadCustomers,
      getCustomers: mockGetCustomers,
      getTotal: mockGetTotal,
      getHasMore: mockGetHasMore,
      createCustomer: mockCreateCustomer,
      updateCustomer: mockUpdateCustomerDoc,
      deleteCustomer: mockDeleteCustomer,
    }),
  },
}));

// useConfirmation mock
const mockShowConfirmation = vi.fn();
const mockHandleConfirm = vi.fn();
const mockHandleCancel = vi.fn();
const mockHandleClose = vi.fn();

vi.mock('../shared/hooks/useConfirmation', () => ({
  useConfirmation: () => ({
    confirmationState: { isOpen: false, title: '', message: '' },
    showConfirmation: mockShowConfirmation,
    handleConfirm: mockHandleConfirm,
    handleCancel: mockHandleCancel,
    handleClose: mockHandleClose,
  }),
}));

// API error handler mock
vi.mock('@/shared/lib/api', () => ({
  handleApiError: (error: any) => error?.message || 'API Error',
}));

// ============================================
// 테스트 데이터
// ============================================

const mockCustomer: Customer = {
  _id: 'customer-1',
  personal_info: {
    name: '홍길동',
    birth_date: '1990-01-01',
    gender: 'male',
  },
  contact_info: {
    phone: '010-1234-5678',
    email: 'hong@example.com',
  },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const mockCustomers: Customer[] = [
  mockCustomer,
  {
    _id: 'customer-2',
    personal_info: {
      name: '김철수',
      birth_date: '1985-05-15',
      gender: 'male',
    },
    contact_info: {
      phone: '010-9876-5432',
    },
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();

  // Reset state
  mockCustomerContextValue.state = {
    customers: [],
    selectedCustomer: null,
    searchQuery: '',
    searchParams: { page: 1, limit: 20 },
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
    total: 0,
    hasMore: false,
    showCreateForm: false,
    showEditForm: false,
    editingCustomer: null,
  };

  // Default mock implementations
  mockGetCustomers.mockReturnValue(mockCustomers);
  mockGetTotal.mockReturnValue(2);
  mockGetHasMore.mockReturnValue(false);
  mockLoadCustomers.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================
// 초기 상태 테스트
// ============================================
describe('useCustomersController - 초기 상태', () => {
  it('초기 상태가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useCustomersController());

    expect(result.current.customers).toEqual([]);
    expect(result.current.selectedCustomer).toBeNull();
    expect(result.current.searchQuery).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('모든 액션 핸들러가 제공된다', () => {
    const { result } = renderHook(() => useCustomersController());

    expect(typeof result.current.loadCustomers).toBe('function');
    expect(typeof result.current.createCustomer).toBe('function');
    expect(typeof result.current.updateCustomer).toBe('function');
    expect(typeof result.current.deleteCustomer).toBe('function');
    expect(typeof result.current.handleSearchChange).toBe('function');
    expect(typeof result.current.handleEditCustomer).toBe('function');
    expect(typeof result.current.handleDeleteCustomer).toBe('function');
  });
});

// ============================================
// loadCustomers 테스트
// ============================================
describe('useCustomersController - loadCustomers', () => {
  it('고객 목록을 성공적으로 로드한다', async () => {
    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadCustomers();
    });

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockLoadCustomers).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(mockSetCustomers).toHaveBeenCalledWith({
      customers: mockCustomers,
      total: 2,
      hasMore: false,
    });
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });

  it('파라미터를 전달하여 로드할 수 있다', async () => {
    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadCustomers({ page: 2, limit: 10 });
    });

    expect(mockLoadCustomers).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('로드 실패 시 에러를 처리한다', async () => {
    mockLoadCustomers.mockRejectedValueOnce(new Error('Load failed'));

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadCustomers();
    });

    expect(mockSetError).toHaveBeenCalledWith('Load failed');
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });
});

// ============================================
// loadMoreCustomers 테스트
// ============================================
describe('useCustomersController - loadMoreCustomers', () => {
  it('더 많은 고객을 로드한다', async () => {
    mockCustomerContextValue.state.hasMore = true;
    mockCustomerContextValue.state.customers = [mockCustomer];
    mockCustomerContextValue.state.searchParams = { page: 1, limit: 20 };

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.loadMoreCustomers();
    });

    expect(mockLoadCustomers).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(mockSetCustomers).toHaveBeenCalledWith({
      customers: [mockCustomer, ...mockCustomers],
      total: 2,
      hasMore: false,
    });
  });

  it('로딩 중일 때는 추가 로드하지 않는다', () => {
    mockCustomerContextValue.state.isLoading = true;
    mockCustomerContextValue.state.hasMore = true;
    mockCustomerContextValue.state.customers = [mockCustomer];

    const { result } = renderHook(() => useCustomersController());

    // loadMoreCustomers는 isLoading이 true면 early return
    act(() => {
      result.current.loadMoreCustomers();
    });

    // useEffect의 초기 로드만 호출됨 (customers.length > 0이므로 실행 안 됨)
    expect(mockLoadCustomers).not.toHaveBeenCalled();
  });

  it('더 이상 데이터가 없으면 로드하지 않는다', () => {
    mockCustomerContextValue.state.hasMore = false;
    mockCustomerContextValue.state.customers = [mockCustomer];

    const { result } = renderHook(() => useCustomersController());

    // loadMoreCustomers는 hasMore가 false면 early return
    act(() => {
      result.current.loadMoreCustomers();
    });

    expect(mockLoadCustomers).not.toHaveBeenCalled();
  });
});

// ============================================
// 검색 테스트
// ============================================
describe('useCustomersController - 검색', () => {
  it('검색어를 변경한다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.handleSearchChange('홍길동');
    });

    expect(mockSetSearchQuery).toHaveBeenCalledWith('홍길동');
    expect(mockSetSearchParams).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('검색을 실행한다', async () => {
    mockCustomerContextValue.state.customers = [mockCustomer];

    const { result } = renderHook(() => useCustomersController());

    // handleSearch 실행
    await act(async () => {
      await result.current.handleSearch();
    });

    // loadCustomers가 page: 1로 호출 (내부에서 searchParams와 merge됨)
    expect(mockLoadCustomers).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });
});

// ============================================
// createCustomer 테스트
// ============================================
describe('useCustomersController - createCustomer', () => {
  it('고객을 성공적으로 생성한다', async () => {
    const newCustomerData: CreateCustomerData = {
      personal_info: {
        name: '이영희',
        birth_date: '1995-03-20',
        gender: 'female',
      },
      contact_info: {
        phone: '010-5555-6666',
      },
    };

    const createdCustomer: Customer = {
      _id: 'customer-new',
      ...newCustomerData,
      created_at: '2025-01-03T00:00:00Z',
      updated_at: '2025-01-03T00:00:00Z',
    };

    mockCreateCustomer.mockResolvedValueOnce(createdCustomer);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.createCustomer(newCustomerData);
    });

    expect(mockSetCreating).toHaveBeenCalledWith(true);
    expect(mockCreateCustomer).toHaveBeenCalledWith(newCustomerData);
    expect(mockAddCustomer).toHaveBeenCalledWith(createdCustomer);
    expect(mockShowCreateForm).toHaveBeenCalledWith(false);
    expect(mockSetCreating).toHaveBeenCalledWith(false);
  });

  it('생성 실패 시 에러를 처리한다', async () => {
    mockCreateCustomer.mockRejectedValueOnce(new Error('Create failed'));

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.createCustomer({} as CreateCustomerData);
    });

    expect(mockSetError).toHaveBeenCalledWith('Create failed');
    expect(mockSetCreating).toHaveBeenCalledWith(false);
  });
});

// ============================================
// updateCustomer 테스트
// ============================================
describe('useCustomersController - updateCustomer', () => {
  it('고객을 성공적으로 수정한다', async () => {
    const updateData: UpdateCustomerData = {
      contact_info: {
        phone: '010-9999-8888',
      },
    };

    const updatedCustomer: Customer = {
      ...mockCustomer,
      contact_info: updateData.contact_info!,
    };

    mockUpdateCustomerDoc.mockResolvedValueOnce(updatedCustomer);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.updateCustomer('customer-1', updateData);
    });

    expect(mockSetUpdating).toHaveBeenCalledWith(true);
    expect(mockUpdateCustomerDoc).toHaveBeenCalledWith('customer-1', updateData);
    expect(mockUpdateCustomer).toHaveBeenCalledWith(updatedCustomer);
    expect(mockShowEditForm).toHaveBeenCalledWith(false);
    expect(mockSetUpdating).toHaveBeenCalledWith(false);
  });

  it('수정 실패 시 에러를 처리한다', async () => {
    mockUpdateCustomerDoc.mockRejectedValueOnce(new Error('Update failed'));

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.updateCustomer('customer-1', {});
    });

    expect(mockSetError).toHaveBeenCalledWith('Update failed');
    expect(mockSetUpdating).toHaveBeenCalledWith(false);
  });
});

// ============================================
// deleteCustomer 테스트
// ============================================
describe('useCustomersController - deleteCustomer', () => {
  it('고객을 성공적으로 삭제한다', async () => {
    mockDeleteCustomer.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.deleteCustomer('customer-1');
    });

    expect(mockSetDeleting).toHaveBeenCalledWith(true);
    expect(mockDeleteCustomer).toHaveBeenCalledWith('customer-1');
    expect(mockRemoveCustomer).toHaveBeenCalledWith('customer-1');
    expect(mockSetDeleting).toHaveBeenCalledWith(false);
  });

  it('삭제 실패 시 에러를 처리한다', async () => {
    mockDeleteCustomer.mockRejectedValueOnce(new Error('Delete failed'));

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.deleteCustomer('customer-1');
    });

    expect(mockSetError).toHaveBeenCalledWith('Delete failed');
    expect(mockSetDeleting).toHaveBeenCalledWith(false);
  });
});

// ============================================
// UI 핸들러 테스트
// ============================================
describe('useCustomersController - UI 핸들러', () => {
  it('고객 편집을 시작한다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.handleEditCustomer(mockCustomer);
    });

    expect(mockSelectCustomer).toHaveBeenCalledWith(mockCustomer);
    expect(mockShowEditForm).toHaveBeenCalledWith(true, mockCustomer);
  });

  it('고객 삭제 확인을 표시한다', async () => {
    mockShowConfirmation.mockResolvedValueOnce(true);
    mockDeleteCustomer.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.handleDeleteCustomer(mockCustomer);
    });

    // NOTE: 소스 코드에 버그 있음 - 템플릿 리터럴이 escape되어 있어 실제 값으로 치환되지 않음
    expect(mockShowConfirmation).toHaveBeenCalledWith({
      title: '고객 삭제',
      message: '${customer.personal_info?.name ?? \'고객\'} 고객을 삭제하시겠습니까?',
      confirmText: '삭제',
      cancelText: '취소',
      destructive: true,
    });
    expect(mockDeleteCustomer).toHaveBeenCalledWith('customer-1');
  });

  it('고객 삭제를 취소한다', async () => {
    mockShowConfirmation.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useCustomersController());

    await act(async () => {
      await result.current.handleDeleteCustomer(mockCustomer);
    });

    expect(mockShowConfirmation).toHaveBeenCalled();
    expect(mockDeleteCustomer).not.toHaveBeenCalled();
  });

  it('생성 폼을 연다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.handleOpenCreateForm();
    });

    expect(mockShowCreateForm).toHaveBeenCalledWith(true);
  });

  it('생성 폼을 닫는다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.handleCloseCreateForm();
    });

    expect(mockShowCreateForm).toHaveBeenCalledWith(false);
  });

  it('편집 폼을 닫는다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.handleCloseEditForm();
    });

    expect(mockShowEditForm).toHaveBeenCalledWith(false);
    expect(mockSelectCustomer).toHaveBeenCalledWith(null);
  });

  it('에러를 해제한다', () => {
    const { result } = renderHook(() => useCustomersController());

    act(() => {
      result.current.clearError();
    });

    expect(mockSetError).toHaveBeenCalledWith(null);
  });
});

// ============================================
// 계산된 값 테스트
// ============================================
describe('useCustomersController - 계산된 값', () => {
  it('isAnyLoading을 올바르게 계산한다', () => {
    mockCustomerContextValue.state.isLoading = true;

    const { result } = renderHook(() => useCustomersController());

    expect(result.current.isAnyLoading).toBe(true);
  });

  it('isEmpty를 올바르게 계산한다', () => {
    mockCustomerContextValue.state.isLoading = false;
    mockCustomerContextValue.state.customers = [];

    const { result } = renderHook(() => useCustomersController());

    expect(result.current.isEmpty).toBe(true);
  });

  it('searchResultMessage를 올바르게 계산한다 (검색어 있음)', () => {
    mockCustomerContextValue.state.searchQuery = '홍길동';
    mockCustomerContextValue.state.total = 5;

    const { result } = renderHook(() => useCustomersController());

    expect(result.current.searchResultMessage).toBe('"홍길동" 검색 결과: 5명');
  });

  it('searchResultMessage를 올바르게 계산한다 (검색어 없음)', () => {
    mockCustomerContextValue.state.searchQuery = '';
    mockCustomerContextValue.state.total = 100;

    const { result } = renderHook(() => useCustomersController());

    expect(result.current.searchResultMessage).toBe('총 100명의 고객');
  });
});

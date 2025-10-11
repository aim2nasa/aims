/**
 * AIMS UIX-3 Customers Controller
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 관리 비즈니스 로직을 담당하는 Controller Hook
 * ARCHITECTURE.md의 Controller 레이어 패턴을 따름
 * Document-Controller-View 분리 구현
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useCustomerContext } from '@/contexts/CustomerContextHooks';
import { CustomerDocument } from '@/stores/CustomerDocument';
import { handleApiError } from '@/shared/lib/api';
import type { Customer, CreateCustomerData, UpdateCustomerData, CustomerSearchQuery } from '@/entities/customer';
import { useConfirmation } from '../shared/hooks/useConfirmation';

/**
 * 고객 관리 Controller Hook
 * 모든 비즈니스 로직과 이벤트 핸들링을 담당
 */
export const useCustomersController = () => {
  const {
    state,
    setLoading,
    setCustomers,
    addCustomer,
    updateCustomer: updateCustomerInState,
    removeCustomer,
    selectCustomer,
    setSearchQuery,
    setSearchParams,
    showCreateForm,
    showEditForm,
    setCreating,
    setUpdating,
    setDeleting,
    setError,
  } = useCustomerContext();

  // Apple-style 확인 다이얼로그 Hook
  const { confirmationState, showConfirmation, handleConfirm, handleCancel, handleClose } = useConfirmation();

  // === 데이터 로딩 로직 ===

  /**
   * 고객 목록 로드
   */
  const loadCustomers = useCallback(async (params?: Partial<CustomerSearchQuery>) => {
    console.log('[useCustomersController] loadCustomers called with params:', params)
    try {
      setLoading(true);
      setError(null);

      // Document-View 패턴: CustomerDocument를 통해 로드
      const document = CustomerDocument.getInstance();
      const searchParams = { ...state.searchParams, ...params };

      console.log('[useCustomersController] Document를 통해 고객 목록 로드:', searchParams)
      await document.loadCustomers(searchParams);

      const customers = document.getCustomers();
      const total = document.getTotal();
      const hasMore = document.getHasMore();

      console.log('[useCustomersController] Document 로드 완료:', {
        customersCount: customers.length,
        total,
        hasMore
      })

      setCustomers({
        customers,
        total,
        hasMore,
      });
    } catch (error) {
      console.error('[useCustomersController] Error loading customers:', error)
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  }, [state.searchParams, setLoading, setCustomers, setError]);

  /**
   * 더 많은 고객 로드 (페이지네이션)
   */
  const loadMoreCustomers = useCallback(async () => {
    if (state.isLoading || !state.hasMore) return;

    const newParams = {
      ...state.searchParams,
      offset: (state.searchParams.offset || 0) + (state.searchParams.limit || 20),
    };

    try {
      setLoading(true);
      const result = state.searchQuery.trim()
        ? await CustomerService.searchCustomers(state.searchQuery, newParams)
        : await CustomerService.getCustomers(newParams);

      // 기존 데이터에 추가
      setCustomers({
        customers: [...state.customers, ...result.customers],
        total: result.total,
        hasMore: result.hasMore,
      });

      // 검색 파라미터 업데이트
      setSearchParams(newParams);
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  }, [
    state.isLoading,
    state.hasMore,
    state.customers,
    state.searchQuery,
    state.searchParams,
    setLoading,
    setCustomers,
    setSearchParams,
    setError,
  ]);

  // === 검색 및 필터링 로직 ===

  /**
   * 검색어 변경 핸들러
   */
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    // 검색 시 오프셋 리셋
    setSearchParams({ ...state.searchParams, offset: 0 });
  }, [setSearchQuery, setSearchParams, state.searchParams]);

  /**
   * 검색 실행
   */
  const handleSearch = useCallback(() => {
    loadCustomers({ offset: 0 });
  }, [loadCustomers]);

  // === CRUD 로직 ===

  /**
   * 고객 생성
   */
  const createCustomer = useCallback(async (data: CreateCustomerData) => {
    try {
      setCreating(true);
      setError(null);

      // Document-View 패턴: CustomerDocument를 통해 생성
      const document = CustomerDocument.getInstance();
      const newCustomer = await document.createCustomer(data);
      console.log('[useCustomersController] Document를 통해 고객 생성 완료 - 모든 View 자동 업데이트됨');

      addCustomer(newCustomer);
      showCreateForm(false);
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setCreating(false);
    }
  }, [setCreating, setError, addCustomer, showCreateForm]);

  /**
   * 고객 수정
   */
  const updateCustomer = useCallback(async (id: string, data: UpdateCustomerData) => {
    try {
      setUpdating(true);
      setError(null);

      // Document-View 패턴: CustomerDocument를 통해 수정
      const document = CustomerDocument.getInstance();
      const updatedCustomer = await document.updateCustomer(id, data);
      console.log('[useCustomersController] Document를 통해 고객 수정 완료 - 모든 View 자동 업데이트됨');

      updateCustomerInState(updatedCustomer);
      showEditForm(false);
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setUpdating(false);
    }
  }, [setUpdating, setError, updateCustomerInState, showEditForm]);

  /**
   * 고객 삭제
   */
  const deleteCustomer = useCallback(async (id: string) => {
    try {
      setDeleting(true);
      setError(null);

      // Document-View 패턴: CustomerDocument를 통해 삭제
      const document = CustomerDocument.getInstance();
      await document.deleteCustomer(id);
      console.log('[useCustomersController] Document를 통해 고객 삭제 완료 - 모든 View 자동 업데이트됨');

      removeCustomer(id);
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setDeleting(false);
    }
  }, [setDeleting, setError, removeCustomer]);

  // === UI 이벤트 핸들러들 ===

  /**
   * 고객 편집 시작
   */
  const handleEditCustomer = useCallback((customer: Customer) => {
    selectCustomer(customer);
    showEditForm(true, customer);
  }, [selectCustomer, showEditForm]);

  /**
   * 고객 삭제 확인 - Apple-style 다이얼로그 사용
   */
  const handleDeleteCustomer = useCallback(async (customer: Customer) => {
    const confirmed = await showConfirmation({
      title: '고객 삭제',
      message: `${customer.name} 고객을 삭제하시겠습니까?`,
      confirmText: '삭제',
      cancelText: '취소',
      destructive: true
    });

    if (confirmed) {
      deleteCustomer(customer._id);
    }
  }, [deleteCustomer, showConfirmation]);

  /**
   * 생성 폼 열기
   */
  const handleOpenCreateForm = useCallback(() => {
    showCreateForm(true);
  }, [showCreateForm]);

  /**
   * 생성 폼 닫기
   */
  const handleCloseCreateForm = useCallback(() => {
    showCreateForm(false);
  }, [showCreateForm]);

  /**
   * 편집 폼 닫기
   */
  const handleCloseEditForm = useCallback(() => {
    showEditForm(false);
    selectCustomer(null);
  }, [showEditForm, selectCustomer]);

  /**
   * 에러 해제
   */
  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  // === 초기 데이터 로딩 ===

  /**
   * 컴포넌트 마운트 시 데이터 로딩
   */
  useEffect(() => {
    if (state.customers.length === 0) {
      loadCustomers();
    }
  }, [loadCustomers, state.customers.length]); // 의존성 배열 수정

  /**
   * 검색어나 파라미터 변경 시 데이터 리로딩
   */
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.searchQuery !== '') {
        handleSearch();
      }
    }, 500); // 500ms 디바운스

    return () => clearTimeout(timeoutId);
  }, [state.searchQuery, handleSearch]);

  // === 계산된 값들 ===

  /**
   * 로딩 상태들
   */
  const isAnyLoading = useMemo(() => {
    return state.isLoading || state.isCreating || state.isUpdating || state.isDeleting;
  }, [state.isLoading, state.isCreating, state.isUpdating, state.isDeleting]);

  /**
   * 고객 목록이 비어있는지 여부
   */
  const isEmpty = useMemo(() => {
    return !state.isLoading && state.customers.length === 0;
  }, [state.isLoading, state.customers.length]);

  /**
   * 검색 결과 메시지
   */
  const searchResultMessage = useMemo(() => {
    const total = state.total ?? 0;
    if (state.searchQuery.trim()) {
      return `"${state.searchQuery}" 검색 결과: ${total.toLocaleString()}명`;
    }
    return `총 ${total.toLocaleString()}명의 고객`;
  }, [state.searchQuery, state.total]);

  // === 공개 API ===

  return {
    // 상태
    customers: state.customers,
    selectedCustomer: state.selectedCustomer,
    searchQuery: state.searchQuery,
    error: state.error,
    total: state.total,
    hasMore: state.hasMore,

    // 로딩 상태
    isLoading: state.isLoading,
    isCreating: state.isCreating,
    isUpdating: state.isUpdating,
    isDeleting: state.isDeleting,
    isAnyLoading,

    // UI 상태
    showCreateForm: state.showCreateForm,
    showEditForm: state.showEditForm,
    editingCustomer: state.editingCustomer,
    isEmpty,
    searchResultMessage,

    // 데이터 액션
    loadCustomers,
    loadMoreCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,

    // 검색 액션
    handleSearchChange,
    handleSearch,

    // UI 액션
    handleEditCustomer,
    handleDeleteCustomer,
    handleOpenCreateForm,
    handleCloseCreateForm,
    handleCloseEditForm,
    clearError,

    // 선택 액션
    selectCustomer,

    // Apple-style 확인 다이얼로그
    confirmationState,
    handleConfirm,
    handleCancel,
    handleClose,
  };
};

/**
 * 기본 내보내기
 */
export default useCustomersController;

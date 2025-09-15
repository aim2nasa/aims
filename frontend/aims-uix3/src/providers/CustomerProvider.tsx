/**
 * AIMS UIX-3 Customer Provider
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 관리 Provider 컴포넌트
 * Context + Service Layer + React Query 통합
 * ARCHITECTURE.md의 Provider 패턴을 따름
 */

import React, { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomerContextProvider, useCustomerContext } from '@/contexts/CustomerContext';
import { CustomerService } from '@/services/customerService';
import { queryKeys, invalidateQueries } from '@/app/queryClient';
import { handleApiError } from '@/shared/lib/api';
import type { CreateCustomerData, UpdateCustomerData } from '@/entities/customer';

/**
 * 고객 데이터 관리 Hook
 * Context와 React Query를 연결하여 데이터 흐름 관리
 */
const useCustomerDataManager = () => {
  const {
    state,
    setLoading,
    setCustomers,
    addCustomer,
    updateCustomer,
    removeCustomer,
    setError,
    setCreating,
    setUpdating,
    setDeleting,
  } = useCustomerContext();

  const queryClient = useQueryClient();

  // 고객 목록 조회
  const {
    data: customersData,
    isLoading: isLoadingCustomers,
    error: customersError,
    refetch: refetchCustomers,
  } = useQuery({
    queryKey: [queryKeys.customers(), state.searchParams],
    queryFn: () => state.searchQuery.trim()
      ? CustomerService.searchCustomers(state.searchQuery, state.searchParams)
      : CustomerService.getCustomers(state.searchParams),
    staleTime: 1000 * 60 * 2, // 2분
    enabled: true, // 항상 활성화
  });

  // 고객 생성 뮤테이션
  const createCustomerMutation = useMutation({
    mutationFn: (data: CreateCustomerData) => {
      setCreating(true);
      return CustomerService.createCustomer(data);
    },
    onSuccess: (newCustomer) => {
      addCustomer(newCustomer);
      invalidateQueries.customers();
      setError(null);
    },
    onError: (error) => {
      setCreating(false);
      setError(handleApiError(error));
    },
  });

  // 고객 수정 뮤테이션
  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCustomerData }) => {
      setUpdating(true);
      return CustomerService.updateCustomer(id, data);
    },
    onSuccess: (updatedCustomer) => {
      updateCustomer(updatedCustomer);
      invalidateQueries.customer(updatedCustomer._id);
      setError(null);
    },
    onError: (error) => {
      setUpdating(false);
      setError(handleApiError(error));
    },
  });

  // 고객 삭제 뮤테이션
  const deleteCustomerMutation = useMutation({
    mutationFn: (id: string) => {
      setDeleting(true);
      return CustomerService.deleteCustomer(id);
    },
    onSuccess: (_, deletedId) => {
      removeCustomer(deletedId);
      invalidateQueries.customers();
      setError(null);
    },
    onError: (error) => {
      setDeleting(false);
      setError(handleApiError(error));
    },
  });

  // 데이터 동기화
  useEffect(() => {
    if (customersData) {
      setCustomers({
        customers: customersData.customers,
        total: customersData.total,
        hasMore: customersData.hasMore,
      });
    }
  }, [customersData, setCustomers]);

  // 로딩 상태 동기화
  useEffect(() => {
    setLoading(isLoadingCustomers);
  }, [isLoadingCustomers, setLoading]);

  // 에러 상태 동기화
  useEffect(() => {
    if (customersError) {
      setError(handleApiError(customersError));
    }
  }, [customersError, setError]);

  // 공개 API
  return {
    // 뮤테이션 함수들
    createCustomer: createCustomerMutation.mutate,
    updateCustomer: useCallback(
      (id: string, data: UpdateCustomerData) => updateCustomerMutation.mutate({ id, data }),
      [updateCustomerMutation]
    ),
    deleteCustomer: deleteCustomerMutation.mutate,

    // 상태
    isCreating: createCustomerMutation.isPending,
    isUpdating: updateCustomerMutation.isPending,
    isDeleting: deleteCustomerMutation.isPending,

    // 유틸리티
    refetchCustomers,
  };
};

/**
 * CustomerProvider 내부 컴포넌트
 * Context 안에서 데이터 관리 Hook을 사용
 */
const CustomerProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Context와 연결된 데이터 관리
  useCustomerDataManager();

  return <>{children}</>;
};

/**
 * CustomerProvider Props
 */
export interface CustomerProviderProps {
  children: React.ReactNode;
}

/**
 * 고객 관리 Provider
 * Context + Service Layer + React Query 통합 제공
 */
export const CustomerProvider: React.FC<CustomerProviderProps> = ({ children }) => {
  return (
    <CustomerContextProvider>
      <CustomerProviderInner>
        {children}
      </CustomerProviderInner>
    </CustomerContextProvider>
  );
};

/**
 * 고객 Provider와 연결된 Action Hook
 * 컴포넌트에서 고객 관련 액션을 수행할 때 사용
 */
export const useCustomerProviderActions = () => {
  const context = useCustomerContext();

  if (!context) {
    throw new Error('useCustomerProviderActions must be used within a CustomerProvider');
  }

  const {
    setSearchQuery,
    setSearchParams,
    showCreateForm,
    showEditForm,
    selectCustomer,
    setError,
    resetState,
  } = context;

  return {
    // 검색 및 필터
    setSearchQuery,
    setSearchParams,

    // UI 상태
    showCreateForm,
    showEditForm,
    selectCustomer,

    // 에러 관리
    setError,
    clearError: () => setError(null),

    // 상태 초기화
    resetState,
  };
};

/**
 * 고객 Provider와 연결된 State Hook
 * 컴포넌트에서 고객 상태를 읽을 때 사용
 */
export const useCustomerProviderState = () => {
  const context = useCustomerContext();

  if (!context) {
    throw new Error('useCustomerProviderState must be used within a CustomerProvider');
  }

  return context.state;
};

/**
 * 기본 내보내기
 */
export default CustomerProvider;
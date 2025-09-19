/**
 * Customer Provider Hooks
 * @since 2025-09-15
 * @version 1.0.0
 *
 * React Fast Refresh 호환성을 위한 Hook들 별도 분리
 */

import { useCustomerContext } from '@/contexts/CustomerContextHooks';

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
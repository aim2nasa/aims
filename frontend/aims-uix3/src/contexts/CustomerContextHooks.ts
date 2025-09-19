/**
 * Customer Context Hooks
 * @since 2025-09-15
 * @version 1.0.0
 *
 * React Fast Refresh 호환성을 위한 Hook들 별도 분리
 */

import { useContext } from 'react';
import { CustomerContext, CustomerContextValue } from './CustomerContext';

/**
 * 고객 Context Hook
 */
export const useCustomerContext = (): CustomerContextValue => {
  const context = useContext(CustomerContext);

  if (!context) {
    throw new Error('useCustomerContext must be used within a CustomerContextProvider');
  }

  return context;
};

/**
 * 고객 Context 선택적 Hook (선택적 데이터만 반환)
 */
export const useCustomerState = () => {
  const { state } = useCustomerContext();
  return state;
};

export const useCustomerActions = () => {
  const {
    setLoading,
    setCustomers,
    addCustomer,
    updateCustomer,
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
    resetState,
  } = useCustomerContext();

  return {
    setLoading,
    setCustomers,
    addCustomer,
    updateCustomer,
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
    resetState,
  };
};
/**
 * AIMS UIX-3 Customer Context
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 고객 관리를 위한 React Context
 * ARCHITECTURE.md의 Context/Provider 패턴을 따름
 */

import React, { createContext, useReducer, useMemo } from 'react';
import type { Customer, CustomerSearchQuery } from '@/entities/customer';

/**
 * 고객 Context 상태 타입
 */
export interface CustomerState {
  // 데이터
  customers: Customer[];
  selectedCustomer: Customer | null;

  // UI 상태
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;

  // 검색 및 필터
  searchQuery: string;
  searchParams: Partial<CustomerSearchQuery>;

  // 폼 상태
  showCreateForm: boolean;
  showEditForm: boolean;
  editingCustomer: Customer | null;

  // 에러 상태
  error: string | null;

  // 통계
  total: number;
  hasMore: boolean;
}

/**
 * 고객 Context 액션 타입
 */
export type CustomerAction =
  // 데이터 로딩
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CUSTOMERS'; payload: { customers: Customer[]; total: number; hasMore: boolean } }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'UPDATE_CUSTOMER'; payload: Customer }
  | { type: 'REMOVE_CUSTOMER'; payload: string }
  | { type: 'SELECT_CUSTOMER'; payload: Customer | null }

  // 검색 및 필터
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_PARAMS'; payload: Partial<CustomerSearchQuery> }

  // 폼 상태
  | { type: 'SHOW_CREATE_FORM'; payload: boolean }
  | { type: 'SHOW_EDIT_FORM'; payload: { show: boolean; customer?: Customer | undefined } }

  // 로딩 상태
  | { type: 'SET_CREATING'; payload: boolean }
  | { type: 'SET_UPDATING'; payload: boolean }
  | { type: 'SET_DELETING'; payload: boolean }

  // 에러 처리
  | { type: 'SET_ERROR'; payload: string | null }

  // 초기화
  | { type: 'RESET_STATE' };

/**
 * 고객 Context 초기 상태
 */
const initialState: CustomerState = {
  customers: [],
  selectedCustomer: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
  searchQuery: '',
  searchParams: {
    limit: 20,
    page: 1,
  },
  showCreateForm: false,
  showEditForm: false,
  editingCustomer: null,
  error: null,
  total: 0,
  hasMore: false,
};

/**
 * 고객 Context 리듀서
 */
function customerReducer(state: CustomerState, action: CustomerAction): CustomerState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_CUSTOMERS':
      return {
        ...state,
        customers: action.payload.customers,
        total: action.payload.total,
        hasMore: action.payload.hasMore,
        isLoading: false,
        error: null,
      };

    case 'ADD_CUSTOMER':
      return {
        ...state,
        customers: [action.payload, ...state.customers],
        total: state.total + 1,
        isCreating: false,
        showCreateForm: false,
        error: null,
      };

    case 'UPDATE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.map(customer =>
          customer._id === action.payload._id ? action.payload : customer
        ),
        selectedCustomer: state.selectedCustomer?._id === action.payload._id
          ? action.payload
          : state.selectedCustomer,
        editingCustomer: null,
        isUpdating: false,
        showEditForm: false,
        error: null,
      };

    case 'REMOVE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.filter(customer => customer._id !== action.payload),
        selectedCustomer: state.selectedCustomer?._id === action.payload
          ? null
          : state.selectedCustomer,
        total: state.total - 1,
        isDeleting: false,
        error: null,
      };

    case 'SELECT_CUSTOMER':
      return { ...state, selectedCustomer: action.payload };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
        searchParams: { ...state.searchParams, page: 1},
      };

    case 'SET_SEARCH_PARAMS':
      return { ...state, searchParams: { ...state.searchParams, ...action.payload } };

    case 'SHOW_CREATE_FORM':
      return { ...state, showCreateForm: action.payload };

    case 'SHOW_EDIT_FORM':
      return {
        ...state,
        showEditForm: action.payload.show,
        editingCustomer: action.payload.customer || null,
      };

    case 'SET_CREATING':
      return { ...state, isCreating: action.payload };

    case 'SET_UPDATING':
      return { ...state, isUpdating: action.payload };

    case 'SET_DELETING':
      return { ...state, isDeleting: action.payload };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isCreating: false,
        isUpdating: false,
        isDeleting: false,
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}

/**
 * 고객 Context 값 타입
 */
export interface CustomerContextValue {
  // 상태
  state: CustomerState;

  // 액션 디스패처들
  dispatch: React.Dispatch<CustomerAction>;

  // 편의 액션들
  setLoading: (loading: boolean) => void;
  setCustomers: (data: { customers: Customer[]; total: number; hasMore: boolean }) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  removeCustomer: (id: string) => void;
  selectCustomer: (customer: Customer | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchParams: (params: Partial<CustomerSearchQuery>) => void;
  showCreateForm: (show: boolean) => void;
  showEditForm: (show: boolean, customer?: Customer) => void;
  setCreating: (creating: boolean) => void;
  setUpdating: (updating: boolean) => void;
  setDeleting: (deleting: boolean) => void;
  setError: (error: string | null) => void;
  resetState: () => void;
}

/**
 * 고객 Context
 */
const CustomerContext = createContext<CustomerContextValue | null>(null);

/**
 * 고객 Context Provider Props
 */
export interface CustomerContextProviderProps {
  children: React.ReactNode;
  initialData?: Partial<CustomerState>;
}

/**
 * 고객 Context Provider
 */
export const CustomerContextProvider: React.FC<CustomerContextProviderProps> = ({
  children,
  initialData,
}) => {
  const [state, dispatch] = useReducer(customerReducer, {
    ...initialState,
    ...initialData,
  });

  // 편의 액션들을 메모이제이션
  const actions = useMemo(() => ({
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setCustomers: (data: { customers: Customer[]; total: number; hasMore: boolean }) =>
      dispatch({ type: 'SET_CUSTOMERS', payload: data }),
    addCustomer: (customer: Customer) => dispatch({ type: 'ADD_CUSTOMER', payload: customer }),
    updateCustomer: (customer: Customer) => dispatch({ type: 'UPDATE_CUSTOMER', payload: customer }),
    removeCustomer: (id: string) => dispatch({ type: 'REMOVE_CUSTOMER', payload: id }),
    selectCustomer: (customer: Customer | null) => dispatch({ type: 'SELECT_CUSTOMER', payload: customer }),
    setSearchQuery: (query: string) => dispatch({ type: 'SET_SEARCH_QUERY', payload: query }),
    setSearchParams: (params: Partial<CustomerSearchQuery>) =>
      dispatch({ type: 'SET_SEARCH_PARAMS', payload: params }),
    showCreateForm: (show: boolean) => dispatch({ type: 'SHOW_CREATE_FORM', payload: show }),
    showEditForm: (show: boolean, customer?: Customer | undefined) =>
      dispatch({ type: 'SHOW_EDIT_FORM', payload: { show, customer } }),
    setCreating: (creating: boolean) => dispatch({ type: 'SET_CREATING', payload: creating }),
    setUpdating: (updating: boolean) => dispatch({ type: 'SET_UPDATING', payload: updating }),
    setDeleting: (deleting: boolean) => dispatch({ type: 'SET_DELETING', payload: deleting }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),
    resetState: () => dispatch({ type: 'RESET_STATE' }),
  }), []);

  // Context 값을 메모이제이션
  const value = useMemo(
    () => ({
      state,
      dispatch,
      ...actions,
    }),
    [state, actions]
  );

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};


// Context 내보내기
export { CustomerContext };

/**
 * 기본 내보내기
 */
export default CustomerContextProvider;
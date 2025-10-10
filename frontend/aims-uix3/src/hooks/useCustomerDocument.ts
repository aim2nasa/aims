/**
 * AIMS UIX-3 useCustomerDocument Hook
 * @since 2025-10-10
 * @version 1.0.0
 *
 * CustomerDocument를 React 컴포넌트에서 사용하기 위한 Hook
 * - Document 자동 구독
 * - 상태 변경 시 자동 리렌더링
 */

import { useState, useEffect, useCallback } from 'react';
import { CustomerDocument } from '@/stores/CustomerDocument';
import type { Customer, CreateCustomerData, UpdateCustomerData, CustomerSearchQuery } from '@/entities/customer';

/**
 * CustomerDocument Hook 반환 타입
 */
interface UseCustomerDocumentReturn {
  // 데이터
  customers: Customer[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;

  // CRUD 메서드
  loadCustomers: (query?: Partial<CustomerSearchQuery>) => Promise<void>;
  createCustomer: (data: CreateCustomerData) => Promise<Customer>;
  updateCustomer: (id: string, data: UpdateCustomerData) => Promise<Customer>;
  deleteCustomer: (id: string) => Promise<void>;
  refresh: (query?: Partial<CustomerSearchQuery>) => Promise<void>;

  // 유틸리티
  getCustomerById: (id: string) => Customer | undefined;
  reset: () => void;
  debug: () => void;
}

/**
 * CustomerDocument Hook
 *
 * Document-View 패턴의 View 역할을 하는 컴포넌트에서 사용
 * 자동으로 Document를 구독하고, 변경 시 리렌더링
 *
 * @example
 * ```tsx
 * const MyView = () => {
 *   const { customers, loadCustomers, updateCustomer } = useCustomerDocument();
 *
 *   useEffect(() => {
 *     loadCustomers();
 *   }, []);
 *
 *   // Document가 변경되면 자동으로 customers 업데이트됨
 * }
 * ```
 */
export const useCustomerDocument = (): UseCustomerDocumentReturn => {
  const [document] = useState(() => CustomerDocument.getInstance());

  // Document 상태를 로컬 state로 동기화
  const [customers, setCustomers] = useState<Customer[]>(document.getCustomers());
  const [total, setTotal] = useState<number>(document.getTotal());
  const [hasMore, setHasMore] = useState<boolean>(document.getHasMore());
  const [isLoading, setIsLoading] = useState<boolean>(document.getIsLoading());
  const [error, setError] = useState<string | null>(document.getError());
  const [lastUpdated, setLastUpdated] = useState<number>(document.getLastUpdated());

  // Document 구독 및 상태 동기화
  useEffect(() => {
    const syncState = () => {
      setCustomers(document.getCustomers());
      setTotal(document.getTotal());
      setHasMore(document.getHasMore());
      setIsLoading(document.getIsLoading());
      setError(document.getError());
      setLastUpdated(document.getLastUpdated());
    };

    // 초기 동기화
    syncState();

    // Document 구독
    const unsubscribe = document.subscribe(syncState);

    return () => {
      unsubscribe();
    };
  }, [document]);

  // CRUD 메서드를 useCallback으로 메모이제이션
  const loadCustomers = useCallback(
    async (query?: Partial<CustomerSearchQuery>) => {
      await document.loadCustomers(query);
    },
    [document]
  );

  const createCustomer = useCallback(
    async (data: CreateCustomerData) => {
      return await document.createCustomer(data);
    },
    [document]
  );

  const updateCustomer = useCallback(
    async (id: string, data: UpdateCustomerData) => {
      return await document.updateCustomer(id, data);
    },
    [document]
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      await document.deleteCustomer(id);
    },
    [document]
  );

  const refresh = useCallback(
    async (query?: Partial<CustomerSearchQuery>) => {
      await document.refresh(query);
    },
    [document]
  );

  const getCustomerById = useCallback(
    (id: string) => {
      return document.getCustomerById(id);
    },
    [document]
  );

  const reset = useCallback(() => {
    document.reset();
  }, [document]);

  const debug = useCallback(() => {
    document.debug();
  }, [document]);

  return {
    // 데이터
    customers,
    total,
    hasMore,
    isLoading,
    error,
    lastUpdated,

    // CRUD 메서드
    loadCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    refresh,

    // 유틸리티
    getCustomerById,
    reset,
    debug,
  };
};

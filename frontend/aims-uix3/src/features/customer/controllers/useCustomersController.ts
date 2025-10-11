/**
 * AIMS UIX-3 Customers Controller
 * @since 2025-10-03
 * @version 1.0.0
 *
 * 고객 목록 조회 및 관리를 위한 컨트롤러
 * 페이지네이션, 검색, 필터링 지원
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { CustomerSearchQuerySchema, type Customer, type CustomerSearchQuery } from '@/entities/customer/model';

interface UseCustomersControllerProps {
  /** 초기 페이지 크기 */
  initialLimit?: number;
  /** 자동 로드 여부 */
  autoLoad?: boolean;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

/**
 * Customers Controller Hook
 *
 * @example
 * const { customers, pagination, isLoading, searchCustomers, loadMore } = useCustomersController();
 */
export const useCustomersController = ({
  initialLimit = 20,
  autoLoad = true,
}: UseCustomersControllerProps = {}) => {
  // 상태 관리
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    limit: initialLimit,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 검색 쿼리 상태
  const [searchQuery, setSearchQuery] = useState<CustomerSearchQuery>({
    page: 1,
    limit: initialLimit,
  });

  /**
   * 고객 목록 조회
   */
  const fetchCustomers = useCallback(async (query: CustomerSearchQuery, append: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      // 쿼리 검증
      const validatedQuery = CustomerSearchQuerySchema.parse(query);

      // URL 쿼리 파라미터 생성
      const params = new URLSearchParams();
      params.append('page', String(validatedQuery.page));
      params.append('limit', String(validatedQuery.limit));

      if (validatedQuery.search) {
        params.append('search', validatedQuery.search);
      }
      if (validatedQuery.status) {
        params.append('status', validatedQuery.status);
      }
      if (validatedQuery.customerType) {
        params.append('customerType', validatedQuery.customerType);
      }
      if (validatedQuery.region) {
        params.append('region', validatedQuery.region);
      }
      if (validatedQuery.startDate) {
        params.append('startDate', validatedQuery.startDate);
      }
      if (validatedQuery.endDate) {
        params.append('endDate', validatedQuery.endDate);
      }
      if (validatedQuery.hasDocuments !== undefined) {
        params.append('hasDocuments', String(validatedQuery.hasDocuments));
      }

      // API 호출
      const response = await fetch(`http://tars.giize.com:3010/api/customers?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '고객 목록 조회에 실패했습니다.');
      }

      const result = await response.json();

      // 백엔드 응답 형식: { success: true, data: { customers, pagination } }
      const data = result.data || result;

      // 데이터 업데이트
      if (append) {
        setCustomers((prev) => [...prev, ...(data.customers || [])]);
      } else {
        setCustomers(data.customers || []);
      }

      // 페이지네이션 정보 업데이트
      if (data.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || '고객 목록 조회 중 오류가 발생했습니다.');
      console.error('[useCustomersController] Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 검색 실행
   */
  const searchCustomers = useCallback((query: Partial<CustomerSearchQuery>) => {
    const newQuery: CustomerSearchQuery = {
      ...searchQuery,
      ...query,
      page: 1, // 새 검색 시 첫 페이지로
    };
    setSearchQuery(newQuery);
    fetchCustomers(newQuery, false);
  }, [searchQuery, fetchCustomers]);

  /**
   * 다음 페이지 로드 (더보기)
   */
  const loadMore = useCallback(() => {
    if (pagination.currentPage >= pagination.totalPages) {
      return;
    }

    const nextQuery: CustomerSearchQuery = {
      ...searchQuery,
      page: pagination.currentPage + 1,
    };
    setSearchQuery(nextQuery);
    fetchCustomers(nextQuery, true);
  }, [searchQuery, pagination, fetchCustomers]);

  /**
   * 페이지 이동
   */
  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > pagination.totalPages) {
      return;
    }

    const newQuery: CustomerSearchQuery = {
      ...searchQuery,
      page,
    };
    setSearchQuery(newQuery);
    fetchCustomers(newQuery, false);
  }, [searchQuery, pagination, fetchCustomers]);

  /**
   * 새로고침
   */
  const refresh = useCallback(() => {
    fetchCustomers(searchQuery, false);
  }, [searchQuery, fetchCustomers]);

  /**
   * 검색어 변경
   */
  const handleSearchChange = useCallback((search: string) => {
    searchCustomers({ search });
  }, [searchCustomers]);

  /**
   * 필터 변경
   */
  const handleFilterChange = useCallback((filters: Partial<CustomerSearchQuery>) => {
    searchCustomers(filters);
  }, [searchCustomers]);

  /**
   * 초기 로드
   */
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (!autoLoad || initialLoadRef.current) {
      return;
    }
    initialLoadRef.current = true;
    fetchCustomers(searchQuery, false);
  }, [autoLoad, fetchCustomers, searchQuery]);

  // 계산된 상태
  const hasMore = pagination.currentPage < pagination.totalPages;
  const isEmpty = !isLoading && customers.length === 0;
  const totalCustomers = pagination.totalCount;

  return {
    // 데이터
    customers,
    pagination,
    totalCustomers,

    // 상태
    isLoading,
    error,
    isEmpty,
    hasMore,

    // 쿼리
    searchQuery,

    // 액션
    searchCustomers,
    loadMore,
    goToPage,
    refresh,
    handleSearchChange,
    handleFilterChange,
    setError,
  };
};

export default useCustomersController;

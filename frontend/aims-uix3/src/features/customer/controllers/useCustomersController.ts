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
import { api, ApiError, isRequestCancelledError } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

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

      // API 호출 (api 모듈 사용 - x-user-id 헤더 자동 처리)
      interface CustomersResponse {
        success: boolean;
        data?: {
          customers: Customer[];
          pagination: PaginationInfo;
        };
        customers?: Customer[];
        pagination?: PaginationInfo;
      }

      const result = await api.get<CustomersResponse>(`/api/customers?${params.toString()}`);

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
      setIsLoading(false); // 🔧 성공 시에만 로딩 종료
    } catch (err) {
      // 🔧 취소된 요청은 조용히 무시 (고객 전환 등 정상적인 상황)
      if (isRequestCancelledError(err)) {
        // setIsLoading(false) 호출하지 않음 - 새 요청이 진행 중
        return;
      }
      const message = err instanceof ApiError
        ? err.message
        : (err instanceof Error ? err.message : '고객 목록 조회 중 오류가 발생했습니다.');
      setError(message);
      console.error('[useCustomersController] Fetch error:', err);
      errorReporter.reportApiError(err as Error, { component: 'useCustomersController.fetchCustomers' });
      setIsLoading(false); // 🔧 실제 에러 시에만 로딩 종료
    }
    // 🔧 finally 제거 - 취소된 요청에서 setIsLoading(false) 호출하면 새 요청의 로딩 상태가 풀림
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


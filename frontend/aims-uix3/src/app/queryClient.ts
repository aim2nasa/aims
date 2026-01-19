/**
 * AIMS UIX-3 TanStack Query Configuration
 * @since 2025-09-15
 * @version 1.0.0
 *
 * 서버 상태 관리를 위한 TanStack Query 설정
 * 에러 처리, 재시도, 캐싱 정책 등을 포함
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import type { DefaultOptions } from '@tanstack/react-query';
import { ApiError, NetworkError, TimeoutError, RequestCancelledError, handleApiError } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

/**
 * 기본 쿼리 옵션
 */
const defaultOptions: DefaultOptions = {
  queries: {
    // 5분간 캐시
    staleTime: 1000 * 60 * 5,

    // 가비지 컬렉션까지 10분
    gcTime: 1000 * 60 * 10,

    // 재시도 로직
    retry: (failureCount, error) => {
      // 🔧 요청 취소 에러는 재시도하지 않음 (고객 전환 등 정상적인 취소)
      if (error instanceof RequestCancelledError) {
        return false;
      }

      // 네트워크 에러나 타임아웃은 최대 3번 재시도
      if (error instanceof NetworkError || error instanceof TimeoutError) {
        return failureCount < 3;
      }

      // 4xx 클라이언트 에러는 재시도하지 않음
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false;
      }

      // 5xx 서버 에러는 2번 재시도
      if (error instanceof ApiError && error.status >= 500) {
        return failureCount < 2;
      }

      // 기타 에러는 1번만 재시도
      return failureCount < 1;
    },

    // 재시도 간격 (지수 백오프)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

    // 창이 다시 포커스될 때 자동 refetch 비활성화 (성능상 이유)
    refetchOnWindowFocus: false,

    // 네트워크 재연결 시 refetch
    refetchOnReconnect: true,

    // 마운트 시 refetch (기본값 유지)
    refetchOnMount: true,
  },

  mutations: {
    // 뮤테이션 재시도는 기본적으로 하지 않음
    retry: false,

    // 에러 처리 (에러 리포팅은 mutationCache.onError에서 처리)
    onError: (error) => {
      // 🔧 요청 취소 에러는 조용히 무시 (고객 전환 등 정상적인 취소)
      if (error instanceof RequestCancelledError) {
        return;
      }

      // 전역 에러 처리 로직
      const errorMessage = handleApiError(error);

      // 개발 환경에서 콘솔에 에러 출력
      if (import.meta.env.DEV) {
        console.error('Mutation Error:', errorMessage);
        console.error('Mutation Error:', error);
      }

      // 여기에서 토스트 메시지나 에러 모달을 표시할 수 있음
      // 예: toast.error(errorMessage);
    },
  },
};

/**
 * Query Cache 설정 (Query 에러 핸들링)
 */
const queryCache = new QueryCache({
  onError: (error) => {
    // 🔧 요청 취소 에러는 조용히 무시 (고객 전환 등 정상적인 취소)
    if (error instanceof RequestCancelledError) {
      return;
    }

    // Query 에러 시 에러 리포터에 전송
    if (error instanceof ApiError || error instanceof NetworkError || error instanceof TimeoutError) {
      errorReporter.reportApiError(error, { component: 'QueryCache' });
    } else if (error instanceof Error) {
      errorReporter.reportApiError(error, { component: 'QueryCache' });
    }

    // 개발 환경에서 콘솔에 에러 출력
    if (import.meta.env.DEV) {
      console.error('Query Error:', error);
    }
  }
});

/**
 * Mutation Cache 설정 (Mutation 에러 핸들링)
 */
const mutationCache = new MutationCache({
  onError: (error) => {
    // 🔧 요청 취소 에러는 조용히 무시 (고객 전환 등 정상적인 취소)
    if (error instanceof RequestCancelledError) {
      return;
    }

    // Mutation 에러 시 에러 리포터에 전송
    if (error instanceof ApiError || error instanceof NetworkError || error instanceof TimeoutError) {
      errorReporter.reportApiError(error, { component: 'MutationCache' });
    } else if (error instanceof Error) {
      errorReporter.reportApiError(error, { component: 'MutationCache' });
    }
  }
});

/**
 * Query Client 인스턴스 생성
 */
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions,
});

/**
 * 쿼리 키 팩토리
 * 일관된 쿼리 키 구조를 위한 헬퍼 함수들
 */
export const queryKeys = {
  all: ['aims'] as const,

  customers: () => [...queryKeys.all, 'customers'] as const,
  customer: (id: string) => [...queryKeys.customers(), id] as const,
  customerSearch: (query: string) => [...queryKeys.customers(), 'search', query] as const,

  documents: () => [...queryKeys.all, 'documents'] as const,
  document: (id: string) => [...queryKeys.documents(), id] as const,
  documentsByCustomer: (customerId: string) =>
    [...queryKeys.documents(), 'customer', customerId] as const,

  relationships: () => [...queryKeys.all, 'relationships'] as const,
  relationship: (id: string) => [...queryKeys.relationships(), id] as const,
  relationshipsByCustomer: (customerId: string) =>
    [...queryKeys.relationships(), 'customer', customerId] as const,
} as const;


/**
 * 쿼리 무효화 헬퍼 함수들
 */
export const invalidateQueries = {
  customers: () => queryClient.invalidateQueries({ queryKey: queryKeys.customers() }),
  customer: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.customer(id) }),
  documents: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents() }),
  document: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.document(id) }),
  relationships: () => queryClient.invalidateQueries({ queryKey: queryKeys.relationships() }),
  relationship: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.relationship(id) }),
  all: () => queryClient.invalidateQueries({ queryKey: queryKeys.all }),
};
import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import { errorReporter } from '../shared/lib/errorReporter';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // Query 에러 시 에러 리포터에 전송
      errorReporter.reportApiError(error as Error, {
        component: 'QueryCache'
      });
    }
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      // Mutation 에러 시 에러 리포터에 전송
      errorReporter.reportApiError(error as Error, {
        component: 'MutationCache'
      });
    }
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5분
      gcTime: 1000 * 60 * 3, // 3분 (OOM 방지: 비활성 캐시 빠르게 해제)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

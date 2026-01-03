/**
 * Customer Review SSE 실시간 업데이트 훅
 * 폴링 방식을 SSE로 대체하여 CR 상태 변경 실시간 감지
 * @since 2026-01-03
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAuthToken } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface CRChangeEvent {
  type: 'parsing-complete' | 'parsing-error' | 'retry-started' | 'status-change';
  fileId?: string;
  status?: string;
  errorMessage?: string;
  processingCount?: number;
  timestamp: string;
}

interface UseCustomerReviewSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** CR 상태 변경 시 호출할 콜백 */
  onCRChange?: (event: CRChangeEvent) => void;
}

/**
 * Customer Review SSE 훅
 * @param customerId 고객 ID
 * @param onRefresh CR 목록 새로고침 함수
 * @param options 옵션
 */
export function useCustomerReviewSSE(
  customerId: string | null | undefined,
  onRefresh: () => void,
  options: UseCustomerReviewSSEOptions = {}
) {
  const { enabled = true, onCRChange } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh);
  const onCRChangeRef = useRef(onCRChange);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onCRChangeRef.current = onCRChange;
  }, [onCRChange]);

  // 연결 해제 함수
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectedRef.current = false;
  }, []);

  // SSE 연결 함수 (안정적인 참조)
  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!customerId || !token || !enabled) {
      return;
    }

    // 기존 연결 정리
    disconnect();

    const url = `${API_BASE_URL}/api/customers/${customerId}/customer-reviews/stream?token=${encodeURIComponent(token)}`;

    console.log('[CustomerReviewSSE] 연결 시작...', { customerId, url: url.replace(/token=[^&]+/, 'token=***') });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[CustomerReviewSSE] 연결됨:', data);
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[CustomerReviewSSE] connected 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useCustomerReviewSSE.connected' });
      }
    });

    // CR 상태 변경 이벤트
    eventSource.addEventListener('cr-change', (e) => {
      try {
        const data: CRChangeEvent = JSON.parse(e.data);
        console.log('[CustomerReviewSSE] CR 상태 변경:', data);

        // ref를 통해 최신 콜백 호출
        onCRChangeRef.current?.(data);
        onRefreshRef.current();
      } catch (error) {
        console.error('[CustomerReviewSSE] cr-change 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useCustomerReviewSSE.crChange' });
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[CustomerReviewSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      errorReporter.reportApiError(new Error('CustomerReviewSSE 연결 오류'), { component: 'useCustomerReviewSSE.onerror' });
      isConnectedRef.current = false;
      eventSource.close();

      // 5초 후 재연결
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[CustomerReviewSSE] 재연결 시도...');
        connect();
      }, 5000);
    };
  }, [customerId, enabled, disconnect]);

  // Page Visibility API 처리 (탭 활성화 시 재연결)
  useEffect(() => {
    if (!customerId || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 탭 비활성화 시 연결 해제
        disconnect();
      } else {
        // 탭 활성화 시 즉시 새로고침 후 재연결
        onRefreshRef.current();
        connect();
      }
    };

    // 초기 연결
    connect();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [customerId, enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}

export default useCustomerReviewSSE;

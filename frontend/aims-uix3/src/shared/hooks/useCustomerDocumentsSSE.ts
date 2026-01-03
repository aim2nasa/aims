/**
 * 고객 문서 SSE 실시간 업데이트 훅
 * 폴링 방식을 SSE로 대체하여 실시간 문서 변경 감지
 * @since 2025-12-19
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAuthToken } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface DocumentChangeEvent {
  type: 'linked' | 'unlinked';
  customerId: string;
  documentId: string;
  documentName: string;
  timestamp: string;
}

interface DocumentStatusChangeEvent {
  type: 'conversion' | 'processing';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error' | 'done';
  customerId: string;
  documentId: string;
  documentName: string;
  timestamp: string;
}

interface UseCustomerDocumentsSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 문서 연결/해제 시 호출할 콜백 */
  onDocumentChange?: (event: DocumentChangeEvent) => void;
  /** 문서 처리 상태 변경 시 호출할 콜백 */
  onDocumentStatusChange?: (event: DocumentStatusChangeEvent) => void;
}

/**
 * 고객 문서 SSE 훅
 * @param customerId 고객 ID
 * @param onRefresh 문서 목록 새로고침 함수
 * @param options 옵션
 */
export function useCustomerDocumentsSSE(
  customerId: string | null | undefined,
  onRefresh: () => void,
  options: UseCustomerDocumentsSSEOptions = {}
) {
  const { enabled = true, onDocumentChange, onDocumentStatusChange } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh);
  const onDocumentChangeRef = useRef(onDocumentChange);
  const onDocumentStatusChangeRef = useRef(onDocumentStatusChange);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

  useEffect(() => {
    onDocumentStatusChangeRef.current = onDocumentStatusChange;
  }, [onDocumentStatusChange]);

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

    const url = `${API_BASE_URL}/api/customers/${customerId}/documents/stream?token=${encodeURIComponent(token)}`;

    console.log('[CustomerDocumentsSSE] 연결 시작...', { customerId, url: url.replace(/token=[^&]+/, 'token=***') });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[CustomerDocumentsSSE] 연결됨:', data);
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[CustomerDocumentsSSE] connected 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useCustomerDocumentsSSE.connected', payload: { customerId } });
      }
    });

    // 문서 변경 이벤트 (연결/해제)
    eventSource.addEventListener('document-change', (e) => {
      try {
        const data: DocumentChangeEvent = JSON.parse(e.data);
        console.log('[CustomerDocumentsSSE] 문서 변경:', data);

        // ref를 통해 최신 콜백 호출
        onDocumentChangeRef.current?.(data);
        onRefreshRef.current();
      } catch (error) {
        console.error('[CustomerDocumentsSSE] document-change 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useCustomerDocumentsSSE.documentChange', payload: { customerId } });
      }
    });

    // 문서 처리 상태 변경 이벤트 (PDF 변환, OCR 등)
    eventSource.addEventListener('document-status-change', (e) => {
      try {
        const data: DocumentStatusChangeEvent = JSON.parse(e.data);
        console.log('[CustomerDocumentsSSE] 문서 처리 상태 변경:', data);

        // ref를 통해 최신 콜백 호출
        onDocumentStatusChangeRef.current?.(data);
        // 상태 변경 시 목록 새로고침
        onRefreshRef.current();
      } catch (error) {
        console.error('[CustomerDocumentsSSE] document-status-change 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useCustomerDocumentsSSE.documentStatusChange', payload: { customerId } });
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[CustomerDocumentsSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      errorReporter.reportApiError(new Error('CustomerDocumentsSSE 연결 오류'), { component: 'useCustomerDocumentsSSE.onerror', payload: { customerId, readyState: eventSource.readyState } });
      isConnectedRef.current = false;
      eventSource.close();

      // 5초 후 재연결
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[CustomerDocumentsSSE] 재연결 시도...');
        connect();
      }, 5000);
    };
  }, [customerId, enabled, disconnect]); // onRefresh, onDocumentChange 제거

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
  }, [customerId, enabled, connect, disconnect]); // onRefresh 제거

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}

export default useCustomerDocumentsSSE;

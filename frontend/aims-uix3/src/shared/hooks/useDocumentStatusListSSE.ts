/**
 * Document Status List SSE 실시간 업데이트 훅
 * DocumentStatusProvider의 폴링 방식을 SSE로 대체
 * @since 2025-12-19
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAuthToken } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface DocumentListChangeEvent {
  type: 'uploaded' | 'deleted' | 'status-changed' | 'linked' | 'unlinked' | 'updated';
  documentId: string;
  documentName?: string;
  status?: string;
  timestamp: string;
}

interface UseDocumentStatusListSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 문서 변경 시 호출할 콜백 */
  onDocumentChange?: (event: DocumentListChangeEvent) => void;
}

/**
 * Document Status List SSE 훅
 * @param onRefresh 문서 목록 새로고침 함수
 * @param options 옵션
 */
export function useDocumentStatusListSSE(
  onRefresh: () => void,
  options: UseDocumentStatusListSSEOptions = {}
) {
  const { enabled = true, onDocumentChange } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh);
  const onDocumentChangeRef = useRef(onDocumentChange);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange;
  }, [onDocumentChange]);

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
    if (!enabled) {
      return;
    }

    // JWT 토큰 확인
    const token = getAuthToken();
    if (!token) {
      console.warn('[DocumentStatusListSSE] 인증 토큰 없음 - SSE 연결 스킵');
      return;
    }

    // 기존 연결 정리
    disconnect();

    const url = `${API_BASE_URL}/api/documents/status-list/stream?token=${encodeURIComponent(token)}`;

    if (import.meta.env.DEV) {
      console.log('[DocumentStatusListSSE] 연결 시작...');
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] 연결됨:', data);
        }
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[DocumentStatusListSSE] connected 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusListSSE.connected' });
      }
    });

    // 문서 목록 변경 이벤트
    eventSource.addEventListener('document-list-change', (e) => {
      try {
        const data: DocumentListChangeEvent = JSON.parse(e.data);
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] 문서 목록 변경:', data);
        }

        // ref를 통해 최신 콜백 호출
        onDocumentChangeRef.current?.(data);

        // 🔄 webhook에서 overallStatus를 직접 업데이트하므로 즉시 새로고침
        // 약간의 지연(300ms)은 MongoDB write → read 완료 보장용
        setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('[DocumentStatusListSSE] fetchDocuments 호출 시작');
          }
          onRefreshRef.current();
        }, 300);
      } catch (error) {
        console.error('[DocumentStatusListSSE] document-list-change 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusListSSE.documentListChange' });
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[DocumentStatusListSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      errorReporter.reportApiError(new Error('DocumentStatusListSSE 연결 오류'), { component: 'useDocumentStatusListSSE.onerror', payload: { readyState: eventSource.readyState } });
      isConnectedRef.current = false;
      eventSource.close();

      // 5초 후 재연결
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] 재연결 시도...');
        }
        connect();
      }, 5000);
    };
  }, [enabled, disconnect]);

  // Page Visibility API 처리 (탭 활성화 시 재연결)
  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}

export default useDocumentStatusListSSE;

/**
 * 문서 처리 상태 SSE 훅 (1회성)
 * 문서 업로드 후 OCR 처리 완료를 SSE로 대기
 * 완료/에러/타임아웃 이벤트 수신 시 자동 연결 해제
 * @since 2025-12-19
 */

import { useEffect, useRef, useCallback } from 'react';
import { getAuthToken } from '@/shared/lib/api';
import { errorReporter } from '@/shared/lib/errorReporter';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface ProcessingCompleteEvent {
  documentId: string;
  status: 'completed' | 'error';
  ownerId: string;
  timestamp: string;
}

interface UseDocumentStatusSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 연결 타임아웃 (ms, 기본: 180000 = 3분) */
  timeout?: number;
}

export type DocumentStatusResult =
  | { status: 'completed'; documentId: string }
  | { status: 'error'; documentId: string }
  | { status: 'timeout'; documentId: string }
  | { status: 'connection_error'; documentId: string; error: unknown };

/**
 * 문서 처리 상태 SSE 훅 (1회성)
 * @param documentId 문서 ID
 * @param onComplete 처리 완료 시 호출할 콜백
 * @param options 옵션
 * @returns 연결 상태 및 제어 함수
 */
export function useDocumentStatusSSE(
  documentId: string | null | undefined,
  onComplete: (result: DocumentStatusResult) => void,
  options: UseDocumentStatusSSEOptions = {}
) {
  const { enabled = true, timeout = 180000 } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);
  const hasReceivedResultRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onCompleteRef = useRef(onComplete);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // 연결 해제 함수
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    isConnectedRef.current = false;
  }, []);

  // SSE 연결 함수
  const connect = useCallback(() => {
    const token = getAuthToken();
    if (!documentId || !token || !enabled) {
      return;
    }

    // 이미 결과를 받았으면 연결하지 않음
    if (hasReceivedResultRef.current) {
      return;
    }

    // 기존 연결 정리
    disconnect();

    const url = `${API_BASE_URL}/api/documents/${documentId}/status/stream?token=${encodeURIComponent(token)}`;

    console.log('[DocumentStatusSSE] 연결 시작...', { documentId, url: url.replace(/token=[^&]+/, 'token=***') });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 클라이언트 측 타임아웃 설정
    timeoutRef.current = setTimeout(() => {
      if (!hasReceivedResultRef.current) {
        console.log('[DocumentStatusSSE] 클라이언트 타임아웃:', documentId);
        hasReceivedResultRef.current = true;
        disconnect();
        onCompleteRef.current({ status: 'timeout', documentId });
      }
    }, timeout);

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[DocumentStatusSSE] 연결됨:', data);
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[DocumentStatusSSE] connected 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusSSE.connected', payload: { documentId } });
      }
    });

    // 처리 완료 이벤트
    eventSource.addEventListener('processing-complete', (e) => {
      try {
        const data: ProcessingCompleteEvent = JSON.parse(e.data);
        console.log('[DocumentStatusSSE] 처리 완료:', data);

        hasReceivedResultRef.current = true;
        disconnect();
        onCompleteRef.current({
          status: data.status,
          documentId: data.documentId
        });
      } catch (error) {
        console.error('[DocumentStatusSSE] processing-complete 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusSSE.processingComplete', payload: { documentId } });
      }
    });

    // 서버 측 타임아웃 이벤트
    eventSource.addEventListener('timeout', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[DocumentStatusSSE] 서버 타임아웃:', data);

        hasReceivedResultRef.current = true;
        disconnect();
        onCompleteRef.current({ status: 'timeout', documentId: data.documentId });
      } catch (error) {
        console.error('[DocumentStatusSSE] timeout 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusSSE.timeout', payload: { documentId } });
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[DocumentStatusSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      errorReporter.reportApiError(new Error('DocumentStatusSSE 연결 오류'), { component: 'useDocumentStatusSSE.onerror', payload: { documentId, readyState: eventSource.readyState } });
      isConnectedRef.current = false;

      // 결과를 받지 않은 상태에서 오류 발생 시 콜백 호출
      if (!hasReceivedResultRef.current) {
        hasReceivedResultRef.current = true;
        disconnect();
        onCompleteRef.current({
          status: 'connection_error',
          documentId: documentId || '',
          error
        });
      }
    };
  }, [documentId, enabled, timeout, disconnect]);

  // documentId 변경 시 연결
  useEffect(() => {
    if (!documentId || !enabled) return;

    // 새 문서 ID로 연결 시 상태 초기화
    hasReceivedResultRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [documentId, enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}

export default useDocumentStatusSSE;

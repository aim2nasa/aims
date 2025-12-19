/**
 * Personal Files SSE 실시간 업데이트 훅
 * 폴링 방식을 SSE로 대체하여 실시간 파일 변경 감지
 * @since 2025-12-19
 */

import { useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface FileChangeEvent {
  type: 'created' | 'deleted' | 'renamed' | 'moved' | 'updated';
  itemId: string;
  itemName: string;
  itemType: 'file' | 'folder' | 'document';
  timestamp: string;
}

interface UsePersonalFilesSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 파일 변경 시 호출할 콜백 */
  onFileChange?: (event: FileChangeEvent) => void;
}

/**
 * Personal Files SSE 훅
 * @param userId 사용자 ID
 * @param onRefresh 파일 목록 새로고침 함수
 * @param options 옵션
 */
export function usePersonalFilesSSE(
  userId: string | null | undefined,
  onRefresh: () => void,
  options: UsePersonalFilesSSEOptions = {}
) {
  const { enabled = true, onFileChange } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh);
  const onFileChangeRef = useRef(onFileChange);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onFileChangeRef.current = onFileChange;
  }, [onFileChange]);

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
    if (!userId || !enabled) {
      return;
    }

    // 기존 연결 정리
    disconnect();

    const url = `${API_BASE_URL}/api/personal-files/stream?userId=${encodeURIComponent(userId)}`;

    if (import.meta.env.DEV) {
      console.log('[PersonalFilesSSE] 연결 시작...', { userId });
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (import.meta.env.DEV) {
          console.log('[PersonalFilesSSE] 연결됨:', data);
        }
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[PersonalFilesSSE] connected 이벤트 파싱 실패:', error);
      }
    });

    // 파일 변경 이벤트
    eventSource.addEventListener('file-change', (e) => {
      try {
        const data: FileChangeEvent = JSON.parse(e.data);
        if (import.meta.env.DEV) {
          console.log('[PersonalFilesSSE] 파일 변경:', data);
        }

        // ref를 통해 최신 콜백 호출
        onFileChangeRef.current?.(data);
        onRefreshRef.current();
      } catch (error) {
        console.error('[PersonalFilesSSE] file-change 이벤트 파싱 실패:', error);
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[PersonalFilesSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      isConnectedRef.current = false;
      eventSource.close();

      // 5초 후 재연결
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[PersonalFilesSSE] 재연결 시도...');
        }
        connect();
      }, 5000);
    };
  }, [userId, enabled, disconnect]);

  // Page Visibility API 처리 (탭 활성화 시 재연결)
  useEffect(() => {
    if (!userId || !enabled) return;

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
  }, [userId, enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    disconnect,
    reconnect: connect,
  };
}

export default usePersonalFilesSSE;

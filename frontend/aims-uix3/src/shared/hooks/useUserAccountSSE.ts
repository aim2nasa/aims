/**
 * User Account SSE 실시간 업데이트 훅
 * 관리자가 사용자 티어/스토리지 등을 변경할 때 실시간 알림 수신
 * @since 2025-12-29
 */

import { useEffect, useRef, useCallback } from 'react';
import { errorReporter } from '@/shared/lib/errorReporter';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || '';

interface TierChangedEvent {
  tier: string;
  quota_bytes: number;
  formatted_quota: string;
  timestamp: string;
}

interface UseUserAccountSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean;
  /** 티어 변경 시 호출할 콜백 */
  onTierChanged?: (event: TierChangedEvent) => void;
}

/**
 * User Account SSE 훅
 * @param userId 사용자 ID
 * @param onRefresh 스토리지 정보 새로고침 함수
 * @param options 옵션
 */
export function useUserAccountSSE(
  userId: string | null | undefined,
  onRefresh: () => void,
  options: UseUserAccountSSEOptions = {}
) {
  const { enabled = true, onTierChanged } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh);
  const onTierChangedRef = useRef(onTierChanged);

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    onTierChangedRef.current = onTierChanged;
  }, [onTierChanged]);

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

  // SSE 연결 함수
  const connect = useCallback(() => {
    console.log('[UserAccountSSE] connect 호출', { userId, enabled });

    if (!userId || !enabled) {
      console.log('[UserAccountSSE] 연결 건너뜀 - userId 또는 enabled 조건 불충족');
      return;
    }

    // 기존 연결 정리
    disconnect();

    const url = `${API_BASE_URL}/api/user/account/stream?userId=${encodeURIComponent(userId)}`;
    console.log('[UserAccountSSE] 연결 시작...', { userId, url });

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // 연결 성공
    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[UserAccountSSE] 연결됨:', data);
        isConnectedRef.current = true;
      } catch (error) {
        console.error('[UserAccountSSE] connected 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useUserAccountSSE.connected', payload: { userId } });
      }
    });

    // 티어 변경 이벤트
    eventSource.addEventListener('tier-changed', (e) => {
      try {
        const data: TierChangedEvent = JSON.parse(e.data);
        console.log('[UserAccountSSE] 티어 변경 이벤트 수신:', data);

        // ref를 통해 최신 콜백 호출
        onTierChangedRef.current?.(data);
        console.log('[UserAccountSSE] onRefresh 호출 시작');
        onRefreshRef.current();
        console.log('[UserAccountSSE] onRefresh 호출 완료');
      } catch (error) {
        console.error('[UserAccountSSE] tier-changed 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useUserAccountSSE.tierChanged', payload: { userId } });
      }
    });

    // ping 이벤트 (keep-alive)
    eventSource.addEventListener('ping', () => {
      // keep-alive, 무시
    });

    // 연결 오류 처리
    eventSource.onerror = (error) => {
      console.error('[UserAccountSSE] 연결 오류:', error, 'readyState:', eventSource.readyState);
      errorReporter.reportApiError(new Error('UserAccountSSE 연결 오류'), { component: 'useUserAccountSSE.onerror', payload: { userId, readyState: eventSource.readyState } });
      isConnectedRef.current = false;
      eventSource.close();

      // 10초 후 재연결 (계정 정보는 빈번하지 않으므로 더 긴 간격)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (import.meta.env.DEV) {
          console.log('[UserAccountSSE] 재연결 시도...');
        }
        connect();
      }, 10000);
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

export default useUserAccountSSE;

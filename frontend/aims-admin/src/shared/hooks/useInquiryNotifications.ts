/**
 * 문의 알림 관리 훅 (관리자용)
 * SSE를 통한 실시간 알림 수신 및 읽음 상태 관리
 * @since 2025-12-18
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getUnreadCount,
  getUnreadIds,
  markAsRead as markAsReadApi,
  getNotificationStreamUrl,
} from '@/features/inquiries/api';

interface InquiryNotificationData {
  inquiryId: string;
  userId?: string;
  userName?: string;
}

interface UseInquiryNotificationsReturn {
  /** 미확인 문의 개수 */
  unreadCount: number;
  /** 미확인 문의 ID Set */
  unreadIds: Set<string>;
  /** 특정 문의가 미확인인지 확인 */
  isUnread: (inquiryId: string) => boolean;
  /** 문의 읽음 처리 */
  markAsRead: (inquiryId: string) => Promise<void>;
  /** SSE 연결 상태 */
  isConnected: boolean;
  /** 데이터 새로고침 */
  refresh: () => Promise<void>;
}

/**
 * 문의 알림 관리 훅 (관리자용)
 * @param enabled SSE 연결 활성화 여부 (로그인 상태에서만 true)
 */
export function useInquiryNotifications(enabled: boolean = true): UseInquiryNotificationsReturn {
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 초기 데이터 로드
  const loadInitialData = useCallback(async () => {
    try {
      const [count, ids] = await Promise.all([
        getUnreadCount(),
        getUnreadIds(),
      ]);
      setUnreadCount(count);
      setUnreadIds(new Set(ids));
    } catch (error) {
      console.error('[AdminInquiryNotifications] 초기 데이터 로드 실패:', error);
    }
  }, []);

  // SSE 연결 설정
  const connectSSE = useCallback(() => {
    if (!enabled) return;

    // 기존 연결 정리
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getNotificationStreamUrl();
    if (!url.includes('token=')) {
      console.log('[AdminInquiryNotifications] 토큰이 없어 SSE 연결을 건너뜁니다.');
      return;
    }

    console.log('[AdminInquiryNotifications] SSE 연결 시작...');
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      console.log('[AdminInquiryNotifications] SSE 연결됨');
      setIsConnected(true);
    });

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setUnreadCount(data.count);
        setUnreadIds(new Set(data.ids));
        console.log('[AdminInquiryNotifications] 초기 데이터 수신:', data);
      } catch (error) {
        console.error('[AdminInquiryNotifications] init 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('new-inquiry', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[AdminInquiryNotifications] 새 문의 알림:', data);

        // 미확인 목록에 추가
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.add(data.inquiryId);
          return next;
        });
        setUnreadCount((prev) => prev + 1);

        // React Query 캐시 무효화 (목록 자동 갱신)
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
      } catch (error) {
        console.error('[AdminInquiryNotifications] new-inquiry 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('new-message', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[AdminInquiryNotifications] 새 메시지 알림:', data);

        // 미확인 목록에 추가
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.add(data.inquiryId);
          return next;
        });
        setUnreadCount((prev) => prev + 1);

        // React Query 캐시 무효화 (목록 및 상세 자동 갱신)
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry', data.inquiryId] });
      } catch (error) {
        console.error('[AdminInquiryNotifications] new-message 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('ping', () => {
      // Keep-alive, 무시
    });

    eventSource.onerror = (error) => {
      console.error('[AdminInquiryNotifications] SSE 오류:', error);
      setIsConnected(false);
      eventSource.close();

      // 5초 후 재연결 시도
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[AdminInquiryNotifications] SSE 재연결 시도...');
        connectSSE();
      }, 5000);
    };
  }, [enabled, queryClient]);

  // 문의 읽음 처리
  const markAsRead = useCallback(async (inquiryId: string) => {
    try {
      await markAsReadApi(inquiryId);

      // 로컬 상태 업데이트
      setUnreadIds((prev) => {
        const next = new Set(prev);
        if (next.has(inquiryId)) {
          next.delete(inquiryId);
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return next;
      });
    } catch (error) {
      console.error('[AdminInquiryNotifications] 읽음 처리 실패:', error);
    }
  }, []);

  // 특정 문의가 미확인인지 확인
  const isUnread = useCallback((inquiryId: string) => {
    return unreadIds.has(inquiryId);
  }, [unreadIds]);

  // 데이터 새로고침
  const refresh = useCallback(async () => {
    await loadInitialData();
  }, [loadInitialData]);

  // SSE 연결 관리
  useEffect(() => {
    if (enabled) {
      // 먼저 REST API로 초기 데이터 로드
      loadInitialData();
      // SSE 연결 시작
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, loadInitialData, connectSSE]);

  return {
    unreadCount,
    unreadIds,
    isUnread,
    markAsRead,
    isConnected,
    refresh,
  };
}

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
import { errorReporter } from '@/shared/lib/errorReporter';

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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initReceivedRef = useRef(false); // init 이벤트 수신 여부
  const processedEventIdsRef = useRef<Set<string>>(new Set()); // 처리된 이벤트 ID 추적

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
      errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.loadInitialData' });
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
    initReceivedRef.current = false; // 연결 시 초기화

    eventSource.addEventListener('connected', () => {
      console.log('[AdminInquiryNotifications] SSE 연결됨');
      setIsConnected(true);
    });

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setUnreadCount(data.count);
        setUnreadIds(new Set(data.ids));
        // 처리된 이벤트 ID 초기화 (init에서 받은 ID들은 이미 처리된 것으로 표시)
        processedEventIdsRef.current = new Set(data.ids);
        initReceivedRef.current = true; // init 수신 완료
        console.log('[AdminInquiryNotifications] 초기 데이터 수신:', data);
      } catch (error) {
        console.error('[AdminInquiryNotifications] init 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.init' });
      }
    });

    eventSource.addEventListener('new-inquiry', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[AdminInquiryNotifications] 새 문의 알림:', data);

        // init 이벤트 수신 전이면 무시 (init에서 최신 상태를 받으므로)
        if (!initReceivedRef.current) {
          console.log('[AdminInquiryNotifications] init 전 이벤트 무시');
          return;
        }

        // 이미 처리된 이벤트면 무시 (중복 방지)
        if (processedEventIdsRef.current.has(data.inquiryId)) {
          console.log('[AdminInquiryNotifications] 이미 처리된 이벤트 무시:', data.inquiryId);
          return;
        }
        // 처리됨으로 표시
        processedEventIdsRef.current.add(data.inquiryId);

        // 미확인 목록에 추가 및 카운트 증가
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.add(data.inquiryId);
          return next;
        });
        setUnreadCount((c) => c + 1);

        // React Query 캐시 무효화 (목록 자동 갱신)
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
      } catch (error) {
        console.error('[AdminInquiryNotifications] new-inquiry 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.new-inquiry' });
      }
    });

    eventSource.addEventListener('new-message', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[AdminInquiryNotifications] 새 메시지 알림:', data);

        // init 이벤트 수신 전이면 무시 (init에서 최신 상태를 받으므로)
        if (!initReceivedRef.current) {
          console.log('[AdminInquiryNotifications] init 전 이벤트 무시');
          return;
        }

        // 이미 처리된 이벤트면 무시 (중복 방지)
        if (processedEventIdsRef.current.has(data.inquiryId)) {
          console.log('[AdminInquiryNotifications] 이미 처리된 이벤트 무시:', data.inquiryId);
          return;
        }
        // 처리됨으로 표시
        processedEventIdsRef.current.add(data.inquiryId);

        // 미확인 목록에 추가 및 카운트 증가
        setUnreadIds((prev) => {
          const next = new Set(prev);
          next.add(data.inquiryId);
          return next;
        });
        setUnreadCount((c) => c + 1);

        // React Query 캐시 무효화 (목록 및 상세 자동 갱신)
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiries'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'inquiry', data.inquiryId] });
      } catch (error) {
        console.error('[AdminInquiryNotifications] new-message 이벤트 파싱 실패:', error);
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.new-message' });
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
    // 이미 읽음 처리된 경우 무시 (중복 호출 방지)
    if (!processedEventIdsRef.current.has(inquiryId)) {
      console.log('[AdminInquiryNotifications] 이미 읽음 처리됨:', inquiryId);
      return;
    }

    // 즉시 처리됨으로 표시 (await 전에 삭제해야 중복 호출 방지)
    processedEventIdsRef.current.delete(inquiryId);

    // 로컬 상태 먼저 업데이트 (낙관적 업데이트)
    setUnreadIds((prev) => {
      const next = new Set(prev);
      next.delete(inquiryId);
      return next;
    });
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await markAsReadApi(inquiryId);
    } catch (error) {
      // API 실패 시 상태 복구
      processedEventIdsRef.current.add(inquiryId);
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.add(inquiryId);
        return next;
      });
      setUnreadCount((c) => c + 1);
      console.error('[AdminInquiryNotifications] 읽음 처리 실패:', error);
      errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.markAsRead' });
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
      // SSE 연결만 시작 (init 이벤트에서 초기 데이터 수신)
      // loadInitialData()를 함께 호출하면 타이밍 이슈로 count 중복 발생
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
  }, [enabled, connectSSE]);

  return {
    unreadCount,
    unreadIds,
    isUnread,
    markAsRead,
    isConnected,
    refresh,
  };
}

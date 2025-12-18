/**
 * 문의 알림 관리 훅
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
} from '@/entities/inquiry/api';

interface InquiryNotificationData {
  inquiryId: string;
  messageId?: string;
  title?: string;
  status?: string;
  previousStatus?: string;
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
 * 문의 알림 관리 훅 (카카오톡 스타일)
 * @param enabled SSE 연결 활성화 여부 (로그인 상태에서만 true)
 * @param currentViewingInquiryId 현재 보고 있는 문의 ID (열려있는 채팅방)
 */
export function useInquiryNotifications(
  enabled: boolean = true,
  currentViewingInquiryId: string | null = null
): UseInquiryNotificationsReturn {
  const queryClient = useQueryClient();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initReceivedRef = useRef(false);
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // 현재 보고 있는 문의 ID를 ref로 추적 (SSE 핸들러에서 사용)
  const currentViewingInquiryIdRef = useRef<string | null>(currentViewingInquiryId);
  useEffect(() => {
    currentViewingInquiryIdRef.current = currentViewingInquiryId;
  }, [currentViewingInquiryId]);

  // 초기 데이터 로드 (수동 새로고침용)
  const loadInitialData = useCallback(async () => {
    try {
      const [count, ids] = await Promise.all([
        getUnreadCount(),
        getUnreadIds(),
      ]);
      setUnreadCount(count);
      setUnreadIds(new Set(ids));
    } catch (error) {
      console.error('[InquiryNotifications] 초기 데이터 로드 실패:', error);
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
      console.log('[InquiryNotifications] 토큰이 없어 SSE 연결을 건너뜁니다.');
      return;
    }

    console.log('[InquiryNotifications] SSE 연결 시작...');
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    initReceivedRef.current = false;

    eventSource.addEventListener('connected', () => {
      console.log('[InquiryNotifications] SSE 연결됨');
      setIsConnected(true);
    });

    eventSource.addEventListener('init', (e) => {
      try {
        const data = JSON.parse(e.data);
        setUnreadCount(data.count);
        setUnreadIds(new Set(data.ids));
        processedEventIdsRef.current = new Set(data.ids);
        initReceivedRef.current = true;
        console.log('[InquiryNotifications] 초기 데이터 수신:', data);
      } catch (error) {
        console.error('[InquiryNotifications] init 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('new-message', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[InquiryNotifications] 새 메시지 알림:', data);

        if (!initReceivedRef.current) {
          console.log('[InquiryNotifications] init 전 이벤트 무시');
          return;
        }

        // messageId로 중복 체크 (같은 문의의 다른 메시지는 허용)
        const eventKey = data.messageId || data.inquiryId;
        if (processedEventIdsRef.current.has(eventKey)) {
          console.log('[InquiryNotifications] 이미 처리된 이벤트 무시:', eventKey);
          return;
        }
        processedEventIdsRef.current.add(eventKey);

        // 카카오톡 스타일: 현재 보고 있는 문의면 카운트 증가 안함 + 즉시 읽음 처리
        const isCurrentlyViewing = currentViewingInquiryIdRef.current === data.inquiryId;
        if (isCurrentlyViewing) {
          console.log('[InquiryNotifications] 현재 보고 있는 문의 - 즉시 읽음 처리');
          // 서버에 읽음 처리 요청 (카운트 증가 안함)
          markAsReadApi(data.inquiryId).catch((err) => {
            console.error('[InquiryNotifications] 자동 읽음 처리 실패:', err);
          });
        } else {
          // 다른 문의면 카운트 증가
          setUnreadIds((prev) => {
            const next = new Set(prev);
            next.add(data.inquiryId);
            return next;
          });
          setUnreadCount((c) => c + 1);
        }

        // 쿼리 리셋 (메시지 목록 갱신) - reset으로 캐시 완전 초기화 후 재요청
        console.log('[InquiryNotifications] 쿼리 리셋 시작:', data.inquiryId);
        queryClient.resetQueries({ queryKey: ['inquiry', data.inquiryId] })
          .then(() => console.log('[InquiryNotifications] 쿼리 리셋 완료'))
          .catch((err) => console.error('[InquiryNotifications] 쿼리 리셋 실패:', err));
        queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      } catch (error) {
        console.error('[InquiryNotifications] new-message 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('status-changed', (e) => {
      try {
        const data: InquiryNotificationData = JSON.parse(e.data);
        console.log('[InquiryNotifications] 상태 변경 알림:', data);
        queryClient.resetQueries({ queryKey: ['inquiry', data.inquiryId] });
        queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      } catch (error) {
        console.error('[InquiryNotifications] status-changed 이벤트 파싱 실패:', error);
      }
    });

    eventSource.addEventListener('ping', () => {});

    eventSource.onerror = (error) => {
      console.error('[InquiryNotifications] SSE 오류:', error);
      setIsConnected(false);
      eventSource.close();

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[InquiryNotifications] SSE 재연결 시도...');
        connectSSE();
      }, 5000);
    };
  }, [enabled, queryClient]);

  // unreadIds를 ref로도 추적 (markAsRead 의존성 제거를 위해)
  const unreadIdsRef = useRef<Set<string>>(unreadIds);
  useEffect(() => {
    unreadIdsRef.current = unreadIds;
  }, [unreadIds]);

  // 문의 읽음 처리
  // 주의: 의존성에 unreadIds를 넣으면 init 이벤트 수신 시 함수가 새로 생성되어
  // InquiryView의 useEffect가 재실행되고 즉시 읽음 처리가 됨
  const markAsRead = useCallback(async (inquiryId: string) => {
    // 이미 읽은 문의면 무시 (ref 사용으로 의존성 제거)
    if (!unreadIdsRef.current.has(inquiryId)) {
      console.log('[InquiryNotifications] 이미 읽음 처리됨:', inquiryId);
      return;
    }

    // 낙관적 업데이트: unreadIds에서 제거
    setUnreadIds((prev) => {
      const next = new Set(prev);
      next.delete(inquiryId);
      return next;
    });

    try {
      await markAsReadApi(inquiryId);
      // 읽음 처리 성공 후 서버에서 정확한 count 가져오기
      const newCount = await getUnreadCount();
      setUnreadCount(newCount);
    } catch (error) {
      // 실패 시 unreadIds 복구
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.add(inquiryId);
        return next;
      });
      console.error('[InquiryNotifications] 읽음 처리 실패:', error);
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

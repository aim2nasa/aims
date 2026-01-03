/**
 * 문의 알림 관리 훅
 * SharedWorker 기반 SSE로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getUnreadCount,
  getUnreadIds,
  markAsRead as markAsReadApi,
  getNotificationStreamUrl,
} from '@/entities/inquiry/api'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface InquiryNotificationData {
  inquiryId: string
  messageId?: string
  title?: string
  status?: string
  previousStatus?: string
  count?: number
  ids?: string[]
}

interface UseInquiryNotificationsReturn {
  /** 미확인 문의 개수 */
  unreadCount: number
  /** 미확인 문의 ID Set */
  unreadIds: Set<string>
  /** 특정 문의가 미확인인지 확인 */
  isUnread: (inquiryId: string) => boolean
  /** 문의 읽음 처리 */
  markAsRead: (inquiryId: string) => Promise<void>
  /** SSE 연결 상태 */
  isConnected: boolean
  /** 데이터 새로고침 */
  refresh: () => Promise<void>
}

/**
 * 문의 알림 관리 훅 (카카오톡 스타일)
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param enabled SSE 연결 활성화 여부 (로그인 상태에서만 true)
 * @param currentViewingInquiryId 현재 보고 있는 문의 ID (열려있는 채팅방)
 */
export function useInquiryNotifications(
  enabled: boolean = true,
  currentViewingInquiryId: string | null = null
): UseInquiryNotificationsReturn {
  const queryClient = useQueryClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set())
  const initReceivedRef = useRef(false)
  const processedEventIdsRef = useRef<Set<string>>(new Set())

  // 현재 보고 있는 문의 ID를 ref로 추적 (SSE 핸들러에서 사용)
  const currentViewingInquiryIdRef = useRef<string | null>(currentViewingInquiryId)
  useEffect(() => {
    currentViewingInquiryIdRef.current = currentViewingInquiryId
  }, [currentViewingInquiryId])

  // 초기 데이터 로드 (수동 새로고침용)
  const loadInitialData = useCallback(async () => {
    try {
      const [count, ids] = await Promise.all([
        getUnreadCount(),
        getUnreadIds(),
      ])
      setUnreadCount(count)
      setUnreadIds(new Set(ids))
    } catch (error) {
      console.error('[InquiryNotifications] 초기 데이터 로드 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.loadInitialData' })
    }
  }, [])

  // unreadIds를 ref로도 추적 (markAsRead 의존성 제거를 위해)
  const unreadIdsRef = useRef<Set<string>>(unreadIds)
  useEffect(() => {
    unreadIdsRef.current = unreadIds
  }, [unreadIds])

  // SSE 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    const eventData = data as InquiryNotificationData

    if (eventType === 'init') {
      try {
        setUnreadCount(eventData.count || 0)
        setUnreadIds(new Set(eventData.ids || []))
        processedEventIdsRef.current = new Set(eventData.ids || [])
        initReceivedRef.current = true
        console.log('[InquiryNotifications] 초기 데이터 수신:', eventData)
      } catch (error) {
        console.error('[InquiryNotifications] init 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.initEvent' })
      }
    } else if (eventType === 'new-message') {
      try {
        console.log('[InquiryNotifications] 새 메시지 알림:', eventData)

        if (!initReceivedRef.current) {
          console.log('[InquiryNotifications] init 전 이벤트 무시')
          return
        }

        // messageId로 중복 체크 (같은 문의의 다른 메시지는 허용)
        const eventKey = eventData.messageId || eventData.inquiryId
        if (processedEventIdsRef.current.has(eventKey)) {
          console.log('[InquiryNotifications] 이미 처리된 이벤트 무시:', eventKey)
          return
        }
        processedEventIdsRef.current.add(eventKey)

        // 카카오톡 스타일: 현재 보고 있는 문의면 카운트 증가 안함 + 즉시 읽음 처리
        const isCurrentlyViewing = currentViewingInquiryIdRef.current === eventData.inquiryId
        if (isCurrentlyViewing) {
          console.log('[InquiryNotifications] 현재 보고 있는 문의 - 즉시 읽음 처리')
          // 서버에 읽음 처리 요청 (카운트 증가 안함)
          markAsReadApi(eventData.inquiryId).catch((err) => {
            console.error('[InquiryNotifications] 자동 읽음 처리 실패:', err)
            errorReporter.reportApiError(err as Error, { component: 'useInquiryNotifications.autoMarkAsRead' })
          })
        } else {
          // 다른 문의면 카운트 증가
          setUnreadIds((prev) => {
            const next = new Set(prev)
            next.add(eventData.inquiryId)
            return next
          })
          setUnreadCount((c) => c + 1)
        }

        // 쿼리 리셋 (메시지 목록 갱신) - reset으로 캐시 완전 초기화 후 재요청
        console.log('[InquiryNotifications] 쿼리 리셋 시작:', eventData.inquiryId)
        queryClient.resetQueries({ queryKey: ['inquiry', eventData.inquiryId] })
          .then(() => console.log('[InquiryNotifications] 쿼리 리셋 완료'))
          .catch((err) => {
            console.error('[InquiryNotifications] 쿼리 리셋 실패:', err)
            errorReporter.reportApiError(err as Error, { component: 'useInquiryNotifications.queryReset' })
          })
        queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      } catch (error) {
        console.error('[InquiryNotifications] new-message 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.newMessageEvent' })
      }
    } else if (eventType === 'status-changed') {
      try {
        console.log('[InquiryNotifications] 상태 변경 알림:', eventData)
        queryClient.resetQueries({ queryKey: ['inquiry', eventData.inquiryId] })
        queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      } catch (error) {
        console.error('[InquiryNotifications] status-changed 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.statusChangedEvent' })
      }
    }
  }, [queryClient])

  // 연결 성공 핸들러
  const handleConnect = useCallback(() => {
    console.log('[InquiryNotifications] SSE 연결됨')
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[InquiryNotifications] SSE 오류:', error)
    errorReporter.reportApiError(error, { component: 'useInquiryNotifications.sseError' })
  }, [])

  // 엔드포인트 URL에서 경로만 추출
  const getEndpointPath = useCallback(() => {
    const fullUrl = getNotificationStreamUrl()
    // URL 파싱하여 경로만 추출
    try {
      const url = new URL(fullUrl, window.location.origin)
      return url.pathname
    } catch {
      return '/api/inquiries/notifications/stream'
    }
  }, [])

  // SharedWorker 기반 SSE 구독
  const { isConnected } = useSSESubscription<InquiryNotificationData>({
    streamKey: 'inquiry:notifications',
    endpoint: getEndpointPath(),
    enabled,
    onEvent: handleEvent,
    onConnect: handleConnect,
    onError: handleError
  })

  // 문의 읽음 처리
  // 주의: 의존성에 unreadIds를 넣으면 init 이벤트 수신 시 함수가 새로 생성되어
  // InquiryView의 useEffect가 재실행되고 즉시 읽음 처리가 됨
  const markAsRead = useCallback(async (inquiryId: string) => {
    // 이미 읽은 문의면 무시 (ref 사용으로 의존성 제거)
    if (!unreadIdsRef.current.has(inquiryId)) {
      console.log('[InquiryNotifications] 이미 읽음 처리됨:', inquiryId)
      return
    }

    // 낙관적 업데이트: unreadIds에서 제거
    setUnreadIds((prev) => {
      const next = new Set(prev)
      next.delete(inquiryId)
      return next
    })

    try {
      await markAsReadApi(inquiryId)
      // 읽음 처리 성공 후 서버에서 정확한 count 가져오기
      const newCount = await getUnreadCount()
      setUnreadCount(newCount)
    } catch (error) {
      // 실패 시 unreadIds 복구
      setUnreadIds((prev) => {
        const next = new Set(prev)
        next.add(inquiryId)
        return next
      })
      console.error('[InquiryNotifications] 읽음 처리 실패:', error)
      errorReporter.reportApiError(error as Error, { component: 'useInquiryNotifications.markAsRead' })
    }
  }, [])

  // 특정 문의가 미확인인지 확인
  const isUnread = useCallback((inquiryId: string) => {
    return unreadIds.has(inquiryId)
  }, [unreadIds])

  // 데이터 새로고침
  const refresh = useCallback(async () => {
    await loadInitialData()
  }, [loadInitialData])

  return {
    unreadCount,
    unreadIds,
    isUnread,
    markAsRead,
    isConnected,
    refresh,
  }
}

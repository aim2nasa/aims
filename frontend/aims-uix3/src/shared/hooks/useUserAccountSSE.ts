/**
 * User Account SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface TierChangedEvent {
  tier: string
  quota_bytes: number
  formatted_quota: string
  timestamp: string
}

interface UseUserAccountSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 티어 변경 시 호출할 콜백 */
  onTierChanged?: (event: TierChangedEvent) => void
}

/**
 * User Account SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param userId 사용자 ID
 * @param onRefresh 스토리지 정보 새로고침 함수
 * @param options 옵션
 */
export function useUserAccountSSE(
  userId: string | null | undefined,
  onRefresh: () => void,
  options: UseUserAccountSSEOptions = {}
) {
  const { enabled = true, onTierChanged } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onTierChangedRef = useRef(onTierChanged)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onTierChangedRef.current = onTierChanged
  }, [onTierChanged])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'tier-changed') {
      try {
        const eventData = data as TierChangedEvent
        console.log('[UserAccountSSE] 티어 변경 이벤트 수신:', eventData)

        // ref를 통해 최신 콜백 호출
        onTierChangedRef.current?.(eventData)
        console.log('[UserAccountSSE] onRefresh 호출 시작')
        onRefreshRef.current()
        console.log('[UserAccountSSE] onRefresh 호출 완료')
      } catch (error) {
        console.error('[UserAccountSSE] tier-changed 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useUserAccountSSE.tierChanged', payload: { userId } })
      }
    }
  }, [userId])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    console.log('[UserAccountSSE] 연결됨:', data)
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[UserAccountSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'useUserAccountSSE.onerror', payload: { userId } })
  }, [userId])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<TierChangedEvent>({
    streamKey: userId ? `user:account:${userId}` : '',
    endpoint: '/api/user/account/stream',
    params: userId ? { userId } : {},
    enabled: enabled && !!userId,
    onEvent: handleEvent,
    onConnect: handleConnect,
    onError: handleError
  })

  return {
    isConnected,
    disconnect,
    reconnect,
  }
}


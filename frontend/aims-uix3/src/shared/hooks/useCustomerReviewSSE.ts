/**
 * Customer Review SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface CRChangeEvent {
  type: 'parsing-complete' | 'parsing-error' | 'retry-started' | 'status-change'
  fileId?: string
  status?: string
  errorMessage?: string
  processingCount?: number
  timestamp: string
}

interface UseCustomerReviewSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** CR 상태 변경 시 호출할 콜백 */
  onCRChange?: (event: CRChangeEvent) => void
}

/**
 * Customer Review SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param customerId 고객 ID
 * @param onRefresh CR 목록 새로고침 함수
 * @param options 옵션
 */
export function useCustomerReviewSSE(
  customerId: string | null | undefined,
  onRefresh: () => void,
  options: UseCustomerReviewSSEOptions = {}
) {
  const { enabled = true, onCRChange } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onCRChangeRef = useRef(onCRChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onCRChangeRef.current = onCRChange
  }, [onCRChange])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'cr-change') {
      try {
        const eventData = data as CRChangeEvent
        console.log('[CustomerReviewSSE] CR 상태 변경:', eventData)

        // ref를 통해 최신 콜백 호출
        onCRChangeRef.current?.(eventData)
        onRefreshRef.current()
      } catch (error) {
        console.error('[CustomerReviewSSE] cr-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useCustomerReviewSSE.crChange' })
      }
    }
  }, [])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    console.log('[CustomerReviewSSE] 연결됨:', data)
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[CustomerReviewSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'useCustomerReviewSSE.onerror' })
  }, [])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<CRChangeEvent>({
    streamKey: customerId ? `customer:${customerId}:reviews` : '',
    endpoint: customerId ? `/api/customers/${customerId}/customer-reviews/stream` : '',
    enabled: enabled && !!customerId,
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

export default useCustomerReviewSSE

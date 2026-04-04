/**
 * Annual Report SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface ARChangeEvent {
  type: 'parsing-complete' | 'parsing-error' | 'retry-started' | 'status-change'
  fileId?: string
  status?: string
  errorMessage?: string
  timestamp: string
}

interface UseAnnualReportSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** AR 상태 변경 시 호출할 콜백 */
  onARChange?: (event: ARChangeEvent) => void
}

/**
 * Annual Report SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param customerId 고객 ID
 * @param onRefresh AR 목록 새로고침 함수
 * @param options 옵션
 */
export function useAnnualReportSSE(
  customerId: string | null | undefined,
  onRefresh: () => void,
  options: UseAnnualReportSSEOptions = {}
) {
  const { enabled = true, onARChange } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onARChangeRef = useRef(onARChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onARChangeRef.current = onARChange
  }, [onARChange])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    // 🔍 DEBUG: 모든 이벤트 수신 로깅
    console.log(`[AnnualReportSSE] 📥 이벤트 수신 - eventType: ${eventType}, data:`, data)

    if (eventType === 'ar-change') {
      try {
        const eventData = data as ARChangeEvent
        console.log('[AnnualReportSSE] 🎯 AR 상태 변경:', eventData)

        // ref를 통해 최신 콜백 호출
        onARChangeRef.current?.(eventData)
        onRefreshRef.current()
      } catch (error) {
        console.error('[AnnualReportSSE] ar-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useAnnualReportSSE.arChange' })
      }
    } else {
      console.log(`[AnnualReportSSE] ⚠️ 처리되지 않은 이벤트 타입: ${eventType}`)
    }
  }, [])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    console.log('[AnnualReportSSE] 연결됨:', data)
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[AnnualReportSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'useAnnualReportSSE.onerror' })
  }, [])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<ARChangeEvent>({
    streamKey: customerId ? `customer:${customerId}:annual-reports` : '',
    endpoint: customerId ? `/api/customers/${customerId}/annual-reports/stream` : '',
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


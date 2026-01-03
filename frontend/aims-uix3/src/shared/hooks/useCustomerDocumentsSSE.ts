/**
 * 고객 문서 SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface DocumentChangeEvent {
  type: 'linked' | 'unlinked'
  customerId: string
  documentId: string
  documentName: string
  timestamp: string
}

interface DocumentStatusChangeEvent {
  type: 'conversion' | 'processing'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error' | 'done'
  customerId: string
  documentId: string
  documentName: string
  timestamp: string
}

interface UseCustomerDocumentsSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 문서 연결/해제 시 호출할 콜백 */
  onDocumentChange?: (event: DocumentChangeEvent) => void
  /** 문서 처리 상태 변경 시 호출할 콜백 */
  onDocumentStatusChange?: (event: DocumentStatusChangeEvent) => void
}

/**
 * 고객 문서 SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param customerId 고객 ID
 * @param onRefresh 문서 목록 새로고침 함수
 * @param options 옵션
 */
export function useCustomerDocumentsSSE(
  customerId: string | null | undefined,
  onRefresh: () => void,
  options: UseCustomerDocumentsSSEOptions = {}
) {
  const { enabled = true, onDocumentChange, onDocumentStatusChange } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onDocumentChangeRef = useRef(onDocumentChange)
  const onDocumentStatusChangeRef = useRef(onDocumentStatusChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  }, [onDocumentChange])

  useEffect(() => {
    onDocumentStatusChangeRef.current = onDocumentStatusChange
  }, [onDocumentStatusChange])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'document-change') {
      try {
        const eventData = data as DocumentChangeEvent
        console.log('[CustomerDocumentsSSE] 문서 변경:', eventData)

        // ref를 통해 최신 콜백 호출
        onDocumentChangeRef.current?.(eventData)
        onRefreshRef.current()
      } catch (error) {
        console.error('[CustomerDocumentsSSE] document-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useCustomerDocumentsSSE.documentChange', payload: { customerId } })
      }
    } else if (eventType === 'document-status-change') {
      try {
        const eventData = data as DocumentStatusChangeEvent
        console.log('[CustomerDocumentsSSE] 문서 처리 상태 변경:', eventData)

        // ref를 통해 최신 콜백 호출
        onDocumentStatusChangeRef.current?.(eventData)
        // 상태 변경 시 목록 새로고침
        onRefreshRef.current()
      } catch (error) {
        console.error('[CustomerDocumentsSSE] document-status-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useCustomerDocumentsSSE.documentStatusChange', payload: { customerId } })
      }
    }
  }, [customerId])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    console.log('[CustomerDocumentsSSE] 연결됨:', data)
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[CustomerDocumentsSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'useCustomerDocumentsSSE.onerror', payload: { customerId } })
  }, [customerId])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription({
    streamKey: customerId ? `customer:${customerId}:documents` : '',
    endpoint: customerId ? `/api/customers/${customerId}/documents/stream` : '',
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

export default useCustomerDocumentsSSE

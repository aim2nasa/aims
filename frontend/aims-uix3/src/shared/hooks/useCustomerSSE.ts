/**
 * 고객 통합 SSE 실시간 업데이트 훅
 * HTTP/1.1 동시 연결 제한 문제 해결을 위해 documents, AR, CR SSE를 1개로 통합
 * 기존 3개 SSE (documents/stream, annual-reports/stream, customer-reviews/stream)를
 * 1개 SSE (/stream)로 통합하여 연결 수를 5개 → 3개로 감소
 * @since 2025-01-13
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

// 문서 변경 이벤트
interface DocumentChangeEvent {
  type: 'linked' | 'unlinked'
  customerId: string
  documentId: string
  documentName: string
  timestamp: string
}

// 문서 상태 변경 이벤트
interface DocumentStatusChangeEvent {
  type: 'conversion' | 'processing'
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'error' | 'done'
  customerId: string
  documentId: string
  documentName: string
  timestamp: string
}

// Annual Report 변경 이벤트
interface ARChangeEvent {
  type: 'parsing-complete' | 'parsing-error' | 'retry-started' | 'status-change'
  fileId?: string
  status?: string
  errorMessage?: string
  timestamp: string
}

// Customer Review 변경 이벤트
interface CRChangeEvent {
  type: 'parsing-complete' | 'parsing-error' | 'retry-started' | 'status-change'
  fileId?: string
  status?: string
  errorMessage?: string
  processingCount?: number
  timestamp: string
}

interface UseCustomerSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 문서 연결/해제 시 호출할 콜백 */
  onDocumentChange?: (event: DocumentChangeEvent) => void
  /** 문서 처리 상태 변경 시 호출할 콜백 */
  onDocumentStatusChange?: (event: DocumentStatusChangeEvent) => void
  /** AR 상태 변경 시 호출할 콜백 */
  onARChange?: (event: ARChangeEvent) => void
  /** CR 상태 변경 시 호출할 콜백 */
  onCRChange?: (event: CRChangeEvent) => void
}

interface UseCustomerSSEHandlers {
  /** 문서 목록 새로고침 */
  onRefreshDocuments?: () => void
  /** AR 목록 새로고침 */
  onRefreshAR?: () => void
  /** CR 목록 새로고침 */
  onRefreshCR?: () => void
}

/**
 * 고객 통합 SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * 기존 3개의 개별 SSE 훅을 1개로 통합
 *
 * @param customerId 고객 ID
 * @param handlers 새로고침 핸들러들
 * @param options 옵션
 *
 * @example
 * ```tsx
 * useCustomerSSE(customerId, {
 *   onRefreshDocuments: loadDocuments,
 *   onRefreshAR: loadAnnualReports,
 *   onRefreshCR: loadCustomerReviews
 * })
 * ```
 */
export function useCustomerSSE(
  customerId: string | null | undefined,
  handlers: UseCustomerSSEHandlers = {},
  options: UseCustomerSSEOptions = {}
) {
  const {
    enabled = true,
    onDocumentChange,
    onDocumentStatusChange,
    onARChange,
    onCRChange
  } = options

  const {
    onRefreshDocuments,
    onRefreshAR,
    onRefreshCR
  } = handlers

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshDocumentsRef = useRef(onRefreshDocuments)
  const onRefreshARRef = useRef(onRefreshAR)
  const onRefreshCRRef = useRef(onRefreshCR)
  const onDocumentChangeRef = useRef(onDocumentChange)
  const onDocumentStatusChangeRef = useRef(onDocumentStatusChange)
  const onARChangeRef = useRef(onARChange)
  const onCRChangeRef = useRef(onCRChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshDocumentsRef.current = onRefreshDocuments
  }, [onRefreshDocuments])

  useEffect(() => {
    onRefreshARRef.current = onRefreshAR
  }, [onRefreshAR])

  useEffect(() => {
    onRefreshCRRef.current = onRefreshCR
  }, [onRefreshCR])

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  }, [onDocumentChange])

  useEffect(() => {
    onDocumentStatusChangeRef.current = onDocumentStatusChange
  }, [onDocumentStatusChange])

  useEffect(() => {
    onARChangeRef.current = onARChange
  }, [onARChange])

  useEffect(() => {
    onCRChangeRef.current = onCRChange
  }, [onCRChange])

  // 통합 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    console.log(`[CustomerSSE] 📥 이벤트 수신 - eventType: ${eventType}, data:`, data)

    switch (eventType) {
      case 'document-change':
        try {
          const eventData = data as DocumentChangeEvent
          console.log('[CustomerSSE] 문서 변경:', eventData)
          onDocumentChangeRef.current?.(eventData)
          onRefreshDocumentsRef.current?.()
        } catch (error) {
          console.error('[CustomerSSE] document-change 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, {
            component: 'useCustomerSSE.documentChange',
            payload: { customerId }
          })
        }
        break

      case 'document-status-change':
        try {
          const eventData = data as DocumentStatusChangeEvent
          console.log('[CustomerSSE] 문서 처리 상태 변경:', eventData)
          onDocumentStatusChangeRef.current?.(eventData)
          onRefreshDocumentsRef.current?.()
        } catch (error) {
          console.error('[CustomerSSE] document-status-change 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, {
            component: 'useCustomerSSE.documentStatusChange',
            payload: { customerId }
          })
        }
        break

      case 'ar-change':
        try {
          const eventData = data as ARChangeEvent
          console.log('[CustomerSSE] 🎯 AR 상태 변경:', eventData)
          onARChangeRef.current?.(eventData)
          onRefreshARRef.current?.()
        } catch (error) {
          console.error('[CustomerSSE] ar-change 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, {
            component: 'useCustomerSSE.arChange',
            payload: { customerId }
          })
        }
        break

      case 'cr-change':
        try {
          const eventData = data as CRChangeEvent
          console.log('[CustomerSSE] CR 상태 변경:', eventData)
          onCRChangeRef.current?.(eventData)
          onRefreshCRRef.current?.()
        } catch (error) {
          console.error('[CustomerSSE] cr-change 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, {
            component: 'useCustomerSSE.crChange',
            payload: { customerId }
          })
        }
        break

      default:
        console.log(`[CustomerSSE] ⚠️ 처리되지 않은 이벤트 타입: ${eventType}`)
    }
  }, [customerId])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    console.log('[CustomerSSE] ✅ 통합 SSE 연결됨:', data)
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[CustomerSSE] ❌ 연결 오류:', error)
    errorReporter.reportApiError(error, {
      component: 'useCustomerSSE.onerror',
      payload: { customerId }
    })
  }, [customerId])

  // SharedWorker 기반 통합 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription({
    streamKey: customerId ? `customer:${customerId}:combined` : '',
    endpoint: customerId ? `/api/customers/${customerId}/stream` : '',
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

export default useCustomerSSE

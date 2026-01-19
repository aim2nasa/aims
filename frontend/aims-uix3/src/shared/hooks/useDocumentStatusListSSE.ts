/**
 * Document Status List SSE 실시간 업데이트 훅
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback } from 'react'
import { useSSESubscription } from './useSSESubscription'
import { errorReporter } from '@/shared/lib/errorReporter'

interface DocumentListChangeEvent {
  type: 'uploaded' | 'deleted' | 'status-changed' | 'linked' | 'unlinked' | 'updated' | 'progress-update'
  documentId: string
  documentName?: string
  status?: string
  progress?: number
  stage?: string
  timestamp: string
}

interface UseDocumentStatusListSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 문서 변경 시 호출할 콜백 */
  onDocumentChange?: (event: DocumentListChangeEvent) => void
}

/**
 * Document Status List SSE 훅
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param onRefresh 문서 목록 새로고침 함수
 * @param options 옵션
 */
export function useDocumentStatusListSSE(
  onRefresh: () => void,
  options: UseDocumentStatusListSSEOptions = {}
) {
  const { enabled = true, onDocumentChange } = options

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onRefreshRef = useRef(onRefresh)
  const onDocumentChangeRef = useRef(onDocumentChange)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  }, [onDocumentChange])

  // 이벤트 핸들러
  const handleEvent = useCallback((eventType: string, data: unknown) => {
    // 1. 문서 목록 변경 이벤트 (업로드, 삭제, 상태변경 등)
    if (eventType === 'document-list-change') {
      try {
        const eventData = data as DocumentListChangeEvent
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] 문서 목록 변경:', eventData)
        }

        // 콜백 호출
        onDocumentChangeRef.current?.(eventData)

        // 🔄 webhook에서 overallStatus를 직접 업데이트하므로 즉시 새로고침
        // 약간의 지연(300ms)은 MongoDB write → read 완료 보장용
        setTimeout(() => {
          if (import.meta.env.DEV) {
            console.log('[DocumentStatusListSSE] fetchDocuments 호출 시작')
          }
          onRefreshRef.current()
        }, 300)
      } catch (error) {
        console.error('[DocumentStatusListSSE] document-list-change 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusListSSE.documentListChange' })
      }
    }

    // 2. 문서 진행률 업데이트 이벤트 (폴링 대체)
    if (eventType === 'document-progress') {
      try {
        const eventData = data as DocumentListChangeEvent
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] 진행률 업데이트:', eventData.documentId, `${eventData.progress}%`, eventData.stage)
        }

        // 🔧 FIX: SSE 이벤트에서 받은 progress 값을 직접 상태에 반영
        // onDocumentChange 콜백이 있으면 직접 상태 업데이트 (API 호출 없이 즉시 반영)
        // 없으면 기존 방식대로 전체 새로고침 (300ms 딜레이로 MongoDB 동기화 보장)
        if (onDocumentChangeRef.current) {
          onDocumentChangeRef.current(eventData)
          // 🛡️ 안전장치: 3초 후 최종 상태 확인 (SSE 누락/불일치 자동 복구)
          setTimeout(() => {
            onRefreshRef.current()
          }, 3000)
        } else {
          // fallback: 콜백이 없으면 딜레이 후 새로고침
          setTimeout(() => {
            onRefreshRef.current()
          }, 300)
        }
      } catch (error) {
        console.error('[DocumentStatusListSSE] document-progress 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusListSSE.documentProgress' })
      }
    }
  }, [])

  // 연결 성공 핸들러
  const handleConnect = useCallback((data: unknown) => {
    if (import.meta.env.DEV) {
      console.log('[DocumentStatusListSSE] 연결됨:', data)
    }
  }, [])

  // 오류 핸들러
  const handleError = useCallback((error: Error) => {
    console.error('[DocumentStatusListSSE] 연결 오류:', error)
    errorReporter.reportApiError(error, { component: 'useDocumentStatusListSSE.onerror' })
  }, [])

  // SharedWorker 기반 SSE 구독
  const { isConnected, disconnect, reconnect } = useSSESubscription<DocumentListChangeEvent>({
    streamKey: 'documents:status-list',
    endpoint: '/api/documents/status-list/stream',
    enabled,
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

export default useDocumentStatusListSSE

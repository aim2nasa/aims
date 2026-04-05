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
  // 📊 debounce 타이머 (SSE 이벤트 폭격 방지)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  }, [onDocumentChange])

  // 📊 debounced refresh: 500ms 내 중복 호출을 하나로 병합
  const debouncedRefresh = useCallback((delay: number = 500) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      onRefreshRef.current()
    }, delay)
  }, [])

  // cleanup
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

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

        // 🔄 webhook에서 overallStatus를 직접 업데이트하므로 새로고침
        // 📊 debounce로 연속 이벤트 시 API 호출 병합
        if (import.meta.env.DEV) {
          console.log('[DocumentStatusListSSE] fetchDocuments debounced 호출')
        }
        debouncedRefresh(500)

        // 전체 문서 보기(DocumentExplorerView)도 갱신 트리거
        window.dispatchEvent(new Event('refresh-document-library'))
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
          // 📊 debounce로 연속 progress 이벤트 시 API 호출 병합
          debouncedRefresh(3000)
        } else {
          // fallback: 콜백이 없으면 debounce 후 새로고침
          debouncedRefresh(500)
        }
      } catch (error) {
        console.error('[DocumentStatusListSSE] document-progress 이벤트 처리 실패:', error)
        errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusListSSE.documentProgress' })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debouncedRefresh는 ref 기반으로 안정적
  }, [])

  // 연결 성공 핸들러
  // 🔧 근본 해결: SSE 연결/재연결 시 즉시 DB에서 최신 상태 조회
  // - 페이지 이동 중 놓친 이벤트가 있어도 최신 상태 반영
  // - SSE 이벤트만 의존하지 않고 DB 상태를 신뢰
  const handleConnect = useCallback((data: unknown) => {
    if (import.meta.env.DEV) {
      console.log('[DocumentStatusListSSE] 연결됨:', data)
    }
    // 연결 즉시 최신 상태 조회 (놓친 이벤트 복구, 짧은 debounce)
    debouncedRefresh(300)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debouncedRefresh는 ref 기반으로 안정적
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


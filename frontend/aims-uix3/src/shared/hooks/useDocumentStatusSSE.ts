/**
 * 문서 처리 상태 SSE 훅 (1회성)
 * SharedWorker 기반으로 리팩토링 - 멀티탭 연결 공유
 * 완료/에러/타임아웃 이벤트 수신 시 자동 연결 해제
 * @since 2025-01-04
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { sseClient } from '../lib/sseWorkerClient'
import { errorReporter } from '@/shared/lib/errorReporter'

interface ProcessingCompleteEvent {
  documentId: string
  status: 'completed' | 'error'
  ownerId: string
  timestamp: string
}

interface UseDocumentStatusSSEOptions {
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 연결 타임아웃 (ms, 기본: 180000 = 3분) */
  timeout?: number
}

export type DocumentStatusResult =
  | { status: 'completed'; documentId: string }
  | { status: 'error'; documentId: string }
  | { status: 'timeout'; documentId: string }
  | { status: 'connection_error'; documentId: string; error: unknown }

/**
 * 문서 처리 상태 SSE 훅 (1회성)
 * SharedWorker를 통해 연결을 공유하여 멀티탭 HTTP 연결 제한 문제 해결
 * @param documentId 문서 ID
 * @param onComplete 처리 완료 시 호출할 콜백
 * @param options 옵션
 * @returns 연결 상태 및 제어 함수
 */
export function useDocumentStatusSSE(
  documentId: string | null | undefined,
  onComplete: (result: DocumentStatusResult) => void,
  options: UseDocumentStatusSSEOptions = {}
) {
  const { enabled = true, timeout = 180000 } = options

  const [isConnected, setIsConnected] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasReceivedResultRef = useRef(false)
  const streamKeyRef = useRef<string>('')

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onCompleteRef = useRef(onComplete)

  // 최신 콜백 참조 유지
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // 연결 해제 함수
  const disconnect = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (streamKeyRef.current) {
      sseClient.unsubscribe(streamKeyRef.current)
      streamKeyRef.current = ''
    }
    setIsConnected(false)
  }, [])

  // SSE 연결 함수
  const connect = useCallback(() => {
    if (!documentId || !enabled) {
      return
    }

    // 이미 결과를 받았으면 연결하지 않음
    if (hasReceivedResultRef.current) {
      return
    }

    // 기존 연결 정리
    disconnect()

    const streamKey = `document:${documentId}:status`
    streamKeyRef.current = streamKey

    console.log('[DocumentStatusSSE] 연결 시작...', { documentId })

    // 인증 토큰 동기화
    sseClient.syncAuthToken()

    // 이벤트 리스너 등록
    const unsubscribe = sseClient.on(streamKey, (event) => {
      const { eventType, data } = event

      if (eventType === 'connected') {
        console.log('[DocumentStatusSSE] 연결됨:', data)
        setIsConnected(true)
      } else if (eventType === 'processing-complete') {
        try {
          const eventData = data as ProcessingCompleteEvent
          console.log('[DocumentStatusSSE] 처리 완료:', eventData)

          hasReceivedResultRef.current = true
          disconnect()
          onCompleteRef.current({
            status: eventData.status,
            documentId: eventData.documentId
          })
        } catch (error) {
          console.error('[DocumentStatusSSE] processing-complete 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusSSE.processingComplete', payload: { documentId } })
        }
      } else if (eventType === 'timeout') {
        try {
          const eventData = data as { documentId: string }
          console.log('[DocumentStatusSSE] 서버 타임아웃:', eventData)

          hasReceivedResultRef.current = true
          disconnect()
          onCompleteRef.current({ status: 'timeout', documentId: eventData.documentId })
        } catch (error) {
          console.error('[DocumentStatusSSE] timeout 이벤트 처리 실패:', error)
          errorReporter.reportApiError(error as Error, { component: 'useDocumentStatusSSE.timeout', payload: { documentId } })
        }
      } else if (eventType === 'error') {
        console.error('[DocumentStatusSSE] 연결 오류:', data)
        setIsConnected(false)

        // 결과를 받지 않은 상태에서 오류 발생 시 콜백 호출
        if (!hasReceivedResultRef.current) {
          hasReceivedResultRef.current = true
          disconnect()
          onCompleteRef.current({
            status: 'connection_error',
            documentId: documentId || '',
            error: data
          })
        }
      }
    })

    // 구독 요청
    sseClient.subscribe(streamKey, `/api/documents/${documentId}/status/stream`)

    // 클라이언트 측 타임아웃 설정
    timeoutRef.current = setTimeout(() => {
      if (!hasReceivedResultRef.current) {
        console.log('[DocumentStatusSSE] 클라이언트 타임아웃:', documentId)
        hasReceivedResultRef.current = true
        disconnect()
        onCompleteRef.current({ status: 'timeout', documentId })
      }
    }, timeout)

    return unsubscribe
  }, [documentId, enabled, timeout, disconnect])

  // documentId 변경 시 연결
  useEffect(() => {
    if (!documentId || !enabled) return

    // 새 문서 ID로 연결 시 상태 초기화
    hasReceivedResultRef.current = false
    const unsubscribe = connect()

    return () => {
      unsubscribe?.()
      disconnect()
    }
  }, [documentId, enabled, connect, disconnect])

  return {
    isConnected,
    disconnect,
    reconnect: connect,
  }
}

export default useDocumentStatusSSE

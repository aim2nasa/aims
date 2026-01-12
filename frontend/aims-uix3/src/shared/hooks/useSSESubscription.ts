/**
 * SSE Subscription Hook
 * SharedWorker 기반 SSE 구독 공통 훅
 * @since 2025-01-04
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { sseClient, type SSEEvent } from '../lib/sseWorkerClient'

export interface UseSSESubscriptionOptions<T = unknown> {
  /** 스트림 고유 키 (예: 'documents:status-list', 'customer:123:documents') */
  streamKey: string
  /** SSE 엔드포인트 (예: '/api/documents/status-list/stream') */
  endpoint: string
  /** 추가 파라미터 */
  params?: Record<string, string>
  /** SSE 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 이벤트 수신 시 콜백 */
  onEvent?: (eventType: string, data: T) => void
  /** 연결 성공 시 콜백 */
  onConnect?: (data?: unknown) => void
  /** 연결 해제 시 콜백 */
  onDisconnect?: () => void
  /** 오류 발생 시 콜백 */
  onError?: (error: Error) => void
}

export interface UseSSESubscriptionReturn {
  /** 연결 상태 */
  isConnected: boolean
  /** 수동 재연결 */
  reconnect: () => void
  /** 수동 연결 해제 */
  disconnect: () => void
}

/**
 * SSE 구독 훅
 * SharedWorker를 통해 SSE 연결을 공유하여 HTTP 연결 제한 문제 해결
 */
export function useSSESubscription<T = unknown>(
  options: UseSSESubscriptionOptions<T>
): UseSSESubscriptionReturn {
  const {
    streamKey,
    endpoint,
    params,
    enabled = true,
    onEvent,
    onConnect,
    onDisconnect,
    onError
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY_MS = 5000

  // params를 안정화 (JSON 직렬화로 비교)
  const paramsKey = useMemo(() => JSON.stringify(params || {}), [params])
  const stableParams = useMemo(() => params || {}, [paramsKey])

  // 콜백을 ref로 저장하여 의존성 문제 해결
  const onEventRef = useRef(onEvent)
  const onConnectRef = useRef(onConnect)
  const onDisconnectRef = useRef(onDisconnect)
  const onErrorRef = useRef(onError)

  // endpoint와 params를 ref로 저장 (connect 함수 안정화)
  const endpointRef = useRef(endpoint)
  const paramsRef = useRef(stableParams)

  // 최신 콜백/값 참조 유지
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])

  useEffect(() => {
    onDisconnectRef.current = onDisconnect
  }, [onDisconnect])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    endpointRef.current = endpoint
  }, [endpoint])

  useEffect(() => {
    paramsRef.current = stableParams
  }, [stableParams])

  // 구독 해제 함수
  const disconnect = useCallback(() => {
    sseClient.unsubscribe(streamKey)
    setIsConnected(false)
  }, [streamKey])

  // 구독 함수 (ref 사용으로 의존성 최소화)
  const connect = useCallback(() => {
    if (!enabled || !streamKey) return

    // 🔍 DEBUG: 연결 시작 로깅
    console.log(`[useSSESubscription] 🚀 연결 시작 - streamKey: ${streamKey}, endpoint: ${endpointRef.current}`)

    // 인증 토큰 동기화
    sseClient.syncAuthToken()

    // 이벤트 리스너 등록
    const unsubscribe = sseClient.on(streamKey, (event: SSEEvent) => {
      const { eventType, data } = event

      // 🔍 DEBUG: 이벤트 수신 로깅
      console.log(`[useSSESubscription] 📥 이벤트 수신 - streamKey: ${streamKey}, eventType: ${eventType}, data:`, data)

      if (eventType === 'connected') {
        console.log(`[useSSESubscription] ✅ 연결 성공 - streamKey: ${streamKey}`)
        setIsConnected(true)
        reconnectAttemptRef.current = 0  // 🔄 연결 성공 시 재연결 카운터 리셋
        onConnectRef.current?.(data)
      } else if (eventType === 'error') {
        console.log(`[useSSESubscription] ❌ 연결 오류 - streamKey: ${streamKey}`)
        setIsConnected(false)
        onErrorRef.current?.(new Error((data as { message?: string })?.message || 'SSE error'))

        // 🔄 자동 재연결 시도 (최대 MAX_RECONNECT_ATTEMPTS회)
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptRef.current++
          console.log(`[SSE] 재연결 시도 ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS} (${RECONNECT_DELAY_MS}ms 후)`)

          // 기존 타이머 정리
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
          }

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`[SSE] 재연결 실행 중...`)
            sseClient.syncAuthToken()
            sseClient.subscribe(streamKey, endpointRef.current, paramsRef.current)
          }, RECONNECT_DELAY_MS)
        } else {
          console.warn(`[SSE] 최대 재연결 시도 횟수(${MAX_RECONNECT_ATTEMPTS}) 초과 - streamKey: ${streamKey}`)
        }
      } else {
        // 일반 이벤트
        console.log(`[useSSESubscription] 🎯 일반 이벤트 전달 - eventType: ${eventType}`)
        onEventRef.current?.(eventType, data as T)
      }
    })

    // 구독 요청 (ref 사용)
    sseClient.subscribe(streamKey, endpointRef.current, paramsRef.current)

    return unsubscribe
  }, [enabled, streamKey])

  // 재연결 함수
  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(() => {
      connect()
    }, 100)
  }, [disconnect, connect])

  // SSE 연결 관리 (streamKey, enabled 변경 시만 재연결)
  // 🔧 SharedWorker는 모든 탭에서 연결을 공유하므로 탭 비활성화 시에도 연결 유지
  useEffect(() => {
    if (!enabled || !streamKey) return

    // 초기 연결
    const unsubscribe = connect()

    // 탭 활성화 시 토큰 동기화 (연결은 끊지 않음)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 탭 활성화 시 토큰 동기화
        sseClient.syncAuthToken()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      unsubscribe?.()
      sseClient.unsubscribe(streamKey)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // 🔄 재연결 타이머 정리
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [enabled, streamKey, connect])

  return {
    isConnected,
    reconnect,
    disconnect
  }
}

export default useSSESubscription

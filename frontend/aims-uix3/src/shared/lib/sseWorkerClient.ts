/**
 * SSE Worker Client
 * SharedWorker 기반 SSE 연결 관리 클라이언트
 * Safari 등 SharedWorker 미지원 브라우저를 위한 폴백 포함
 * @since 2025-01-04
 */

import { getAuthToken } from './api'

// 타입 정의
export interface SSEEvent {
  streamKey: string
  eventType: string
  data: unknown
}

interface WorkerMessage {
  type: string
  payload?: unknown
}

interface WorkerResponse {
  type: string
  payload: {
    streamKey?: string
    eventType?: string
    data?: unknown
    error?: string
    timestamp?: number
  }
}

type EventCallback = (event: SSEEvent) => void

// 폴백용 연결 정보
interface PolyfillConnection {
  eventSource: EventSource
  endpoint: string
  params: Record<string, string>
  retryTimeout: ReturnType<typeof setTimeout> | null
}

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] || ''
const RECONNECT_DELAY = 5000

/**
 * SSE Worker Client
 * SharedWorker 사용 가능 시 SharedWorker 사용, 불가능 시 폴백
 */
class SSEWorkerClient {
  private worker: SharedWorker | null = null
  private port: MessagePort | null = null
  private listeners = new Map<string, Set<EventCallback>>()
  private isSupported: boolean
  private isInitialized = false

  // 폴백용 상태
  private polyfillConnections = new Map<string, PolyfillConnection>()

  constructor() {
    // SharedWorker 지원 여부 확인
    this.isSupported = typeof SharedWorker !== 'undefined'

    if (this.isSupported) {
      this.initWorker()
    } else {
      console.warn('[SSE-Client] SharedWorker not supported, using polyfill')
    }
  }

  /**
   * SharedWorker 초기화
   */
  private initWorker() {
    try {
      // Vite에서 SharedWorker 로드
      this.worker = new SharedWorker(
        new URL('../../workers/sse-shared-worker.ts', import.meta.url),
        { type: 'module', name: 'aims-sse-worker' }
      )

      this.port = this.worker.port
      this.port.onmessage = this.handleWorkerMessage.bind(this)
      this.port.start()

      // 인증 토큰 전송
      this.syncAuthToken()

      // 페이지 언로드 시 정리
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
          this.disconnect()
        })
      }

      this.isInitialized = true
      console.log('[SSE-Client] SharedWorker initialized')
    } catch (error) {
      console.error('[SSE-Client] SharedWorker initialization failed:', error)
      this.isSupported = false
    }
  }

  /**
   * Worker 메시지 핸들러
   */
  private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
    const { type, payload } = event.data

    if (type === 'event' && payload.streamKey && payload.eventType) {
      // SSE 이벤트를 리스너들에게 전달
      const callbacks = this.listeners.get(payload.streamKey)
      if (callbacks) {
        const sseEvent: SSEEvent = {
          streamKey: payload.streamKey,
          eventType: payload.eventType,
          data: payload.data
        }
        callbacks.forEach(cb => {
          try {
            cb(sseEvent)
          } catch (error) {
            console.error('[SSE-Client] Callback error:', error)
          }
        })
      }
    } else if (type === 'subscribed') {
      console.log('[SSE-Client] Subscribed:', payload.streamKey)
    } else if (type === 'unsubscribed') {
      console.log('[SSE-Client] Unsubscribed:', payload.streamKey)
    } else if (type === 'pong') {
      // ping 응답, 무시
    }
  }

  /**
   * 인증 토큰 동기화
   */
  syncAuthToken() {
    const token = getAuthToken()
    if (this.isSupported && this.port) {
      this.port.postMessage({
        type: 'set-auth',
        payload: { token: token || '' }
      })
    }
  }

  /**
   * 스트림 구독
   */
  subscribe(streamKey: string, endpoint: string, params: Record<string, string> = {}) {
    // 토큰을 subscribe 시점에 직접 전달 (레이스 컨디션 방지)
    const token = getAuthToken()

    if (this.isSupported && this.port) {
      this.port.postMessage({
        type: 'subscribe',
        payload: { streamKey, endpoint, params, token: token || '' }
      } as WorkerMessage)
    } else {
      // 폴백: 직접 EventSource 사용
      this.polyfillSubscribe(streamKey, endpoint, params)
    }
  }

  /**
   * 스트림 구독 해제
   */
  unsubscribe(streamKey: string) {
    // 리스너 정리
    this.listeners.delete(streamKey)

    if (this.isSupported && this.port) {
      this.port.postMessage({
        type: 'unsubscribe',
        payload: { streamKey }
      } as WorkerMessage)
    } else {
      // 폴백: 직접 연결 종료
      this.polyfillUnsubscribe(streamKey)
    }
  }

  /**
   * 이벤트 리스너 등록
   * @returns 리스너 해제 함수
   */
  on(streamKey: string, callback: EventCallback): () => void {
    if (!this.listeners.has(streamKey)) {
      this.listeners.set(streamKey, new Set())
    }
    this.listeners.get(streamKey)!.add(callback)

    // 해제 함수 반환
    return () => {
      this.listeners.get(streamKey)?.delete(callback)
    }
  }

  /**
   * 모든 구독 해제 (탭 종료 시)
   */
  disconnect() {
    if (this.isSupported && this.port) {
      this.port.postMessage({ type: 'disconnect' })
    } else {
      // 폴백: 모든 연결 종료
      this.polyfillConnections.forEach((conn, streamKey) => {
        if (conn.retryTimeout) {
          clearTimeout(conn.retryTimeout)
        }
        conn.eventSource.close()
        this.polyfillConnections.delete(streamKey)
      })
    }
    this.listeners.clear()
  }

  /**
   * 연결 상태 확인 (ping)
   */
  ping(): Promise<boolean> {
    if (!this.isSupported || !this.port) {
      return Promise.resolve(false)
    }

    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), 5000)

      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'pong') {
          clearTimeout(timeout)
          this.port?.removeEventListener('message', handler)
          resolve(true)
        }
      }

      this.port?.addEventListener('message', handler)
      this.port?.postMessage({ type: 'ping' })
    })
  }

  /**
   * SharedWorker 지원 여부
   */
  isSharedWorkerSupported(): boolean {
    return this.isSupported
  }

  // ============================================
  // Safari 폴백 구현 (기존 EventSource 방식)
  // ============================================

  /**
   * 폴백: 구독
   */
  private polyfillSubscribe(streamKey: string, endpoint: string, params: Record<string, string>) {
    // 기존 연결이 있으면 무시
    if (this.polyfillConnections.has(streamKey)) {
      return
    }

    const token = getAuthToken()
    const url = new URL(`${API_BASE_URL}${endpoint}`, window.location.origin)

    if (token) {
      url.searchParams.set('token', encodeURIComponent(token))
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value)
      }
    })

    console.log('[SSE-Client Polyfill] Connecting:', streamKey)

    const eventSource = new EventSource(url.toString())

    const conn: PolyfillConnection = {
      eventSource,
      endpoint,
      params,
      retryTimeout: null
    }

    this.polyfillConnections.set(streamKey, conn)
    this.setupPolyfillEventListeners(streamKey, conn)
  }

  /**
   * 폴백: 구독 해제
   */
  private polyfillUnsubscribe(streamKey: string) {
    const conn = this.polyfillConnections.get(streamKey)
    if (conn) {
      if (conn.retryTimeout) {
        clearTimeout(conn.retryTimeout)
      }
      conn.eventSource.close()
      this.polyfillConnections.delete(streamKey)
      console.log('[SSE-Client Polyfill] Disconnected:', streamKey)
    }
  }

  /**
   * 폴백: 이벤트 리스너 설정
   */
  private setupPolyfillEventListeners(streamKey: string, conn: PolyfillConnection) {
    const { eventSource } = conn

    // 공통 이벤트 핸들러
    const handleEvent = (eventType: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        this.emitPolyfillEvent(streamKey, eventType, data)
      } catch (error) {
        console.error(`[SSE-Client Polyfill] ${eventType} parse error:`, error)
      }
    }

    // 모든 SSE 이벤트 타입 등록
    const eventTypes = [
      'connected', 'init', 'document-list-change', 'document-change',
      'document-status-change', 'ar-change', 'cr-change', 'processing-complete',
      'timeout', 'new-message', 'status-changed', 'tier-changed', 'file-change',
      'document-progress' // 문서 진행률 업데이트
    ]

    eventTypes.forEach(eventType => {
      eventSource.addEventListener(eventType, handleEvent(eventType))
    })

    // ping 무시
    eventSource.addEventListener('ping', () => {})

    // 오류 처리 및 재연결
    eventSource.onerror = () => {
      console.error('[SSE-Client Polyfill] Connection error:', streamKey)
      eventSource.close()

      // 에러 이벤트 전달
      this.emitPolyfillEvent(streamKey, 'error', { message: 'SSE connection error' })

      // 재연결 시도
      if (this.polyfillConnections.has(streamKey)) {
        conn.retryTimeout = setTimeout(() => {
          console.log('[SSE-Client Polyfill] Reconnecting:', streamKey)
          this.polyfillUnsubscribe(streamKey)
          this.polyfillSubscribe(streamKey, conn.endpoint, conn.params)
        }, RECONNECT_DELAY)
      }
    }
  }

  /**
   * 폴백: 이벤트 전달
   */
  private emitPolyfillEvent(streamKey: string, eventType: string, data: unknown) {
    const callbacks = this.listeners.get(streamKey)
    if (callbacks) {
      const event: SSEEvent = { streamKey, eventType, data }
      callbacks.forEach(cb => {
        try {
          cb(event)
        } catch (error) {
          console.error('[SSE-Client Polyfill] Callback error:', error)
        }
      })
    }
  }
}

// 싱글톤 인스턴스
export const sseClient = new SSEWorkerClient()

// 기본 내보내기
export default sseClient

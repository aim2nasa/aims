/**
 * SSE SharedWorker
 * 모든 탭에서 SSE 연결을 공유하여 HTTP/1.1 연결 제한 (6개) 문제 해결
 * @since 2025-01-04
 */

// 타입 정의
interface Connection {
  eventSource: EventSource
  subscribers: Set<MessagePort>
  endpoint: string
  params: Record<string, string>
  retryCount: number
  retryTimeout: ReturnType<typeof setTimeout> | null
}

interface SubscribePayload {
  streamKey: string
  endpoint: string
  params?: Record<string, string>
  token?: string // 레이스 컨디션 방지용 토큰
}

interface UnsubscribePayload {
  streamKey: string
}

interface SetAuthPayload {
  token: string
}

interface WorkerMessage {
  type: 'subscribe' | 'unsubscribe' | 'disconnect' | 'set-auth' | 'ping'
  payload?: SubscribePayload | UnsubscribePayload | SetAuthPayload
}

// 전역 상태
const connections = new Map<string, Connection>()
const ports = new Set<MessagePort>()
const portSubscriptions = new Map<MessagePort, Set<string>>() // 포트별 구독 목록
let authToken: string | null = null

// 상수
const RECONNECT_DELAY = 5000 // 5초
const MAX_RETRY_COUNT = 10

/**
 * 로그 유틸리티
 */
function log(message: string, ...args: unknown[]) {
  console.log(`[SSE-Worker] ${message}`, ...args)
}

function logError(message: string, ...args: unknown[]) {
  console.error(`[SSE-Worker] ${message}`, ...args)
}

/**
 * URL 생성
 */
function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(endpoint, self.location.origin)

  // 인증 토큰 추가
  if (authToken) {
    url.searchParams.set('token', authToken)
  }

  // 추가 파라미터
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value)
    }
  })

  return url.toString()
}

/**
 * 구독자들에게 메시지 브로드캐스트
 */
function broadcastToSubscribers(streamKey: string, type: string, data: unknown) {
  const conn = connections.get(streamKey)
  if (!conn) {
    log(`⚠️ 브로드캐스트 실패 - 연결 없음: ${streamKey}`)
    log(`현재 연결된 streamKey 목록:`, Array.from(connections.keys()))
    return
  }

  const message = {
    type: 'event',
    payload: { streamKey, eventType: type, data }
  }

  // 🔍 DEBUG: 브로드캐스트 로깅
  log(`📢 브로드캐스트 - streamKey: ${streamKey}, eventType: ${type}, 구독자: ${conn.subscribers.size}명`)

  conn.subscribers.forEach(port => {
    try {
      port.postMessage(message)
      log(`✅ 메시지 전송 성공 - streamKey: ${streamKey}, eventType: ${type}`)
    } catch (e) {
      // 포트가 닫힌 경우 정리
      log(`포트 전송 실패, 정리: ${streamKey}`)
      conn.subscribers.delete(port)
      portSubscriptions.get(port)?.delete(streamKey)
    }
  })
}

/**
 * 특정 포트에 메시지 전송
 */
function sendToPort(port: MessagePort, type: string, payload: unknown) {
  try {
    port.postMessage({ type, payload })
  } catch (e) {
    logError('포트 전송 실패:', e)
  }
}

/**
 * SSE 이벤트 리스너 설정
 */
function setupEventListeners(streamKey: string, conn: Connection) {
  const { eventSource } = conn

  // 연결 성공
  eventSource.addEventListener('connected', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      log(`연결됨: ${streamKey}`)
      conn.retryCount = 0 // 재연결 카운터 리셋
      broadcastToSubscribers(streamKey, 'connected', data)
    } catch (error) {
      logError(`connected 파싱 실패: ${streamKey}`, error)
    }
  })

  // init 이벤트 (inquiry notifications)
  eventSource.addEventListener('init', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      log(`init 수신: ${streamKey}`)
      broadcastToSubscribers(streamKey, 'init', data)
    } catch (error) {
      logError(`init 파싱 실패: ${streamKey}`, error)
    }
  })

  // 문서 목록 변경 (document status list)
  eventSource.addEventListener('document-list-change', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'document-list-change', data)
    } catch (error) {
      logError(`document-list-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // 문서 변경 (customer documents)
  eventSource.addEventListener('document-change', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'document-change', data)
    } catch (error) {
      logError(`document-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // 문서 상태 변경 (customer documents)
  eventSource.addEventListener('document-status-change', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'document-status-change', data)
    } catch (error) {
      logError(`document-status-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // AR 변경 (annual reports)
  eventSource.addEventListener('ar-change', (e: MessageEvent) => {
    try {
      // 🔍 DEBUG: AR 변경 이벤트 수신 로깅
      log(`🎯 ar-change 이벤트 수신! streamKey: ${streamKey}, raw data:`, e.data)
      const data = JSON.parse(e.data)
      log(`🎯 ar-change 파싱 완료:`, data)
      broadcastToSubscribers(streamKey, 'ar-change', data)
    } catch (error) {
      logError(`ar-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // CR 변경 (customer reviews)
  eventSource.addEventListener('cr-change', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'cr-change', data)
    } catch (error) {
      logError(`cr-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // 처리 완료 (document status)
  eventSource.addEventListener('processing-complete', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'processing-complete', data)
    } catch (error) {
      logError(`processing-complete 파싱 실패: ${streamKey}`, error)
    }
  })

  // 타임아웃 (document status)
  eventSource.addEventListener('timeout', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'timeout', data)
    } catch (error) {
      logError(`timeout 파싱 실패: ${streamKey}`, error)
    }
  })

  // 새 메시지 (inquiry notifications)
  eventSource.addEventListener('new-message', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'new-message', data)
    } catch (error) {
      logError(`new-message 파싱 실패: ${streamKey}`, error)
    }
  })

  // 상태 변경 (inquiry notifications)
  eventSource.addEventListener('status-changed', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'status-changed', data)
    } catch (error) {
      logError(`status-changed 파싱 실패: ${streamKey}`, error)
    }
  })

  // 티어 변경 (user account)
  eventSource.addEventListener('tier-changed', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'tier-changed', data)
    } catch (error) {
      logError(`tier-changed 파싱 실패: ${streamKey}`, error)
    }
  })

  // 파일 변경 (personal files)
  eventSource.addEventListener('file-change', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'file-change', data)
    } catch (error) {
      logError(`file-change 파싱 실패: ${streamKey}`, error)
    }
  })

  // 문서 진행률 업데이트 (document status list - progress)
  eventSource.addEventListener('document-progress', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      broadcastToSubscribers(streamKey, 'document-progress', data)
    } catch (error) {
      logError(`document-progress 파싱 실패: ${streamKey}`, error)
    }
  })

  // ping (keep-alive)
  eventSource.addEventListener('ping', () => {
    // keep-alive, 무시
  })

  // 오류 처리
  eventSource.onerror = () => {
    logError(`연결 오류: ${streamKey}, readyState: ${eventSource.readyState}`)

    // 연결 종료
    eventSource.close()

    // 에러 브로드캐스트
    broadcastToSubscribers(streamKey, 'error', {
      message: 'SSE connection error',
      streamKey
    })

    // 재연결 시도
    if (conn.subscribers.size > 0 && conn.retryCount < MAX_RETRY_COUNT) {
      conn.retryCount++
      log(`재연결 예약 (${conn.retryCount}/${MAX_RETRY_COUNT}): ${streamKey}`)

      conn.retryTimeout = setTimeout(() => {
        if (conn.subscribers.size > 0) {
          reconnect(streamKey, conn)
        }
      }, RECONNECT_DELAY)
    } else if (conn.retryCount >= MAX_RETRY_COUNT) {
      logError(`최대 재연결 횟수 초과: ${streamKey}`)
      connections.delete(streamKey)
    }
  }
}

/**
 * SSE 재연결
 */
function reconnect(streamKey: string, conn: Connection) {
  log(`재연결 시도: ${streamKey}`)

  const url = buildUrl(conn.endpoint, conn.params)
  const eventSource = new EventSource(url)
  conn.eventSource = eventSource

  setupEventListeners(streamKey, conn)
}

/**
 * 구독 처리
 */
function handleSubscribe(port: MessagePort, payload: SubscribePayload) {
  const { streamKey, endpoint, params = {}, token } = payload

  // 🔍 DEBUG: 구독 요청 상세 로깅
  log(`📡 구독 요청 수신 - streamKey: ${streamKey}, endpoint: ${endpoint}`)
  log(`   params: ${JSON.stringify(params)}, token: ${token ? '있음' : '없음'}`)

  // 토큰이 전달되면 즉시 설정 (레이스 컨디션 방지)
  if (token && token !== authToken) {
    authToken = token
    log(`토큰 설정됨 (subscribe payload에서)`)
  }

  log(`구독 요청: ${streamKey}`)

  // 포트 구독 목록 초기화
  if (!portSubscriptions.has(port)) {
    portSubscriptions.set(port, new Set())
  }
  portSubscriptions.get(port)!.add(streamKey)

  let conn = connections.get(streamKey)

  if (!conn) {
    // 새 SSE 연결 생성
    log(`새 연결 생성: ${streamKey}`)

    const url = buildUrl(endpoint, params)
    const eventSource = new EventSource(url)

    conn = {
      eventSource,
      subscribers: new Set([port]),
      endpoint,
      params,
      retryCount: 0,
      retryTimeout: null
    }

    setupEventListeners(streamKey, conn)
    connections.set(streamKey, conn)
  } else {
    // 기존 연결에 구독자 추가
    log(`기존 연결에 구독자 추가: ${streamKey} (총 ${conn.subscribers.size + 1}명)`)
    conn.subscribers.add(port)
  }

  sendToPort(port, 'subscribed', { streamKey })

  // 현재 연결 상태 확인
  const totalConnections = connections.size
  const totalSubscribers = Array.from(connections.values())
    .reduce((sum, c) => sum + c.subscribers.size, 0)
  log(`현재 상태 - 연결: ${totalConnections}, 총 구독자: ${totalSubscribers}`)
}

/**
 * 구독 해제 처리
 */
function handleUnsubscribe(port: MessagePort, payload: UnsubscribePayload) {
  const { streamKey } = payload

  log(`구독 해제 요청: ${streamKey}`)

  const conn = connections.get(streamKey)
  if (conn) {
    conn.subscribers.delete(port)
    portSubscriptions.get(port)?.delete(streamKey)

    // 구독자가 없으면 연결 종료
    if (conn.subscribers.size === 0) {
      log(`연결 종료 (구독자 없음): ${streamKey}`)

      if (conn.retryTimeout) {
        clearTimeout(conn.retryTimeout)
      }
      conn.eventSource.close()
      connections.delete(streamKey)
    }
  }

  sendToPort(port, 'unsubscribed', { streamKey })
}

/**
 * 포트 연결 해제 처리 (탭 종료)
 */
function handleDisconnect(port: MessagePort) {
  log('포트 연결 해제')

  // 해당 포트의 모든 구독 해제
  const subscriptions = portSubscriptions.get(port)
  if (subscriptions) {
    subscriptions.forEach(streamKey => {
      const conn = connections.get(streamKey)
      if (conn) {
        conn.subscribers.delete(port)

        if (conn.subscribers.size === 0) {
          log(`연결 종료 (포트 해제): ${streamKey}`)
          if (conn.retryTimeout) {
            clearTimeout(conn.retryTimeout)
          }
          conn.eventSource.close()
          connections.delete(streamKey)
        }
      }
    })
  }

  portSubscriptions.delete(port)
  ports.delete(port)
}

/**
 * 인증 토큰 설정
 */
function handleSetAuth(payload: SetAuthPayload) {
  const oldToken = authToken
  authToken = payload.token

  log(`인증 토큰 설정: ${authToken ? '있음' : '없음'}`)

  // 토큰 변경 시 모든 연결 재설정
  if (oldToken !== authToken && connections.size > 0) {
    log('토큰 변경으로 모든 연결 재설정')

    connections.forEach((conn, streamKey) => {
      if (conn.retryTimeout) {
        clearTimeout(conn.retryTimeout)
      }
      conn.eventSource.close()
      reconnect(streamKey, conn)
    })
  }
}

/**
 * 메시지 핸들러
 */
function handleMessage(port: MessagePort, msg: WorkerMessage) {
  switch (msg.type) {
    case 'subscribe':
      handleSubscribe(port, msg.payload as SubscribePayload)
      break
    case 'unsubscribe':
      handleUnsubscribe(port, msg.payload as UnsubscribePayload)
      break
    case 'disconnect':
      handleDisconnect(port)
      break
    case 'set-auth':
      handleSetAuth(msg.payload as SetAuthPayload)
      break
    case 'ping':
      sendToPort(port, 'pong', { timestamp: Date.now() })
      break
    default:
      logError('알 수 없는 메시지 타입:', msg.type)
  }
}

/**
 * SharedWorker 연결 핸들러
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(self as any).onconnect = (event: MessageEvent) => {
  const port = event.ports[0]
  ports.add(port)

  log(`새 포트 연결 (총 ${ports.size}개)`)

  port.onmessage = (e: MessageEvent<WorkerMessage>) => {
    handleMessage(port, e.data)
  }

  port.start()
}

log('SharedWorker 초기화 완료')

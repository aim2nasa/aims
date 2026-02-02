/**
 * SSE SharedWorker
 * 모든 탭에서 SSE 연결을 공유하여 HTTP/1.1 연결 제한 (6개) 문제 해결
 * @since 2025-01-04
 */

// 타입 정의
interface BufferedEvent {
  eventType: string
  data: unknown
  timestamp: number
}

interface Connection {
  eventSource: EventSource
  subscribers: Set<MessagePort>
  endpoint: string
  params: Record<string, string>
  retryCount: number
  retryTimeout: ReturnType<typeof setTimeout> | null
  // 🔧 근본 해결: 구독자가 없을 때 받은 이벤트 버퍼
  eventBuffer: BufferedEvent[]
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
const INITIAL_RECONNECT_DELAY = 5000  // 초기 재연결 대기: 5초
const MAX_RECONNECT_DELAY = 60000     // 최대 재연결 대기: 60초
const BACKOFF_MULTIPLIER = 2          // 지수 백오프 배수

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

// 상수
const EVENT_BUFFER_MAX_SIZE = 100 // 버퍼 최대 크기
const EVENT_BUFFER_MAX_AGE_MS = 60000 // 1분 이상 된 이벤트는 삭제

/**
 * 구독자들에게 메시지 브로드캐스트
 * 🔧 근본 해결: 구독자가 없으면 버퍼에 저장
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

  // 🔧 근본 해결: 구독자가 없으면 버퍼에 저장
  if (conn.subscribers.size === 0) {
    // connected 이벤트는 버퍼링하지 않음 (새 구독 시 자동 전송)
    if (type !== 'connected') {
      conn.eventBuffer.push({
        eventType: type,
        data,
        timestamp: Date.now()
      })
      log(`📦 이벤트 버퍼에 저장 - streamKey: ${streamKey}, eventType: ${type}, 버퍼 크기: ${conn.eventBuffer.length}`)

      // 버퍼 크기 제한
      if (conn.eventBuffer.length > EVENT_BUFFER_MAX_SIZE) {
        conn.eventBuffer.shift()
      }
    }
    return
  }

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

    // 구독자가 있는 한 무한 재연결 (exponential backoff with cap)
    if (conn.subscribers.size > 0) {
      conn.retryCount++
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(BACKOFF_MULTIPLIER, Math.min(conn.retryCount - 1, 4)),
        MAX_RECONNECT_DELAY
      )
      log(`재연결 예약 (${conn.retryCount}회차, ${delay}ms 후): ${streamKey}`)

      conn.retryTimeout = setTimeout(() => {
        if (conn.subscribers.size > 0) {
          reconnect(streamKey, conn)
        }
      }, delay)
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
      retryTimeout: null,
      eventBuffer: [] // 🔧 근본 해결: 이벤트 버퍼 초기화
    }

    setupEventListeners(streamKey, conn)
    connections.set(streamKey, conn)
  } else {
    // 기존 연결에 구독자 추가
    log(`기존 연결에 구독자 추가: ${streamKey} (총 ${conn.subscribers.size + 1}명)`)
    conn.subscribers.add(port)

    // 🔧 근본 해결 Step 1: 버퍼된 이벤트 전달 (최대 1분 이내)
    // - 페이지 이동 중 놓친 이벤트를 새 구독자에게 즉시 전달
    const now = Date.now()
    const validEvents = conn.eventBuffer.filter(e => now - e.timestamp < EVENT_BUFFER_MAX_AGE_MS)

    if (validEvents.length > 0) {
      log(`📦 버퍼된 이벤트 전달: ${streamKey}, ${validEvents.length}개`)
      validEvents.forEach(bufferedEvent => {
        sendToPort(port, 'event', {
          streamKey,
          eventType: bufferedEvent.eventType,
          data: bufferedEvent.data
        })
      })
      // 버퍼 클리어 (전달 완료)
      conn.eventBuffer = []
    }

    // 🔧 근본 해결 Step 2: connected 이벤트 전송
    // - 새 구독자가 handleConnect에서 DB 최신 상태 조회 트리거
    // - 버퍼된 이벤트가 없어도 DB 조회로 최신 상태 보장 (Single Source of Truth)
    sendToPort(port, 'event', {
      streamKey,
      eventType: 'connected',
      data: { message: 'Joined existing connection', bufferedEventsDelivered: validEvents.length, timestamp: Date.now() }
    })
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
 * 🔧 근본 해결: 구독자가 없어도 SSE 연결 유지 (탭 종료 전까지)
 * - 페이지 이동 시에도 SSE 연결 끊기지 않음
 * - Backend에서 보내는 이벤트를 놓치지 않음
 * - 새 구독이 들어오면 기존 연결 재사용
 */
function handleUnsubscribe(port: MessagePort, payload: UnsubscribePayload) {
  const { streamKey } = payload

  log(`구독 해제 요청: ${streamKey}`)

  const conn = connections.get(streamKey)
  if (conn) {
    conn.subscribers.delete(port)
    portSubscriptions.get(port)?.delete(streamKey)

    // 🔧 근본 해결: 구독자가 없어도 SSE 연결 유지
    // 탭이 열려 있는 동안 연결을 끊지 않음
    // 새 구독이 들어오면 기존 연결 재사용
    if (conn.subscribers.size === 0) {
      log(`구독자 없음, 연결 유지: ${streamKey} (새 구독 대기)`)
      // 연결을 끊지 않음 - 탭 종료(handleDisconnect) 또는 모든 포트 해제 시에만 끊음
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

/**
 * Logger Abstraction
 *
 * 모든 console 출력을 이 모듈을 통해 처리
 * - debug: 개발 환경에서만 출력
 * - info: 정보성 메시지 (항상 출력)
 * - warn: 경고 메시지 (항상 출력, 서버 전송)
 * - error: 에러 메시지 (항상 출력, 서버 전송)
 *
 * 사용법:
 * import { logger } from '@/shared/lib/logger'
 * logger.debug('MyComponent', 'state updated', { count: 1 })
 * logger.error('MyComponent', error)
 *
 * @since 2025-12-22 - 서버 전송 기능 추가
 */

import { getAuthToken } from './api'

const isDev = import.meta.env.DEV && !import.meta.env['VITEST']
const API_BASE_URL = (import.meta.env['VITE_API_BASE_URL'] as string) || ''

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  source: {
    type: 'frontend'
    component: string
    url: string
  }
  message: string
  data?: unknown
  context: {
    browser: string
    os: string
    version: string
  }
  timestamp: string
}

interface LoggerConfig {
  /** 로그 레벨 활성화 여부 */
  enabled: Record<LogLevel, boolean>
  /** 타임스탬프 표시 여부 */
  showTimestamp: boolean
  /** 컨텍스트 색상 사용 여부 (개발 환경) */
  useColors: boolean
  /** 서버 전송 설정 */
  serverTransmission: {
    /** 서버 전송 활성화 */
    enabled: boolean
    /** 서버로 전송할 로그 레벨 */
    levels: LogLevel[]
    /** 배치 전송 간격 (ms) */
    throttleMs: number
    /** 최대 큐 크기 */
    maxQueueSize: number
  }
}

const defaultConfig: LoggerConfig = {
  enabled: {
    debug: isDev,
    info: true,
    warn: true,
    error: true
  },
  showTimestamp: false,
  useColors: isDev,
  serverTransmission: {
    enabled: !isDev, // 프로덕션에서만 서버 전송
    levels: ['warn', 'error'], // warn, error만 서버 전송
    throttleMs: 5000, // 5초마다 배치 전송
    maxQueueSize: 100
  }
}

let config = { ...defaultConfig }

// 로그 큐
let logQueue: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 브라우저/OS 정보 추출
 */
const getBrowserInfo = (): { browser: string; os: string } => {
  const ua = navigator.userAgent
  let browser = 'Unknown'
  let os = 'Unknown'

  // Browser detection
  if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari')) browser = 'Safari'
  else if (ua.includes('Edge')) browser = 'Edge'

  // OS detection
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Android')) os = 'Android'

  return { browser, os }
}

/**
 * 로그 큐 플러시 (서버로 전송)
 */
const flushQueue = async (): Promise<void> => {
  if (logQueue.length === 0) return

  const logsToSend = logQueue.splice(0, 10) // 한 번에 최대 10개

  try {
    // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
    const token = getAuthToken()
    await fetch(`${API_BASE_URL}/api/system-logs/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ logs: logsToSend })
    })
  } catch {
    // 전송 실패 시 무시 (무한 루프 방지)
    // 실패한 로그를 다시 큐에 넣지 않음
  }

  // 남은 로그가 있으면 다시 스케줄
  if (logQueue.length > 0) {
    scheduleFlush()
  }
}

/**
 * 플러시 스케줄링
 */
const scheduleFlush = (): void => {
  if (flushTimer) return

  flushTimer = setTimeout(() => {
    flushTimer = null
    flushQueue()
  }, config.serverTransmission.throttleMs)
}

/**
 * 로그를 큐에 추가 (서버 전송용)
 */
const queueLog = (level: LogLevel, component: string, message: string, data?: unknown): void => {
  if (!config.serverTransmission.enabled) return
  if (!config.serverTransmission.levels.includes(level)) return

  // 큐 오버플로우 방지
  if (logQueue.length >= config.serverTransmission.maxQueueSize) {
    logQueue.shift() // 가장 오래된 로그 제거
  }

  const { browser, os } = getBrowserInfo()

  const entry: LogEntry = {
    level,
    source: {
      type: 'frontend',
      component,
      url: window.location.href
    },
    message,
    data: data !== undefined ? data : undefined,
    context: {
      browser,
      os,
      version: (import.meta.env['VITE_APP_VERSION'] as string) || 'unknown'
    },
    timestamp: new Date().toISOString()
  }

  logQueue.push(entry)
  scheduleFlush()
}

/**
 * 로그 포맷팅
 */
const formatMessage = (level: LogLevel, context: string): string => {
  const parts: string[] = []

  if (config.showTimestamp) {
    const now = new Date()
    parts.push(`[${now.toISOString().slice(11, 23)}]`)
  }

  parts.push(`[${context}]`)

  return parts.join(' ')
}

/**
 * 컬러 스타일 (개발 환경 콘솔용)
 */
const styles: Record<LogLevel, string> = {
  debug: 'color: #6b7280',    // gray
  info: 'color: #3b82f6',     // blue
  warn: 'color: #f59e0b',     // amber
  error: 'color: #ef4444'     // red
}

export const logger = {
  /**
   * 디버그 로그 (개발 환경에서만 출력)
   * @param context 컴포넌트/모듈 이름
   * @param message 메시지 또는 데이터
   * @param data 추가 데이터 (선택)
   */
  debug: (context: string, message?: unknown, data?: unknown): void => {
    if (!config.enabled.debug) return

    const prefix = formatMessage('debug', context)

    if (config.useColors) {
      if (data !== undefined) {
        console.log(`%c${prefix}`, styles.debug, message, data)
      } else if (message !== undefined) {
        console.log(`%c${prefix}`, styles.debug, message)
      } else {
        console.log(`%c${prefix}`, styles.debug)
      }
    } else {
      if (data !== undefined) {
        console.log(prefix, message, data)
      } else if (message !== undefined) {
        console.log(prefix, message)
      } else {
        console.log(prefix)
      }
    }

    // 서버 전송 (설정에 따라)
    const msgStr = typeof message === 'string' ? message : JSON.stringify(message)
    queueLog('debug', context, msgStr, data)
  },

  /**
   * 정보 로그
   */
  info: (context: string, message?: unknown, data?: unknown): void => {
    if (!config.enabled.info) return

    const prefix = formatMessage('info', context)

    if (data !== undefined) {
      console.info(prefix, message, data)
    } else if (message !== undefined) {
      console.info(prefix, message)
    } else {
      console.info(prefix)
    }

    // 서버 전송 (설정에 따라)
    const msgStr = typeof message === 'string' ? message : JSON.stringify(message)
    queueLog('info', context, msgStr, data)
  },

  /**
   * 경고 로그
   */
  warn: (context: string, message: string, data?: unknown): void => {
    if (!config.enabled.warn) return

    const prefix = formatMessage('warn', context)

    if (data !== undefined) {
      console.warn(prefix, message, data)
    } else {
      console.warn(prefix, message)
    }

    // 서버 전송
    queueLog('warn', context, message, data)
  },

  /**
   * 에러 로그 (항상 출력)
   * @param context 컴포넌트/모듈 이름
   * @param error 에러 객체 또는 메시지
   * @param data 추가 컨텍스트 데이터 (선택)
   */
  error: (context: string, error: unknown, data?: unknown): void => {
    if (!config.enabled.error) return

    const prefix = formatMessage('error', context)

    if (data !== undefined) {
      console.error(prefix, error, data)
    } else {
      console.error(prefix, error)
    }

    // 서버 전송
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorData = error instanceof Error
      ? { ...(data && typeof data === 'object' ? data : {}), stack: error.stack, type: error.name }
      : data
    queueLog('error', context, errorMsg, errorData)
  },

  /**
   * 그룹 로그 시작 (개발 환경에서만)
   */
  group: (context: string, label?: string): void => {
    if (!isDev) return
    console.group(`[${context}]${label ? ` ${label}` : ''}`)
  },

  /**
   * 그룹 로그 종료
   */
  groupEnd: (): void => {
    if (!isDev) return
    console.groupEnd()
  },

  /**
   * 테이블 출력 (개발 환경에서만)
   */
  table: (context: string, data: unknown): void => {
    if (!isDev) return
    console.log(`[${context}]`)
    console.table(data)
  },

  /**
   * 설정 변경
   */
  configure: (newConfig: Partial<LoggerConfig>): void => {
    config = { ...config, ...newConfig }
    if (newConfig.enabled) {
      config.enabled = { ...config.enabled, ...newConfig.enabled }
    }
    if (newConfig.serverTransmission) {
      config.serverTransmission = { ...config.serverTransmission, ...newConfig.serverTransmission }
    }
  },

  /**
   * 기본 설정으로 복원
   */
  reset: (): void => {
    config = { ...defaultConfig }
  },

  /**
   * 즉시 플러시 (페이지 언로드 시 호출)
   */
  flush: (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    // 동기적으로 전송 시도 (sendBeacon 사용)
    if (logQueue.length > 0 && navigator.sendBeacon) {
      // 🔒 보안: getAuthToken()으로 토큰 통합 관리 (v1/v2 호환)
      const token = getAuthToken()
      const blob = new Blob([JSON.stringify({ logs: logQueue })], { type: 'application/json' })
      navigator.sendBeacon(`${API_BASE_URL}/api/system-logs/batch`, blob)
      logQueue = []
    }
  }
}

// 페이지 언로드 시 남은 로그 전송
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    logger.flush()
  })
}

export type { LoggerConfig, LogLevel }

/**
 * Logger Abstraction
 *
 * 모든 console 출력을 이 모듈을 통해 처리
 * - debug: 개발 환경에서만 출력
 * - info: 정보성 메시지 (항상 출력)
 * - warn: 경고 메시지 (항상 출력)
 * - error: 에러 메시지 (항상 출력)
 *
 * 사용법:
 * import { logger } from '@/shared/lib/logger'
 * logger.debug('MyComponent', 'state updated', { count: 1 })
 * logger.error('MyComponent', error)
 */

const isDev = import.meta.env.DEV

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LoggerConfig {
  /** 로그 레벨 활성화 여부 */
  enabled: Record<LogLevel, boolean>
  /** 타임스탬프 표시 여부 */
  showTimestamp: boolean
  /** 컨텍스트 색상 사용 여부 (개발 환경) */
  useColors: boolean
}

const defaultConfig: LoggerConfig = {
  enabled: {
    debug: isDev,
    info: true,
    warn: true,
    error: true
  },
  showTimestamp: false,
  useColors: isDev
}

let config = { ...defaultConfig }

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
  },

  /**
   * 기본 설정으로 복원
   */
  reset: (): void => {
    config = { ...defaultConfig }
  }
}

export type { LoggerConfig }

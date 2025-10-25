/**
 * Processing Log Types
 * @since 2025-10-23
 *
 * 문서 등록 처리 로그 타입 정의
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'ar-detect' | 'ar-auto'

export interface ProcessingLog {
  id: string
  timestamp: Date
  level: LogLevel
  message: string
  details?: string | undefined
}

/**
 * 로그 레벨별 설정
 */
export const LOG_CONFIG = {
  info: {
    icon: '●',
    color: 'rgba(142, 142, 147, 0.8)',
    bgColor: 'transparent'
  },
  success: {
    icon: '●',
    color: 'rgba(52, 199, 89, 1)',
    bgColor: 'transparent'
  },
  warning: {
    icon: '●',
    color: 'rgba(255, 149, 0, 1)',
    bgColor: 'transparent'
  },
  error: {
    icon: '●',
    color: 'rgba(255, 59, 48, 1)',
    bgColor: 'transparent'
  },
  'ar-detect': {
    icon: '●',
    color: 'rgba(10, 132, 255, 1)',
    bgColor: 'transparent'
  },
  'ar-auto': {
    icon: '●',
    color: 'rgba(52, 199, 89, 1)',
    bgColor: 'transparent'
  }
} as const

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
    icon: 'info.circle',
    color: 'var(--color-text-secondary)',
    bgColor: 'rgba(142, 142, 147, 0.08)'
  },
  success: {
    icon: 'checkmark.circle',
    color: 'rgba(52, 199, 89, 0.9)',
    bgColor: 'rgba(52, 199, 89, 0.08)'
  },
  warning: {
    icon: 'exclamationmark.triangle',
    color: 'rgba(255, 149, 0, 0.9)',
    bgColor: 'rgba(255, 149, 0, 0.08)'
  },
  error: {
    icon: 'xmark.circle',
    color: 'rgba(255, 59, 48, 0.9)',
    bgColor: 'rgba(255, 59, 48, 0.08)'
  },
  'ar-detect': {
    icon: 'doc.text.magnifyingglass',
    color: 'rgba(10, 132, 255, 0.9)',
    bgColor: 'rgba(10, 132, 255, 0.08)'
  },
  'ar-auto': {
    icon: 'checkmark.circle.fill',
    color: 'rgba(52, 199, 89, 0.9)',
    bgColor: 'rgba(52, 199, 89, 0.08)'
  }
} as const

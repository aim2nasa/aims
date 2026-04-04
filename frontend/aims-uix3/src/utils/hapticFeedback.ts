/**
 * 🍎 iOS Haptic Feedback API
 * Apple 표준 햅틱 패턴 구현
 */

import { logger } from '@/shared/lib/logger'

export type HapticFeedbackType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection'

/**
 * 🍎 Apple HIG Haptic Patterns
 * iOS 표준 햅틱 피드백 패턴
 */
const HAPTIC_PATTERNS = {
  light: [10],                    // 가벼운 탭
  medium: [20],                   // 중간 강도
  heavy: [30],                    // 강한 탭
  success: [10, 50, 10],         // 성공 패턴
  warning: [15, 100, 15, 100],   // 경고 패턴
  error: [50, 100, 50],          // 에러 패턴
  selection: [5]                  // 선택 피드백 (가장 가벼움)
} as const

/**
 * 🍎 iOS Web Haptic Feedback 구현
 * Progressive Enhancement: 지원되는 기기에서만 동작
 */
class iOSHapticFeedback {
  private isSupported: boolean
  private isEnabled: boolean

  constructor() {
    // iOS Safari, Android Chrome에서 햅틱 지원 확인
    this.isSupported = typeof navigator !== 'undefined' &&
                      typeof navigator.vibrate === 'function'

    // 사용자 설정에 따른 햅틱 활성화 (기본값: true)
    this.isEnabled = localStorage.getItem('aims-haptic-enabled') !== 'false'
  }

  /**
   * 햅틱 피드백 트리거
   */
  trigger(type: HapticFeedbackType): void {
    if (!this.isSupported || !this.isEnabled) {
      return
    }

    try {
      const pattern = HAPTIC_PATTERNS[type]
      navigator.vibrate?.(pattern)
    } catch (error) {
      // 햅틱 실패는 조용히 무시
      logger.debug('Haptic', 'feedback failed', error)
    }
  }

  /**
   * 햅틱 피드백 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    localStorage.setItem('aims-haptic-enabled', String(enabled))
  }

  /**
   * 햅틱 지원 여부 확인
   */
  get supported(): boolean {
    return this.isSupported
  }

  /**
   * 햅틱 활성화 상태 확인
   */
  get enabled(): boolean {
    return this.isEnabled
  }
}

// 싱글톤 인스턴스
const hapticFeedback = new iOSHapticFeedback()


/**
 * 🍎 편의 함수들 - Apple HIG 권장 사용법
 */

// 버튼 클릭시 사용
export const hapticTap = () => hapticFeedback.trigger('light')

// 선택 변경시 사용
export const hapticSelection = () => hapticFeedback.trigger('selection')

// 성공 액션시 사용
export const hapticSuccess = () => hapticFeedback.trigger('success')

// 에러 발생시 사용
export const hapticError = () => hapticFeedback.trigger('error')

// 경고시 사용
export const hapticWarning = () => hapticFeedback.trigger('warning')

// 중요한 액션시 사용
export const hapticImpact = () => hapticFeedback.trigger('medium')

export default hapticFeedback

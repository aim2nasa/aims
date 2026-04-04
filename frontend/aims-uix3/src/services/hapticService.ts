/**
 * iOS-style Haptic Feedback Service
 * @since 1.0.0
 *
 * 웹 기반 햅틱 피드백으로 iOS 네이티브 경험 구현
 * Navigator Vibration API 활용하여 iOS 햅틱 패턴 재현
 * CLAUDE.md 준수: 하드코딩 금지, 모든 값은 상수로 관리
 */

/**
 * iOS 햅틱 피드백 타입 열거형
 * iOS UIImpactFeedbackGenerator 스타일과 매핑
 */
export enum HapticType {
  /** 가벼운 터치 - 버튼 hover, 소프트 상호작용 */
  LIGHT = 'light',
  /** 중간 강도 - 버튼 클릭, 선택, 토글 */
  MEDIUM = 'medium',
  /** 강한 피드백 - 모달 열기/닫기, 중요한 액션 */
  HEAVY = 'heavy',
  /** 성공 피드백 - 완료, 저장 성공 */
  SUCCESS = 'success',
  /** 경고 피드백 - 주의 필요한 상황 */
  WARNING = 'warning',
  /** 오류 피드백 - 실패, 에러 상황 */
  ERROR = 'error',
  /** 선택 피드백 - 아이템 선택, 체크박스 */
  SELECTION = 'selection'
}

/**
 * iOS 표준 햅틱 패턴 상수
 * 실제 iOS 디바이스의 햅틱 패턴을 웹에서 최대한 재현
 */
const HAPTIC_PATTERNS = {
  [HapticType.LIGHT]: [10], // 10ms 짧은 진동
  [HapticType.MEDIUM]: [20], // 20ms 중간 진동
  [HapticType.HEAVY]: [50], // 50ms 강한 진동
  [HapticType.SUCCESS]: [10, 50, 10, 50], // 성공 패턴: 짧음-긺-짧음-긺
  [HapticType.WARNING]: [30, 100, 30], // 경고 패턴: 중간-긺-중간
  [HapticType.ERROR]: [50, 50, 50, 50, 50], // 오류 패턴: 5번 연속 강한 진동
  [HapticType.SELECTION]: [5] // 5ms 아주 가벼운 진동
} as const

/**
 * 햅틱 설정 인터페이스
 */
interface HapticConfig {
  /** 햅틱 피드백 활성화 여부 */
  enabled: boolean
  /** 사용자 설정에 따른 강도 조절 (0.0 - 1.0) */
  intensity: number
  /** 디버깅용 로그 활성화 */
  debug: boolean
}

/**
 * iOS 스타일 햅틱 피드백 서비스 클래스
 *
 * @example
 * ```typescript
 * // 기본 사용법
 * HapticService.trigger(HapticType.LIGHT)
 *
 * // 설정 변경
 * HapticService.configure({ intensity: 0.5 })
 *
 * // 지원 여부 확인
 * if (HapticService.isSupported()) {
 *   HapticService.trigger(HapticType.SUCCESS)
 * }
 * ```
 */
export class HapticService {
  /** 현재 햅틱 설정 */
  private static config: HapticConfig = {
    enabled: true,
    intensity: 1.0,
    debug: false
  }

  /** 마지막 햅틱 실행 시간 (중복 실행 방지용) */
  private static lastTriggerTime = 0

  /** 중복 실행 방지 간격 (ms) */
  private static readonly DEBOUNCE_INTERVAL = 50

  /**
   * 햅틱 피드백 트리거
   *
   * @param type 햅틱 타입
   * @param force 디바운스 무시하고 강제 실행
   */
  static trigger(type: HapticType, force = false): void {
    // 햅틱 비활성화 상태 확인
    if (!this.config.enabled) {
      this.log(`Haptic disabled: ${type}`)
      return
    }

    // 브라우저 지원 여부 확인
    if (!this.isSupported()) {
      this.log(`Haptic not supported: ${type}`)
      return
    }

    // 디바운스 체크 (중복 실행 방지)
    const now = Date.now()
    if (!force && now - this.lastTriggerTime < this.DEBOUNCE_INTERVAL) {
      this.log(`Haptic debounced: ${type}`)
      return
    }

    this.lastTriggerTime = now

    try {
      // 패턴 가져오기
      const pattern = HAPTIC_PATTERNS[type]
      if (!pattern) {
        this.log(`Unknown haptic type: ${type}`)
        return
      }

      // 강도 적용한 패턴 생성
      const adjustedPattern = pattern.map(duration =>
        Math.round(duration * this.config.intensity)
      )

      // 햅틱 실행
      navigator.vibrate(adjustedPattern)
      this.log(`Haptic triggered: ${type} with pattern [${adjustedPattern.join(', ')}]`)

    } catch (error) {
      this.log(`Haptic error: ${error}`)
    }
  }

  /**
   * 브라우저 햅틱 지원 여부 확인
   *
   * @returns 지원 여부
   */
  static isSupported(): boolean {
    return 'vibrate' in navigator && typeof navigator.vibrate === 'function'
  }

  /**
   * 햅틱 설정 업데이트
   *
   * @param newConfig 새로운 설정 (부분 업데이트 가능)
   */
  static configure(newConfig: Partial<HapticConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.log(`Haptic configured:`, this.config)
  }

  /**
   * 현재 햅틱 설정 가져오기
   *
   * @returns 현재 설정
   */
  static getConfig(): Readonly<HapticConfig> {
    return { ...this.config }
  }

  /**
   * 햅틱 활성화/비활성화
   *
   * @param enabled 활성화 여부
   */
  static setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    this.log(`Haptic ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * 햅틱 강도 설정
   *
   * @param intensity 강도 (0.0 - 1.0)
   */
  static setIntensity(intensity: number): void {
    this.config.intensity = Math.max(0, Math.min(1, intensity))
    this.log(`Haptic intensity set to: ${this.config.intensity}`)
  }

  /**
   * 모든 햅틱 중지
   */
  static stop(): void {
    if (this.isSupported()) {
      navigator.vibrate(0)
      this.log('All haptics stopped')
    }
  }

  /**
   * 햅틱 테스트 시퀀스 실행 (개발/디버깅용)
   */
  static async testSequence(): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Haptic feedback not supported on this device')
      return
    }

    const types = Object.values(HapticType)
    if (import.meta.env.DEV) {
      console.log('Starting haptic test sequence...')
    }

    for (const type of types) {
      if (import.meta.env.DEV) {
        console.log(`Testing: ${type}`)
      }
      this.trigger(type, true) // 강제 실행
      await new Promise(resolve => setTimeout(resolve, 1000)) // 1초 간격
    }

    if (import.meta.env.DEV) {
      console.log('Haptic test sequence completed')
    }
  }

  /**
   * 디버그 로그 출력
   *
   * @param message 로그 메시지
   * @param data 추가 데이터
   */
  private static log(message: string, data?: unknown): void {
    if (!this.config.debug) {
      return
    }

    if (import.meta.env.DEV) {
      if (data !== undefined) {
        console.log(`[HapticService] ${message}`, data)
      } else {
        console.log(`[HapticService] ${message}`)
      }
    }
  }
}

/**
 * 컴포넌트 이벤트 핸들러에 햅틱을 쉽게 추가하는 유틸리티
 *
 * @param hapticType 햅틱 타입
 * @param originalHandler 원본 이벤트 핸들러
 * @returns 햅틱이 추가된 이벤트 핸들러
 *
 * @example
 * ```tsx
 * const handleClick = withHaptic(HapticType.MEDIUM, () => {
 *   console.log('Button clicked!')
 * })
 *
 * <button onClick={handleClick}>Click me</button>
 * ```
 */
export function withHaptic<Args extends unknown[]>(
  hapticType: HapticType
): (...args: Args) => void
export function withHaptic<Args extends unknown[], Return>(
  hapticType: HapticType,
  originalHandler: (...args: Args) => Return
): (...args: Args) => Return
export function withHaptic<Args extends unknown[], Return>(
  hapticType: HapticType,
  originalHandler?: (...args: Args) => Return
): (...args: Args) => Return | void {
  return (...args: Args) => {
    HapticService.trigger(hapticType)
    return originalHandler?.(...args)
  }
}

// 기본 내보내기


/**
 * useHeaderTooltip Hook
 * @since 1.0.0
 *
 * Header 툴팁 및 펄스 애니메이션 비즈니스 로직 Hook
 * ARCHITECTURE.md 준수: 비즈니스 로직을 Hook으로 분리
 * CLAUDE.md 준수: 최소한 수정 원칙, 기존 기능에 영향 없음
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * Header 툴팁 및 펄스 상태 관리 Hook
 *
 * 애플 디자인 철학 구현:
 * - Smart Behavior: 첫 방문자에게만 표시
 * - Non-intrusive: 자동 해제로 방해하지 않음
 * - Progressive Disclosure: 필요한 시점에만 표시
 * - Breathing Animation: 극도로 서브틀한 펄스 힌트
 */
export const useHeaderTooltip = () => {
  const [showTooltip, setShowTooltip] = useState(false)
  const [showPulse, setShowPulse] = useState(false)

  useEffect(() => {
    // localStorage에서 툴팁 표시 여부 확인
    const hasSeenTooltip = localStorage.getItem('aims-header-tooltip-seen')

    if (!hasSeenTooltip) {
      // 4단계 타이밍 구현:
      // 2초 후 펄스 시작 → 3초 후 툴팁 표시 → 8초 후 모든 힌트 해제

      // 2초 후 펄스 애니메이션 시작
      const pulseTimer = setTimeout(() => {
        setShowPulse(true)
      }, 2000)

      // 3초 후 툴팁 표시 (펄스 중단)
      const showTimer = setTimeout(() => {
        setShowPulse(false) // 펄스 중단
        setShowTooltip(true)
      }, 3000)

      // 8초 후 자동 해제 (표시 후 5초간 유지)
      const dismissTimer = setTimeout(() => {
        setShowTooltip(false)
        setShowPulse(false) // 안전하게 펄스도 해제
        localStorage.setItem('aims-header-tooltip-seen', 'true')
      }, 8000)

      return () => {
        clearTimeout(pulseTimer)
        clearTimeout(showTimer)
        clearTimeout(dismissTimer)
      }
    }

    // 이미 툴팁을 본 경우 cleanup 함수 없이 종료
    return undefined
  }, [])

  /**
   * 툴팁 및 펄스 수동 해제
   * 사용자가 헤더와 상호작용하면 즉시 해제
   */
  const dismissTooltip = useCallback(() => {
    setShowTooltip(false)
    setShowPulse(false) // 펄스도 함께 해제
    localStorage.setItem('aims-header-tooltip-seen', 'true')
  }, [])

  return {
    showTooltip,
    showPulse,
    dismissTooltip
  }
}

export default useHeaderTooltip
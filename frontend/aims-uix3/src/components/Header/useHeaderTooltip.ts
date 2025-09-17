/**
 * useHeaderTooltip Hook
 * @since 1.0.0
 *
 * Header 툴팁 비즈니스 로직 Hook
 * ARCHITECTURE.md 준수: 비즈니스 로직을 Hook으로 분리
 * CLAUDE.md 준수: 최소한 수정 원칙, 기존 기능에 영향 없음
 */

import { useState, useEffect, useCallback } from 'react'

/**
 * Header 툴팁 상태 관리 Hook
 *
 * 애플 디자인 철학 구현:
 * - Smart Behavior: 첫 방문자에게만 표시
 * - Non-intrusive: 자동 해제로 방해하지 않음
 * - Progressive Disclosure: 필요한 시점에만 표시
 */
export const useHeaderTooltip = () => {
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    // localStorage에서 툴팁 표시 여부 확인
    const hasSeenTooltip = localStorage.getItem('aims-header-tooltip-seen')

    if (!hasSeenTooltip) {
      // 3초 후 툴팁 표시
      const showTimer = setTimeout(() => {
        setShowTooltip(true)
      }, 3000)

      // 8초 후 자동 해제 (표시 후 5초간 유지)
      const dismissTimer = setTimeout(() => {
        setShowTooltip(false)
        localStorage.setItem('aims-header-tooltip-seen', 'true')
      }, 8000)

      return () => {
        clearTimeout(showTimer)
        clearTimeout(dismissTimer)
      }
    }
  }, [])

  /**
   * 툴팁 수동 해제
   * 사용자가 헤더와 상호작용하면 즉시 해제
   */
  const dismissTooltip = useCallback(() => {
    setShowTooltip(false)
    localStorage.setItem('aims-header-tooltip-seen', 'true')
  }, [])

  return {
    showTooltip,
    dismissTooltip
  }
}

export default useHeaderTooltip
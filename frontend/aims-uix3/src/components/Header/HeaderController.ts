/**
 * Header Controller
 * @since 1.0.0
 *
 * Header 컴포넌트의 비즈니스 로직 관리
 * ARCHITECTURE.md 준수: Controller Hook으로 비즈니스 로직 분리
 * CLAUDE.md 준수: 애플 디자인 철학 "Progressive Disclosure" 구현
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  HeaderState,
  HeaderControllerReturn,
  ProgressiveDisclosureConfig
} from './Header.types'

/** 애플 스타일 Progressive Disclosure 설정 */
const PROGRESSIVE_DISCLOSURE_CONFIG: ProgressiveDisclosureConfig = {
  baseHeight: 20,        // 기본 높이 - 거의 보이지 않음
  expandedHeight: 60,    // 확장 높이 - 기존 높이 유지
  hoverDelay: 100,       // 호버 지연 - 즉각적이지 않은 자연스러운 반응
  fadeInDuration: 200,   // 페이드인 - 부드러운 전환
  fadeOutDuration: 300   // 페이드아웃 - 약간 더 천천히
}

/**
 * Header Controller Hook
 *
 * Progressive Disclosure 패턴을 구현하여 Header가
 * "Invisible until you need it" 철학을 따르도록 함
 */
export const useHeaderController = (): HeaderControllerReturn => {
  // 상태 관리
  const [state, setState] = useState<HeaderState>({
    isHovered: false,
    showControls: false,
    isAnimating: false
  })

  // 타이머 관리를 위한 refs
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 타이머 정리 함수
  const clearTimers = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current)
      animationTimeoutRef.current = null
    }
  }, [])

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return clearTimers
  }, [clearTimers])

  /**
   * 호버 시작 핸들러
   * 즉각적인 반응으로 자연스러운 사용자 경험 제공
   */
  const handleMouseEnter = useCallback(() => {
    clearTimers()
    setState(prev => ({
      ...prev,
      isHovered: true,
      showControls: true,
      isAnimating: false
    }))
  }, [clearTimers])

  /**
   * 호버 종료 핸들러
   * 즉각적인 숨김으로 반응성 향상
   */
  const handleMouseLeave = useCallback(() => {
    clearTimers()
    setState(prev => ({
      ...prev,
      isHovered: false,
      showControls: false,
      isAnimating: false
    }))
  }, [clearTimers])

  /**
   * 키보드 포커스 핸들러
   * 접근성을 위한 포커스 상태 처리
   */
  const handleFocus = useCallback(() => {
    clearTimers()
    setState(prev => ({
      ...prev,
      isHovered: true,
      showControls: true,
      isAnimating: false
    }))
  }, [clearTimers])

  /**
   * 키보드 블러 핸들러
   * 포커스 해제 시 자연스러운 숨김
   */
  const handleBlur = useCallback(() => {
    // 포커스가 Header 내부 요소로 이동하는 경우 체크
    // 실제 구현에서는 relatedTarget 확인 필요
    handleMouseLeave()
  }, [handleMouseLeave])

  return {
    state,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur
  }
}

/**
 * Progressive Disclosure 설정 내보내기
 * CSS에서 동일한 값들을 사용할 수 있도록 함
 */
export { PROGRESSIVE_DISCLOSURE_CONFIG }
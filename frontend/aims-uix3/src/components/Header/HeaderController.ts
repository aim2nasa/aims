/**
 * Header Controller
 * @since 1.0.0
 *
 * Header 컴포넌트의 비즈니스 로직 관리
 * ARCHITECTURE.md 준수: Controller Hook으로 비즈니스 로직 분리
 */

import { useState, useCallback } from 'react'
import {
  HeaderState,
  HeaderControllerReturn
} from './Header.types'

/**
 * Header Controller Hook
 *
 * 헤더 호버 상태를 관리하여 서브틀한 배경 변화 구현
 */
export const useHeaderController = (): HeaderControllerReturn => {
  const [state, setState] = useState<HeaderState>({
    isHovered: false
  })

  const handleMouseEnter = useCallback(() => {
    setState({ isHovered: true })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setState({ isHovered: false })
  }, [])

  const handleFocus = useCallback(() => {
    setState({ isHovered: true })
  }, [])

  const handleBlur = useCallback(() => {
    setState({ isHovered: false })
  }, [])

  return {
    state,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur
  }
}

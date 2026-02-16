import { useState, useEffect, useCallback } from 'react'

/**
 * 모바일 가상 키보드 감지 훅
 *
 * ChatPanel.tsx의 visualViewport 패턴을 재사용 가능한 훅으로 추출.
 * window.visualViewport API로 키보드 열림/닫힘 감지 및 가용 뷰포트 크기 제공.
 *
 * @param enabled - 활성화 여부 (모달 visible && 모바일일 때만 true)
 *
 * @example
 * ```tsx
 * const { isKeyboardOpen, viewportHeight, offsetTop } = useVirtualKeyboard(visible && isMobile)
 * ```
 */

interface VirtualKeyboardState {
  /** 키보드 열림 여부 */
  isKeyboardOpen: boolean
  /** visualViewport 높이 (키보드 제외 가용 높이) */
  viewportHeight: number
  /** visualViewport 상단 오프셋 */
  offsetTop: number
}

const KEYBOARD_THRESHOLD = 0.75 // viewport가 innerHeight의 75% 미만이면 키보드 열림으로 판정

export function useVirtualKeyboard(enabled: boolean): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>({
    isKeyboardOpen: false,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
  })

  const handleViewportResize = useCallback(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const currentHeight = viewport.height
    const offsetTop = viewport.offsetTop
    const isKeyboardOpen = currentHeight < window.innerHeight * KEYBOARD_THRESHOLD

    setState({ isKeyboardOpen, viewportHeight: currentHeight, offsetTop })
  }, [])

  useEffect(() => {
    if (!enabled || !window.visualViewport) return

    const viewport = window.visualViewport

    // 초기 상태 설정
    handleViewportResize()

    viewport.addEventListener('resize', handleViewportResize)
    viewport.addEventListener('scroll', handleViewportResize)

    return () => {
      viewport.removeEventListener('resize', handleViewportResize)
      viewport.removeEventListener('scroll', handleViewportResize)

      // 정리: 키보드 닫힌 상태로 초기화
      setState({
        isKeyboardOpen: false,
        viewportHeight: window.innerHeight,
        offsetTop: 0,
      })
    }
  }, [enabled, handleViewportResize])

  return state
}

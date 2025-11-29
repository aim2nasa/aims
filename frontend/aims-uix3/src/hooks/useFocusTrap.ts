/**
 * useFocusTrap Hook
 * @since 2025-11-29
 * @version 1.0.0
 *
 * 모달/다이얼로그에서 포커스가 외부로 나가지 않도록 트랩
 * - Tab/Shift+Tab 키 순환
 * - 자동 첫 요소 포커스
 * - 접근성 WCAG 2.1 AA 준수
 */

import { useEffect, useRef, RefObject, useCallback } from 'react'

/** 포커스 가능한 요소 선택자 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface UseFocusTrapOptions {
  /** 훅 활성화 여부 (기본값: true) */
  enabled?: boolean
  /** 활성화 시 첫 요소에 자동 포커스 (기본값: true) */
  autoFocus?: boolean
  /** 비활성화 시 이전 포커스 복원 (기본값: true) */
  restoreFocus?: boolean
  /** 초기 포커스할 요소 선택자 (기본값: 첫 번째 포커스 가능 요소) */
  initialFocusSelector?: string
}

/**
 * 포커스 트랩 훅
 *
 * @param options - 옵션 설정
 * @returns ref - 포커스를 가둘 컨테이너에 연결할 ref
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen })
 *
 *   if (!isOpen) return null
 *
 *   return (
 *     <div ref={containerRef} role="dialog" aria-modal="true">
 *       <button onClick={onClose}>닫기</button>
 *       <input type="text" placeholder="입력" />
 *       <button>확인</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions = {}
): RefObject<T | null> {
  const {
    enabled = true,
    autoFocus = true,
    restoreFocus = true,
    initialFocusSelector,
  } = options

  const containerRef = useRef<T | null>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // 포커스 가능한 요소들 가져오기
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return []

    const elements = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    return Array.from(elements).filter((el) => {
      // 숨겨진 요소 제외 (display:none, visibility:hidden, hidden 속성)
      // offsetParent는 jsdom에서 항상 null이므로 사용하지 않음
      const style = window.getComputedStyle(el)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !el.hasAttribute('hidden')
      )
    })
  }, [])

  // 첫 번째 요소에 포커스
  const focusFirstElement = useCallback(() => {
    if (!containerRef.current) return

    // 초기 포커스 선택자가 지정된 경우
    if (initialFocusSelector) {
      const initialElement = containerRef.current.querySelector<HTMLElement>(initialFocusSelector)
      if (initialElement) {
        initialElement.focus()
        return
      }
    }

    // 첫 번째 포커스 가능 요소
    const focusableElements = getFocusableElements()
    const firstFocusable = focusableElements[0]
    if (firstFocusable) {
      firstFocusable.focus()
    } else {
      // 포커스 가능한 요소가 없으면 컨테이너에 포커스
      containerRef.current.focus()
    }
  }, [getFocusableElements, initialFocusSelector])

  // 키보드 이벤트 핸들러
  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const container = containerRef.current

    // 이전 포커스 요소 저장
    if (restoreFocus && document.activeElement instanceof HTMLElement) {
      previousActiveElement.current = document.activeElement
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // 포커스 가능한 요소가 없으면 무시
      if (!firstElement || !lastElement) return

      // Shift + Tab: 뒤로 이동
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      }
      // Tab: 앞으로 이동
      else {
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    // 자동 포커스 (setTimeout 사용 - requestAnimationFrame은 jsdom에서 동작하지 않음)
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    if (autoFocus) {
      timeoutId = setTimeout(() => {
        focusFirstElement()
      }, 0)
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      container.removeEventListener('keydown', handleKeyDown)

      // 이전 포커스 복원
      if (restoreFocus && previousActiveElement.current) {
        previousActiveElement.current.focus()
        previousActiveElement.current = null
      }
    }
  }, [enabled, autoFocus, restoreFocus, getFocusableElements, focusFirstElement])

  return containerRef
}

export default useFocusTrap

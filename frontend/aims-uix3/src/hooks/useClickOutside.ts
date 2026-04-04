/**
 * useClickOutside Hook
 * @since 2025-11-29
 * @version 1.0.0
 *
 * 요소 외부 클릭 감지 훅
 * - 드롭다운, 모달, 컨텍스트 메뉴 등에서 사용
 * - mousedown 이벤트 기반
 * - enabled 옵션으로 조건부 활성화
 * - delay 옵션으로 즉시 닫힘 방지
 */

import { useEffect, useRef, RefObject } from 'react'

interface UseClickOutsideOptions {
  /** 훅 활성화 여부 (기본값: true) */
  enabled?: boolean
  /** 이벤트 리스너 등록 지연 시간 (ms) - 열릴 때 즉시 닫히는 것 방지 */
  delay?: number
  /** 이벤트 타입 (기본값: 'mousedown') */
  eventType?: 'mousedown' | 'click'
}

/**
 * 요소 외부 클릭 감지 훅
 *
 * @param callback - 외부 클릭 시 실행할 콜백 함수
 * @param options - 옵션 설정
 * @returns ref - 감지 대상 요소에 연결할 ref
 *
 * @example
 * ```tsx
 * // 기본 사용법
 * const dropdownRef = useClickOutside<HTMLDivElement>(() => {
 *   setIsOpen(false)
 * }, { enabled: isOpen })
 *
 * return (
 *   <div ref={dropdownRef}>
 *     <DropdownContent />
 *   </div>
 * )
 * ```
 *
 * @example
 * ```tsx
 * // 지연 등록 (메뉴 열릴 때 즉시 닫히는 것 방지)
 * const menuRef = useClickOutside<HTMLDivElement>(
 *   () => onClose(),
 *   { enabled: isOpen, delay: 0 }
 * )
 * ```
 *
 * @example
 * ```tsx
 * // 기존 ref 사용
 * const existingRef = useRef<HTMLDivElement>(null)
 * useClickOutside(() => setIsOpen(false), {
 *   enabled: isOpen,
 * }, existingRef)
 * ```
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  callback: (event: MouseEvent) => void,
  options: UseClickOutsideOptions = {},
  externalRef?: RefObject<T | null>
): RefObject<T | null> {
  const { enabled = true, delay, eventType = 'mousedown' } = options
  const internalRef = useRef<T | null>(null)
  const ref = externalRef || internalRef

  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback(event)
      }
    }

    // delay가 설정되어 있으면 지연 등록
    if (delay !== undefined) {
      const timeoutId = setTimeout(() => {
        document.addEventListener(eventType, handleClickOutside)
      }, delay)

      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener(eventType, handleClickOutside)
      }
    }

    // 즉시 등록
    document.addEventListener(eventType, handleClickOutside)

    return () => {
      document.removeEventListener(eventType, handleClickOutside)
    }
  }, [enabled, callback, delay, eventType, ref])

  return ref
}

/**
 * useClickOutside의 간단한 버전
 * - isOpen 상태에 따라 자동 활성화
 * - setIsOpen(false)를 자동으로 호출
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 * const dropdownRef = useClickOutsideToggle<HTMLDivElement>(isOpen, setIsOpen)
 *
 * return (
 *   <div ref={dropdownRef}>
 *     <DropdownContent />
 *   </div>
 * )
 * ```
 */
export function useClickOutsideToggle<T extends HTMLElement = HTMLElement>(
  isOpen: boolean,
  setIsOpen: (open: boolean) => void,
  options: Omit<UseClickOutsideOptions, 'enabled'> = {}
): RefObject<T | null> {
  return useClickOutside<T>(() => setIsOpen(false), { ...options, enabled: isOpen })
}


import { useCallback, useRef, useEffect } from 'react'

/**
 * 메뉴 네비게이션 옵션 (휠 + 키보드 통합)
 */
interface NavigationOptions {
  /** 네비게이션 가능한 메뉴 키 배열 */
  items: string[]
  /** 현재 선택된 키 */
  selectedKey: string
  /** 선택 변경 시 호출되는 콜백 */
  onSelectionChange: (key: string) => void
  /** 네비게이션 비활성화 옵션 */
  disabled?: boolean
  /** 스크롤 민감도 설정 (ms) */
  scrollSensitivity?: number
  /** 순환 네비게이션 활성화 */
  circular?: boolean
  /** 키보드 네비게이션 활성화 */
  enableKeyboard?: boolean
  /** Enter 키로 선택 확정 콜백 */
  onEnter?: (selectedKey: string) => void
  /** Escape 키 콜백 */
  onEscape?: () => void
}

/**
 * 네비게이션 결과
 */
interface NavigationResult {
  /** 휠 이벤트 핸들러 */
  onWheel: (event: React.WheelEvent) => void
  /** 키보드 이벤트 핸들러 */
  onKeyDown: (event: React.KeyboardEvent) => void
  /** 위로 이동 가능 여부 */
  canNavigateUp: boolean
  /** 아래로 이동 가능 여부 */
  canNavigateDown: boolean
  /** 현재 선택된 항목의 인덱스 */
  currentIndex: number
  /** 포커스 관리용 tabIndex */
  tabIndex: number
}

/**
 * AIMS UIX3 CustomMenu용 통합 네비게이션 훅 (휠 + 키보드)
 *
 * Document-Controller-View 아키텍처 준수
 * - 순수 비즈니스 로직만 담당
 * - 성능 최적화 (debounce, 메모이제이션)
 * - 접근성 고려 (prefers-reduced-motion, keyboard navigation)
 *
 * @param options 네비게이션 옵션
 * @returns 통합 네비게이션 결과 객체
 */
export const useNavigation = ({
  items,
  selectedKey,
  onSelectionChange,
  disabled = false,
  scrollSensitivity = 100,
  circular = true,
  enableKeyboard = true,
  onEnter,
  onEscape
}: NavigationOptions): NavigationResult => {

  // 스크롤 debounce를 위한 타이머 ref
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 현재 선택된 항목의 인덱스 계산
  const currentIndex = items.indexOf(selectedKey)

  // 네비게이션 가능 여부 계산
  const canNavigateUp = circular ? items.length > 0 : currentIndex > 0
  const canNavigateDown = circular ? items.length > 0 : currentIndex < items.length - 1

  /**
   * 다음 선택할 키 계산
   */
  const getNextKey = useCallback((direction: 'up' | 'down'): string | null => {
    if (items.length === 0) return null

    let nextIndex: number

    if (direction === 'up') {
      if (currentIndex <= 0) {
        // 첫 번째 항목에서 위로 스크롤
        nextIndex = circular ? items.length - 1 : 0
      } else {
        nextIndex = currentIndex - 1
      }
    } else {
      if (currentIndex >= items.length - 1) {
        // 마지막 항목에서 아래로 스크롤
        nextIndex = circular ? 0 : items.length - 1
      } else {
        nextIndex = currentIndex + 1
      }
    }

    return items[nextIndex] || null
  }, [items, currentIndex, circular])

  /**
   * 휠 이벤트 핸들러
   * - 성능 최적화를 위한 debounce 적용
   * - 접근성 고려 (motion 설정 확인)
   */
  const handleWheel = useCallback((event: React.WheelEvent) => {
    // 기능 비활성화 시 처리 안함
    if (disabled || items.length === 0) return

    // 모션 감소 설정 확인 (접근성)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    // 가로 스크롤은 무시
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

    // 이벤트 전파 방지 (상위 스크롤 방지)
    event.preventDefault()
    event.stopPropagation()

    // 스크롤 방향 감지
    const scrollDirection = event.deltaY > 0 ? 'down' : 'up'

    // 기존 타이머가 있으면 클리어 (중복 스크롤 방지)
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // 즉시 반응하되, 중복 처리 방지를 위한 최소한의 debounce
    scrollTimeoutRef.current = setTimeout(() => {
      const nextKey = getNextKey(scrollDirection)
      if (nextKey && nextKey !== selectedKey) {
        onSelectionChange(nextKey)
      }
    }, scrollSensitivity)

  }, [disabled, items.length, scrollSensitivity, selectedKey, onSelectionChange, getNextKey])

  /**
   * 키보드 이벤트 핸들러
   * - Arrow Up/Down: 메뉴 네비게이션
   * - Enter: 선택 확정
   * - Escape: 탈출
   * - Home/End: 첫/마지막 항목으로 이동
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // 기능 비활성화 시 처리 안함
    if (disabled || !enableKeyboard || items.length === 0) return

    let handled = false
    let nextKey: string | null = null

    switch (event.key) {
      case 'ArrowUp':
        nextKey = getNextKey('up')
        handled = true
        break

      case 'ArrowDown':
        nextKey = getNextKey('down')
        handled = true
        break

      case 'Home':
        nextKey = items[0] || null
        handled = true
        break

      case 'End':
        nextKey = items[items.length - 1] || null
        handled = true
        break

      case 'Enter':
      case ' ': // 스페이스바도 선택으로 처리
        if (onEnter) {
          onEnter(selectedKey)
          handled = true
        }
        break

      case 'Escape':
        if (onEscape) {
          onEscape()
          handled = true
        }
        break

      default:
        // 다른 키는 처리하지 않음
        break
    }

    // 키보드 네비게이션 처리됨
    if (handled) {
      event.preventDefault()
      event.stopPropagation()

      // 선택 변경
      if (nextKey && nextKey !== selectedKey) {
        onSelectionChange(nextKey)
      }
    }

  }, [disabled, enableKeyboard, items, selectedKey, onSelectionChange, getNextKey, onEnter, onEscape])

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  return {
    onWheel: handleWheel,
    onKeyDown: handleKeyDown,
    canNavigateUp,
    canNavigateDown,
    currentIndex,
    tabIndex: disabled || !enableKeyboard ? -1 : 0 // 키보드 접근 가능 시만 포커스 허용
  }
}
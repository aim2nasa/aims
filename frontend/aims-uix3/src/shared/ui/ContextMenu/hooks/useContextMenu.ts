/**
 * useContextMenu Hook
 * @description 컨텍스트 메뉴 상태 관리 훅
 */

import { useState, useCallback, useEffect } from 'react'
import type { ContextMenuPosition, UseContextMenuReturn } from '../types'

/**
 * 컨텍스트 메뉴 상태 관리 훅
 *
 * @example
 * ```tsx
 * const { isOpen, position, targetData, open, close } = useContextMenu<Document>()
 *
 * return (
 *   <div onContextMenu={(e) => open(e, document)}>
 *     {isOpen && (
 *       <ContextMenu
 *         visible={isOpen}
 *         position={position}
 *         sections={menuSections}
 *         onClose={close}
 *       />
 *     )}
 *   </div>
 * )
 * ```
 */
export function useContextMenu<T = unknown>(): UseContextMenuReturn<T> {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<ContextMenuPosition>({ x: 0, y: 0 })
  const [targetData, setTargetData] = useState<T | null>(null)

  /**
   * 메뉴 열기
   */
  const open = useCallback((e: React.MouseEvent, data?: T) => {
    e.preventDefault()
    e.stopPropagation()

    setPosition({ x: e.clientX, y: e.clientY })
    setTargetData(data ?? null)
    setIsOpen(true)
  }, [])

  /**
   * 메뉴 닫기
   */
  const close = useCallback(() => {
    setIsOpen(false)
    // 애니메이션 완료 후 데이터 초기화
    setTimeout(() => {
      setTargetData(null)
    }, 150)
  }, [])

  /**
   * ESC 키 및 외부 클릭으로 닫기
   */
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.context-menu')) {
        close()
      }
    }

    // 약간의 딜레이 후 이벤트 등록 (열기 클릭과 충돌 방지)
    const timeoutId = setTimeout(() => {
      document.addEventListener('keydown', handleEscape)
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, close])

  return {
    isOpen,
    position,
    targetData,
    open,
    close
  }
}

export default useContextMenu

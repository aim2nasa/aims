/**
 * useContextMenuPosition Hook
 * @description 화면 경계를 고려한 메뉴 위치 조정 훅
 */

import { useState, useEffect, useRef, type RefObject } from 'react'
import type { ContextMenuPosition } from '../types'

/**
 * 화면 경계를 고려하여 메뉴 위치 조정
 *
 * @param position - 원본 위치 (마우스 클릭 좌표)
 * @param menuRef - 메뉴 요소 ref
 * @returns 조정된 위치
 *
 * @example
 * ```tsx
 * const menuRef = useRef<HTMLDivElement>(null)
 * const adjustedPosition = useContextMenuPosition(position, menuRef)
 *
 * return (
 *   <div
 *     ref={menuRef}
 *     style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
 *   />
 * )
 * ```
 */
export function useContextMenuPosition(
  position: ContextMenuPosition,
  menuRef: RefObject<HTMLDivElement | null>
): ContextMenuPosition {
  const [adjustedPosition, setAdjustedPosition] = useState<ContextMenuPosition>(position)
  const hasAdjusted = useRef(false)

  useEffect(() => {
    // position이 변경될 때만 재계산
    hasAdjusted.current = false
  }, [position.x, position.y])

  useEffect(() => {
    if (!menuRef.current || hasAdjusted.current) {
      return
    }

    const rect = menuRef.current.getBoundingClientRect()
    const padding = 8 // 화면 가장자리 여백

    let { x, y } = position

    // 우측 경계 체크
    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding
    }

    // 하단 경계 체크
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding
    }

    // 좌측/상단 최소값
    x = Math.max(padding, x)
    y = Math.max(padding, y)

    // 위치가 변경되었으면 업데이트
    if (x !== position.x || y !== position.y) {
      setAdjustedPosition({ x, y })
      hasAdjusted.current = true
    } else {
      setAdjustedPosition(position)
    }
  }, [position, menuRef])

  return adjustedPosition
}


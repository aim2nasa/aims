/**
 * ActionOverflowMenu Component
 * @since 2026-03-16
 *
 * 액션 버튼이 많을 때 "더보기(···)" 메뉴로 묶어주는 컴포넌트
 * - 핵심 버튼은 항상 표시, 나머지는 드롭다운 메뉴에 수납
 * - 40~60대 사용자를 위해 텍스트가 항상 보이는 메뉴 방식 채택
 * - 포탈 기반으로 overflow:hidden 부모에서도 정상 동작
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './ActionOverflowMenu.css'

export interface OverflowMenuItem {
  /** 고유 키 */
  key: string
  /** 표시할 라벨 */
  label: string
  /** 왼쪽 아이콘 */
  icon?: React.ReactNode
  /** 클릭 핸들러 */
  onClick: () => void
  /** 위험 동작 여부 (빨간색 표시) */
  destructive?: boolean
}

interface ActionOverflowMenuProps {
  /** 더보기 메뉴에 표시할 항목들 */
  items: OverflowMenuItem[]
  /** 추가 CSS 클래스 */
  className?: string
}

/**
 * 더보기(···) 메뉴 컴포넌트
 * - createPortal로 body에 렌더링하여 overflow:hidden 우회
 * - 외부 클릭/Escape 키로 닫힘
 * - 위/아래 방향 자동 감지
 */
export const ActionOverflowMenu: React.FC<ActionOverflowMenuProps> = ({
  items,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; upward: boolean }>({
    top: 0,
    left: 0,
    upward: false,
  })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 메뉴 위치 계산
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight || 200
    const spaceBelow = window.innerHeight - rect.bottom
    const upward = spaceBelow < menuHeight && rect.top > spaceBelow

    setMenuPos({
      top: upward
        ? rect.top + window.scrollY - (menuRef.current?.offsetHeight || menuHeight) - 4
        : rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX,
      upward,
    })
  }, [])

  // 메뉴 열릴 때 위치 계산
  useEffect(() => {
    if (isOpen) {
      updatePosition()
      // 메뉴 렌더링 후 높이 확정되면 재계산
      requestAnimationFrame(updatePosition)
    }
  }, [isOpen, updatePosition])

  // 외부 클릭 감지
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // 항목이 없으면 렌더링하지 않음
  if (items.length === 0) return null

  const handleItemClick = (item: OverflowMenuItem) => {
    setIsOpen(false)
    item.onClick()
  }

  return (
    <div className={`action-overflow ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="action-overflow__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="더보기"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className={`action-overflow__menu ${menuPos.upward ? 'action-overflow__menu--upward' : ''}`}
          role="menu"
          style={{
            '--menu-top': `${menuPos.top}px`,
            '--menu-left': `${menuPos.left}px`,
          } as React.CSSProperties}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`action-overflow__item ${item.destructive ? 'action-overflow__item--destructive' : ''}`}
              onClick={() => handleItemClick(item)}
              role="menuitem"
            >
              {item.icon && (
                <span className="action-overflow__item-icon" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span className="action-overflow__item-label">{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default ActionOverflowMenu

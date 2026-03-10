/**
 * ContextMenu Component
 * @description 공통 컨텍스트 메뉴 컴포넌트 (Apple HIG 스타일)
 */

import { useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ContextMenuItem } from './ContextMenuItem'
import { ContextMenuDivider } from './ContextMenuDivider'
import { useContextMenuPosition } from './hooks/useContextMenuPosition'
import type { ContextMenuProps } from './types'
import './ContextMenu.css'

/**
 * 컨텍스트 메뉴 컴포넌트
 *
 * @example
 * ```tsx
 * const { isOpen, position, open, close } = useContextMenu()
 *
 * const sections = [
 *   {
 *     id: 'actions',
 *     items: [
 *       { id: 'edit', label: '편집', icon: <EditIcon /> },
 *       { id: 'delete', label: '삭제', danger: true },
 *     ]
 *   }
 * ]
 *
 * return (
 *   <div onContextMenu={open}>
 *     <ContextMenu
 *       visible={isOpen}
 *       position={position}
 *       sections={sections}
 *       onClose={close}
 *     />
 *   </div>
 * )
 * ```
 */
export function ContextMenu({
  visible,
  position,
  sections,
  onClose
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const adjustedPosition = useContextMenuPosition(position, menuRef)

  /**
   * 첫 번째 메뉴 아이템에 포커스
   */
  useEffect(() => {
    if (!visible || !menuRef.current) return

    const firstItem = menuRef.current.querySelector<HTMLButtonElement>(
      '.context-menu-item:not([disabled])'
    )
    firstItem?.focus()
  }, [visible])

  /**
   * 키보드 네비게이션
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!menuRef.current) return

      const items = Array.from(
        menuRef.current.querySelectorAll<HTMLButtonElement>(
          '.context-menu-item:not([disabled])'
        )
      )
      const currentIndex = items.findIndex((item) => item === document.activeElement)

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
          items[nextIndex]?.focus()
          break

        case 'ArrowUp':
          e.preventDefault()
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
          items[prevIndex]?.focus()
          break

        case 'Home':
          e.preventDefault()
          items[0]?.focus()
          break

        case 'End':
          e.preventDefault()
          items[items.length - 1]?.focus()
          break

        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [onClose]
  )

  if (!visible) return null

  // 현재 테마 가져오기
  const theme = document.documentElement.getAttribute('data-theme') || 'light'

  const menuContent = (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label="컨텍스트 메뉴"
      data-theme={theme}
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        zIndex: 'var(--z-index-modal, 1000)'
      }}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section.id} className="context-menu__section">
          {section.title && (
            <div className="context-menu__section-title">{section.title}</div>
          )}

          {section.items.map((item) => (
            <ContextMenuItem key={item.id} {...item} onClose={onClose} />
          ))}

          {/* 섹션 간 구분선 (마지막 섹션 제외) */}
          {sectionIndex < sections.length - 1 && <ContextMenuDivider />}
        </div>
      ))}

    </div>
  )

  return createPortal(menuContent, document.body)
}

export default ContextMenu

/**
 * ContextMenuItem Component
 * @description 개별 컨텍스트 메뉴 아이템
 */

import { useCallback } from 'react'
import type { ContextMenuItemProps } from './types'

/**
 * 컨텍스트 메뉴 개별 아이템
 */
export function ContextMenuItem({
  id,
  label,
  icon,
  shortcut,
  disabled = false,
  danger = false,
  onClick,
  onClose
}: ContextMenuItemProps) {
  const handleClick = useCallback(() => {
    if (disabled) return

    onClick?.()
    onClose?.()
  }, [disabled, onClick, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  return (
    <button
      type="button"
      role="menuitem"
      className={`context-menu-item ${danger ? 'context-menu-item--danger' : ''} ${disabled ? 'context-menu-item--disabled' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      data-context-menu-item-id={id}
      tabIndex={disabled ? -1 : 0}
    >
      {icon && <span className="context-menu-item__icon">{icon}</span>}
      <span className="context-menu-item__label">{label}</span>
      {shortcut && <span className="context-menu-item__shortcut">{shortcut}</span>}
    </button>
  )
}


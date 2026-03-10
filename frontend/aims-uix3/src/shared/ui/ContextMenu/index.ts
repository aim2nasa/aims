/**
 * ContextMenu - 공통 컨텍스트 메뉴 컴포넌트
 *
 * @example
 * ```tsx
 * import { ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui/ContextMenu'
 *
 * const { isOpen, position, targetData, open, close } = useContextMenu<Document>()
 *
 * const sections: ContextMenuSection[] = [
 *   {
 *     id: 'view',
 *     items: [
 *       { id: 'preview', label: '미리보기', shortcut: 'Space' },
 *       { id: 'detail', label: '상세 정보', shortcut: '⌘+I' },
 *     ]
 *   },
 *   {
 *     id: 'danger',
 *     items: [
 *       { id: 'delete', label: '삭제', danger: true },
 *     ]
 *   }
 * ]
 *
 * return (
 *   <div onContextMenu={(e) => open(e, document)}>
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

// Components
export { ContextMenu } from './ContextMenu'
export { ContextMenuItem } from './ContextMenuItem'
export { ContextMenuDivider } from './ContextMenuDivider'

// Hooks
export { useContextMenu } from './hooks/useContextMenu'
export { useContextMenuPosition } from './hooks/useContextMenuPosition'

// Types
export type {
  ContextMenuPosition,
  ContextMenuItem as ContextMenuItemType,
  ContextMenuSection,
  ContextMenuProps,
  ContextMenuItemProps,
  UseContextMenuReturn
} from './types'

// Default export
export { ContextMenu as default } from './ContextMenu'

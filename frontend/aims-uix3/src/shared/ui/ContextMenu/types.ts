/**
 * ContextMenu Types
 * @description 컨텍스트 메뉴 컴포넌트 타입 정의
 */

import type { ReactNode } from 'react'

/**
 * 메뉴 위치
 */
export interface ContextMenuPosition {
  x: number
  y: number
}

/**
 * 개별 메뉴 아이템
 */
export interface ContextMenuItem {
  /** 고유 ID */
  id: string
  /** 표시 레이블 */
  label: string
  /** 아이콘 (SFSymbol 또는 SVG) */
  icon?: ReactNode
  /** 키보드 단축키 표시 */
  shortcut?: string
  /** 비활성화 여부 */
  disabled?: boolean
  /** 위험 액션 여부 (삭제 등) */
  danger?: boolean
  /** 클릭 핸들러 */
  onClick?: () => void
}

/**
 * 메뉴 섹션 (구분선으로 분리되는 그룹)
 */
export interface ContextMenuSection {
  /** 섹션 ID */
  id: string
  /** 섹션 제목 (선택) */
  title?: string
  /** 섹션 내 아이템 목록 */
  items: ContextMenuItem[]
}

/**
 * ContextMenu 컴포넌트 Props
 */
export interface ContextMenuProps {
  /** 표시 여부 */
  visible: boolean
  /** 메뉴 위치 */
  position: ContextMenuPosition
  /** 메뉴 섹션 목록 */
  sections: ContextMenuSection[]
  /** 닫기 핸들러 */
  onClose: () => void
}

/**
 * ContextMenuItem 컴포넌트 Props
 */
export interface ContextMenuItemProps extends ContextMenuItem {
  /** 닫기 핸들러 (클릭 후 메뉴 닫기용) */
  onClose?: () => void
}

/**
 * useContextMenu 훅 반환 타입
 */
export interface UseContextMenuReturn<T = unknown> {
  /** 메뉴 열림 상태 */
  isOpen: boolean
  /** 메뉴 위치 */
  position: ContextMenuPosition
  /** 선택된 타겟 데이터 */
  targetData: T | null
  /** 메뉴 열기 */
  open: (e: React.MouseEvent, data?: T) => void
  /** 메뉴 닫기 */
  close: () => void
}

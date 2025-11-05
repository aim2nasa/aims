/**
 * DraggableModal Component
 * @since 2025-11-04
 * @version 1.0.0
 *
 * Drag & Resize 가능한 모달 컴포넌트
 * - 기본 Modal 컴포넌트 + useModalDragResize 훅 조합
 * - 헤더 드래그로 모달 이동
 * - 8개 핸들로 크기 조절
 * - Portal, ESC, body overflow는 Modal이 자동 처리
 */

import React from 'react'
import { createPortal } from 'react-dom'
import { useModalDragResize } from '../../../hooks/useModalDragResize'
import './DraggableModal.css'

export interface DraggableModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 모달 제목 (선택적) - 문자열 또는 React 요소 */
  title?: React.ReactNode
  /** backdrop 클릭 시 닫기 활성화 여부 */
  backdropClosable?: boolean
  /** ESC 키로 닫기 활성화 여부 */
  escapeToClose?: boolean
  /** 모달 헤더 표시 여부 */
  showHeader?: boolean
  /** 모달 footer 영역 (선택적) */
  footer?: React.ReactNode
  /** 모달 본문 내용 */
  children: React.ReactNode
  /** 추가 CSS 클래스 */
  className?: string
  /** ARIA label (접근성) */
  ariaLabel?: string
  /** 초기 너비 */
  initialWidth?: number
  /** 초기 높이 */
  initialHeight?: number
  /** 최소 너비 */
  minWidth?: number
  /** 최소 높이 */
  minHeight?: number
}

/**
 * DraggableModal React Component
 *
 * Drag & Resize 기능이 있는 모달
 * 기본 Modal의 Portal, ESC, body overflow 기능 + 드래그/리사이즈
 *
 * @example
 * ```tsx
 * <DraggableModal
 *   visible={isOpen}
 *   onClose={handleClose}
 *   title="문서 프리뷰"
 *   initialWidth={1200}
 *   initialHeight={800}
 *   minWidth={600}
 *   minHeight={400}
 * >
 *   <div>드래그 & 리사이즈 가능한 내용</div>
 * </DraggableModal>
 * ```
 */
export const DraggableModal: React.FC<DraggableModalProps> = ({
  visible,
  onClose,
  title,
  backdropClosable = false,
  escapeToClose = true,
  showHeader = true,
  footer,
  children,
  className = '',
  ariaLabel,
  initialWidth = 1200,
  initialHeight = 800,
  minWidth = 600,
  minHeight = 400
}) => {
  // Drag & Resize 기능
  const modal = useModalDragResize({
    initialWidth,
    initialHeight,
    minWidth,
    minHeight
  })

  // ESC 키로 닫기
  React.useEffect(() => {
    if (!escapeToClose || !visible) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose, escapeToClose])

  // body overflow 제어
  React.useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [visible])

  // 모달 외부 클릭 처리
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (backdropClosable && e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!visible) return null

  const modalBody = (
    <div
      className="draggable-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className={`draggable-modal ${className}`}
        style={modal.modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Modal')}
        tabIndex={-1}
      >
        {/* Resize Handles */}
        {modal.resizeHandles.map(handle => (
          <div
            key={handle.position}
            className={`resize-handle resize-handle--${handle.position}`}
            onMouseDown={handle.onMouseDown}
            style={handle.style}
          />
        ))}

        {/* Header (Draggable) */}
        {showHeader && title && (
          <header
            className="draggable-modal__header"
            {...modal.headerProps}
          >
            <h2 className="draggable-modal__title">{title}</h2>
          </header>
        )}

        {/* Content */}
        <div className="draggable-modal__content">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="draggable-modal__footer">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )

  return createPortal(modalBody, document.body)
}

export default DraggableModal

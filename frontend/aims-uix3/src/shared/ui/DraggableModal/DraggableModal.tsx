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
import { useEscapeKey, useBodyOverflow, useBackdropClick } from '../Modal/hooks/useModalCore'
import Tooltip from '../Tooltip'
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
  /** 크기 초기화 버튼 표시 여부 */
  showResetButton?: boolean
  /** 크기 초기화 시 호출될 추가 콜백 (칼럼 폭 리셋 등) */
  onReset?: () => void
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
  showResetButton = false,
  onReset,
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

  // 공통 모달 훅 사용
  useEscapeKey(escapeToClose && visible, onClose)
  useBodyOverflow(visible)
  const handleBackdropClick = useBackdropClick(backdropClosable, onClose)

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
            <div className="draggable-modal__header-buttons">
              {showResetButton && modal.isResizedFromDefault && (
                <Tooltip content="초기 크기로 복원">
                  <button
                    className="draggable-modal__reset-button draggable-modal__reset-button--icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      modal.reset()
                      onReset?.()
                    }}
                    aria-label="초기 크기로 복원"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </Tooltip>
              )}
              <button
                className="draggable-modal__close-button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                aria-label="모달 닫기"
                type="button"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M12 4L4 12M4 4L12 12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
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

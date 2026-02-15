/**
 * Modal Component
 * @since 2025-11-04
 * @version 1.0.0
 *
 * 통일된 모달 시스템을 위한 베이스 컴포넌트
 * - React Portal 자동 처리
 * - ESC 키로 닫기
 * - body overflow 제어
 * - backdrop 클릭으로 닫기
 * - 접근성 (ARIA) 지원
 * - Light/Dark 테마 자동 대응
 */

import React, { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey, useBodyOverflow, useBackdropClick, useBackButton } from './hooks/useModalCore'
import { CloseButton } from '@/shared/ui/CloseButton'
import './Modal.css'

export interface ModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 모달 제목 (선택적) - 문자열 또는 React 요소 */
  title?: React.ReactNode
  /** 모달 크기 */
  size?: 'sm' | 'md' | 'lg' | 'xl'
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
}

/**
 * Modal React Component
 *
 * 재사용 가능한 모달 베이스 컴포넌트
 * 모든 공통 로직(Portal, ESC, body overflow 등)을 자동 처리
 *
 * @example
 * ```tsx
 * <Modal
 *   visible={isOpen}
 *   onClose={handleClose}
 *   title="문서 메모"
 *   size="md"
 *   footer={<Button onClick={handleClose}>확인</Button>}
 * >
 *   <div>모달 내용</div>
 * </Modal>
 * ```
 */
export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  size = 'md',
  backdropClosable = false,
  escapeToClose = true,
  showHeader = true,
  footer,
  children,
  className = '',
  ariaLabel
}) => {
  const modalRef = useRef<HTMLDivElement>(null)

  // 공통 모달 훅 사용
  useEscapeKey(escapeToClose && visible, onClose)
  useBackButton(visible, onClose)
  useBodyOverflow(visible)
  const handleBackdropClick = useBackdropClick(backdropClosable, onClose)

  if (!visible) return null

  const modalBody = (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className={`modal modal--${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Modal')}
        tabIndex={-1}
      >
        {/* Header */}
        {showHeader && title && (
          <header className="modal__header">
            <h2 className="modal__title">{title}</h2>
            <CloseButton onClick={onClose} ariaLabel="모달 닫기" />
          </header>
        )}

        {/* Content */}
        <div className="modal__content">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="modal__footer">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )

  return createPortal(modalBody, document.body)
}

export default Modal

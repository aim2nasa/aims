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

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useModalDragResize } from '../../../hooks/useModalDragResize'
import { useEscapeKey, useBodyOverflow, useBackdropClick, useBackButton } from '../Modal/hooks/useModalCore'
import { CloseButton } from '@/shared/ui/CloseButton'
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
  /** localStorage 저장 키 (위치/크기 자동 영속화) */
  storageKey?: string
  /** 투명 모드: backdrop 없이 배경과 상호작용 가능 */
  transparent?: boolean
  /** 새창에서 보기 핸들러 (제공되면 버튼 표시) */
  onOpenPopup?: () => void
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
  minHeight = 400,
  storageKey,
  transparent = false,
  onOpenPopup
}) => {
  // 모바일 감지: 인라인 스타일 대신 CSS 미디어쿼리 사용
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Drag & Resize 기능
  const modal = useModalDragResize({
    initialWidth,
    initialHeight,
    minWidth,
    storageKey,
    minHeight
  })

  // 공통 모달 훅 사용
  useEscapeKey(escapeToClose && visible, onClose)
  useBackButton(visible, onClose)
  // 투명 모드에서는 body overflow 유지 (배경 스크롤 가능)
  useBodyOverflow(visible && !transparent)
  const handleBackdropClick = useBackdropClick(backdropClosable, onClose)

  if (!visible) return null

  const modalBody = (
    <div
      className={`draggable-modal-backdrop ${transparent ? 'draggable-modal-backdrop--transparent' : ''}`}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className={`draggable-modal ${modal.isMaximized ? 'draggable-modal--maximized' : ''} ${modal.isImmersive ? 'draggable-modal--immersive' : ''} ${className}`}
        style={isMobile ? undefined : modal.modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || (typeof title === 'string' ? title : 'Modal')}
        tabIndex={-1}
      >
        {/* Resize Handles (최대화 상태에서는 숨김) */}
        {!modal.isMaximized && modal.resizeHandles.map(handle => (
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
              {/* 최대화/복원 버튼 */}
              <Tooltip content={modal.isMaximized ? "복원 (더블클릭)" : "최대화 (더블클릭)"}>
                <button
                  className="draggable-modal__maximize-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    modal.toggleMaximize()
                  }}
                  aria-label={modal.isMaximized ? "창 복원" : "창 최대화"}
                  type="button"
                >
                  {modal.isMaximized ? (
                    /* 복원 아이콘: 두 개의 겹친 사각형 */
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2H12.5A1.5 1.5 0 0 1 14 3.5V9.5A1.5 1.5 0 0 1 12.5 11H11" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  ) : (
                    /* 최대화 아이콘: 단일 사각형 */
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  )}
                </button>
              </Tooltip>
              {/* 새창에서 보기 버튼 */}
              {onOpenPopup && (
                <Tooltip content="새창에서 보기">
                  <button
                    className="draggable-modal__popup-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenPopup()
                    }}
                    aria-label="새창에서 보기"
                    type="button"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M9 2h5v5M14 2L8 8M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </Tooltip>
              )}
              {/* 몰입 모드 버튼 (최대화 상태에서만 표시) */}
              {modal.isMaximized && (
                <Tooltip content="몰입 모드 (헤더/푸터 숨김)">
                  <button
                    className="draggable-modal__immersive-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      modal.toggleImmersive()
                    }}
                    aria-label="몰입 모드"
                    type="button"
                  >
                    {/* 몰입 모드 아이콘: 확장 화살표 */}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </Tooltip>
              )}
              {showResetButton && modal.isResizedFromDefault && !modal.isMaximized && (
                <Tooltip content="초기 크기로 복원">
                  <button
                    className="draggable-modal__reset-button draggable-modal__reset-button--icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      modal.reset()
                      onReset?.()
                    }}
                    aria-label="초기 크기로 복원"
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 1 1 1.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </Tooltip>
              )}
              <CloseButton
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                ariaLabel="모달 닫기"
              />
            </div>
          </header>
        )}

        {/* Content */}
        <div className="draggable-modal__content" style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: isMobile ? 'auto' : 'hidden' }}>
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

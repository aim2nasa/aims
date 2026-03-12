/**
 * AppleConfirmModal Component
 * @since 1.0.0
 * @version 2.0.0 - Modal 컴포넌트 기반으로 마이그레이션 (Phase 6)
 * @updated 2025-11-06
 *
 * 🍎 애플 스타일 확인 모달 - iOS/macOS 네이티브 alert 완벽 재현
 * COMPONENT_GUIDE.md와 ARCHITECTURE.md 패턴을 준수하는 순수 View 컴포넌트
 *
 * Modal 컴포넌트가 ESC, body overflow, Portal, 애니메이션을 자동 처리합니다.
 */

import React from 'react'
import Modal from '../../../../shared/ui/Modal'
import type { AppleConfirmState, AppleConfirmActions } from '../../../../controllers/useAppleConfirmController'
import Button from '../../../../shared/ui/Button'
import './AppleConfirmModal.css'

export interface AppleConfirmModalProps {
  /** Controller에서 전달받은 상태 */
  state: AppleConfirmState
  /** Controller에서 전달받은 액션들 */
  actions: AppleConfirmActions
}

/**
 * AppleConfirmModal React 컴포넌트
 *
 * 🍎 애플 디자인 철학 완벽 구현:
 * - Clarity (명확성): 명확한 정보 계층
 * - Deference (겸손함): 콘텐츠를 방해하지 않음
 * - Depth (깊이감): 자연스러운 시각적 계층
 * - Progressive Disclosure: 필요할 때만 표시
 *
 * 📐 아키텍처 패턴:
 * - Document-Controller-View 패턴의 순수 View 레이어
 * - 모든 비즈니스 로직은 Controller Hook에서 처리
 * - Props를 통해서만 상태와 액션을 전달받음
 */
export const AppleConfirmModal: React.FC<AppleConfirmModalProps> = ({
  state,
  actions
}) => {
  const [inputValue, setInputValue] = React.useState('')

  React.useEffect(() => {
    if (!state.isOpen) setInputValue('')
  }, [state.isOpen])

  if (!state.isOpen) return null

  const isConfirmDisabled = !!state.requireTextConfirm && inputValue !== state.requireTextConfirm

  // Footer with buttons
  const footer = (
    <div className="apple-confirm-modal__actions">
      {state.showCancel && (
        <Button
          variant="ghost"
          size="md"
          onClick={actions.handleCancel}
          autoFocus={state.confirmStyle === 'destructive'}
        >
          {state.cancelText}
        </Button>
      )}

      <Button
        variant={state.confirmStyle === 'destructive' ? 'destructive' : 'primary'}
        size="md"
        onClick={actions.handleConfirm}
        disabled={isConfirmDisabled}
        autoFocus={!state.showCancel || state.confirmStyle === 'primary'}
      >
        {state.confirmText}
      </Button>
    </div>
  )

  const handleClose = state.showCancel ? actions.handleCancel : () => {}

  return (
    <Modal
      visible={state.isOpen}
      onClose={handleClose}
      showHeader={false}
      backdropClosable={state.showCancel ?? true}
      className="apple-confirm-modal"
      size="sm"
      footer={footer}
      ariaLabel={state.title || '확인'}
    >
      {/* 🍎 MODAL HEADER: iOS Alert 스타일 */}
      <div className="apple-confirm-modal__header">
        <div className="apple-confirm-modal__icon">
          <div className={`apple-confirm-modal__icon-display apple-confirm-modal__icon-display--${state.iconType || 'warning'}`}>
            {state.iconType === 'success' && '✅'}
            {state.iconType === 'error' && '❌'}
            {state.iconType === 'info' && 'ℹ️'}
            {(!state.iconType || state.iconType === 'warning') && '⚠️'}
          </div>
        </div>

        <h2
          id="apple-confirm-modal-title"
          className="apple-confirm-modal__title"
        >
          {state.title}
        </h2>
      </div>

      {/* 🍎 MODAL BODY: 명확한 메시지 표시 */}
      <div className="apple-confirm-modal__body">
        <p
          id="apple-confirm-modal-message"
          className="apple-confirm-modal__message"
        >
          {state.message}
        </p>
        {state.requireTextConfirm && (
          <div className="apple-confirm-modal__text-confirm">
            <p className="apple-confirm-modal__text-confirm-label">
              확인을 위해 <strong>{state.requireTextConfirm}</strong> 를 입력하세요
            </p>
            <input
              type="text"
              className="apple-confirm-modal__text-confirm-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isConfirmDisabled) actions.handleConfirm() }}
              placeholder={state.requireTextConfirm}
              autoFocus
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

export default AppleConfirmModal

/**
 * AppleConfirmModal Component
 * @since 1.0.0
 *
 * 🍎 애플 스타일 확인 모달 - iOS/macOS 네이티브 alert 완벽 재현
 * COMPONENT_GUIDE.md와 ARCHITECTURE.md 패턴을 준수하는 순수 View 컴포넌트
 */

import React from 'react'
import { createPortal } from 'react-dom'
import type { AppleConfirmState, AppleConfirmActions } from '../../../../controllers/useAppleConfirmController'
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
  // 렌더링하지 않을 때는 null 반환
  if (!state.shouldRender) return null

  // 🍎 Portal을 사용해 body에 직접 렌더링 (애플 스타일)
  return createPortal(
    <div
      className={`apple-confirm-modal-overlay ${state.isAnimating ? 'apple-confirm-modal-overlay--visible' : ''}`}
      onClick={actions.handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="apple-confirm-modal-title"
      aria-describedby="apple-confirm-modal-message"
    >
      <div
        className={`apple-confirm-modal ${state.isAnimating ? 'apple-confirm-modal--visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🍎 MODAL HEADER: iOS Alert 스타일 */}
        <div className="apple-confirm-modal__header">
          <div className="apple-confirm-modal__icon">
            <div className="apple-confirm-modal__warning-icon">
              ⚠️
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
        </div>

        {/* 🍎 MODAL ACTIONS: iOS 버튼 스타일 */}
        <div className="apple-confirm-modal__actions">
          <button
            type="button"
            className="apple-confirm-modal__button apple-confirm-modal__button--cancel"
            onClick={actions.handleCancel}
            autoFocus={state.confirmStyle === 'destructive'} // destructive일 때는 취소에 포커스
          >
            {state.cancelText}
          </button>

          <button
            type="button"
            className={`apple-confirm-modal__button apple-confirm-modal__button--confirm apple-confirm-modal__button--${state.confirmStyle}`}
            onClick={actions.handleConfirm}
            autoFocus={state.confirmStyle === 'primary'} // primary일 때는 확인에 포커스
          >
            {state.confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AppleConfirmModal
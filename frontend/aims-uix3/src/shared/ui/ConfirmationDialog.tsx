/**
 * Apple-style Confirmation Dialog
 * @since 1.0.0
 *
 * iOS Human Interface Guidelines 준수 확인 다이얼로그
 * - Progressive Disclosure 패턴 구현
 * - 햅틱 피드백 통합
 * - 완벽한 접근성 지원
 */

import React, { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../components/SFSymbol'
import { HapticService, HapticType } from '../../services/hapticService'
import Button from './Button'
import './ConfirmationDialog.css'

export interface ConfirmationDialogProps {
  /** 다이얼로그 표시 여부 */
  open: boolean
  /** 다이얼로그 제목 */
  title: string
  /** 확인 메시지 */
  message: string
  /** 확인 버튼 텍스트 (기본: "확인") */
  confirmText?: string
  /** 취소 버튼 텍스트 (기본: "취소") */
  cancelText?: string
  /** 위험한 액션 여부 (빨간 버튼) */
  destructive?: boolean
  /** 확인 버튼 클릭 핸들러 */
  onConfirm: () => void
  /** 취소 버튼 클릭 핸들러 */
  onCancel: () => void
  /** 다이얼로그 닫기 핸들러 */
  onClose?: () => void
}

/**
 * Apple HIG 준수 확인 다이얼로그
 *
 * @example
 * ```tsx
 * <ConfirmationDialog
 *   open={showDeleteDialog}
 *   title="고객 삭제"
 *   message="김철수 고객을 삭제하시겠습니까?"
 *   destructive={true}
 *   onConfirm={handleDeleteConfirm}
 *   onCancel={handleDeleteCancel}
 * />
 * ```
 */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  destructive = false,
  onConfirm,
  onCancel,
  onClose
}) => {
  // 확인 버튼 클릭 (햅틱 피드백 포함)
  const handleConfirm = useCallback(() => {
    // 위험한 액션의 경우 더 강한 햅틱 피드백
    HapticService.trigger(destructive ? HapticType.HEAVY : HapticType.MEDIUM)
    onConfirm()
  }, [onConfirm, destructive])

  // 취소 버튼 클릭 (햅틱 피드백 포함)
  const handleCancel = useCallback(() => {
    HapticService.trigger(HapticType.LIGHT)
    onCancel()
    onClose?.()
  }, [onCancel, onClose])

  // 백드롭 클릭 시 취소
  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleCancel()
    }
  }, [handleCancel])

  // Escape 키로 다이얼로그 닫기
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        handleCancel()
      }
    }

    if (open) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [open, handleCancel])

  if (!open) return null

  const dialogContent = (
    <div
      className="confirmation-dialog-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
      aria-hidden="true"
    >
      <div
        className="confirmation-dialog"
        role="alertdialog"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        aria-modal="true"
      >
        {/* 아이콘 영역 */}
        <div className="confirmation-dialog__icon">
          <SFSymbol
            name={destructive ? "exclamationmark.triangle" : "questionmark.circle"}
            size={SFSymbolSize.TITLE_1}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
        </div>

        {/* 콘텐츠 영역 */}
        <div className="confirmation-dialog__content">
          <h2 id="dialog-title" className="confirmation-dialog__title">
            {title}
          </h2>
          <p id="dialog-message" className="confirmation-dialog__message">
            {message}
          </p>
        </div>

        {/* 액션 버튼 영역 */}
        <div className="confirmation-dialog__actions">
          <Button
            variant="secondary"
            size="md"
            onClick={handleCancel}
            aria-label={`${cancelText} - 작업을 취소합니다`}
          >
            {cancelText}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            size="md"
            onClick={handleConfirm}
            aria-label={`${confirmText} - 작업을 실행합니다`}
            autoFocus
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )

  // Portal을 사용하여 body에 렌더링
  return createPortal(dialogContent, document.body)
}

export default ConfirmationDialog

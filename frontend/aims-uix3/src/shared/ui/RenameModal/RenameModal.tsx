/**
 * RenameModal
 * 문서 이름 변경 모달 — InlineRenameInput 대체
 * 넓은 input으로 긴 파일명도 전체 표시
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Modal } from '@/shared/ui/Modal/Modal'
import './RenameModal.css'

export interface RenameModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 (취소) */
  onClose: () => void
  /** 이름 변경 확정 */
  onConfirm: (newName: string) => void
  /** 편집 대상 필드 */
  editField: 'originalName' | 'displayName'
  /** 원본 파일명 */
  originalName: string
  /** AI 별칭 */
  displayName?: string
  /** 브라우저 히스토리 사용 여부 (기본: true) */
  useHistory?: boolean
}

export const RenameModal: React.FC<RenameModalProps> = ({
  visible,
  onClose,
  onConfirm,
  editField,
  useHistory,
  originalName,
  displayName,
}) => {
  const isEditingOriginal = editField === 'originalName'
  const currentName = isEditingOriginal ? originalName : (displayName || originalName)
  const [value, setValue] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  // 모달 열릴 때 값 초기화 + 포커스
  useEffect(() => {
    if (!visible) return
    setValue(currentName)
    // 다음 틱에서 포커스 (모달 애니메이션 후)
    const timer = setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      // 확장자 앞까지만 선택 (Finder 스타일)
      const dotIndex = currentName.lastIndexOf('.')
      if (dotIndex > 0) {
        input.setSelectionRange(0, dotIndex)
      } else {
        input.select()
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [visible, currentName])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed === currentName) {
      onClose()
      return
    }
    onConfirm(trimmed)
  }, [value, currentName, onConfirm, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
    // Esc는 Modal 컴포넌트가 처리
  }, [handleSubmit])

  // 참고 정보: 편집하지 않는 다른 이름
  const referenceLabel = isEditingOriginal ? '별칭' : '원본'
  const referenceName = isEditingOriginal ? displayName : originalName
  const hasReference = Boolean(referenceName) && referenceName !== currentName

  const footer = (
    <div className="rename-modal__footer-actions">
      <button
        type="button"
        className="rename-modal__btn rename-modal__btn--cancel"
        onClick={onClose}
      >
        취소
      </button>
      <button
        type="button"
        className="rename-modal__btn rename-modal__btn--confirm"
        onClick={handleSubmit}
      >
        변경
      </button>
    </div>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="이름 변경"
      size="sm"
      variant="alert"
      backdropClosable={false}
      useHistory={useHistory}
      footer={footer}
    >
      <div className="rename-modal__body">
        {hasReference && (
          <div className="rename-modal__reference">
            <span className="rename-modal__reference-label">{referenceLabel}</span>
            <span className="rename-modal__reference-value">{referenceName}</span>
          </div>
        )}
        <label className="rename-modal__label">
          {isEditingOriginal ? '원본 파일명' : '별칭'}
        </label>
        <input
          ref={inputRef}
          type="text"
          className="rename-modal__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </Modal>
  )
}

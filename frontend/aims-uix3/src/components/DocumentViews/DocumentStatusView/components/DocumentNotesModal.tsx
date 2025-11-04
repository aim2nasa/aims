/**
 * DocumentNotesModal Component
 * @since 1.0.0
 *
 * 문서 연결 시 작성된 메모를 표시하는 모달
 */

import React from 'react'
import { createPortal } from 'react-dom'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import { Button } from '@/shared/ui'
import './DocumentNotesModal.css'

export interface DocumentNotesModalProps {
  visible: boolean
  documentName: string
  customerName?: string | undefined
  notes: string
  onClose: () => void
}

export const DocumentNotesModal: React.FC<DocumentNotesModalProps> = ({
  visible,
  documentName,
  customerName,
  notes,
  onClose
}) => {
  // ESC 키로 닫기
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && visible) {
        onClose()
      }
    }

    if (visible) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [visible, onClose])

  if (!visible) return null

  const modalBody = (
    <div
      className="document-notes-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="document-notes-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-notes-modal-title"
      >
        {/* Header */}
        <header className="document-notes-modal__header">
          <div className="document-notes-modal__title">
            <SFSymbol
              name="note.text"
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
              decorative={true}
            />
            <h2 id="document-notes-modal-title">문서 메모</h2>
          </div>
          <button
            className="document-notes-modal__close"
            onClick={onClose}
            aria-label="닫기"
          >
            <SFSymbol
              name="xmark"
              size={SFSymbolSize.BODY}
              weight={SFSymbolWeight.SEMIBOLD}
              decorative={true}
            />
          </button>
        </header>

        {/* Content */}
        <div className="document-notes-modal__content">
          {/* 문서 정보 */}
          <div className="document-notes-modal__info">
            <div className="info-row">
              <span className="info-label">문서:</span>
              <span className="info-value">{documentName}</span>
            </div>
            {customerName && (
              <div className="info-row">
                <span className="info-label">고객:</span>
                <span className="info-value">{customerName}</span>
              </div>
            )}
          </div>

          {/* 메모 내용 */}
          <div className="document-notes-modal__notes">
            <h3>메모 내용</h3>
            <div className="notes-content">
              {notes}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="document-notes-modal__footer">
          <Button
            variant="primary"
            size="md"
            onClick={onClose}
          >
            확인
          </Button>
        </footer>
      </div>
    </div>
  )

  return createPortal(modalBody, document.body)
}

export default DocumentNotesModal

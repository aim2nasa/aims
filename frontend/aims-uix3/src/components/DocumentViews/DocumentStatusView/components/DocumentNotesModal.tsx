/**
 * DocumentNotesModal Component
 * @since 1.0.0
 * @updated 2025-11-04 - 공통 Modal 컴포넌트 적용
 *
 * 문서 연결 시 작성된 메모를 표시하는 모달
 * 공통 Modal 컴포넌트 사용으로 Portal, ESC, body overflow 자동 처리
 */

import React from 'react'
import { Button, Modal } from '@/shared/ui'
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
  const footer = (
    <Button
      variant="primary"
      size="md"
      onClick={onClose}
    >
      확인
    </Button>
  )

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="문서 메모"
      size="md"
      footer={footer}
      ariaLabel="문서 메모"
      className="document-notes-modal"
    >
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
    </Modal>
  )
}

export default DocumentNotesModal

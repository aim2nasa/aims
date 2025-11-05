/**
 * DocumentNotesModal Component
 * @since 1.0.0
 * @updated 2025-11-05 - 편집/삭제 기능 추가
 *
 * 문서 연결 시 작성된 메모를 편집/삭제할 수 있는 모달
 * 공통 Modal 컴포넌트 사용으로 Portal, ESC, body overflow 자동 처리
 */

import React, { useState, useEffect } from 'react'
import { Button, Modal } from '@/shared/ui'
import './DocumentNotesModal.css'

export interface DocumentNotesModalProps {
  visible: boolean
  documentName: string
  customerName?: string | undefined
  customerId?: string | undefined
  documentId?: string | undefined
  notes: string
  onClose: () => void
  onSave?: (notes: string) => Promise<void>
  onDelete?: () => Promise<void>
}

export const DocumentNotesModal: React.FC<DocumentNotesModalProps> = ({
  visible,
  documentName,
  customerName,
  // customerId, // API 호출에는 사용되지 않고 부모 컴포넌트에서 관리
  // documentId, // API 호출에는 사용되지 않고 부모 컴포넌트에서 관리
  notes,
  onClose,
  onSave,
  onDelete
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedNotes, setEditedNotes] = useState(notes)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // notes가 변경되면 editedNotes도 업데이트
  useEffect(() => {
    setEditedNotes(notes)
  }, [notes])

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleCancel = () => {
    setEditedNotes(notes)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!onSave) return

    setIsSaving(true)
    try {
      await onSave(editedNotes)
      setIsEditing(false)
    } catch (error) {
      console.error('[DocumentNotesModal] 메모 저장 실패:', error)
      // 에러는 onSave에서 처리하도록 함
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return

    // 삭제 확인
    if (!confirm('메모를 삭제하시겠습니까?')) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete()
    } catch (error) {
      console.error('[DocumentNotesModal] 메모 삭제 실패:', error)
      // 에러는 onDelete에서 처리하도록 함
    } finally {
      setIsDeleting(false)
    }
  }

  // 편집/삭제 기능이 없는 경우 (읽기 전용)
  const isReadOnly = !onSave && !onDelete

  const footer = (
    <div className="document-notes-modal__footer">
      {isEditing ? (
        <>
          <Button
            variant="secondary"
            size="md"
            onClick={handleCancel}
            disabled={isSaving}
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </>
      ) : (
        <>
          {!isReadOnly && (
            <>
              <Button
                variant="destructive"
                size="md"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleEdit}
              >
                편집
              </Button>
            </>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={onClose}
          >
            {isReadOnly ? '확인' : '닫기'}
          </Button>
        </>
      )}
    </div>
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
        {isEditing ? (
          <textarea
            className="notes-textarea"
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            placeholder="메모를 입력하세요..."
            rows={8}
            autoFocus
          />
        ) : (
          <div className="notes-content">
            {notes || '(메모 없음)'}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default DocumentNotesModal

/**
 * FullTextModal Component
 * @since 1.0.0
 * @version 2.0.0 - 공통 Modal 컴포넌트 적용
 *
 * 🍎 iOS 스타일 Full Text 모달
 * 문서의 전체 텍스트(meta.full_text 또는 ocr.full_text)를 표시
 * 공통 Modal 컴포넌트 사용 (드래그 지원)
 */

import React from 'react'
import { Modal, Button } from '@/shared/ui'
import './FullTextModal.css'

interface FullTextModalProps {
  /** 모달 표시 여부 */
  visible: boolean
  /** 모달 닫기 핸들러 */
  onClose: () => void
  /** 문서 이름 */
  documentName: string
  /** 전체 텍스트 */
  fullText: string
}

/**
 * FullTextModal React 컴포넌트
 *
 * iOS 스타일의 모달로 문서 전체 텍스트를 표시합니다.
 * Progressive Disclosure 원칙에 따라 필요할 때만 표시됩니다.
 *
 * @example
 * ```tsx
 * <FullTextModal
 *   visible={isVisible}
 *   onClose={handleClose}
 *   documentName="문서.pdf"
 *   fullText="전체 텍스트 내용..."
 * />
 * ```
 */
export const FullTextModal: React.FC<FullTextModalProps> = ({
  visible,
  onClose,
  documentName,
  fullText
}) => {
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={documentName}
      size="lg"
    >
      {/* 모달 바디 */}
      <div className="fulltext-modal-body">
        <pre className="fulltext-content">{fullText || '텍스트가 없습니다.'}</pre>
      </div>

      {/* 모달 푸터 */}
      <div className="fulltext-modal-footer">
        <Button
          variant="secondary"
          onClick={onClose}
        >
          닫기
        </Button>
      </div>
    </Modal>
  )
}

export default FullTextModal

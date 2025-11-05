/**
 * DocumentLinkModal Component
 * @version 3.0.0 - 🍎 공통 Modal 컴포넌트 적용
 * @updated 2025-11-04
 * @description 문서를 고객에게 연결하는 모달
 *
 * - 공통 Modal 컴포넌트 사용 (Portal, ESC, body overflow 자동 처리)
 * - iOS 스타일 디자인
 */

import React, { useEffect, useMemo, useState } from 'react'
import type { Document, DocumentCustomerRelation } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import type { Customer } from '@/entities/customer'
import type { CustomerDocumentsResult } from '../../../../services/DocumentService'
import { Button, Dropdown, type DropdownOption, Tooltip, Modal } from '../../../../shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import CustomerSelectorModal from '../../../../shared/ui/CustomerSelectorModal/CustomerSelectorModal'
import './DocumentLinkModal.css'

interface DocumentLinkModalProps {
  visible: boolean
  document: Document | null
  onClose: () => void
  onFetchCustomerDocuments: (customerId: string) => Promise<CustomerDocumentsResult>
  onLink: (params: {
    customerId: string
    documentId: string
    relationshipType: string
    notes?: string
  }) => Promise<DocumentCustomerRelation | undefined>
}

// 전체 문서 유형 (시스템 자동 부여 포함)
const ALL_RELATIONSHIP_TYPES: DropdownOption[] = [
  { value: 'general', label: '일반 문서' },
  { value: 'contract', label: '계약서' },
  { value: 'claim', label: '보험금청구서' },
  { value: 'proposal', label: '제안서' },
  { value: 'id_verification', label: '신분증명서' },
  { value: 'medical', label: '의료서류' },
  { value: 'annual_report', label: 'Annual Report' } // 시스템 자동 부여 전용
]

// 사용자에게 표시할 문서 유형 (Annual Report 제외)
const RELATIONSHIP_OPTIONS: DropdownOption[] = ALL_RELATIONSHIP_TYPES.filter(
  option => option.value !== 'annual_report'
)

export const DocumentLinkModal: React.FC<DocumentLinkModalProps> = ({
  visible,
  document,
  onClose,
  onFetchCustomerDocuments,
  onLink
}) => {
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [relationshipType, setRelationshipType] = useState<string>('general')
  const [notes, setNotes] = useState<string>('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const documentId = useMemo(
    () => document?._id || (document as Record<string, string | undefined>)?.['id'] || '',
    [document]
  );
  const documentName = useMemo(() => (document ? DocumentStatusService.extractFilename(document) : ''), [document])

  /**
   * 모달이 열릴 때 상태 초기화
   */
  useEffect(() => {
    if (visible) {
      setSelectedCustomer(null)
      setRelationshipType('general')
      setNotes('')
      setDuplicateWarning(null)
      setFeedbackMessage(null)
    }
  }, [visible])

  /**
   * 고객 선택 시 중복 연결 검사
   */
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setDuplicateWarning(null)
    setFeedbackMessage(null)
    setIsCustomerSelectorOpen(false)

    if (!documentId) {
      return
    }

    try {
      const customerDocs = await onFetchCustomerDocuments(customer._id)
      const alreadyLinked = customerDocs.documents?.some((doc) => String(doc._id) === documentId)

      if (alreadyLinked) {
        setDuplicateWarning('이 문서는 이미 선택한 고객과 연결되어 있습니다.')
      }
    } catch (error) {
      console.error('고객 문서 조회 오류:', error)
      setDuplicateWarning(null)
    }
  }

  /**
   * 연결 실행
   */
  const handleLink = async () => {
    if (!documentId || !selectedCustomer) return

    setLinkLoading(true)
    setFeedbackMessage(null)

    try {
      const _params: { customerId: string; documentId: string; relationshipType: string; notes?: string } = {
        customerId: selectedCustomer._id,
        documentId,
        relationshipType
      };
      const _trimmed = notes.trim();
      if (_trimmed) { _params.notes = _trimmed; }
      await onLink(_params)

      setFeedbackMessage('문서가 고객에게 성공적으로 연결되었습니다.')

      // 🍎 문서 연결 이벤트 발생 (고객 상세 페이지 자동 새로고침용)
      window.dispatchEvent(new CustomEvent('documentLinked', {
        detail: {
          documentId,
          customerId: selectedCustomer._id,
          timestamp: new Date().toISOString()
        }
      }))
      if (import.meta.env.DEV) {
        console.log('[DocumentLinkModal] documentLinked 이벤트 발생:', {
          documentId,
          customerId: selectedCustomer._id
        })
      }

      onClose()
    } catch (error) {
      console.error('문서 연결 오류:', error)
      const message =
        error instanceof Error
          ? error.message
          : '문서를 고객에게 연결하는 중 문제가 발생했습니다.'
      setFeedbackMessage(message)
    } finally {
      setLinkLoading(false)
    }
  }

  if (!visible || !document) {
    return null
  }

  const isLinkDisabled = !selectedCustomer || Boolean(duplicateWarning) || linkLoading

  const footer = (
    <>
      <Tooltip content="모달을 닫습니다">
        <Button
          variant="ghost"
          size="md"
          onClick={onClose}
          className="document-link-modal__button document-link-modal__button--cancel"
        >
          취소
        </Button>
      </Tooltip>
      <Tooltip content={duplicateWarning ? duplicateWarning : '선택한 고객과 문서를 연결합니다'}>
        <Button
          variant="primary"
          size="md"
          onClick={handleLink}
          disabled={isLinkDisabled}
          loading={linkLoading}
          className="document-link-modal__button document-link-modal__button--confirm"
        >
          연결하기
        </Button>
      </Tooltip>
    </>
  )

  return (
    <>
    <Modal
      visible={visible}
      onClose={onClose}
      title={
        <div className="document-link-modal__title">
          <SFSymbol
            name="person.crop.circle.badge.plus"
            size={SFSymbolSize.TITLE_2}
            weight={SFSymbolWeight.MEDIUM}
            decorative={true}
          />
          <span>문서를 고객에게 연결</span>
        </div>
      }
      size="lg"
      footer={footer}
      ariaLabel="문서를 고객에게 연결"
      className="document-link-modal"
    >
      {/* Document Info */}
      <section className="document-link-modal__section document-link-modal__section--document">
        <div className="document-chip">
          <span className="document-chip__icon" aria-hidden="true">📄</span>
          <span className="document-chip__name">{documentName}</span>
          <span className="document-chip__status">
            {DocumentStatusService.getStatusLabel(DocumentStatusService.extractStatus(document))}
          </span>
        </div>
      </section>

      {/* Customer Selection */}
      <section className="document-link-modal__section">
        <h3>고객 선택</h3>
        <div className="document-link-modal__customer-selection">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsCustomerSelectorOpen(true)}
            fullWidth
          >
            고객선택
          </Button>

          {/* 선택된 고객 표시 */}
          <div className="document-link-modal__selected-customer">
            {selectedCustomer ? (
              <div className="selected-customer-info">
                <div className="selected-customer-main">
                  <span className="selected-customer-name">
                    {selectedCustomer.personal_info?.name || '이름 없음'}
                  </span>
                  <button
                    className="clear-customer-button"
                    onClick={() => {
                      setSelectedCustomer(null)
                      setDuplicateWarning(null)
                    }}
                    aria-label="고객 선택 해제"
                    title="고객 선택 해제"
                  >
                    ✕
                  </button>
                </div>
                <div className="selected-customer-details">
                  <span className="selected-customer-phone">
                    {selectedCustomer.personal_info?.mobile_phone ||
                     selectedCustomer.personal_info?.home_phone ||
                     selectedCustomer.personal_info?.work_phone ||
                     '연락처 없음'}
                  </span>
                </div>
              </div>
            ) : (
              <span className="customer-placeholder">고객을 선택해주세요</span>
            )}
          </div>
        </div>
      </section>

    {/* Form */}
    <section className="document-link-modal__section">
      <div className="document-link-modal__form-row">
        <div className="document-link-modal__field">
          <label htmlFor="relationship-type">문서 유형</label>
          <Dropdown
            value={relationshipType}
            options={RELATIONSHIP_OPTIONS}
            onChange={setRelationshipType}
            aria-label="문서 유형 선택"
            width="100%"
          />
        </div>
      </div>
      <div className="document-link-modal__field">
        <label htmlFor="link-notes">
          메모
          <span className="document-link-modal__optional">선택 사항</span>
        </label>
        <textarea
          id="link-notes"
          className="form-textarea document-link-modal__textarea"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="이 문서와 고객의 관계에 대한 참고 메모를 남겨주세요."
          rows={3}
        />
      </div>
    </section>

    {/* Feedback */}
    {feedbackMessage && (
      <section className="document-link-modal__section">
        <p className="document-link-modal__feedback">{feedbackMessage}</p>
      </section>
    )}
    </Modal>

    {/* 🍎 고객 선택 모달 */}
    <CustomerSelectorModal
      visible={isCustomerSelectorOpen}
      onClose={() => setIsCustomerSelectorOpen(false)}
      onSelect={handleSelectCustomer}
    />
    </>
  )
}

export default DocumentLinkModal

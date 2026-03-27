/**
 * DocumentLinkModal Component
 * @version 3.0.0 - 🍎 공통 Modal 컴포넌트 적용
 * @updated 2025-11-04
 * @description 문서를 고객에게 연결하는 모달
 *
 * - 공통 Modal 컴포넌트 사용 (Portal, ESC, body overflow 자동 처리)
 * - iOS 스타일 디자인
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import type { Document, DocumentCustomerRelation } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import type { Customer } from '@/entities/customer'
import type { CustomerDocumentsResult } from '../../../../services/DocumentService'
import { Button, Dropdown, type DropdownOption, Tooltip, Modal } from '../../../../shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import CustomerSelectorModal from '../../../../shared/ui/CustomerSelectorModal/CustomerSelectorModal'
import { useRecentCustomersStore, type RecentCustomer } from '@/shared/store/useRecentCustomersStore'
import { SearchService } from '@/services/searchService'
import type { SearchResultItem } from '@/entities/search'
import { errorReporter } from '@/shared/lib/errorReporter'
import { invalidateQueries } from '@/app/queryClient'
import { getDocumentTypeLabelsMap } from '@/shared/constants/documentCategories'
import './DocumentLinkModal.css'

interface DocumentLinkModalProps {
  visible: boolean
  /** 단일 문서 (하위 호환성) 또는 여러 문서 배열 */
  document?: Document | null
  documents?: Document[]
  onClose: () => void
  onFetchCustomerDocuments: (customerId: string) => Promise<CustomerDocumentsResult>
  onLink: (params: {
    customerId: string
    documentId: string
    relationshipType: string
    notes?: string
  }) => Promise<DocumentCustomerRelation | undefined>
}

// 시스템 유형 제외 필터
const SYSTEM_TYPES = new Set(['annual_report', 'customer_review', 'unspecified'])

export const DocumentLinkModal: React.FC<DocumentLinkModalProps> = ({
  visible,
  document,
  documents,
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
  // 최근 선택한 고객 목록 (전역 상태)
  const { recentCustomers, addRecentCustomer, getRecentCustomers } = useRecentCustomersStore()

  // DB 캐시 기반 문서유형 옵션 (시스템 유형 제외)
  const relationshipOptions = useMemo<DropdownOption[]>(() => {
    return Object.entries(getDocumentTypeLabelsMap())
      .filter(([value]) => !SYSTEM_TYPES.has(value))
      .map(([value, label]) => ({ value, label }))
  }, [])

  // 단일 문서 또는 여러 문서 배열 처리
  const targetDocuments = useMemo(() => {
    if (documents && documents.length > 0) {
      return documents
    }
    if (document) {
      return [document]
    }
    return []
  }, [document, documents])

  // documents prop이 있으면 bulk mode (문서가 1개여도)
  const isBulkMode = !!(documents && documents.length > 0)

  // 단일 문서 모드에서만 사용 (일괄 모드에서는 targetDocuments 사용)
  // SearchResultItem과 Document 모두 지원
  const documentName = useMemo(() => {
    if (!document) return ''

    // SearchResultItem인 경우 (payload, upload, meta 등의 구조)
    if ('payload' in document || 'upload' in document) {
      return SearchService.getOriginalName(document as SearchResultItem)
    }

    // Document 타입인 경우
    return DocumentStatusService.extractFilename(document)
  }, [document])

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
      // 최근 선택한 고객 목록은 Zustand store에서 자동으로 관리됨
    }
  }, [visible])

  /**
   * 고객 선택 시 중복 연결 검사 (단일/일괄 모두 지원)
   */
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer)
    setDuplicateWarning(null)
    setFeedbackMessage(null)
    setIsCustomerSelectorOpen(false)

    // 최근 선택 고객 목록에 추가 (전역 상태 자동 업데이트)
    addRecentCustomer(customer)

    if (targetDocuments.length === 0) {
      return
    }

    try {
      const customerDocs = await onFetchCustomerDocuments(customer._id)
      const customerDocIds = new Set(customerDocs.documents?.map(doc => String(doc._id)) || [])

      const duplicates = targetDocuments.filter(doc => {
        const docId = doc._id || (doc as Record<string, string | undefined>)?.['id'] || ''
        return customerDocIds.has(docId)
      })

      if (duplicates.length > 0) {
        if (isBulkMode) {
          setDuplicateWarning(`${duplicates.length}개의 문서가 이미 선택한 고객과 연결되어 있습니다.`)
        } else {
          setDuplicateWarning('이 문서는 이미 선택한 고객과 연결되어 있습니다.')
        }
      }
    } catch (error) {
      console.error('고객 문서 조회 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLinkModal.handleSelectCustomer', payload: { customerId: customer._id } })
      setDuplicateWarning(null)
    }
  }

  /**
   * 최근 선택 고객에서 빠른 선택 처리
   */
  const handleQuickSelectCustomer = async (recentCustomer: RecentCustomer) => {
    // Customer 객체 형태로 변환
    const customer: Customer = {
      _id: recentCustomer._id,
      personal_info: {
        name: recentCustomer.name,
        mobile_phone: recentCustomer.phone,
        address: recentCustomer.address ? {
          address1: recentCustomer.address
        } : undefined
      }
    } as Customer

    // 기존 고객 선택 핸들러 호출
    await handleSelectCustomer(customer)
  }

  /**
   * 🍎 최근 고객 드롭다운 옵션 생성 (DocumentSearchView와 동일)
   */
  const recentCustomerOptions = useMemo((): DropdownOption[] => {
    const options: DropdownOption[] = [
      { value: '', label: '고객 미선택' }
    ]

    // 전역 상태에서 최근 고객 목록 가져오기
    const recent = getRecentCustomers()
    recent.forEach(customer => {
      options.push({
        value: customer._id,
        label: customer.name
      })
    })

    return options
  }, [recentCustomers, getRecentCustomers])

  /**
   * 🍎 최근 고객 드롭다운에서 선택 핸들러 (DocumentSearchView와 동일)
   */
  const handleRecentCustomerSelect = useCallback(async (customerId: string) => {
    if (!customerId) {
      // "고객 미선택" 선택
      setSelectedCustomer(null)
      setDuplicateWarning(null)
      return
    }

    // 전역 상태에서 최근 고객 목록 가져와서 찾기
    const recent = getRecentCustomers()
    const recentCustomer = recent.find(c => c._id === customerId)
    if (recentCustomer) {
      // Customer 객체 재구성
      await handleQuickSelectCustomer(recentCustomer)
    }
  }, [getRecentCustomers, handleQuickSelectCustomer])

  /**
   * 연결 실행 (단일/일괄 모두 지원)
   */
  const handleLink = async () => {
    if (targetDocuments.length === 0 || !selectedCustomer) return

    setLinkLoading(true)
    setFeedbackMessage(null)

    try {
      const trimmedNotes = notes.trim()
      let successCount = 0
      let failureCount = 0

      // 모든 문서에 대해 순차적으로 연결 시도
      for (const doc of targetDocuments) {
        const docId = doc._id || (doc as Record<string, string | undefined>)?.['id'] || ''
        if (!docId) {
          failureCount++
          continue
        }

        try {
          const params: { customerId: string; documentId: string; relationshipType: string; notes?: string } = {
            customerId: selectedCustomer._id,
            documentId: docId,
            relationshipType
          }
          if (trimmedNotes) {
            params.notes = trimmedNotes
          }
          await onLink(params)

          // TanStack Query 캐시 무효화 + 레거시 이벤트 (고객 상세 페이지 자동 새로고침용)
          invalidateQueries.documentLinked({
            documentId: docId,
            customerId: selectedCustomer._id,
            timestamp: new Date().toISOString()
          })

          successCount++
        } catch (err) {
          console.error(`문서 ${docId} 연결 실패:`, err)
          errorReporter.reportApiError(err as Error, { component: 'DocumentLinkModal.handleLink.item', payload: { docId, customerId: selectedCustomer._id } })
          failureCount++
        }
      }

      if (isBulkMode) {
        if (failureCount === 0) {
          setFeedbackMessage(`${successCount}개의 문서가 고객에게 성공적으로 연결되었습니다.`)
        } else {
          setFeedbackMessage(
            `${successCount}개 성공, ${failureCount}개 실패했습니다.`
          )
        }
      } else {
        setFeedbackMessage('문서가 고객에게 성공적으로 연결되었습니다.')
      }

      if (import.meta.env.DEV) {
        console.log('[DocumentLinkModal] 일괄 연결 완료:', {
          total: targetDocuments.length,
          success: successCount,
          failure: failureCount,
          customerId: selectedCustomer._id
        })
      }

      // 성공한 문서가 하나라도 있으면 모달 닫기
      if (successCount > 0) {
        onClose()
      }
    } catch (error) {
      console.error('문서 연결 오류:', error)
      errorReporter.reportApiError(error as Error, { component: 'DocumentLinkModal.handleLink' })
      const message =
        error instanceof Error
          ? error.message
          : '문서를 고객에게 연결하는 중 문제가 발생했습니다.'
      setFeedbackMessage(message)
    } finally {
      setLinkLoading(false)
    }
  }

  if (!visible || targetDocuments.length === 0) {
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
      size={isBulkMode ? "xl" : "md"}
      footer={footer}
      ariaLabel="문서를 고객에게 연결"
      className="document-link-modal"
    >
      {/* Document Info - 단일 문서 또는 여러 문서 리스트 */}
      <section className="document-link-modal__section document-link-modal__section--document">
        {isBulkMode ? (
          <>
            <div className="document-link-modal__bulk-header">
              <span className="document-link-modal__bulk-count">
                📄 {targetDocuments.length}개의 문서 선택됨
              </span>
            </div>
            <div className="document-link-modal__document-list">
              {targetDocuments.map((doc, index) => {
                const docId = doc._id || (doc as Record<string, string | undefined>)?.['id'] || ''
                // SearchResultItem과 Document 모두 지원
                const docName = ('payload' in doc || 'upload' in doc)
                  ? SearchService.getOriginalName(doc as SearchResultItem)
                  : DocumentStatusService.extractFilename(doc)
                const docStatus = DocumentStatusService.extractStatus(doc)
                const statusLabel = DocumentStatusService.getStatusLabel(docStatus)
                return (
                  <div key={docId || index} className="document-list-item">
                    <span className="document-list-item__icon" aria-hidden="true">📄</span>
                    <span className="document-list-item__name" title={docName}>
                      {docName}
                    </span>
                    <span className="document-list-item__status">{statusLabel}</span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="document-chip">
            <span className="document-chip__icon" aria-hidden="true">📄</span>
            <span className="document-chip__name">{documentName}</span>
            <span className="document-chip__status">
              {DocumentStatusService.getStatusLabel(DocumentStatusService.extractStatus(targetDocuments[0] || document!))}
            </span>
          </div>
        )}
      </section>

      {/* Customer Selection & Document Type */}
      <section className="document-link-modal__section">
        <div className="document-link-modal__main-row">
          {/* 🍎 고객 선택 (DocumentSearchView와 동일한 패턴) */}
          <div className="document-link-modal__customer-selection">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setIsCustomerSelectorOpen(true)}
            >
              고객선택
            </Button>

            {/* 🍎 선택된 고객 표시 또는 최근 고객 드롭다운 */}
            <div className="document-link-modal__selected-customer">
              {selectedCustomer ? (
                <>
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
                </>
              ) : (
                <Dropdown
                  value=""
                  options={recentCustomerOptions}
                  onChange={handleRecentCustomerSelect}
                  width="100%"
                  aria-label="최근 선택한 고객"
                />
              )}
            </div>
          </div>

          {/* 문서 유형 */}
          <div className="document-link-modal__field document-link-modal__field--inline">
            <label htmlFor="relationship-type">문서 유형</label>
            <Dropdown
              value={relationshipType}
              options={relationshipOptions}
              onChange={setRelationshipType}
              aria-label="문서 유형 선택"
              width="100%"
            />
          </div>
        </div>
      </section>

    {/* Memo */}
    <section className="document-link-modal__section">
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
          rows={2}
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

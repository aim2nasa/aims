/**
 * DocumentLinkModal Component
 * @version 2.0.0 - 🍎 iOS 스타일 모달 디자인 통일
 * @description 문서를 고객에게 연결하는 모달
 *
 * - React Portal 사용
 * - 드래그로 이동 가능
 * - ESC 키로 닫기
 * - iOS 스타일 디자인
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Document, DocumentCustomerRelation } from '../../../../types/documentStatus'
import { DocumentStatusService } from '../../../../services/DocumentStatusService'
import type { Customer, CustomerSearchResponse } from '@/entities/customer'
import type { CustomerDocumentsResult } from '../../../../services/DocumentService'
import { Button, Dropdown, type DropdownOption, Input, Tooltip } from '../../../../shared/ui'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../../../SFSymbol'
import './DocumentLinkModal.css'

interface DocumentLinkModalProps {
  visible: boolean
  document: Document | null
  onClose: () => void
  onSearchCustomers: (searchTerm: string, page?: number, limit?: number) => Promise<CustomerSearchResponse>
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

const SEARCH_LIMIT = 20

export const DocumentLinkModal: React.FC<DocumentLinkModalProps> = ({
  visible,
  document,
  onClose,
  onSearchCustomers,
  onFetchCustomerDocuments,
  onLink
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<{ currentPage: number; totalPages: number; totalCount: number } | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [relationshipType, setRelationshipType] = useState<string>('general')
  const [notes, setNotes] = useState<string>('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)

  // 🍎 드래그 상태 관리
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOriginRef = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

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
      setSearchTerm('')
      setSearchResults([])
      setSearchError(null)
      setPagination(null)
      setSelectedCustomerId(null)
      setSelectedCustomer(null)
      setRelationshipType('general')
      setNotes('')
      setDuplicateWarning(null)
      setFeedbackMessage(null)
      setCurrentPage(1)
    }
  }, [visible])

  /**
   * 드래그 중 핸들러
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const newX = e.clientX - dragOriginRef.current.x
    const newY = e.clientY - dragOriginRef.current.y

    setPosition({ x: newX, y: newY })
  }, [isDragging])

  /**
   * 드래그 종료 핸들러
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  /**
   * 드래그 이벤트 리스너 등록
   */
  useEffect(() => {
    if (isDragging) {
      window.document.addEventListener('mousemove', handleMouseMove)
      window.document.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.document.removeEventListener('mousemove', handleMouseMove)
        window.document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    return undefined
  }, [isDragging, handleMouseMove, handleMouseUp])

  /**
   * Escape 키로 모달 닫기
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && visible) {
        onClose()
      }
    }

    if (visible) {
      window.document.addEventListener('keydown', handleKeyDown)
      window.document.body.style.overflow = 'hidden'
    }

    return () => {
      window.document.removeEventListener('keydown', handleKeyDown)
      window.document.body.style.overflow = 'unset'
    }
  }, [visible, onClose])

  /**
   * 고객 검색 (디바운스)
   */
  useEffect(() => {
    if (!visible) return

    const trimmed = searchTerm.trim()
    if (!trimmed) {
      setSearchResults([])
      setPagination(null)
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    let isCancelled = false
    setSearchLoading(true)
    setSearchError(null)

    const timer = window.setTimeout(() => {
      onSearchCustomers(trimmed, currentPage, SEARCH_LIMIT)
        .then((response) => {
          if (isCancelled) return
          const customers = response.customers ?? []
          const normalize = (value: string) =>
            value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
          const keyword = normalize(trimmed)
          const filtered = customers.filter((customer) => {
            const name = customer.personal_info?.name
            const phone =
              customer.personal_info?.mobile_phone ?? customer.personal_info?.home_phone ?? customer.personal_info?.work_phone ??
              customer.personal_info?.mobile_phone ??
              customer.personal_info?.home_phone ??
              customer.personal_info?.work_phone
            return (
              (name && normalize(name).includes(keyword)) ||
              (phone && normalize(phone).includes(keyword))
            )
          })

          setSearchResults(filtered)
          setPagination({
            currentPage: 1,
            totalPages: 1,
            totalCount: filtered.length
          })
        })
        .catch((error) => {
          if (isCancelled) return
          console.error('고객 검색 오류:', error)
          setSearchError('고객 검색에 실패했습니다.')
          setSearchResults([])
          setPagination(null)
        })
        .finally(() => {
          if (!isCancelled) {
            setSearchLoading(false)
          }
        })
    }, 300)

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
    }
  }, [searchTerm, currentPage, visible, onSearchCustomers])

  /**
   * 검색어 변경 시 페이지 초기화
   */
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  /**
   * 고객 선택 시 중복 연결 검사
   */
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomerId(customer._id)
    setSelectedCustomer(customer)
    setDuplicateWarning(null)
    setFeedbackMessage(null)

    if (!documentId) return

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
   * 고객 검색 결과 페이지 변경
   */
  const handlePageChange = (direction: 'prev' | 'next') => {
    if (!pagination) return

    if (direction === 'prev' && pagination.currentPage > 1) {
      setCurrentPage(pagination.currentPage - 1)
    } else if (direction === 'next' && pagination.currentPage < pagination.totalPages) {
      setCurrentPage(pagination.currentPage + 1)
    }
  }

  /**
   * 연결 실행
   */
  const handleLink = async () => {
    if (!documentId || !selectedCustomerId) return

    setLinkLoading(true)
    setFeedbackMessage(null)

    try {
      const _params: { customerId: string; documentId: string; relationshipType: string; notes?: string } = {
        customerId: selectedCustomerId,
        documentId,
        relationshipType
      };
      const _trimmed = notes.trim();
      if (_trimmed) { _params.notes = _trimmed; }
      await onLink(_params)

      setFeedbackMessage('문서가 고객에게 성공적으로 연결되었습니다.')
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

  /**
   * 배경 클릭 시 닫기
   */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  if (!visible || !document) {
    return null
  }

  const isLinkDisabled = !selectedCustomerId || Boolean(duplicateWarning) || linkLoading
  const totalResults = pagination?.totalCount ?? searchResults.length

  const modalBody = (
    <div
      className="document-link-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="document-link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-link-modal-title"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        {/* Header - 드래그 가능 */}
        <header
          className="document-link-modal__header"
          onMouseDown={(e) => {
            if (e.button !== 0) return // 왼쪽 클릭만
            if (!modalRef.current) return

            setIsDragging(true)
            const rect = modalRef.current.getBoundingClientRect()
            dragOriginRef.current = {
              x: e.clientX - rect.left + position.x,
              y: e.clientY - rect.top + position.y
            }
          }}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div className="document-link-modal__title">
            <SFSymbol
              name="person.crop.circle.badge.plus"
              size={SFSymbolSize.TITLE_2}
              weight={SFSymbolWeight.MEDIUM}
              decorative={true}
            />
            <h2 id="document-link-modal-title">문서를 고객에게 연결</h2>
          </div>
          <button
            type="button"
            className="document-link-modal__close"
            onClick={onClose}
            aria-label="모달 닫기"
          >
            ×
          </button>
        </header>

        <div className="document-link-modal__content">
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

          {/* Search */}
          <section className="document-link-modal__section">
            <h3>고객 검색</h3>
            <Input
              placeholder="예: 김철수, 010-1234-5678"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              leftIcon={
                <SFSymbol
                  name="magnifyingglass"
                  size={SFSymbolSize.CAPTION_1}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
              }
              fullWidth
            />
            {searchError && <p className="document-link-modal__error">{searchError}</p>}

          {/* Search Feedback */}
          {searchTerm && (
            <div className="document-link-modal__search-feedback">
              <span>
                검색 결과 <strong>{totalResults}</strong>명
              </span>
              {totalResults > SEARCH_LIMIT && (
                <span className="document-link-modal__hint">더 구체적인 검색어를 입력하면 정확도가 높아집니다.</span>
              )}
            </div>
          )}

          {/* Results */}
          <div className="document-link-modal__results">
            {searchLoading ? (
              <div className="document-link-modal__loader">
                <span className="document-link-modal__spinner" aria-label="검색 중" />
                <span>고객을 검색하고 있습니다...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <ul className="customer-result-list" role="listbox">
                {searchResults.map((customer) => {
                  const isSelected = selectedCustomerId === customer._id
                  const displayName = customer.personal_info?.name || '이름 없음'
                  const phone =
                    customer.personal_info?.mobile_phone ?? customer.personal_info?.home_phone ?? customer.personal_info?.work_phone ??
                    customer.personal_info?.mobile_phone ??
                    customer.personal_info?.home_phone ??
                    customer.personal_info?.work_phone ??
                    '연락처 없음'
                  const customerType = customer.insurance_info?.customer_type || '유형 없음'

                  return (
                    <li
                      key={customer._id}
                      className={`document-link-modal__customer-item ${isSelected ? 'document-link-modal__customer-item--selected' : ''}`}
                      onClick={() => handleSelectCustomer(customer)}
                      aria-pressed={isSelected}
                      role="option"
                    >
                      <div className="document-link-modal__customer-item-row">
                        <span className="document-link-modal__customer-item-name">{displayName}</span>
                        <span className="document-link-modal__customer-item-info">
                          <span className="document-link-modal__customer-item-phone">{phone}</span>
                          <span className="document-link-modal__customer-item-divider">•</span>
                          <span className="document-link-modal__customer-item-type" title={customerType}>{customerType}</span>
                        </span>
                        {isSelected && <span className="document-link-modal__customer-item-tag">선택됨</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : searchTerm ? (
              <div className="document-link-modal__empty">
                <span>검색 결과가 없습니다.</span>
              </div>
            ) : (
              <div className="document-link-modal__empty">
                <span>검색어를 입력하면 고객을 찾을 수 있습니다.</span>
              </div>
            )}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="document-link-modal__pagination">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange('prev')}
                disabled={pagination.currentPage <= 1}
              >
                이전
              </Button>
              <span className="document-link-modal__pagination-info">
                {pagination.currentPage} / {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange('next')}
                disabled={pagination.currentPage >= pagination.totalPages}
              >
                다음
              </Button>
            </div>
          )}
        </section>

        {/* Selected customer */}
        {selectedCustomer && (
          <section className="document-link-modal__section">
            <div className="selected-customer">
              <div className="selected-customer__meta">
                <SFSymbol
                  name="person.circle"
                  size={SFSymbolSize.TITLE_3}
                  weight={SFSymbolWeight.REGULAR}
                  decorative={true}
                />
                <div>
                  <span className="selected-customer__name">{selectedCustomer.personal_info?.name}</span>
                  <span className="selected-customer__info">
                    {selectedCustomer.personal_info?.mobile_phone || '연락처 없음'} · {selectedCustomer.insurance_info?.customer_type || '유형 미입력'}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedCustomerId(null)
                  setSelectedCustomer(null)
                  setDuplicateWarning(null)
                }}
              >
                선택 해제
              </Button>
            </div>
          </section>
        )}

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
        </div>

        {/* Footer */}
        <footer className="document-link-modal__footer">
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
              variant="secondary"
              size="md"
              onClick={handleLink}
              disabled={isLinkDisabled}
              loading={linkLoading}
              className="document-link-modal__button document-link-modal__button--confirm"
            >
              연결하기
            </Button>
          </Tooltip>
        </footer>
      </div>
    </div>
  )

  return createPortal(modalBody, window.document.body)
}

export default DocumentLinkModal

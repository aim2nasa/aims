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
  const [relationshipType, setRelationshipType] = useState<string>('general')
  const [notes, setNotes] = useState<string>('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const prevSearchTermRef = useRef<string>('')
  const isSearchStableRef = useRef<boolean>(true) // 검색 결과가 안정화되었는지 추적
  const onSearchCustomersRef = useRef(onSearchCustomers) // 함수 참조 고정
  const clickCountRef = useRef<number>(0) // 클릭 횟수 추적

  // 입력 변경 감지용 refs
  const lastChangeTimestampRef = useRef<number>(0) // 마지막 onChange 시간
  const pendingValueRef = useRef<string | null>(null) // 복원 대기 중인 값

  // 함수 참조 업데이트
  useEffect(() => {
    onSearchCustomersRef.current = onSearchCustomers
  }, [onSearchCustomers])

  // 🍎 드래그 상태 관리
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 }) // 드래그 시작 시 마우스 위치
  const modalRef = useRef<HTMLDivElement>(null)
  const wasDraggingRef = useRef(false) // 드래그 직후인지 추적

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
      clickCountRef.current = 0
      setSearchTerm('')
      setSearchResults([])
      setSearchError(null)
      setPagination(null)
      setSelectedCustomerId(null)
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
    if (!isDragging || !modalRef.current) return

    const deltaX = e.clientX - dragStartRef.current.x
    const deltaY = e.clientY - dragStartRef.current.y

    setPosition({ x: deltaX, y: deltaY })
  }, [isDragging])

  /**
   * 드래그 종료 핸들러
   */
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      wasDraggingRef.current = true
      // 100ms 후 드래그 상태 해제 (클릭 이벤트 발생 방지)
      setTimeout(() => {
        wasDraggingRef.current = false
      }, 100)
    }
    setIsDragging(false)
  }, [isDragging])

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
      isSearchStableRef.current = true // 빈 검색어는 즉시 안정화
      return
    }

    // 검색어가 변경되면 페이지를 1로 리셋
    if (prevSearchTermRef.current !== trimmed) {
      prevSearchTermRef.current = trimmed
      if (currentPage !== 1) {
        setCurrentPage(1)
        return // 페이지 변경 후 이 useEffect가 다시 실행됨
      }
    }

    let isCancelled = false
    isSearchStableRef.current = false // 검색 시작 - 불안정 상태
    setSearchLoading(true)
    setSearchError(null)

    const timer = window.setTimeout(() => {
      onSearchCustomersRef.current(trimmed, currentPage, SEARCH_LIMIT)
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

          // 검색 결과 렌더링 후 안정화 (150ms 대기)
          setTimeout(() => {
            if (!isCancelled) {
              isSearchStableRef.current = true
            }
          }, 150)
        })
        .catch((error) => {
          if (isCancelled) return
          console.error('고객 검색 오류:', error)
          setSearchError('고객 검색에 실패했습니다.')
          setSearchResults([])
          setPagination(null)
          isSearchStableRef.current = true // 에러 시에도 안정화
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
  }, [searchTerm, currentPage, visible]) // onSearchCustomers 제거 - ref로 관리

  /**
   * 고객 선택 시 중복 연결 검사
   */
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomerId(customer._id)
    setDuplicateWarning(null)
    setFeedbackMessage(null)

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

  if (!visible || !document) {
    return null
  }

  const isLinkDisabled = !selectedCustomerId || Boolean(duplicateWarning) || linkLoading

  const modalBody = (
    <div
      className="document-link-modal-backdrop"
      role="presentation"
    >
      <div
        ref={modalRef}
        className="document-link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-link-modal-title"
        style={{
          ...(position ? { transform: `translate(${position.x}px, ${position.y}px)` } : {}),
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
            dragStartRef.current = {
              x: e.clientX,
              y: e.clientY
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
              autoComplete="off"
              onChange={(event) => {
                const now = performance.now()
                const newValue = event.target.value

                // 🚫 자동 삭제/재입력 사이클 감지
                // Case 1: 값이 빈 문자열로 변경되는 경우 - 복원 대기 모드 진입
                if (!newValue && searchTerm.trim()) {
                  pendingValueRef.current = searchTerm
                  lastChangeTimestampRef.current = now

                  // 100ms 후에도 복원되지 않으면 정상 삭제로 간주
                  setTimeout(() => {
                    if (pendingValueRef.current === searchTerm) {
                      pendingValueRef.current = null
                      setSearchTerm('')
                    }
                  }, 100)

                  return
                }

                // Case 2: 복원 대기 중인 경우 - 모든 변경 차단
                if (pendingValueRef.current) {
                  const timeSinceEmpty = now - lastChangeTimestampRef.current

                  if (timeSinceEmpty < 100) {
                    // 100ms 이내 = 자동 사이클
                    pendingValueRef.current = null
                    return
                  } else {
                    // 100ms 이후 = 정상 입력
                    pendingValueRef.current = null
                  }
                }

                // 정상적인 변경 - 상태 업데이트
                pendingValueRef.current = null
                lastChangeTimestampRef.current = now
                setSearchTerm(newValue)
              }}
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

          {/* Results */}
          <div className="document-link-modal__results">
            {searchLoading ? (
              <div className="document-link-modal__loader">
                <span className="document-link-modal__spinner" aria-label="검색 중" />
                <span>고객을 검색하고 있습니다...</span>
              </div>
            ) : searchResults.length > 0 ? (
              <ul className="customer-result-list" role="listbox">
                {searchResults.map((customer, index) => {
                  const isSelected = selectedCustomerId === customer._id
                  const displayName = customer.personal_info?.name || '이름 없음'
                  const phone =
                    customer.personal_info?.mobile_phone ?? customer.personal_info?.home_phone ?? customer.personal_info?.work_phone ??
                    customer.personal_info?.mobile_phone ??
                    customer.personal_info?.home_phone ??
                    customer.personal_info?.work_phone ??
                    '연락처 없음'

                  // address가 객체일 수 있으므로 문자열로 변환
                  const addressObj = customer.personal_info?.address
                  const address = typeof addressObj === 'string'
                    ? addressObj
                    : addressObj && typeof addressObj === 'object'
                      ? `${addressObj.address1 || ''} ${addressObj.address2 || ''}`.trim() || '주소 없음'
                      : '주소 없음'

                  return (
                    <li
                      key={customer._id}
                      className={`document-link-modal__customer-item ${isSelected ? 'document-link-modal__customer-item--selected' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault()

                        // 검색 결과가 안정화되지 않았으면 클릭 무시
                        if (!isSearchStableRef.current) {
                          return
                        }

                        if (isSelected) {
                          setSelectedCustomerId(null)
                          setDuplicateWarning(null)
                        } else {
                          handleSelectCustomer(customer)
                        }
                      }}
                      aria-pressed={isSelected}
                      role="option"
                    >
                      <div className="document-link-modal__customer-item-row">
                        <span className="document-link-modal__customer-item-check">
                          {isSelected && (
                            <SFSymbol
                              name="checkmark.circle.fill"
                              size={SFSymbolSize.FOOTNOTE}
                              weight={SFSymbolWeight.SEMIBOLD}
                              decorative={true}
                            />
                          )}
                        </span>
                        <span className="document-link-modal__customer-item-number">{index + 1}</span>
                        <span className="document-link-modal__customer-item-name">{displayName}</span>
                        <span className="document-link-modal__customer-item-phone">{phone}</span>
                        <span className="document-link-modal__customer-item-address">{address}</span>
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
        </footer>
      </div>
    </div>
  )

  return createPortal(modalBody, window.document.body)
}

export default DocumentLinkModal

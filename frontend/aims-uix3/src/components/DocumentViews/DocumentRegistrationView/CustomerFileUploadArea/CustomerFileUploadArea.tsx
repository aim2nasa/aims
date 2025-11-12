/**
 * CustomerFileUploadArea Component
 * @since 1.0.0
 *
 * 고객 파일 등록 시 고객 선택과 문서 유형 선택 UI
 * - 고객 선택 (최근 고객 드롭다운 + 고객 검색 모달)
 * - 문서 유형 선택
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Button, Dropdown, type DropdownOption } from '@/shared/ui'
import { CustomerSelectorModal } from '@/shared/ui/CustomerSelectorModal'
import Tooltip from '@/shared/ui/Tooltip'
import type { Customer } from '@/entities/customer'
import { useRecentCustomersStore } from '@/shared/store/useRecentCustomersStore'
import './CustomerFileUploadArea.css'

interface CustomerFileUploadAreaProps {
  /** 선택된 고객 */
  selectedCustomer: Customer | null
  /** 고객 선택 핸들러 */
  onCustomerSelect: (customer: Customer | null) => void
  /** 선택된 문서 유형 */
  documentType: string
  /** 문서 유형 선택 핸들러 */
  onDocumentTypeChange: (type: string) => void
  /** 메모 */
  notes: string
  /** 메모 변경 핸들러 */
  onNotesChange: (notes: string) => void
  /** 비활성화 여부 */
  disabled: boolean
  /** 메모 영역 펼침 상태 */
  isNotesExpanded: boolean
  /** 메모 영역 토글 핸들러 */
  onToggleNotes: () => void
  /** 초기화 버튼 표시 여부 */
  showResetButton?: boolean
  /** 초기화 핸들러 */
  onReset?: () => void
  /** 초기화 버튼 비활성화 여부 */
  resetDisabled?: boolean
}

// 문서 유형 옵션 (DocumentLinkModal과 동일)
const DOCUMENT_TYPE_OPTIONS: DropdownOption[] = [
  { value: 'unspecified', label: '미지정' },
  { value: 'general', label: '일반 문서' },
  { value: 'contract', label: '계약서' },
  { value: 'claim', label: '보험금청구서' },
  { value: 'proposal', label: '제안서' },
  { value: 'id_verification', label: '신분증명서' },
  { value: 'medical', label: '의료서류' }
]

/**
 * CustomerFileUploadArea React 컴포넌트
 */
export const CustomerFileUploadArea: React.FC<CustomerFileUploadAreaProps> = ({
  selectedCustomer,
  onCustomerSelect,
  documentType,
  onDocumentTypeChange,
  notes,
  onNotesChange,
  disabled,
  isNotesExpanded,
  onToggleNotes,
  showResetButton = false,
  onReset,
  resetDisabled = false
}) => {
  // 고객 선택 모달 상태
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false)
  // 최근 선택한 고객 목록 (전역 상태)
  const { recentCustomers, addRecentCustomer, getRecentCustomers } = useRecentCustomersStore()

  // 문서유형 기본값 보장 (빈 문자열이면 'unspecified'로 설정)
  const effectiveDocumentType = documentType || 'unspecified'

  /**
   * 고객 선택 해제 시 문서유형을 "미지정"으로 리셋
   */
  useEffect(() => {
    if (!selectedCustomer && documentType !== 'unspecified') {
      onDocumentTypeChange('unspecified')
    }
  }, [selectedCustomer, documentType, onDocumentTypeChange])

  /**
   * 최근 고객 드롭다운 옵션 생성 (DocumentLinkModal과 동일)
   */
  const recentCustomerOptions = useMemo(() => {
    const options: DropdownOption[] = [
      {
        value: '',
        label: '고객 미선택'
      }
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
   * 최근 고객 드롭다운에서 선택 핸들러
   */
  const handleRecentCustomerSelect = useCallback((customerId: string) => {
    if (!customerId) {
      // "고객 미선택" 선택
      onCustomerSelect(null)
      return
    }

    // 전역 상태에서 최근 고객 목록 가져와서 찾기
    const recent = getRecentCustomers()
    const recentCustomer = recent.find(c => c._id === customerId)
    if (recentCustomer) {
      // Customer 객체 재구성
      onCustomerSelect({
        _id: recentCustomer._id,
        personal_info: {
          name: recentCustomer.name
        }
      } as Customer)
    }
  }, [getRecentCustomers, onCustomerSelect])

  /**
   * 고객 선택 모달에서 고객 선택 핸들러
   */
  const handleCustomerSelected = useCallback((customer: Customer) => {
    onCustomerSelect(customer)
    setIsCustomerSelectorOpen(false)

    // 최근 고객 목록에 추가 (전역 상태 자동 업데이트)
    addRecentCustomer(customer)
  }, [onCustomerSelect, addRecentCustomer])

  return (
    <div className="customer-file-upload-area">
      {/* 고객 선택 & 문서 유형 선택 & 초기화 버튼 (한 줄) */}
      <div className="customer-file-upload-area__main-row">
        {/* 고객 선택 영역 */}
        <div className="customer-file-upload-area__customer-selection">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsCustomerSelectorOpen(true)}
            disabled={disabled}
          >
            고객선택
          </Button>

          {/* 선택된 고객 표시 또는 최근 고객 드롭다운 */}
          <div className="customer-file-upload-area__selected-customer">
            {selectedCustomer ? (
              <>
                <span className="selected-customer-name">
                  {selectedCustomer.personal_info?.name || '이름 없음'}
                </span>
                <button
                  className="clear-customer-button"
                  onClick={() => onCustomerSelect(null)}
                  aria-label="고객 선택 해제"
                  title="고객 선택 해제"
                  disabled={disabled}
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
        <div className="customer-file-upload-area__field customer-file-upload-area__field--inline">
          <label htmlFor="document-type">문서 유형</label>
          <Dropdown
            value={effectiveDocumentType}
            options={DOCUMENT_TYPE_OPTIONS}
            onChange={onDocumentTypeChange}
            disabled={!selectedCustomer}
            aria-label="문서 유형 선택"
          />
        </div>

        {/* 초기화 버튼 (옵션) */}
        {showResetButton && onReset && (
          <Tooltip content="초기화">
            <button
              onClick={onReset}
              disabled={resetDisabled}
              className="customer-file-upload-area__reset-button"
              aria-label="초기화"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 8C2 4.68629 4.68629 2 8 2C9.88447 2 11.5551 2.93087 12.6083 4.35M14 8C14 11.3137 11.3137 14 8 14C6.11553 14 4.44487 13.0691 3.39167 11.65M12.6083 4.35H9M12.6083 4.35V1M3.39167 11.65H7M3.39167 11.65V15"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"/>
              </svg>
            </button>
          </Tooltip>
        )}
      </div>

      {/* 메모 입력 영역 (접을 수 있음) */}
      <div className={`notes-section ${isNotesExpanded ? 'notes-section--expanded' : 'notes-section--collapsed'}`}>
        <button
          type="button"
          className="notes-section__toggle"
          onClick={onToggleNotes}
          aria-expanded={isNotesExpanded}
          aria-label={isNotesExpanded ? '메모 접기' : '메모 펼치기'}
        >
          <div className="notes-header">
            <span className="notes-label">메모 (선택사항)</span>
            <span className="notes-toggle-icon" aria-hidden="true">
              {isNotesExpanded ? '▲' : '▼'}
            </span>
          </div>
        </button>

        {isNotesExpanded && (
          <textarea
            className="notes-input"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="이 문서와 고객의 관계에 대한 참고 메모를 남겨주세요."
            rows={3}
            disabled={disabled || !selectedCustomer}
            aria-label="메모"
          />
        )}
      </div>

      {/* 고객 선택 모달 */}
      <CustomerSelectorModal
        visible={isCustomerSelectorOpen}
        onClose={() => setIsCustomerSelectorOpen(false)}
        onSelect={handleCustomerSelected}
      />
    </div>
  )
}

export default CustomerFileUploadArea

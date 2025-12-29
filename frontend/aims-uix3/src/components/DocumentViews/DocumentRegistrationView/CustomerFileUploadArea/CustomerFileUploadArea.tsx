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
  /** 비활성화 여부 */
  disabled: boolean
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
  disabled
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
      {/* 하나의 경계 박스: 고객 선택 + 고객 정보 + 문서 유형 + 메모 */}
      <div className="customer-file-upload-area__content-box">
        {/* 첫 번째 행: 고객 선택 버튼 + 고객 정보 */}
        <div className="customer-file-upload-area__main-row">
          {/* 고객 선택 버튼 */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsCustomerSelectorOpen(true)}
            disabled={disabled}
          >
            고객 선택
          </Button>

          {/* 선택된 고객 표시 또는 최근 고객 드롭다운 */}
          <div className="customer-file-upload-area__selected-customer">
            {selectedCustomer ? (
              <div className="selected-customer-name">
                <span className="selected-customer-text">
                  {selectedCustomer.personal_info?.name || '이름 없음'}
                </span>
                <button
                  className="clear-customer-button"
                  onClick={() => onCustomerSelect(null)}
                  aria-label="고객 선택 해제"
                  disabled={disabled}
                >
                  ✕
                </button>
              </div>
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

        {/* 문서 유형 선택 - 고객 선택 시에만 표시 */}
        {selectedCustomer && (
          <div className="options-section">
            <div className="options-content">
              <div className="options-field">
                <label className="options-field__label">문서 유형</label>
                <Dropdown
                  value={effectiveDocumentType}
                  options={DOCUMENT_TYPE_OPTIONS}
                  onChange={onDocumentTypeChange}
                  aria-label="문서 유형 선택"
                />
              </div>
            </div>
          </div>
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

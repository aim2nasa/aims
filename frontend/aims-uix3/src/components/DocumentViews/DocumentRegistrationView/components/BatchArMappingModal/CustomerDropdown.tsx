/**
 * CustomerDropdown
 * @description 고객 선택 드롭다운 컴포넌트
 */

import React, { useState, useRef, useEffect } from 'react'
import type { Customer } from '@/features/customer/types/customer'
import type { MatchStatus } from '../../types/arBatchTypes'

export interface CustomerDropdownProps {
  /** 그룹 ID */
  groupId: string
  /** 현재 선택값 표시 */
  value: string
  /** 매칭된 고객 목록 */
  matchingCustomers: Customer[]
  /** 매칭 상태 */
  matchStatus: MatchStatus
  /** 선택된 고객 ID */
  selectedCustomerId: string | null
  /** 고객 선택 */
  onSelectCustomer: (groupId: string, customerId: string | null, customerName?: string) => void
  /** 새 고객 등록 모달 열기 */
  onOpenNewCustomerModal: () => void
  /** 고객 검색 모달 열기 */
  onOpenCustomerSearchModal: () => void
  /** 비활성화 */
  disabled?: boolean
}

export const CustomerDropdown: React.FC<CustomerDropdownProps> = ({
  groupId,
  value,
  matchingCustomers,
  matchStatus,
  selectedCustomerId,
  onSelectCustomer,
  onOpenNewCustomerModal,
  onOpenCustomerSearchModal,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }

  const handleSelectCustomer = (customer: Customer) => {
    onSelectCustomer(groupId, customer._id, customer.personal_info?.name)
    setIsOpen(false)
  }

  const handleNewCustomer = () => {
    setIsOpen(false)
    onOpenNewCustomerModal()
  }

  const handleSearchCustomer = () => {
    setIsOpen(false)
    onOpenCustomerSearchModal()
  }

  return (
    <div className="customer-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`customer-dropdown__trigger ${isOpen ? 'customer-dropdown__trigger--open' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="customer-dropdown__value">{value}</span>
        <span className="customer-dropdown__arrow">▼</span>
      </button>

      {isOpen && (
        <div className="customer-dropdown__menu" role="listbox">
          {/* 매칭된 고객 목록 */}
          {matchingCustomers.length > 0 && (
            <>
              {matchingCustomers.map(customer => (
                <button
                  key={customer._id}
                  type="button"
                  className={`customer-dropdown__option ${selectedCustomerId === customer._id ? 'customer-dropdown__option--selected' : ''}`}
                  onClick={() => handleSelectCustomer(customer)}
                  role="option"
                  aria-selected={selectedCustomerId === customer._id}
                >
                  <span className="customer-dropdown__option-name">
                    {customer.personal_info?.name || '이름 없음'}
                  </span>
                  <span className="customer-dropdown__option-type">
                    ({customer.insurance_info?.customer_type || '개인'})
                  </span>
                  {selectedCustomerId === customer._id && (
                    <span className="customer-dropdown__option-check">✓</span>
                  )}
                </button>
              ))}
              <div className="customer-dropdown__divider" />
            </>
          )}

          {/* 새 고객 등록 */}
          <button
            type="button"
            className="customer-dropdown__option customer-dropdown__option--action"
            onClick={handleNewCustomer}
            role="option"
          >
            <span className="customer-dropdown__option-icon">➕</span>
            <span className="customer-dropdown__option-text">새 고객 등록</span>
          </button>

          {/* 다른 고객 검색 */}
          <button
            type="button"
            className="customer-dropdown__option customer-dropdown__option--action"
            onClick={handleSearchCustomer}
            role="option"
          >
            <span className="customer-dropdown__option-icon">🔍</span>
            <span className="customer-dropdown__option-text">
              {matchingCustomers.length > 0 ? '다른 고객 검색' : '기존 고객 검색'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export default CustomerDropdown

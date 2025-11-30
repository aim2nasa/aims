/**
 * AIMS UIX-3 Customer Detail - Contracts Tab
 * @since 2025-11-30
 *
 * 🍎 고객의 보험 계약 목록 표시
 * - 칼럼: 상품명, 계약일, 증권번호, 보험료, 이체일, 납입주기, 납입상태
 * - 정렬, 페이지네이션 지원
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react'
import type { Customer } from '@/entities/customer/model'
import type { Contract } from '@/entities/contract/model'
import { ContractService } from '@/services/contractService'
import { ContractUtils } from '@/entities/contract/model'
import { Tooltip } from '@/shared/ui'
import { Dropdown } from '@/shared/ui'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import './ContractsTab.css'

interface ContractsTabProps {
  customer: Customer
  onContractCountChange?: (count: number) => void
}

// 🍎 페이지당 항목 수 옵션
const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

// 🍎 정렬 필드 타입
type SortField = 'product_name' | 'contract_date' | 'policy_number' | 'premium' | 'payment_day' | 'payment_cycle' | 'payment_status'
type SortDirection = 'asc' | 'desc'

export const ContractsTab: React.FC<ContractsTabProps> = ({
  customer,
  onContractCountChange
}) => {
  // 🍎 상태 관리
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🍎 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // 🍎 정렬 상태
  const [sortField, setSortField] = useState<SortField>('contract_date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // 🍎 계약 데이터 로드
  const loadContracts = useCallback(async () => {
    if (!customer?._id) return

    setIsLoading(true)
    setError(null)

    try {
      const data = await ContractService.getContractsByCustomer(customer._id)
      setContracts(data)
      onContractCountChange?.(data.length)
    } catch (err) {
      console.error('[ContractsTab] 계약 로드 실패:', err)
      setError(err instanceof Error ? err.message : '계약 정보를 불러올 수 없습니다.')
      onContractCountChange?.(0)
    } finally {
      setIsLoading(false)
    }
  }, [customer?._id, onContractCountChange])

  // 🍎 초기 로드
  useEffect(() => {
    void loadContracts()
  }, [loadContracts])

  // 🍎 contractChanged 이벤트 리스너
  useEffect(() => {
    const handleContractChanged = () => {
      if (import.meta.env.DEV) {
        console.log('[ContractsTab] contractChanged 이벤트 수신 - 새로고침')
      }
      void loadContracts()
    }

    window.addEventListener('contractChanged', handleContractChanged)
    return () => {
      window.removeEventListener('contractChanged', handleContractChanged)
    }
  }, [loadContracts])

  // 🍎 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1)
  }, [sortField])

  // 🍎 정렬된 계약 목록
  const sortedContracts = useMemo(() => {
    return [...contracts].sort((a, b) => {
      let aValue: string | number | null
      let bValue: string | number | null

      switch (sortField) {
        case 'product_name':
          aValue = a.product_name ?? ''
          bValue = b.product_name ?? ''
          break
        case 'contract_date':
          aValue = a.contract_date ?? ''
          bValue = b.contract_date ?? ''
          break
        case 'policy_number':
          aValue = a.policy_number ?? ''
          bValue = b.policy_number ?? ''
          break
        case 'premium':
          aValue = a.premium ?? 0
          bValue = b.premium ?? 0
          break
        case 'payment_day':
          aValue = a.payment_day ?? ''
          bValue = b.payment_day ?? ''
          break
        case 'payment_cycle':
          aValue = a.payment_cycle ?? ''
          bValue = b.payment_cycle ?? ''
          break
        case 'payment_status':
          aValue = a.payment_status ?? ''
          bValue = b.payment_status ?? ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [contracts, sortField, sortDirection])

  // 🍎 페이지네이션 계산
  const totalPages = Math.ceil(sortedContracts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedContracts = sortedContracts.slice(startIndex, endIndex)

  // 🍎 페이지 변경
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // 🍎 페이지당 항목 수 변경
  const handleLimitChange = useCallback((limit: number) => {
    setItemsPerPage(limit)
    setCurrentPage(1)
  }, [])

  // 🍎 총 보험료 계산
  const totalPremium = useMemo(() => {
    return contracts.reduce((sum, c) => sum + (c.premium || 0), 0)
  }, [contracts])

  // 🍎 가장 긴 상품명 기준으로 칼럼폭 계산
  const productColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 200 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.product_name || '').length))
    // 글자당 약 8px, 최소 150px, 최대 400px
    const calculatedWidth = Math.max(150, Math.min(400, maxLength * 8 + 40))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 계약일 기준
  const contractDateColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.contract_date || '').length))
    // 글자당 약 7px, 최소 80px, 최대 120px
    const calculatedWidth = Math.max(80, Math.min(120, maxLength * 7 + 16))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 증권번호 기준
  const policyNumberColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 115 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.policy_number || '').length))
    // 글자당 약 7px, 최소 80px, 최대 160px
    const calculatedWidth = Math.max(80, Math.min(160, maxLength * 7 + 16))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 보험료 기준
  const premiumColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => {
      const formatted = ContractUtils.formatPremium(c.premium)
      return formatted.length
    }))
    // 글자당 약 8px, 최소 70px, 최대 140px
    const calculatedWidth = Math.max(70, Math.min(140, maxLength * 8 + 16))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 이체일 기준
  const paymentDayColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 75 // 기본값
    const maxLength = Math.max(...contracts.map(c => {
      const day = c.payment_day || '-'
      return day.length
    }))
    // 글자당 약 8px, 최소 50px, 최대 90px
    const calculatedWidth = Math.max(50, Math.min(90, maxLength * 8 + 16))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 납입주기 기준
  const paymentCycleColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 90 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.payment_cycle || '').length))
    // 글자당 약 10px (한글), 최소 60px, 최대 120px
    const calculatedWidth = Math.max(60, Math.min(120, maxLength * 10 + 16))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 납입상태 기준
  const paymentStatusColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.payment_status || '').length))
    // 글자당 약 10px (한글), 최소 70px, 최대 130px
    const calculatedWidth = Math.max(70, Math.min(130, maxLength * 10 + 16))
    return calculatedWidth
  }, [contracts])

  const isEmpty = contracts.length === 0

  const renderState = () => {
    if (isLoading && contracts.length === 0) {
      return (
        <div className="customer-contracts__state customer-contracts__state--loading">
          <SFSymbol
            name='arrow.clockwise'
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>계약 정보를 불러오는 중입니다...</span>
        </div>
      )
    }

    if (error && contracts.length === 0) {
      return (
        <div className="customer-contracts__state customer-contracts__state--error">
          <SFSymbol
            name='exclamationmark.triangle.fill'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>{error}</span>
          <button
            type="button"
            className="customer-contracts__retry"
            onClick={() => void loadContracts()}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (isEmpty) {
      return (
        <div className="customer-contracts__state customer-contracts__state--empty">
          <SFSymbol
            name='doc.text.magnifyingglass'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>등록된 보험 계약이 없습니다.</span>
        </div>
      )
    }

    return null
  }

  // 🍎 정렬 인디케이터 렌더링
  const renderSortIndicator = (field: SortField) => {
    if (sortField === field) {
      return <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
    }
    return null
  }

  return (
    <div className="customer-contracts">
      <div className="customer-contracts__header">
        <div className="customer-contracts__summary">
          <span className="customer-contracts__count">
            총 <strong>{contracts.length}</strong>건
          </span>
          {contracts.length > 0 && (
            <span className="customer-contracts__total-premium">
              월 보험료 합계: <strong>{ContractUtils.formatPremium(totalPremium)}</strong>
            </span>
          )}
        </div>
      </div>

      {renderState()}

      {!isEmpty && contracts.length > 0 && (
        <>
          {/* 🍎 리스트 컨테이너 */}
          <div
            className="customer-contracts__list-container"
            style={{
              '--product-column-width': `${productColumnWidth}px`,
              '--contract-date-column-width': `${contractDateColumnWidth}px`,
              '--policy-number-column-width': `${policyNumberColumnWidth}px`,
              '--premium-column-width': `${premiumColumnWidth}px`,
              '--payment-day-column-width': `${paymentDayColumnWidth}px`,
              '--payment-cycle-column-width': `${paymentCycleColumnWidth}px`,
              '--payment-status-column-width': `${paymentStatusColumnWidth}px`,
            } as React.CSSProperties}
          >
            {/* 🍎 칼럼 헤더 */}
            <div className="customer-contracts-list-header">
              <div
                className="header-product header-sortable"
                onClick={() => handleSort('product_name')}
                role="button"
                tabIndex={0}
                aria-label="상품명으로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/>
                  <path d="M5 5h6M5 8h6M5 11h4" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span>상품명</span>
                {renderSortIndicator('product_name')}
              </div>
              <div
                className="header-date header-sortable"
                onClick={() => handleSort('contract_date')}
                role="button"
                tabIndex={0}
                aria-label="계약일로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M2 6h12M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>계약일</span>
                {renderSortIndicator('contract_date')}
              </div>
              <div
                className="header-policy header-sortable"
                onClick={() => handleSort('policy_number')}
                role="button"
                tabIndex={0}
                aria-label="증권번호로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <path d="M5 6h6M5 10h6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span>증권번호</span>
                {renderSortIndicator('policy_number')}
              </div>
              <div
                className="header-premium header-sortable"
                onClick={() => handleSort('premium')}
                role="button"
                tabIndex={0}
                aria-label="보험료로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none"/>
                  <text x="8" y="11" textAnchor="middle" fontSize="8" fill="currentColor">₩</text>
                </svg>
                <span>보험료</span>
                {renderSortIndicator('premium')}
              </div>
              <div
                className="header-payment-day header-sortable"
                onClick={() => handleSort('payment_day')}
                role="button"
                tabIndex={0}
                aria-label="이체일로 정렬"
              >
                <span>이체일</span>
                {renderSortIndicator('payment_day')}
              </div>
              <div
                className="header-cycle header-sortable"
                onClick={() => handleSort('payment_cycle')}
                role="button"
                tabIndex={0}
                aria-label="납입주기로 정렬"
              >
                <span>납입주기</span>
                {renderSortIndicator('payment_cycle')}
              </div>
              <div
                className="header-status header-sortable"
                onClick={() => handleSort('payment_status')}
                role="button"
                tabIndex={0}
                aria-label="납입상태로 정렬"
              >
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7" fill="currentColor"/>
                  <path d="M6 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>납입상태</span>
                {renderSortIndicator('payment_status')}
              </div>
            </div>

            {/* 🍎 계약 리스트 */}
            {paginatedContracts.map((contract) => (
              <div
                key={contract._id}
                className="customer-contracts-item"
              >
                {/* 상품명 */}
                <Tooltip content={contract.product_name || '-'}>
                  <span className="contract-product">
                    {contract.product_name || '-'}
                  </span>
                </Tooltip>

                {/* 계약일 */}
                <span className="contract-date">
                  {ContractUtils.formatContractDate(contract.contract_date)}
                </span>

                {/* 증권번호 */}
                <span className="contract-policy">
                  {contract.policy_number || '-'}
                </span>

                {/* 보험료 */}
                <span className="contract-premium">
                  {ContractUtils.formatPremium(contract.premium)}
                </span>

                {/* 이체일 */}
                <span className="contract-payment-day">
                  {contract.payment_day || '-'}
                </span>

                {/* 납입주기 */}
                <span className="contract-cycle">
                  {ContractUtils.getPaymentCycleText(contract.payment_cycle)}
                </span>

                {/* 납입상태 */}
                <span className={`contract-status contract-status--${(contract.payment_status || '').replace(/\s/g, '-').toLowerCase()}`}>
                  {ContractUtils.getPaymentStatusText(contract.payment_status)}
                </span>
              </div>
            ))}
          </div>

          {/* 🍎 페이지네이션 */}
          {totalPages > 0 && (
            <div className="contract-pagination">
              <div className="pagination-limit">
                <Dropdown
                  value={String(itemsPerPage)}
                  options={ITEMS_PER_PAGE_OPTIONS}
                  onChange={(value) => handleLimitChange(Number(value))}
                  aria-label="페이지당 항목 수"
                  width={80}
                />
              </div>

              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    className="pagination-button pagination-button--prev"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="이전 페이지"
                  >
                    <span className="pagination-arrow">‹</span>
                  </button>

                  <div className="pagination-info">
                    <span className="pagination-current">{currentPage}</span>
                    <span className="pagination-separator">/</span>
                    <span className="pagination-total">{totalPages}</span>
                  </div>

                  <button
                    className="pagination-button pagination-button--next"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="다음 페이지"
                  >
                    <span className="pagination-arrow">›</span>
                  </button>
                </div>
              )}

              {totalPages <= 1 && <div className="pagination-spacer"></div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ContractsTab

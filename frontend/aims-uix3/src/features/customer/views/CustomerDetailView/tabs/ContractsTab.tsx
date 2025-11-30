/**
 * AIMS UIX-3 Customer Detail - Contracts Tab
 * @since 2025-11-30
 *
 * 🍎 고객의 보험 계약 목록 표시
 * - 칼럼: 상품명, 계약일, 증권번호, 보험료, 이체일, 납입주기, 납입상태
 * - 정렬, 페이지네이션 지원
 */

import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
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

// 🍎 페이지당 항목 수 옵션 (자동 옵션 포함)
const ITEMS_PER_PAGE_OPTIONS_BASE = [
  { value: 'auto', label: '자동' },
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' }
]

// 🍎 행 높이 상수 (CSS와 동일하게 유지)
const ROW_HEIGHT = 32   // CSS height: 32px
const ROW_GAP = 2       // CSS gap: 2px (행 사이 간격)
// 🍎 기본 높이값 (실제 DOM 측정이 안될 때 fallback)
const DEFAULT_LIST_HEADER_HEIGHT = 32
const DEFAULT_PAGINATION_HEIGHT = 26

// 🍎 정렬 필드 타입
type SortField = 'product_name' | 'contract_date' | 'policy_number' | 'premium' | 'payment_day' | 'payment_cycle' | 'payment_status'
type SortDirection = 'asc' | 'desc'

// 🍎 한글 전각 문자를 고려한 텍스트 폭 계산 유틸리티
const calculateTextWidth = (text: string): number => {
  let width = 0
  for (const char of text) {
    // 한글, 한자, 일본어 등 전각 문자는 12px, 그 외는 7px
    if (/[\u3131-\uD79D\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(char)) {
      width += 12
    } else {
      width += 7
    }
  }
  return width
}

export const ContractsTab: React.FC<ContractsTabProps> = ({
  customer,
  onContractCountChange
}) => {
  // 🍎 상태 관리
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🍎 페이지네이션 상태 ('auto' 또는 숫자)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | number>('auto')
  const [containerHeight, setContainerHeight] = useState(0)
  const sectionContainerRef = useRef<HTMLDivElement>(null)

  // 🍎 자동 모드일 때 컨테이너 높이 기반 항목 수 계산
  // ⚠️ CustomerFullDetailView에서는 .customer-contracts__header가 display:none으로 숨겨지고
  //    페이지네이션 높이도 26px로 오버라이드됨. 따라서 실제 DOM 요소 높이를 측정해야 함.
  const autoCalculatedItems = useMemo(() => {
    if (containerHeight <= 0) return 10 // 기본값

    const container = sectionContainerRef.current
    if (!container) return 10

    // 요약 헤더 높이 측정 (CustomerFullDetailView에서는 display:none → 0)
    const summaryHeader = container.querySelector('.customer-contracts__header') as HTMLElement | null
    const summaryHeight = summaryHeader ? summaryHeader.getBoundingClientRect().height : 0

    // 리스트 헤더 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const listHeader = container.querySelector('.customer-contracts-list-header') as HTMLElement | null
    const measuredListHeaderHeight = listHeader ? listHeader.getBoundingClientRect().height : 0
    const listHeaderHeight = measuredListHeaderHeight > 0 ? measuredListHeaderHeight : DEFAULT_LIST_HEADER_HEIGHT

    // 페이지네이션 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const pagination = container.querySelector('.contract-pagination') as HTMLElement | null
    const measuredPaginationHeight = pagination ? pagination.getBoundingClientRect().height : 0
    const paginationHeight = measuredPaginationHeight > 0 ? measuredPaginationHeight : DEFAULT_PAGINATION_HEIGHT

    // 컨테이너 gap 측정 (요약 헤더가 보일 때만 적용)
    const containerStyle = getComputedStyle(container)
    const gap = parseFloat(containerStyle.gap) || 0

    // fixedHeight 계산: 실제 보이는 요소들의 높이 합
    const fixedHeight = summaryHeight + (summaryHeight > 0 ? gap : 0) + listHeaderHeight + paginationHeight
    const availableHeight = containerHeight - fixedHeight

    // N개 행의 총 높이 = N * ROW_HEIGHT + (N-1) * ROW_GAP
    // 이를 풀면: N <= (availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)
    const maxItems = Math.max(1, Math.floor((availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)))

    // 디버그 로그 (개발 모드에서만)
    if (import.meta.env.DEV) {
      console.log('[ContractsTab] 자동 페이지네이션 계산:', {
        containerHeight,
        summaryHeight,
        listHeaderHeight: `${measuredListHeaderHeight} → ${listHeaderHeight}`,
        paginationHeight: `${measuredPaginationHeight} → ${paginationHeight}`,
        gap,
        fixedHeight,
        availableHeight,
        maxItems
      })
    }

    return maxItems
  }, [containerHeight])

  // 🍎 실제 적용되는 페이지당 항목 수
  const itemsPerPage = itemsPerPageMode === 'auto' ? autoCalculatedItems : itemsPerPageMode

  // 🍎 섹션 컨테이너 높이 측정 (ResizeObserver)
  useEffect(() => {
    const container = sectionContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // 🍎 드롭다운 옵션 (자동 모드일 때 계산된 값 표시)
  const itemsPerPageOptions = useMemo(() => {
    return ITEMS_PER_PAGE_OPTIONS_BASE.map(opt => {
      if (opt.value === 'auto') {
        return {
          value: 'auto',
          label: itemsPerPageMode === 'auto' ? `자동(${autoCalculatedItems})` : '자동'
        }
      }
      return opt
    })
  }, [itemsPerPageMode, autoCalculatedItems])

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

  // 디버그 로그: 페이지네이션 상태 확인
  if (import.meta.env.DEV) {
    console.log('[ContractsTab] 페이지네이션 상태:', {
      itemsPerPageMode,
      autoCalculatedItems,
      itemsPerPage,
      totalContracts: sortedContracts.length,
      totalPages,
      currentPage,
      startIndex,
      endIndex,
      paginatedCount: paginatedContracts.length
    })
  }

  // 🍎 페이지 변경
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // 🍎 페이지당 항목 수 변경 ('auto' 또는 숫자)
  const handleLimitChange = useCallback((value: string) => {
    if (import.meta.env.DEV) {
      console.log('[ContractsTab] handleLimitChange 호출:', { value, currentMode: itemsPerPageMode })
    }
    if (value === 'auto') {
      setItemsPerPageMode('auto')
    } else {
      setItemsPerPageMode(Number(value))
    }
    setCurrentPage(1)
  }, [itemsPerPageMode])

  // 🍎 총 보험료 계산
  const totalPremium = useMemo(() => {
    return contracts.reduce((sum, c) => sum + (c.premium || 0), 0)
  }, [contracts])

  // 🍎 가장 긴 상품명 기준으로 칼럼폭 계산 (한글 전각 문자 고려)
  const productColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 200 // 기본값
    const maxWidth = Math.max(...contracts.map(c => calculateTextWidth(c.product_name || '')))
    // 패딩 포함, 최소 200px, 최대 450px
    const calculatedWidth = Math.max(200, Math.min(450, maxWidth + 40))
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
    <div ref={sectionContainerRef} className="customer-contracts">
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
                  value={itemsPerPageMode === 'auto' ? 'auto' : String(itemsPerPageMode)}
                  options={itemsPerPageOptions}
                  onChange={handleLimitChange}
                  aria-label="페이지당 항목 수"
                  width={90}
                />
              </div>

              <div className="pagination-controls">
                <button
                  type="button"
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
                  type="button"
                  className="pagination-button pagination-button--next"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="다음 페이지"
                >
                  <span className="pagination-arrow">›</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ContractsTab

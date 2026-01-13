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
import { AnnualReportApi, type AnnualReport } from '@/features/customer/api/annualReportApi'
import { UserContextService } from '../../../../../components/DocumentViews/DocumentRegistrationView/services/userContextService'
import { Tooltip } from '@/shared/ui'
import { Dropdown } from '@/shared/ui'
import SFSymbol, {
  SFSymbolAnimation,
  SFSymbolSize,
  SFSymbolWeight
} from '../../../../../components/SFSymbol'
import { errorReporter } from '@/shared/lib/errorReporter'
import { useColumnResize, type ColumnConfig } from '@/hooks/useColumnResize'
import { formatDate } from '@/shared/lib/timeUtils'
import './ContractsTab.css'

interface ContractsTabProps {
  customer: Customer
  onContractCountChange?: (count: number) => void
  /** 외부에서 전달받는 검색어 (CustomerFullDetailView에서 사용) */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
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

// 🍎 정렬 아이콘 폭 (font-size: 10px + gap: 4px)
const SORT_ICON_WIDTH = 14

// 🍎 컬럼 리사이즈 설정
const CONTRACTS_COLUMNS: ColumnConfig[] = [
  { id: 'product', minWidth: 120, maxWidth: 450 },
  { id: 'contractDate', minWidth: 80, maxWidth: 135 },
  { id: 'policyNumber', minWidth: 80, maxWidth: 175 },
  { id: 'premium', minWidth: 70, maxWidth: 155 },
  { id: 'paymentDay', minWidth: 50, maxWidth: 105 },
  { id: 'paymentCycle', minWidth: 60, maxWidth: 135 },
  { id: 'paymentStatus', minWidth: 70, maxWidth: 145 }
]

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
  onContractCountChange,
  searchTerm: externalSearchTerm,
  onSearchChange
}) => {
  // 🍎 상태 관리
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🍎 AR 기반 계약 정보 상태
  const [arReports, setArReports] = useState<AnnualReport[]>([])
  const [expandedArId, setExpandedArId] = useState<string | null>(null)
  const [isLoadingAr, setIsLoadingAr] = useState(false)

  // 🍎 검색어 상태 (외부/내부)
  const [internalSearchTerm, setInternalSearchTerm] = useState('')
  const searchTerm = externalSearchTerm ?? internalSearchTerm
  const _setSearchTerm = onSearchChange ?? setInternalSearchTerm

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
      errorReporter.reportApiError(err as Error, { component: 'ContractsTab.loadContracts', payload: { customerId: customer._id } })
      setError(err instanceof Error ? err.message : '계약 정보를 불러올 수 없습니다.')
      onContractCountChange?.(0)
    } finally {
      setIsLoading(false)
    }
  }, [customer?._id, onContractCountChange])

  // 🍎 AR 데이터 로드
  const loadArReports = useCallback(async () => {
    if (!customer?._id) return

    setIsLoadingAr(true)
    try {
      const userId = UserContextService.getContext().identifierValue
      const response = await AnnualReportApi.getAnnualReports(customer._id, userId, 50)

      if (response.success && response.data) {
        // 완료된 AR만 필터링 (API 응답 타입을 any로 캐스팅하여 contracts 접근)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const completedReports = (response.data.reports as any[])
          .filter((r) => r.status === 'completed')
          .map((r) => ({
            report_id: r.report_id || r.file_id || '',
            issue_date: r.issue_date || '',
            customer_name: r.customer_name || '',
            total_monthly_premium: r.total_monthly_premium,
            total_coverage: r.total_coverage || 0,
            contract_count: r.total_contracts || r.contract_count || 0,
            contracts: r.contracts || [],
            source_file_id: r.source_file_id || r.file_id || '',
            created_at: r.created_at || r.uploaded_at || '',
            parsed_at: r.parsed_at || '',
            status: r.status || 'completed',
          })) as AnnualReport[]
        setArReports(completedReports)
      }
    } catch (err) {
      console.error('[ContractsTab] AR 로드 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'ContractsTab.loadArReports', payload: { customerId: customer._id } })
    } finally {
      setIsLoadingAr(false)
    }
  }, [customer?._id])

  // 🍎 초기 로드
  useEffect(() => {
    void loadContracts()
    void loadArReports()
  }, [loadContracts, loadArReports])

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

  // 🍎 검색어 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // 🍎 검색어로 필터링된 계약 목록
  const filteredContracts = useMemo(() => {
    if (!searchTerm.trim()) return contracts

    const term = searchTerm.toLowerCase().trim()
    return contracts.filter(contract => {
      // 상품명, 증권번호로 검색
      const productName = (contract.product_name ?? '').toLowerCase()
      const policyNumber = (contract.policy_number ?? '').toLowerCase()

      return productName.includes(term) || policyNumber.includes(term)
    })
  }, [contracts, searchTerm])

  // 🍎 정렬된 계약 목록
  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
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
  }, [filteredContracts, sortField, sortDirection])

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

  // 🍎 가장 긴 상품명 기준으로 칼럼폭 계산 (한글 전각 문자 고려 + 정렬 아이콘)
  const productColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 200 // 기본값
    const maxWidth = Math.max(...contracts.map(c => calculateTextWidth(c.product_name || '')))
    // 패딩 + 정렬 아이콘 포함, 최소 200px, 최대 450px
    const calculatedWidth = Math.max(200, Math.min(450, maxWidth + 40 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 계약일 기준 (+ 정렬 아이콘)
  const contractDateColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.contract_date || '').length))
    // 글자당 약 7px + 정렬 아이콘, 최소 80px, 최대 135px
    const calculatedWidth = Math.max(80, Math.min(135, maxLength * 7 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 증권번호 기준 (+ 정렬 아이콘)
  const policyNumberColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 115 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.policy_number || '').length))
    // 글자당 약 7px + 정렬 아이콘, 최소 80px, 최대 175px
    const calculatedWidth = Math.max(80, Math.min(175, maxLength * 7 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 보험료 기준 (+ 정렬 아이콘)
  const premiumColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => {
      const formatted = ContractUtils.formatPremium(c.premium)
      return formatted.length
    }))
    // 글자당 약 8px + 정렬 아이콘, 최소 70px, 최대 155px
    const calculatedWidth = Math.max(70, Math.min(155, maxLength * 8 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 이체일 기준 (+ 정렬 아이콘)
  const paymentDayColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 75 // 기본값
    const maxLength = Math.max(...contracts.map(c => {
      const day = c.payment_day || '-'
      return day.length
    }))
    // 글자당 약 8px + 정렬 아이콘, 최소 50px, 최대 105px
    const calculatedWidth = Math.max(50, Math.min(105, maxLength * 8 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 납입주기 기준 (+ 정렬 아이콘)
  const paymentCycleColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 90 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.payment_cycle || '').length))
    // 글자당 약 10px (한글) + 정렬 아이콘, 최소 60px, 최대 135px
    const calculatedWidth = Math.max(60, Math.min(135, maxLength * 10 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 동적 칼럼 폭 계산: 납입상태 기준 (+ 정렬 아이콘)
  const paymentStatusColumnWidth = useMemo(() => {
    if (contracts.length === 0) return 100 // 기본값
    const maxLength = Math.max(...contracts.map(c => (c.payment_status || '').length))
    // 글자당 약 10px (한글) + 정렬 아이콘, 최소 70px, 최대 145px
    const calculatedWidth = Math.max(70, Math.min(145, maxLength * 10 + 16 + SORT_ICON_WIDTH))
    return calculatedWidth
  }, [contracts])

  // 🍎 컬럼 리사이즈 훅 (동적 계산값을 기본값으로 사용)
  const defaultColumnWidths = useMemo(() => ({
    product: productColumnWidth,
    contractDate: contractDateColumnWidth,
    policyNumber: policyNumberColumnWidth,
    premium: premiumColumnWidth,
    paymentDay: paymentDayColumnWidth,
    paymentCycle: paymentCycleColumnWidth,
    paymentStatus: paymentStatusColumnWidth
  }), [productColumnWidth, contractDateColumnWidth, policyNumberColumnWidth, premiumColumnWidth, paymentDayColumnWidth, paymentCycleColumnWidth, paymentStatusColumnWidth])

  const {
    columnWidths,
    isResizing,
    getResizeHandleProps,
    wasJustResizing
  } = useColumnResize({
    storageKey: 'contracts-tab',
    columns: CONTRACTS_COLUMNS,
    defaultWidths: defaultColumnWidths
  })

  // 🍎 정렬 핸들러 (useColumnResize 훅 뒤에 정의)
  const handleSort = useCallback((field: SortField) => {
    // 리사이즈 직후 클릭은 무시 (정렬 방지)
    if (wasJustResizing()) return

    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1)
  }, [sortField, wasJustResizing])

  const isEmpty = contracts.length === 0

  // 🍎 AR 아코디언 토글 핸들러
  const handleArToggle = useCallback((reportId: string) => {
    setExpandedArId(prev => prev === reportId ? null : reportId)
  }, [])

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

    // AR 데이터가 있으면 빈 상태 메시지 표시 안 함
    if (isEmpty && arReports.length === 0) {
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

      {/* 🍎 AR 기반 계약 정보 (아코디언) - 제목 없이 컴팩트하게 */}
      {arReports.length > 0 && (
        <div className="ar-section__list">
          {arReports.map((report) => {
            const isExpanded = expandedArId === report.report_id
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contractsData = report.contracts as any[]

            return (
              <div key={report.report_id} className="ar-accordion">
                {/* AR 요약 행 */}
                <div
                  className={`ar-accordion__header ${isExpanded ? 'ar-accordion__header--expanded' : ''}`}
                  onClick={() => handleArToggle(report.report_id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded ? 'true' : 'false'}
                >
                  <span className="ar-accordion__toggle">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className="ar-accordion__owner">{report.customer_name || '-'}</span>
                  <span className="ar-accordion__issue-date">{formatDate(report.issue_date)}</span>
                  <span className="ar-accordion__parsed-at">
                    {report.parsed_at ? AnnualReportApi.formatDateTime(report.parsed_at) : '-'}
                  </span>
                  <span className="ar-accordion__premium">
                    {report.total_monthly_premium != null
                      ? AnnualReportApi.formatCurrency(report.total_monthly_premium)
                      : '-'}
                  </span>
                  <span className="ar-accordion__count">
                    {report.contract_count != null ? `${report.contract_count}건` : '-'}
                  </span>
                </div>

                {/* AR 상세 계약 목록 (펼침 시) - 모달과 동일한 상세 정보 */}
                {isExpanded && contractsData && contractsData.length > 0 && (
                  <div className="ar-accordion__content">
                    <div className="ar-contracts-header">
                      <span className="ar-contracts-header__seq">순</span>
                      <span className="ar-contracts-header__policy">증권번호</span>
                      <span className="ar-contracts-header__product">보험상품</span>
                      <span className="ar-contracts-header__holder">계약자</span>
                      <span className="ar-contracts-header__insured">피보험자</span>
                      <span className="ar-contracts-header__date">계약일</span>
                      <span className="ar-contracts-header__status">상태</span>
                      <span className="ar-contracts-header__amount">가입금액</span>
                      <span className="ar-contracts-header__period">보험기간</span>
                      <span className="ar-contracts-header__payment">납입기간</span>
                      <span className="ar-contracts-header__premium">보험료</span>
                    </div>
                    {contractsData.map((contract, idx) => (
                      <div key={`${report.report_id}-${idx}`} className="ar-contract-item">
                        <span className="ar-contract-item__seq">
                          {contract['순번'] || idx + 1}
                        </span>
                        <span className="ar-contract-item__policy">
                          {contract['증권번호'] || '-'}
                        </span>
                        <Tooltip content={contract['보험상품'] || '-'}>
                          <span className="ar-contract-item__product">
                            {contract['보험상품'] || '-'}
                          </span>
                        </Tooltip>
                        <span className="ar-contract-item__holder">
                          {contract['계약자'] || '-'}
                        </span>
                        <span className="ar-contract-item__insured">
                          {contract['피보험자'] || '-'}
                        </span>
                        <span className="ar-contract-item__date">
                          {contract['계약일'] || '-'}
                        </span>
                        <span className={`ar-contract-item__status ar-contract-item__status--${(contract['계약상태'] || '').replace(/\s/g, '-')}`}>
                          {contract['계약상태'] || '-'}
                        </span>
                        <span className="ar-contract-item__amount">
                          {contract['가입금액(만원)']
                            ? contract['가입금액(만원)'].toLocaleString('ko-KR')
                            : '-'}
                        </span>
                        <span className="ar-contract-item__period">
                          {contract['보험기간'] || '-'}
                        </span>
                        <span className="ar-contract-item__payment">
                          {contract['납입기간'] || '-'}
                        </span>
                        <span className="ar-contract-item__premium">
                          {contract['보험료(원)']
                            ? contract['보험료(원)'].toLocaleString('ko-KR')
                            : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 계약 없음 메시지 */}
                {isExpanded && (!contractsData || contractsData.length === 0) && (
                  <div className="ar-accordion__content ar-accordion__content--empty">
                    <span>계약 정보가 없습니다.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* AR 로딩 중 */}
      {isLoadingAr && arReports.length === 0 && (
        <div className="customer-contracts__ar-loading">
          <SFSymbol
            name="arrow.clockwise"
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>AR 계약 정보 로딩 중...</span>
        </div>
      )}

      {renderState()}

      {!isEmpty && contracts.length > 0 && (
        <>
          {/* 🍎 리스트 컨테이너 */}
          <div
            className={`customer-contracts__list-container${isResizing ? ' is-resizing' : ''}`}
            style={{
              '--product-column-width': `${columnWidths['product'] || productColumnWidth}px`,
              '--contract-date-column-width': `${columnWidths['contractDate'] || contractDateColumnWidth}px`,
              '--policy-number-column-width': `${columnWidths['policyNumber'] || policyNumberColumnWidth}px`,
              '--premium-column-width': `${columnWidths['premium'] || premiumColumnWidth}px`,
              '--payment-day-column-width': `${columnWidths['paymentDay'] || paymentDayColumnWidth}px`,
              '--payment-cycle-column-width': `${columnWidths['paymentCycle'] || paymentCycleColumnWidth}px`,
              '--payment-status-column-width': `${columnWidths['paymentStatus'] || paymentStatusColumnWidth}px`,
            } as React.CSSProperties}
          >
            {/* 🍎 칼럼 헤더 */}
            <div className="customer-contracts-list-header">
              <div
                className="header-product header-sortable resizable-header"
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
                <div {...getResizeHandleProps('product')} />
              </div>
              <div
                className="header-date header-sortable resizable-header"
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
                <div {...getResizeHandleProps('contractDate')} />
              </div>
              <div
                className="header-policy header-sortable resizable-header"
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
                <div {...getResizeHandleProps('policyNumber')} />
              </div>
              <div
                className="header-premium header-sortable resizable-header"
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
                <div {...getResizeHandleProps('premium')} />
              </div>
              <div
                className="header-payment-day header-sortable resizable-header"
                onClick={() => handleSort('payment_day')}
                role="button"
                tabIndex={0}
                aria-label="이체일로 정렬"
              >
                <span>이체일</span>
                {renderSortIndicator('payment_day')}
                <div {...getResizeHandleProps('paymentDay')} />
              </div>
              <div
                className="header-cycle header-sortable resizable-header"
                onClick={() => handleSort('payment_cycle')}
                role="button"
                tabIndex={0}
                aria-label="납입주기로 정렬"
              >
                <span>납입주기</span>
                {renderSortIndicator('payment_cycle')}
                <div {...getResizeHandleProps('paymentCycle')} />
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
                <Tooltip
                  content={!contract.product_id ? 'DB에 일치하는 상품이 없어 색상이 다르게 표시됩니다' : (contract.product_name || '-')}
                >
                  <span className={`contract-product ${!contract.product_id ? 'contract-product--unmatched' : ''}`}>
                    {!contract.product_id && (
                      <svg className="product-unmatched-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
                        <path d="M7.25 4.5a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V4.5zM8 10.5a1 1 0 100 2 1 1 0 000-2z"/>
                      </svg>
                    )}
                    <span className="product-name-text">{contract.product_name || '-'}</span>
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
                  width={70}
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

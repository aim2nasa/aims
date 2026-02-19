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
import {
  AnnualReportApi,
  type AnnualReport,
  type ContractHistory,
  groupContractsByPolicyNumber,
  getChangedFields,
} from '@/features/customer/api/annualReportApi'
import {
  CustomerReviewApi,
  type CustomerReview,
} from '@/features/customer/api/customerReviewApi'
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
import { useAnnualReportSSE } from '@/shared/hooks/useAnnualReportSSE'
import { CustomerReviewModal } from '@/features/customer/components/CustomerReviewModal'
import './ContractsTab.layout.css';
import './ContractsTab.ar-accordion.css';
import './ContractsTab.ar-history.css';
import './ContractsTab.cr-history.css';
import './ContractsTab.responsive.css';
import './ContractsTab.cfd-overrides.css';

interface ContractsTabProps {
  customer: Customer
  onContractCountChange?: (count: number) => void
  /** 외부에서 전달받는 검색어 (CustomerFullDetailView에서 사용) */
  searchTerm?: string
  /** 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void
  /** AR 삭제 등으로 인한 외부 새로고침 트리거 */
  refreshTrigger?: number
  /** 보험 이력 탭 (ar: Annual Report 이력, cr: 변액 리포트 이력) */
  historyTab?: 'ar' | 'cr'
  /** AR 이력 갯수 변경 콜백 (증권번호 기준) */
  onArHistoryCountChange?: (count: number) => void
  /** CR 이력 갯수 변경 콜백 (증권번호 기준) */
  onCrHistoryCountChange?: (count: number) => void
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

// 🍎 컬럼 리사이즈 설정 (수동 계약 테이블)
const CONTRACTS_COLUMNS: ColumnConfig[] = [
  { id: 'product', minWidth: 120, maxWidth: 450 },
  { id: 'contractDate', minWidth: 80, maxWidth: 135 },
  { id: 'policyNumber', minWidth: 80, maxWidth: 175 },
  { id: 'premium', minWidth: 70, maxWidth: 155 },
  { id: 'paymentDay', minWidth: 50, maxWidth: 105 },
  { id: 'paymentCycle', minWidth: 60, maxWidth: 135 },
  { id: 'paymentStatus', minWidth: 70, maxWidth: 145 }
]

// 🍎 AR 계약 이력용 컬럼 리사이즈 설정 (11컬럼)
const AR_HISTORY_COLUMNS: ColumnConfig[] = [
  { id: 'seq', minWidth: 31, maxWidth: 44 },           // 순번 (고정)
  { id: 'policy', minWidth: 83, maxWidth: 110 },       // 증권번호
  { id: 'product', minWidth: 110, maxWidth: 440 },     // 보험상품 (1fr)
  { id: 'holder', minWidth: 44, maxWidth: 77 },        // 계약자
  { id: 'insured', minWidth: 44, maxWidth: 77 },       // 피보험자
  { id: 'date', minWidth: 72, maxWidth: 88 },          // 계약일
  { id: 'status', minWidth: 48, maxWidth: 70 },        // 계약상태 (+15%)
  { id: 'amount', minWidth: 63, maxWidth: 95 },        // 가입금액 (+15%)
  { id: 'period', minWidth: 64, maxWidth: 98 },        // 보험기간 (+15%+10%)
  { id: 'payment', minWidth: 46, maxWidth: 73 },       // 납입기간 (+10%)
  { id: 'premium', minWidth: 66, maxWidth: 105 },      // 보험료
  { id: 'issueDate', minWidth: 72, maxWidth: 95 },     // 발행일 (AR 기준일)
]

// 🍎 CRS 계약 이력용 컬럼 리사이즈 설정 (9컬럼)
const CR_HISTORY_COLUMNS: ColumnConfig[] = [
  { id: 'seq', minWidth: 31, maxWidth: 44 },           // 순번 (고정)
  { id: 'policy', minWidth: 83, maxWidth: 130 },       // 증권번호
  { id: 'product', minWidth: 110, maxWidth: 440 },     // 보험상품 (1fr)
  { id: 'contractor', minWidth: 44, maxWidth: 77 },    // 계약자
  { id: 'insured', minWidth: 44, maxWidth: 77 },       // 피보험자
  { id: 'date', minWidth: 72, maxWidth: 88 },          // 계약일
  { id: 'insuredAmount', minWidth: 66, maxWidth: 105 },// 보험가입금액
  { id: 'accumulated', minWidth: 66, maxWidth: 105 },  // 적립금
  { id: 'returnRate', minWidth: 55, maxWidth: 83 },    // 투자수익률
  { id: 'issueDate', minWidth: 72, maxWidth: 95 },     // 발행일 (CRS 기준일)
]

// 🍎 CRS 계약 이력 스냅샷 타입
interface CrContractSnapshot {
  issueDate: string
  insuredAmount?: number    // 보험가입금액 (원)
  accumulatedAmount?: number // 적립금 (원)
  investmentReturnRate?: number // 투자수익률 (%)
  surrenderValue?: number   // 해지환급금 (원)
  surrenderRate?: number    // 해지환급율 (%)
}

// 🍎 CRS 계약 이력 타입 (증권번호별 그룹)
interface CrContractHistory {
  policyNumber: string
  productName: string
  contractorName: string
  insuredName: string
  contractDate: string
  latestSnapshot: CrContractSnapshot
  snapshots: CrContractSnapshot[]
}

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

/**
 * CRS 리뷰를 증권번호별로 그룹화하여 계약 이력 생성
 */
function groupCrReviewsByPolicyNumber(reviews: CustomerReview[]): CrContractHistory[] {
  const policyMap = new Map<string, {
    productName: string
    contractorName: string
    insuredName: string
    contractDate: string
    snapshots: CrContractSnapshot[]
  }>()

  // 발행일 기준 최신순 정렬
  const sortedReviews = [...reviews].sort((a, b) => {
    const dateA = a.issue_date ? new Date(a.issue_date).getTime() : 0
    const dateB = b.issue_date ? new Date(b.issue_date).getTime() : 0
    return dateB - dateA
  })

  for (const review of sortedReviews) {
    const policyNumber = review.contract_info?.policy_number
    if (!policyNumber) continue

    const snapshot: CrContractSnapshot = {
      issueDate: review.issue_date || '',
      insuredAmount: review.contract_info?.insured_amount,
      accumulatedAmount: review.contract_info?.accumulated_amount,
      investmentReturnRate: review.contract_info?.investment_return_rate,
      surrenderValue: review.contract_info?.surrender_value,
      surrenderRate: review.contract_info?.surrender_rate,
    }

    if (!policyMap.has(policyNumber)) {
      policyMap.set(policyNumber, {
        productName: review.product_name || '-',
        contractorName: review.contractor_name || '-',
        insuredName: review.insured_name || '-',
        contractDate: review.contract_info?.contract_date || '-',
        snapshots: [snapshot]
      })
    } else {
      policyMap.get(policyNumber)!.snapshots.push(snapshot)
    }
  }

  // Map을 배열로 변환
  const histories: CrContractHistory[] = []
  policyMap.forEach((data, policyNumber) => {
    histories.push({
      policyNumber,
      productName: data.productName,
      contractorName: data.contractorName,
      insuredName: data.insuredName,
      contractDate: data.contractDate,
      latestSnapshot: data.snapshots[0], // 최신 스냅샷
      snapshots: data.snapshots
    })
  })

  return histories
}

/**
 * CRS 스냅샷 간 변경된 필드 감지
 */
function getCrChangedFields(current: CrContractSnapshot, previous?: CrContractSnapshot): string[] {
  if (!previous) return []
  const changedFields: string[] = []

  if (current.insuredAmount !== previous.insuredAmount) changedFields.push('insuredAmount')
  if (current.accumulatedAmount !== previous.accumulatedAmount) changedFields.push('accumulatedAmount')
  if (current.investmentReturnRate !== previous.investmentReturnRate) changedFields.push('investmentReturnRate')
  if (current.surrenderValue !== previous.surrenderValue) changedFields.push('surrenderValue')
  if (current.surrenderRate !== previous.surrenderRate) changedFields.push('surrenderRate')

  return changedFields
}

export const ContractsTab: React.FC<ContractsTabProps> = ({
  customer,
  onContractCountChange,
  searchTerm: externalSearchTerm,
  onSearchChange,
  refreshTrigger,
  historyTab = 'ar',
  onArHistoryCountChange,
  onCrHistoryCountChange
}) => {
  // 🍎 상태 관리
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🍎 AR 기반 계약 정보 상태
  const [arReports, setArReports] = useState<AnnualReport[]>([])
  const [contractHistories, setContractHistories] = useState<ContractHistory[]>([])
  const [expandedPolicyNumber, setExpandedPolicyNumber] = useState<string | null>(null)
  const [isLoadingAr, setIsLoadingAr] = useState(false)

  // 🍎 CRS 기반 계약 정보 상태
  const [crReviews, setCrReviews] = useState<CustomerReview[]>([])
  const [crContractHistories, setCrContractHistories] = useState<CrContractHistory[]>([])
  const [expandedCrPolicyNumber, setExpandedCrPolicyNumber] = useState<string | null>(null)
  const [isLoadingCr, setIsLoadingCr] = useState(false)

  // 🍎 AR이력에서 변액 리포트 모달
  const [crModalReview, setCrModalReview] = useState<CustomerReview | null>(null)
  const [isCrModalOpen, setIsCrModalOpen] = useState(false)

  // 🍎 AR 계약 이력 정렬 상태
  type ArSortField = 'policyNumber' | 'productName' | 'holder' | 'insured' | 'contractDate' | 'status' | 'coverageAmount' | 'insurancePeriod' | 'paymentPeriod' | 'premium' | 'issueDate'
  const [arSortField, setArSortField] = useState<ArSortField>('policyNumber')
  const [arSortDirection, setArSortDirection] = useState<SortDirection>('asc')

  // 🍎 CRS 계약 이력 정렬 상태
  type CrSortField = 'policyNumber' | 'productName' | 'contractorName' | 'insuredName' | 'contractDate' | 'insuredAmount' | 'accumulatedAmount' | 'investmentReturnRate' | 'issueDate'
  const [crSortField, setCrSortField] = useState<CrSortField>('policyNumber')
  const [crSortDirection, setCrSortDirection] = useState<SortDirection>('asc')

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
    // 📱 모바일(≤768px): 페이지네이션 숨김 → 전체 표시 (스크롤 처리)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 9999
    }
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
    } catch (err) {
      console.error('[ContractsTab] 계약 로드 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'ContractsTab.loadContracts', payload: { customerId: customer._id } })
      setError(err instanceof Error ? err.message : '계약 정보를 불러올 수 없습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [customer?._id])

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

        // 증권번호별 계약 이력으로 변환
        const histories = groupContractsByPolicyNumber(completedReports)
        setContractHistories(histories)
      }
    } catch (err) {
      console.error('[ContractsTab] AR 로드 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'ContractsTab.loadArReports', payload: { customerId: customer._id } })
    } finally {
      setIsLoadingAr(false)
    }
  }, [customer?._id])

  // 🍎 AR SSE 실시간 업데이트 - 파싱 완료 시 자동 리로드
  useAnnualReportSSE(customer?._id, loadArReports, {
    enabled: !!customer?._id,
    onARChange: (event) => {
      if (import.meta.env.DEV) {
        console.log('[ContractsTab] AR SSE 이벤트 수신:', event)
      }
    }
  })

  // 🍎 CRS 데이터 로드
  const loadCrReviews = useCallback(async () => {
    if (!customer?._id) return

    setIsLoadingCr(true)
    try {
      const response = await CustomerReviewApi.getCustomerReviews(customer._id, 100)

      if (response.success && response.data) {
        // 완료된 CRS만 필터링
        const completedReviews = response.data.reviews
          .filter((r) => r.status === 'completed')
        setCrReviews(completedReviews)

        // 증권번호별 계약 이력으로 변환
        const histories = groupCrReviewsByPolicyNumber(completedReviews)
        setCrContractHistories(histories)
      }
    } catch (err) {
      console.error('[ContractsTab] CRS 로드 실패:', err)
      errorReporter.reportApiError(err as Error, { component: 'ContractsTab.loadCrReviews', payload: { customerId: customer._id } })
    } finally {
      setIsLoadingCr(false)
    }
  }, [customer?._id])

  // 🍎 초기 로드
  useEffect(() => {
    void loadContracts()
    void loadArReports()
    void loadCrReviews()
  }, [loadContracts, loadArReports, loadCrReviews])

  // 🍎 외부 refreshTrigger 변경 시 AR 데이터 새로고침 (AR 문서 삭제 등)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      void loadArReports()
    }
  }, [refreshTrigger, loadArReports])

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

  // 🍎 고유 계약 수 계산 (증권번호 기준 중복 제거: API 계약 + AR/CR 이력)
  const effectiveContractCount = useMemo(() => {
    const policyNumbers = new Set<string>()

    // API 계약
    contracts.forEach(c => {
      if (c.policy_number) policyNumbers.add(c.policy_number)
    })

    // AR/CR 이력 계약
    if (historyTab === 'ar') {
      contractHistories.forEach(h => {
        if (h.policyNumber) policyNumbers.add(h.policyNumber)
      })
    } else {
      crContractHistories.forEach(h => {
        if (h.policyNumber) policyNumbers.add(h.policyNumber)
      })
    }

    // 증권번호 없는 API 계약도 카운트 (policy_number가 빈 문자열일 경우)
    const apiWithoutPolicy = contracts.filter(c => !c.policy_number).length
    return policyNumbers.size + apiWithoutPolicy
  }, [contracts, contractHistories, crContractHistories, historyTab])

  // 🍎 탭 헤더 카운트 갱신 (API 계약 + AR/CR 이력 합산)
  useEffect(() => {
    onContractCountChange?.(effectiveContractCount)
  }, [effectiveContractCount, onContractCountChange])

  // 🍎 검색어 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  // 🍎 AR 이력 갯수 콜백 호출 (증권번호별 발행일 갯수 중 최대값)
  useEffect(() => {
    const maxCount = contractHistories.reduce((max, history) =>
      Math.max(max, history.snapshots.length), 0)
    onArHistoryCountChange?.(maxCount)
  }, [contractHistories, onArHistoryCountChange])

  // 🍎 CR 이력 갯수 콜백 호출 (증권번호별 발행일 갯수 중 최대값)
  useEffect(() => {
    const maxCount = crContractHistories.reduce((max, history) =>
      Math.max(max, history.snapshots.length), 0)
    onCrHistoryCountChange?.(maxCount)
  }, [crContractHistories, onCrHistoryCountChange])

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

  // 🍎 AR 계약 이력용 동적 칼럼 폭 계산
  const arHistoryColumnWidths = useMemo(() => {
    // 기본값
    const defaults = {
      seq: 31,
      policy: 94,
      product: 198,  // 1fr로 동작하므로 기본값은 참고용
      holder: 50,
      insured: 50,
      date: 75,
      status: 53,
      amount: 70,
      period: 67,
      payment: 51,
      premium: 83,
      issueDate: 80,  // 발행일 (YYYY.MM.DD 형식)
    }

    if (contractHistories.length === 0) {
      return defaults
    }

    // 각 컬럼별 최대 폭 계산
    let maxPolicy = 0
    let maxHolder = 0
    let maxInsured = 0
    let maxDate = 0
    let maxStatus = 0
    let maxAmount = 0
    let maxPeriod = 0
    let maxPayment = 0
    let maxPremium = 0
    let maxIssueDate = 0

    for (const history of contractHistories) {
      maxPolicy = Math.max(maxPolicy, calculateTextWidth(history.policyNumber || ''))
      maxHolder = Math.max(maxHolder, calculateTextWidth(history.holder || ''))
      maxInsured = Math.max(maxInsured, calculateTextWidth(history.insured || ''))
      maxDate = Math.max(maxDate, calculateTextWidth(history.contractDate || ''))
      maxStatus = Math.max(maxStatus, calculateTextWidth(history.latestSnapshot?.status || ''))
      maxAmount = Math.max(maxAmount, calculateTextWidth(
        history.latestSnapshot?.coverageAmount?.toLocaleString('ko-KR') || ''
      ))
      maxPeriod = Math.max(maxPeriod, calculateTextWidth(history.latestSnapshot?.insurancePeriod || ''))
      maxPayment = Math.max(maxPayment, calculateTextWidth(history.latestSnapshot?.paymentPeriod || ''))
      maxPremium = Math.max(maxPremium, calculateTextWidth(
        history.latestSnapshot?.premium?.toLocaleString('ko-KR') || ''
      ))
      maxIssueDate = Math.max(maxIssueDate, calculateTextWidth(history.latestSnapshot?.issueDate || ''))
    }

    // 패딩 + 여유 적용, 최소/최대 범위 적용
    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))
    return {
      seq: 31,  // 순번은 고정
      policy: clamp(maxPolicy + 24, 83, 110),     // 토글 아이콘 포함
      product: 198,  // 1fr로 동작하므로 고정값
      holder: clamp(maxHolder + 9, 44, 77),
      insured: clamp(maxInsured + 9, 44, 77),
      date: clamp(maxDate + 9, 72, 88),
      status: clamp(maxStatus + 9, 42, 61),
      amount: clamp(maxAmount + 9, 55, 83),
      period: clamp(maxPeriod + 9, 50, 77),
      payment: clamp(maxPayment + 9, 42, 66),
      premium: clamp(maxPremium + 9, 66, 105),
      issueDate: clamp(maxIssueDate + 9, 72, 95),
    }
  }, [contractHistories])

  // 🍎 AR 계약 이력용 컬럼 리사이즈 훅
  const {
    columnWidths: arColumnWidths,
    isResizing: isArResizing,
    getResizeHandleProps: getArResizeHandleProps,
    wasJustResizing: wasArJustResizing,
  } = useColumnResize({
    storageKey: 'ar-history-tab',
    columns: AR_HISTORY_COLUMNS,
    defaultWidths: arHistoryColumnWidths,
  })

  // 🍎 CRS 계약 이력용 컬럼 기본 너비
  const crHistoryColumnWidths = useMemo(() => ({
    seq: 31,
    policy: 100,
    product: 200,
    contractor: 50,
    insured: 50,
    date: 75,
    insuredAmount: 90,
    accumulated: 90,
    returnRate: 70,
    issueDate: 80,
  }), [])

  // 🍎 CRS 계약 이력용 컬럼 리사이즈 훅
  const {
    columnWidths: crColumnWidths,
    isResizing: isCrResizing,
    getResizeHandleProps: getCrResizeHandleProps,
    wasJustResizing: wasCrJustResizing,
  } = useColumnResize({
    storageKey: 'cr-history-tab',
    columns: CR_HISTORY_COLUMNS,
    defaultWidths: crHistoryColumnWidths,
  })

  // 🍎 증권번호 아코디언 토글 핸들러
  const handlePolicyToggle = useCallback((policyNumber: string) => {
    setExpandedPolicyNumber(prev => prev === policyNumber ? null : policyNumber)
  }, [])

  // 🍎 CRS 증권번호 → CustomerReview[] 매칭 (발행일 최신순, 한 증권에 여러 리뷰)
  const crReviewsByPolicy = useMemo(() => {
    const map = new Map<string, CustomerReview[]>()
    for (const review of crReviews) {
      const pn = review.contract_info?.policy_number
      if (!pn) continue
      const arr = map.get(pn) || []
      arr.push(review)
      map.set(pn, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || ''))
    }
    return map
  }, [crReviews])

  // 🍎 특정 증권번호 + 발행일로 리뷰 찾기
  const findCrReview = useCallback((policyNumber: string, issueDate?: string) => {
    const reviews = crReviewsByPolicy.get(policyNumber)
    if (!reviews?.length) return null
    if (!issueDate) return reviews[0]
    return reviews.find(r => r.issue_date === issueDate) || reviews[0]
  }, [crReviewsByPolicy])

  // 🍎 순번 클릭 → CRS 상세 모달 열기 (최신 리뷰)
  const handleOpenCrModal = useCallback((policyNumber: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const review = findCrReview(policyNumber)
    if (!review) return
    setCrModalReview(review)
    setIsCrModalOpen(true)
  }, [findCrReview])

  // 🍎 CRS 스냅샷 행 클릭 → 해당 발행일 CRS 모달 열기
  const handleOpenCrSnapshotModal = useCallback((policyNumber: string, issueDate: string) => {
    const review = findCrReview(policyNumber, issueDate)
    if (!review) return
    setCrModalReview(review)
    setIsCrModalOpen(true)
  }, [findCrReview])

  // 🍎 AR 계약 이력 정렬 핸들러
  const handleArSort = useCallback((field: typeof arSortField) => {
    // 리사이즈 직후 클릭은 무시 (정렬 방지)
    if (wasArJustResizing()) return

    if (arSortField === field) {
      setArSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setArSortField(field)
      setArSortDirection('asc')
    }
  }, [arSortField, wasArJustResizing])

  // 🍎 검색어로 필터링된 AR 계약 이력
  const filteredContractHistories = useMemo(() => {
    if (!searchTerm.trim()) return contractHistories
    const term = searchTerm.toLowerCase().trim()
    return contractHistories.filter(h =>
      (h.policyNumber || '').toLowerCase().includes(term) ||
      (h.productName || '').toLowerCase().includes(term) ||
      (h.holder || '').toLowerCase().includes(term) ||
      (h.insured || '').toLowerCase().includes(term)
    )
  }, [contractHistories, searchTerm])

  // 🍎 정렬된 AR 계약 이력
  const sortedContractHistories = useMemo(() => {
    return [...filteredContractHistories].sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (arSortField) {
        case 'policyNumber':
          aValue = a.policyNumber || ''
          bValue = b.policyNumber || ''
          break
        case 'productName':
          aValue = a.productName || ''
          bValue = b.productName || ''
          break
        case 'holder':
          aValue = a.holder || ''
          bValue = b.holder || ''
          break
        case 'insured':
          aValue = a.insured || ''
          bValue = b.insured || ''
          break
        case 'contractDate':
          aValue = a.contractDate || ''
          bValue = b.contractDate || ''
          break
        case 'status':
          aValue = a.latestSnapshot?.status || ''
          bValue = b.latestSnapshot?.status || ''
          break
        case 'coverageAmount':
          aValue = a.latestSnapshot?.coverageAmount || 0
          bValue = b.latestSnapshot?.coverageAmount || 0
          break
        case 'insurancePeriod':
          aValue = a.latestSnapshot?.insurancePeriod || ''
          bValue = b.latestSnapshot?.insurancePeriod || ''
          break
        case 'paymentPeriod':
          aValue = a.latestSnapshot?.paymentPeriod || ''
          bValue = b.latestSnapshot?.paymentPeriod || ''
          break
        case 'premium':
          aValue = a.latestSnapshot?.premium || 0
          bValue = b.latestSnapshot?.premium || 0
          break
        case 'issueDate':
          aValue = a.latestSnapshot?.issueDate || ''
          bValue = b.latestSnapshot?.issueDate || ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return arSortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return arSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredContractHistories, arSortField, arSortDirection])

  // 🍎 AR 정렬 인디케이터 렌더링
  const renderArSortIndicator = (field: typeof arSortField) => {
    if (arSortField === field) {
      return <span className="ar-sort-indicator">{arSortDirection === 'asc' ? '▲' : '▼'}</span>
    }
    return null
  }

  // 🍎 CRS 계약 이력 정렬 핸들러
  const handleCrSort = useCallback((field: CrSortField) => {
    if (wasCrJustResizing()) return
    if (crSortField === field) {
      setCrSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setCrSortField(field)
      setCrSortDirection('asc')
    }
  }, [crSortField, wasCrJustResizing])

  // 🍎 검색어로 필터링된 CRS 계약 이력
  const filteredCrContractHistories = useMemo(() => {
    if (!searchTerm.trim()) return crContractHistories
    const term = searchTerm.toLowerCase().trim()
    return crContractHistories.filter(h =>
      (h.policyNumber || '').toLowerCase().includes(term) ||
      (h.productName || '').toLowerCase().includes(term) ||
      (h.contractorName || '').toLowerCase().includes(term) ||
      (h.insuredName || '').toLowerCase().includes(term)
    )
  }, [crContractHistories, searchTerm])

  // 🍎 정렬된 CRS 계약 이력
  const sortedCrContractHistories = useMemo(() => {
    return [...filteredCrContractHistories].sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (crSortField) {
        case 'policyNumber':
          aValue = a.policyNumber || ''
          bValue = b.policyNumber || ''
          break
        case 'productName':
          aValue = a.productName || ''
          bValue = b.productName || ''
          break
        case 'contractorName':
          aValue = a.contractorName || ''
          bValue = b.contractorName || ''
          break
        case 'insuredName':
          aValue = a.insuredName || ''
          bValue = b.insuredName || ''
          break
        case 'contractDate':
          aValue = a.contractDate || ''
          bValue = b.contractDate || ''
          break
        case 'insuredAmount':
          aValue = a.latestSnapshot?.insuredAmount || 0
          bValue = b.latestSnapshot?.insuredAmount || 0
          break
        case 'accumulatedAmount':
          aValue = a.latestSnapshot?.accumulatedAmount || 0
          bValue = b.latestSnapshot?.accumulatedAmount || 0
          break
        case 'investmentReturnRate':
          aValue = a.latestSnapshot?.investmentReturnRate || 0
          bValue = b.latestSnapshot?.investmentReturnRate || 0
          break
        case 'issueDate':
          aValue = a.latestSnapshot?.issueDate || ''
          bValue = b.latestSnapshot?.issueDate || ''
          break
        default:
          return 0
      }

      if (aValue < bValue) return crSortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return crSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredCrContractHistories, crSortField, crSortDirection])

  // 🍎 CRS 정렬 인디케이터 렌더링
  const renderCrSortIndicator = (field: CrSortField) => {
    if (crSortField === field) {
      return <span className="cr-sort-indicator">{crSortDirection === 'asc' ? '▲' : '▼'}</span>
    }
    return null
  }

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

    // AR 탭: 계약도 없고 AR 이력도 없을 때만 빈 상태 메시지 표시
    if (historyTab === 'ar' && isEmpty && contractHistories.length === 0) {
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
            총 <strong>{effectiveContractCount}</strong>건
          </span>
          {contracts.length > 0 && (
            <span className="customer-contracts__total-premium">
              월 보험료 합계: <strong>{ContractUtils.formatPremium(totalPremium)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 🍎 AR 증권번호 기준 계약 이력 (아코디언) - 11컬럼, 리사이즈 가능 */}
      {historyTab === 'ar' && contractHistories.length > 0 && (
        <div
          className={`contract-history-section${isArResizing ? ' is-resizing' : ''}`}
          style={{
            '--ar-seq-width': `${arColumnWidths['seq'] || arHistoryColumnWidths.seq}px`,
            '--ar-policy-width': `${arColumnWidths['policy'] || arHistoryColumnWidths.policy}px`,
            '--ar-product-width': `${arColumnWidths['product'] || arHistoryColumnWidths.product}px`,
            '--ar-holder-width': `${arColumnWidths['holder'] || arHistoryColumnWidths.holder}px`,
            '--ar-insured-width': `${arColumnWidths['insured'] || arHistoryColumnWidths.insured}px`,
            '--ar-date-width': `${arColumnWidths['date'] || arHistoryColumnWidths.date}px`,
            '--ar-status-width': `${arColumnWidths['status'] || arHistoryColumnWidths.status}px`,
            '--ar-amount-width': `${arColumnWidths['amount'] || arHistoryColumnWidths.amount}px`,
            '--ar-period-width': `${arColumnWidths['period'] || arHistoryColumnWidths.period}px`,
            '--ar-payment-width': `${arColumnWidths['payment'] || arHistoryColumnWidths.payment}px`,
            '--ar-premium-width': `${arColumnWidths['premium'] || arHistoryColumnWidths.premium}px`,
            '--ar-issue-date-width': `${arColumnWidths['issueDate'] || arHistoryColumnWidths.issueDate}px`,
          } as React.CSSProperties}
        >
          {/* 헤더 행 */}
          <div className="contract-history-header">
            <div className="contract-history-header__seq">순번</div>
            <div
              className="contract-history-header__policy resizable-header header-sortable"
              onClick={() => handleArSort('policyNumber')}
              role="button"
              tabIndex={0}
            >
              <span>증권번호</span>
              {renderArSortIndicator('policyNumber')}
              <div {...getArResizeHandleProps('policy')} />
            </div>
            <div
              className="contract-history-header__product resizable-header header-sortable"
              onClick={() => handleArSort('productName')}
              role="button"
              tabIndex={0}
            >
              <span>보험상품</span>
              {renderArSortIndicator('productName')}
              <div {...getArResizeHandleProps('product')} />
            </div>
            <div
              className="contract-history-header__holder resizable-header header-sortable"
              onClick={() => handleArSort('holder')}
              role="button"
              tabIndex={0}
            >
              <span>계약자</span>
              {renderArSortIndicator('holder')}
              <div {...getArResizeHandleProps('holder')} />
            </div>
            <div
              className="contract-history-header__insured resizable-header header-sortable"
              onClick={() => handleArSort('insured')}
              role="button"
              tabIndex={0}
            >
              <span>피보험자</span>
              {renderArSortIndicator('insured')}
              <div {...getArResizeHandleProps('insured')} />
            </div>
            <div
              className="contract-history-header__date resizable-header header-sortable"
              onClick={() => handleArSort('contractDate')}
              role="button"
              tabIndex={0}
            >
              <span>계약일</span>
              {renderArSortIndicator('contractDate')}
              <div {...getArResizeHandleProps('date')} />
            </div>
            <div
              className="contract-history-header__status resizable-header header-sortable"
              onClick={() => handleArSort('status')}
              role="button"
              tabIndex={0}
            >
              <span>계약상태</span>
              {renderArSortIndicator('status')}
              <div {...getArResizeHandleProps('status')} />
            </div>
            <div
              className="contract-history-header__amount resizable-header header-sortable"
              onClick={() => handleArSort('coverageAmount')}
              role="button"
              tabIndex={0}
            >
              <span>가입금액</span>
              {renderArSortIndicator('coverageAmount')}
              <div {...getArResizeHandleProps('amount')} />
            </div>
            <div
              className="contract-history-header__period resizable-header header-sortable"
              onClick={() => handleArSort('insurancePeriod')}
              role="button"
              tabIndex={0}
            >
              <span>보험기간</span>
              {renderArSortIndicator('insurancePeriod')}
              <div {...getArResizeHandleProps('period')} />
            </div>
            <div
              className="contract-history-header__payment resizable-header header-sortable"
              onClick={() => handleArSort('paymentPeriod')}
              role="button"
              tabIndex={0}
            >
              <span>납입기간</span>
              {renderArSortIndicator('paymentPeriod')}
              <div {...getArResizeHandleProps('payment')} />
            </div>
            <div
              className="contract-history-header__premium resizable-header header-sortable"
              onClick={() => handleArSort('premium')}
              role="button"
              tabIndex={0}
            >
              <span>보험료(원)</span>
              {renderArSortIndicator('premium')}
              <div {...getArResizeHandleProps('premium')} />
            </div>
            <div
              className="contract-history-header__issue-date header-sortable"
              onClick={() => handleArSort('issueDate')}
              role="button"
              tabIndex={0}
            >
              <span>발행일</span>
              {renderArSortIndicator('issueDate')}
            </div>
          </div>
          <div className="contract-history-list">
            {sortedContractHistories.map((history, idx) => {
              const isExpanded = expandedPolicyNumber === history.policyNumber
              const hasCrs = crReviewsByPolicy.has(history.policyNumber)
              const { latestSnapshot } = history

              return (
                <div key={history.policyNumber} className="contract-history-accordion">
                  {/* 계약 요약 행 (11컬럼) */}
                  <div
                    className={`contract-history-accordion__header ${isExpanded ? 'contract-history-accordion__header--expanded' : ''}`}
                    onClick={() => handlePolicyToggle(history.policyNumber)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded ? 'true' : 'false'}
                  >
                    {hasCrs ? (
                      <Tooltip content="변액 리포트 상세 보기">
                        <span
                          className="contract-history-item__seq contract-history-item__seq--crs"
                          onClick={(e) => handleOpenCrModal(history.policyNumber, e)}
                          role="button"
                          tabIndex={0}
                        >
                          {idx + 1}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="contract-history-item__seq">{idx + 1}</span>
                    )}
                    <span className="contract-history-item__policy">
                      <span className="contract-history-item__toggle">{isExpanded ? '▼' : '▶'}</span>
                      {history.policyNumber}
                    </span>
                    <Tooltip content={history.productName || '-'}>
                      <span className="contract-history-item__product">{history.productName || '-'}</span>
                    </Tooltip>
                    <span className="contract-history-item__holder">{history.holder || '-'}</span>
                    <span className="contract-history-item__insured">{history.insured || '-'}</span>
                    <span className="contract-history-item__date">{history.contractDate || '-'}</span>
                    <span className={`contract-history-item__status contract-history-item__status--${(latestSnapshot.status || '').replace(/\s/g, '-')}`}>
                      {latestSnapshot.status || '-'}
                    </span>
                    <span className="contract-history-item__amount">
                      {latestSnapshot.coverageAmount ? latestSnapshot.coverageAmount.toLocaleString('ko-KR') : '-'}
                    </span>
                    <span className="contract-history-item__period">{latestSnapshot.insurancePeriod || '-'}</span>
                    <span className="contract-history-item__payment">{latestSnapshot.paymentPeriod || '-'}</span>
                    <span className="contract-history-item__premium">
                      {latestSnapshot.premium ? latestSnapshot.premium.toLocaleString('ko-KR') : '-'}
                    </span>
                    <span className="contract-history-item__issue-date">
                      {formatDate(latestSnapshot.issueDate)}
                    </span>
                  </div>

                  {/* 스냅샷 이력 (펼침 시) - 발행일별 변경 이력 */}
                  {isExpanded && history.snapshots.length > 1 && (
                    <div className="contract-history-accordion__content">
                      <div className="contract-history-snapshots-title">
                        <span>📋 발행일별 이력 ({history.snapshots.length}건)</span>
                      </div>
                      <div className="contract-history-snapshots-header">
                        <span className="snapshot-header__issue-date">발행일</span>
                        <span className="snapshot-header__status">계약상태</span>
                        <span className="snapshot-header__coverage">가입금액</span>
                        <span className="snapshot-header__period">보험기간</span>
                        <span className="snapshot-header__payment">납입기간</span>
                        <span className="snapshot-header__premium">보험료(원)</span>
                      </div>
                      {history.snapshots.map((snapshot, snapshotIdx) => {
                        const prevSnapshot = history.snapshots[snapshotIdx + 1]
                        const changedFields = getChangedFields(snapshot, prevSnapshot)
                        const hasChanges = changedFields.length > 0

                        return (
                          <div
                            key={`${history.policyNumber}-${snapshot.issueDate}`}
                            className={`contract-history-snapshot-item ${hasChanges ? 'contract-history-snapshot-item--changed' : ''}`}
                          >
                            <span className="snapshot-item__issue-date">
                              {formatDate(snapshot.issueDate)}
                            </span>
                            <span className={`snapshot-item__status ${changedFields.includes('status') ? 'snapshot-item--changed' : ''}`}>
                              {snapshot.status || '-'}
                            </span>
                            <span className={`snapshot-item__coverage ${changedFields.includes('coverageAmount') ? 'snapshot-item--changed' : ''}`}>
                              {snapshot.coverageAmount ? snapshot.coverageAmount.toLocaleString('ko-KR') : '-'}
                            </span>
                            <span className={`snapshot-item__period ${changedFields.includes('insurancePeriod') ? 'snapshot-item--changed' : ''}`}>
                              {snapshot.insurancePeriod || '-'}
                            </span>
                            <span className={`snapshot-item__payment ${changedFields.includes('paymentPeriod') ? 'snapshot-item--changed' : ''}`}>
                              {snapshot.paymentPeriod || '-'}
                            </span>
                            <span className={`snapshot-item__premium ${changedFields.includes('premium') ? 'snapshot-item--changed' : ''}`}>
                              {snapshot.premium ? snapshot.premium.toLocaleString('ko-KR') : '-'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 이력이 1건인 경우 (변경 없음) */}
                  {isExpanded && history.snapshots.length === 1 && (
                    <div className="contract-history-accordion__content contract-history-accordion__content--empty">
                      <span>변경 이력이 없습니다. (1건의 AR에서만 발견)</span>
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AR 로딩 중 */}
      {historyTab === 'ar' && isLoadingAr && arReports.length === 0 && (
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

      {/* 🍎 CRS 증권번호 기준 계약 이력 (아코디언) - 9컬럼, 리사이즈 가능 */}
      {historyTab === 'cr' && crContractHistories.length > 0 && (
        <div
          className={`cr-contract-history-section${isCrResizing ? ' is-resizing' : ''}`}
          style={{
            '--cr-seq-width': `${crColumnWidths['seq'] || crHistoryColumnWidths.seq}px`,
            '--cr-policy-width': `${crColumnWidths['policy'] || crHistoryColumnWidths.policy}px`,
            '--cr-product-width': `${crColumnWidths['product'] || crHistoryColumnWidths.product}px`,
            '--cr-contractor-width': `${crColumnWidths['contractor'] || crHistoryColumnWidths.contractor}px`,
            '--cr-insured-width': `${crColumnWidths['insured'] || crHistoryColumnWidths.insured}px`,
            '--cr-date-width': `${crColumnWidths['date'] || crHistoryColumnWidths.date}px`,
            '--cr-insured-amount-width': `${crColumnWidths['insuredAmount'] || crHistoryColumnWidths.insuredAmount}px`,
            '--cr-accumulated-width': `${crColumnWidths['accumulated'] || crHistoryColumnWidths.accumulated}px`,
            '--cr-return-rate-width': `${crColumnWidths['returnRate'] || crHistoryColumnWidths.returnRate}px`,
            '--cr-issue-date-width': `${crColumnWidths['issueDate'] || crHistoryColumnWidths.issueDate}px`,
          } as React.CSSProperties}
        >
          {/* 헤더 행 */}
          <div className="cr-contract-history-header">
            <div className="cr-contract-history-header__seq">순번</div>
            <div
              className="cr-contract-history-header__policy resizable-header header-sortable"
              onClick={() => handleCrSort('policyNumber')}
              role="button"
              tabIndex={0}
            >
              <span>증권번호</span>
              {renderCrSortIndicator('policyNumber')}
              <div {...getCrResizeHandleProps('policy')} />
            </div>
            <div
              className="cr-contract-history-header__product resizable-header header-sortable"
              onClick={() => handleCrSort('productName')}
              role="button"
              tabIndex={0}
            >
              <span>보험상품</span>
              {renderCrSortIndicator('productName')}
              <div {...getCrResizeHandleProps('product')} />
            </div>
            <div
              className="cr-contract-history-header__contractor resizable-header header-sortable"
              onClick={() => handleCrSort('contractorName')}
              role="button"
              tabIndex={0}
            >
              <span>계약자</span>
              {renderCrSortIndicator('contractorName')}
              <div {...getCrResizeHandleProps('contractor')} />
            </div>
            <div
              className="cr-contract-history-header__insured resizable-header header-sortable"
              onClick={() => handleCrSort('insuredName')}
              role="button"
              tabIndex={0}
            >
              <span>피보험자</span>
              {renderCrSortIndicator('insuredName')}
              <div {...getCrResizeHandleProps('insured')} />
            </div>
            <div
              className="cr-contract-history-header__date resizable-header header-sortable"
              onClick={() => handleCrSort('contractDate')}
              role="button"
              tabIndex={0}
            >
              <span>계약일</span>
              {renderCrSortIndicator('contractDate')}
              <div {...getCrResizeHandleProps('date')} />
            </div>
            <div
              className="cr-contract-history-header__insured-amount resizable-header header-sortable"
              onClick={() => handleCrSort('insuredAmount')}
              role="button"
              tabIndex={0}
            >
              <span>보험가입금액</span>
              {renderCrSortIndicator('insuredAmount')}
              <div {...getCrResizeHandleProps('insuredAmount')} />
            </div>
            <div
              className="cr-contract-history-header__accumulated resizable-header header-sortable"
              onClick={() => handleCrSort('accumulatedAmount')}
              role="button"
              tabIndex={0}
            >
              <span>적립금</span>
              {renderCrSortIndicator('accumulatedAmount')}
              <div {...getCrResizeHandleProps('accumulated')} />
            </div>
            <div
              className="cr-contract-history-header__return-rate resizable-header header-sortable"
              onClick={() => handleCrSort('investmentReturnRate')}
              role="button"
              tabIndex={0}
            >
              <span>투자수익률</span>
              {renderCrSortIndicator('investmentReturnRate')}
              <div {...getCrResizeHandleProps('returnRate')} />
            </div>
            <div
              className="cr-contract-history-header__issue-date header-sortable"
              onClick={() => handleCrSort('issueDate')}
              role="button"
              tabIndex={0}
            >
              <span>발행일</span>
              {renderCrSortIndicator('issueDate')}
            </div>
          </div>
          <div className="cr-contract-history-list">
            {sortedCrContractHistories.map((history, idx) => {
              const isExpanded = expandedCrPolicyNumber === history.policyNumber
              const { latestSnapshot } = history

              return (
                <div key={history.policyNumber} className="cr-contract-history-accordion">
                  {/* 계약 요약 행 */}
                  <div
                    className={`cr-contract-history-accordion__header ${isExpanded ? 'cr-contract-history-accordion__header--expanded' : ''}`}
                    onClick={() => setExpandedCrPolicyNumber(isExpanded ? null : history.policyNumber)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded ? 'true' : 'false'}
                  >
                    <Tooltip content="변액 리포트 상세 보기">
                      <span
                        className="cr-contract-history-item__seq cr-contract-history-item__seq--crs"
                        onClick={(e) => handleOpenCrModal(history.policyNumber, e)}
                        role="button"
                        tabIndex={0}
                      >
                        {idx + 1}
                      </span>
                    </Tooltip>
                    <span className="cr-contract-history-item__policy">
                      <span className="cr-contract-history-item__toggle">{isExpanded ? '▼' : '▶'}</span>
                      {history.policyNumber}
                    </span>
                    <Tooltip content={history.productName || '-'}>
                      <span className="cr-contract-history-item__product">{history.productName || '-'}</span>
                    </Tooltip>
                    <span className="cr-contract-history-item__contractor">{history.contractorName || '-'}</span>
                    <span className="cr-contract-history-item__insured">{history.insuredName || '-'}</span>
                    <span className="cr-contract-history-item__date">{history.contractDate || '-'}</span>
                    <span className="cr-contract-history-item__insured-amount">
                      {latestSnapshot.insuredAmount ? latestSnapshot.insuredAmount.toLocaleString('ko-KR') : '-'}
                    </span>
                    <span className="cr-contract-history-item__accumulated">
                      {latestSnapshot.accumulatedAmount ? latestSnapshot.accumulatedAmount.toLocaleString('ko-KR') : '-'}
                    </span>
                    <span className="cr-contract-history-item__return-rate">
                      {latestSnapshot.investmentReturnRate !== undefined ? `${latestSnapshot.investmentReturnRate.toFixed(2)}%` : '-'}
                    </span>
                    <span className="cr-contract-history-item__issue-date">
                      {formatDate(latestSnapshot.issueDate)}
                    </span>
                  </div>

                  {/* 스냅샷 이력 (펼침 시) - 발행일별 변경 이력 */}
                  {isExpanded && history.snapshots.length > 1 && (
                    <div className="cr-contract-history-accordion__content">
                      <div className="cr-contract-history-snapshots-title">
                        <span>📋 발행일별 이력 ({history.snapshots.length}건)</span>
                      </div>
                      <div className="cr-contract-history-snapshots-header">
                        <span className="cr-snapshot-header__issue-date">발행일</span>
                        <span className="cr-snapshot-header__insured-amount">보험가입금액</span>
                        <span className="cr-snapshot-header__accumulated">적립금</span>
                        <span className="cr-snapshot-header__return-rate">투자수익률</span>
                        <span className="cr-snapshot-header__surrender-value">해지환급금</span>
                        <span className="cr-snapshot-header__surrender-rate">해지환급율</span>
                      </div>
                      {history.snapshots.map((snapshot, snapshotIdx) => {
                        const prevSnapshot = history.snapshots[snapshotIdx + 1]
                        const changedFields = getCrChangedFields(snapshot, prevSnapshot)
                        const hasChanges = changedFields.length > 0

                        return (
                          <Tooltip key={`${history.policyNumber}-${snapshot.issueDate}`} content="클릭하여 해당 발행일 변액 리포트 보기">
                            <div
                              className={`cr-contract-history-snapshot-item cr-contract-history-snapshot-item--clickable ${hasChanges ? 'cr-contract-history-snapshot-item--changed' : ''}`}
                              onClick={() => handleOpenCrSnapshotModal(history.policyNumber, snapshot.issueDate)}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="cr-snapshot-item__issue-date">
                                {formatDate(snapshot.issueDate)}
                              </span>
                              <span className={`cr-snapshot-item__insured-amount ${changedFields.includes('insuredAmount') ? 'cr-snapshot-item--changed' : ''}`}>
                                {snapshot.insuredAmount ? snapshot.insuredAmount.toLocaleString('ko-KR') : '-'}
                              </span>
                              <span className={`cr-snapshot-item__accumulated ${changedFields.includes('accumulatedAmount') ? 'cr-snapshot-item--changed' : ''}`}>
                                {snapshot.accumulatedAmount ? snapshot.accumulatedAmount.toLocaleString('ko-KR') : '-'}
                              </span>
                              <span className={`cr-snapshot-item__return-rate ${changedFields.includes('investmentReturnRate') ? 'cr-snapshot-item--changed' : ''}`}>
                                {snapshot.investmentReturnRate !== undefined ? `${snapshot.investmentReturnRate.toFixed(2)}%` : '-'}
                              </span>
                              <span className={`cr-snapshot-item__surrender-value ${changedFields.includes('surrenderValue') ? 'cr-snapshot-item--changed' : ''}`}>
                                {snapshot.surrenderValue ? snapshot.surrenderValue.toLocaleString('ko-KR') : '-'}
                              </span>
                              <span className={`cr-snapshot-item__surrender-rate ${changedFields.includes('surrenderRate') ? 'cr-snapshot-item--changed' : ''}`}>
                                {snapshot.surrenderRate !== undefined ? `${snapshot.surrenderRate.toFixed(2)}%` : '-'}
                              </span>
                            </div>
                          </Tooltip>
                        )
                      })}
                    </div>
                  )}

                  {/* 이력이 1건인 경우 (변경 없음) */}
                  {isExpanded && history.snapshots.length === 1 && (
                    <div className="cr-contract-history-accordion__content cr-contract-history-accordion__content--empty">
                      <span>변경 이력이 없습니다. (1건의 CRS에서만 발견)</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CRS 로딩 중 */}
      {historyTab === 'cr' && isLoadingCr && crReviews.length === 0 && (
        <div className="customer-contracts__ar-loading">
          <SFSymbol
            name="arrow.clockwise"
            animation={SFSymbolAnimation.ROTATE}
            size={SFSymbolSize.CAPTION_1}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>변액 리포트 정보 로딩 중...</span>
        </div>
      )}

      {/* CRS 빈 상태 */}
      {historyTab === 'cr' && !isLoadingCr && crContractHistories.length === 0 && (
        <div className="customer-contracts__state customer-contracts__state--empty">
          <SFSymbol
            name='doc.text.magnifyingglass'
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>등록된 변액 리포트가 없습니다.</span>
        </div>
      )}

      {renderState()}

      {!isEmpty && contracts.length > 0 && (
        <>
          {/* 🍎 리스트 컨테이너 */}
          <div
            className={`tab-table__scroll customer-contracts__list-container${isResizing ? ' is-resizing' : ''}`}
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
            <div className="tab-table__header customer-contracts-list-header">
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
                className="tab-table__row customer-contracts-item"
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
            <div className="tab-table__pagination contract-pagination">
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
      {/* 🍎 변액 리포트 상세 모달 (AR이력/변액리포트이력 공통) */}
      <CustomerReviewModal
        isOpen={isCrModalOpen}
        onClose={() => { setIsCrModalOpen(false); setCrModalReview(null) }}
        review={crModalReview}
      />
    </div>
  )
}

export default ContractsTab

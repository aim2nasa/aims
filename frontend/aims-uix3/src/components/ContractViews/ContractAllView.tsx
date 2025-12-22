/**
 * ContractAllView Component
 * @since 1.0.0
 *
 * 전체계약 뷰
 * DocumentLibraryView 패턴 기반 구현
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAppleConfirm } from '@/contexts/AppleConfirmProvider'
import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import Button from '@/shared/ui/Button'
import { Dropdown } from '@/shared/ui'
import { Tooltip } from '@/shared/ui/Tooltip'
import Modal from '@/shared/ui/Modal'
import { ContractService } from '@/services/contractService'
import { CustomerService } from '@/services/customerService'
import { useDevModeStore } from '@/shared/store/useDevModeStore'
import type { Contract } from '@/entities/contract'
import type { Customer } from '@/entities/customer'
import { formatDate } from '@/shared/lib/timeUtils'
import './ContractAllView.css'

interface ContractAllViewProps {
  visible: boolean
  onClose: () => void
  /** 고객 클릭 핸들러 - RightPane에 고객 상세 정보 표시 */
  onCustomerClick?: (customerId: string, customer: Customer) => void
  /** 고객 더블클릭 핸들러 - 전체 정보 뷰로 이동 */
  onCustomerDoubleClick?: (customerId: string) => void
  /** 뷰 이동 핸들러 */
  onNavigate?: (viewKey: string) => void
}

type SortField = 'customer_type' | 'customer_name' | 'product_name' | 'contract_date' | 'policy_number' | 'premium' | 'payment_day' | 'payment_cycle' | 'insured_person' | 'payment_status'
type SortDirection = 'asc' | 'desc'

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '15', label: '15개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
]

export default function ContractAllView({
  visible,
  onClose,
  onCustomerClick,
  onCustomerDoubleClick,
  onNavigate
}: ContractAllViewProps) {
  // 🍎 애플 스타일 알림 모달
  const { showAlert } = useAppleConfirm()

  // 🍎 클릭/더블클릭 분리를 위한 타이머 Ref
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 데이터 상태
  const [contracts, setContracts] = useState<Contract[]>([])
  const [customerTypeMap, setCustomerTypeMap] = useState<Map<string, '개인' | '법인'>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 검색 상태
  const [searchValue, setSearchValue] = useState('')

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState('50')

  // 페이지네이션 클릭 애니메이션 상태
  const [prevArrowClicked, setPrevArrowClicked] = useState(false)
  const [nextArrowClicked, setNextArrowClicked] = useState(false)

  // 증권번호 표시 형식 (false: 앞자리 0 제거, true: 10자리 전체 표시)
  const [showFullPolicyNumber, setShowFullPolicyNumber] = useState(false)

  // 개발자 모드 상태
  const { isDevMode } = useDevModeStore()

  // 삭제 모드 상태
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedContractIds, setSelectedContractIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean
    count: number
  }>({ isOpen: false, count: 0 })

  // 전체 삭제 확인 모달 상태 (개발 환경 전용)
  const [deleteAllConfirmModal, setDeleteAllConfirmModal] = useState<{
    isOpen: boolean
    totalCount: number
  }>({ isOpen: false, totalCount: 0 })

  // 🍎 도움말 모달 상태
  const [helpModalVisible, setHelpModalVisible] = useState(false)

  // 미등록 고객 알림 모달 상태
  const [notRegisteredModal, setNotRegisteredModal] = useState<{
    isOpen: boolean
    name: string
  }>({ isOpen: false, name: '' })

  // 데이터 로드
  const loadContracts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 계약과 고객 목록 병렬 로드
      const [contractResponse, customerResponse] = await Promise.all([
        ContractService.getContracts({ limit: 10000 }),
        CustomerService.getCustomers({ limit: 10000 }),
      ])
      setContracts(contractResponse.data)

      // 고객 ID -> 고객 유형 맵 생성
      // ObjectId/String 형식 불일치 방지를 위해 String() 변환
      const typeMap = new Map<string, '개인' | '법인'>()
      customerResponse.customers.forEach((customer) => {
        const customerType = customer.insurance_info?.customer_type || '개인'
        typeMap.set(String(customer._id), customerType)
      })
      setCustomerTypeMap(typeMap)

    } catch (err) {
      console.error('[ContractAllView] 계약 목록 조회 실패:', err)
      setError('계약 목록을 불러오는 데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // visible 시 데이터 로드
  useEffect(() => {
    if (visible) {
      loadContracts()
    }
  }, [visible, loadContracts])

  // contractChanged 이벤트 리스너 (계약 삭제/추가 시 자동 새로고침)
  useEffect(() => {
    const handleContractChange = () => {
      if (import.meta.env.DEV) {
        console.log('[ContractAllView] contractChanged 이벤트 수신 - 계약 데이터 새로고침')
      }
      loadContracts()
    }

    window.addEventListener('contractChanged', handleContractChange)
    return () => {
      window.removeEventListener('contractChanged', handleContractChange)
    }
  }, [loadContracts])

  // 🍎 고객명 클릭 핸들러 - 300ms 후 RightPane에 표시 (더블클릭 대기)
  const handleCustomerClick = useCallback(async (contract: Contract, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onCustomerClick) return

    // 이전 타이머가 있으면 취소
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    // 300ms 후 단일 클릭 처리
    clickTimerRef.current = setTimeout(async () => {
      clickTimerRef.current = null

      // customer_id가 있으면 등록된 고객
      if (contract.customer_id) {
        try {
          const customer = await CustomerService.getCustomer(contract.customer_id)
          onCustomerClick(contract.customer_id, customer)
        } catch (err) {
          console.error('[ContractAllView] 고객 조회 실패:', err)
          setNotRegisteredModal({ isOpen: true, name: contract.customer_name || '알 수 없음' })
        }
      } else {
        // customer_id가 없으면 이름으로 검색
        try {
          const response = await CustomerService.searchCustomers(contract.customer_name || '')
          const matchedCustomer = response.customers.find(
            c => c.personal_info?.name === contract.customer_name
          )
          if (matchedCustomer) {
            onCustomerClick(matchedCustomer._id, matchedCustomer)
          } else {
            setNotRegisteredModal({ isOpen: true, name: contract.customer_name || '알 수 없음' })
          }
        } catch (err) {
          console.error('[ContractAllView] 고객 검색 실패:', err)
          setNotRegisteredModal({ isOpen: true, name: contract.customer_name || '알 수 없음' })
        }
      }
    }, 300)
  }, [onCustomerClick])

  // 🍎 고객명 더블클릭 핸들러 - 전체 정보 뷰로 이동
  const handleCustomerDoubleClick = useCallback(async (contract: Contract, e: React.MouseEvent) => {
    e.stopPropagation()

    // 단일 클릭 타이머 취소
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    if (!onCustomerDoubleClick) return

    // customer_id가 있으면 바로 전체 정보 뷰로 이동
    if (contract.customer_id) {
      onCustomerDoubleClick(contract.customer_id)
    } else {
      // customer_id가 없으면 이름으로 검색
      try {
        const response = await CustomerService.searchCustomers(contract.customer_name || '')
        const matchedCustomer = response.customers.find(
          c => c.personal_info?.name === contract.customer_name
        )
        if (matchedCustomer) {
          onCustomerDoubleClick(matchedCustomer._id)
        } else {
          setNotRegisteredModal({ isOpen: true, name: contract.customer_name || '알 수 없음' })
        }
      } catch (err) {
        console.error('[ContractAllView] 고객 검색 실패:', err)
        setNotRegisteredModal({ isOpen: true, name: contract.customer_name || '알 수 없음' })
      }
    }
  }, [onCustomerDoubleClick])

  // 검색 필터링된 계약 목록
  const filteredContracts = useMemo(() => {
    if (!searchValue.trim()) return contracts

    const searchLower = searchValue.toLowerCase().trim()
    return contracts.filter(contract => {
      const customerName = contract.customer_name?.toLowerCase() || ''
      const productName = contract.product_name?.toLowerCase() || ''
      const policyNumber = contract.policy_number?.toLowerCase() || ''

      return (
        customerName.includes(searchLower) ||
        productName.includes(searchLower) ||
        policyNumber.includes(searchLower)
      )
    })
  }, [contracts, searchValue])

  // 정렬된 계약 목록
  const sortedContracts = useMemo(() => {
    if (!sortField) return filteredContracts

    return [...filteredContracts].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
        case 'customer_type':
          // 고객 유형으로 정렬 (개인 < 법인)
          aVal = a.customer_id ? (customerTypeMap.get(String(a.customer_id)) === '법인' ? 1 : 0) : -1
          bVal = b.customer_id ? (customerTypeMap.get(String(b.customer_id)) === '법인' ? 1 : 0) : -1
          break
        case 'customer_name':
          aVal = a.customer_name || ''
          bVal = b.customer_name || ''
          break
        case 'product_name':
          aVal = a.product_name || ''
          bVal = b.product_name || ''
          break
        case 'contract_date':
          aVal = a.contract_date || ''
          bVal = b.contract_date || ''
          break
        case 'policy_number':
          aVal = a.policy_number || ''
          bVal = b.policy_number || ''
          break
        case 'premium':
          aVal = a.premium || 0
          bVal = b.premium || 0
          break
        case 'payment_day':
          aVal = a.payment_day || 0
          bVal = b.payment_day || 0
          break
        case 'payment_cycle':
          aVal = a.payment_cycle || ''
          bVal = b.payment_cycle || ''
          break
        case 'insured_person':
          aVal = a.insured_person || ''
          bVal = b.insured_person || ''
          break
        case 'payment_status':
          aVal = a.payment_status || ''
          bVal = b.payment_status || ''
          break
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      const strA = String(aVal).toLowerCase()
      const strB = String(bVal).toLowerCase()
      if (strA < strB) return sortDirection === 'asc' ? -1 : 1
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredContracts, sortField, sortDirection, customerTypeMap])

  // 페이지네이션
  const itemsPerPageNumber = parseInt(itemsPerPage, 10)
  const pagination = useMemo(() => {
    const totalItems = sortedContracts.length
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPageNumber))
    const safeCurrentPage = Math.min(currentPage, totalPages)
    const startIndex = (safeCurrentPage - 1) * itemsPerPageNumber
    const endIndex = Math.min(startIndex + itemsPerPageNumber, totalItems)
    return { totalItems, totalPages, startIndex, endIndex, currentPage: safeCurrentPage }
  }, [sortedContracts.length, currentPage, itemsPerPageNumber])

  // 현재 페이지 계약 목록
  const visibleContracts = useMemo(() => {
    return sortedContracts.slice(pagination.startIndex, pagination.endIndex)
  }, [sortedContracts, pagination.startIndex, pagination.endIndex])

  // 검색 핸들러
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    setCurrentPage(1) // 검색 시 첫 페이지로 이동
  }

  const handleClearSearch = () => {
    setSearchValue('')
    setCurrentPage(1)
  }

  // 페이지당 항목 수 변경 핸들러
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  // 정렬 핸들러
  const handleColumnSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setCurrentPage(1) // 정렬 시 첫 페이지로 이동
  }

  // 페이지 이동 핸들러
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setPrevArrowClicked(true)
      setCurrentPage(prev => prev - 1)
      setTimeout(() => setPrevArrowClicked(false), 150)
    }
  }

  const handleNextPage = () => {
    if (currentPage < pagination.totalPages) {
      setNextArrowClicked(true)
      setCurrentPage(prev => prev + 1)
      setTimeout(() => setNextArrowClicked(false), 150)
    }
  }

  // 보험료 포맷
  const formatPremium = (premium: number) => {
    return premium.toLocaleString('ko-KR') + '원'
  }

  // 증권번호 포맷 (10자리 전체 또는 앞자리 0 제거)
  const formatPolicyNumber = (policyNumber: string | null) => {
    if (!policyNumber) return '-'
    if (showFullPolicyNumber) {
      // 10자리로 앞자리 0 채우기
      return policyNumber.padStart(10, '0')
    } else {
      // 앞자리 0 제거
      return policyNumber.replace(/^0+/, '') || '0'
    }
  }

  // 증권번호 표시 형식 토글
  const togglePolicyNumberFormat = () => {
    setShowFullPolicyNumber(prev => !prev)
  }

  // 삭제 모드 핸들러
  const handleToggleDeleteMode = () => {
    if (isDeleteMode) {
      // 삭제 모드 종료 시 선택 초기화
      setSelectedContractIds(new Set())
    }
    setIsDeleteMode(!isDeleteMode)
  }

  const handleSelectContract = (contractId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedContractIds(prev => {
      const next = new Set(prev)
      if (next.has(contractId)) {
        next.delete(contractId)
      } else {
        next.add(contractId)
      }
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = visibleContracts.map(c => c._id).filter(Boolean)
      setSelectedContractIds(new Set(allIds))
    } else {
      setSelectedContractIds(new Set())
    }
  }

  const handleDeleteSelected = () => {
    if (selectedContractIds.size === 0) return
    setDeleteConfirmModal({
      isOpen: true,
      count: selectedContractIds.size,
    })
  }

  const handleConfirmDelete = async () => {
    setDeleteConfirmModal({ isOpen: false, count: 0 })
    setIsDeleting(true)

    try {
      const ids = Array.from(selectedContractIds)
      await ContractService.deleteContracts(ids)

      // 삭제 완료 후 새로고침 및 상태 초기화
      await loadContracts()
      setSelectedContractIds(new Set())
      setIsDeleteMode(false)

      // 계약 관리 대시보드 동기화를 위한 이벤트 발생
      window.dispatchEvent(new CustomEvent('contractChanged'))
    } catch (error) {
      console.error('[ContractAllView] 계약 삭제 실패:', error)
      showAlert({
        title: '삭제 실패',
        message: '계약 삭제 중 오류가 발생했습니다.',
        iconType: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // 전체 삭제 핸들러 (개발 환경 전용)
  const handleDeleteAll = () => {
    setDeleteAllConfirmModal({
      isOpen: true,
      totalCount: contracts.length
    })
  }

  const handleConfirmDeleteAll = async () => {
    setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 })
    setIsDeleting(true)

    try {
      const result = await ContractService.deleteAllContracts()
      showAlert({
        title: '삭제 완료',
        message: `${result.deletedCount}건의 계약이 삭제되었습니다.`,
        iconType: 'success'
      })

      // 삭제 완료 후 새로고침 및 상태 초기화
      await loadContracts()
      setSelectedContractIds(new Set())
      setIsDeleteMode(false)

      // 계약 관리 대시보드 동기화를 위한 이벤트 발생
      window.dispatchEvent(new CustomEvent('contractChanged'))
    } catch (error) {
      console.error('[ContractAllView] 계약 전체 삭제 실패:', error)
      showAlert({
        title: '삭제 실패',
        message: '계약 전체 삭제 중 오류가 발생했습니다.',
        iconType: 'error'
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // 정렬 인디케이터 (DocumentLibraryView 동일 패턴)
  const renderSortIndicator = (field: SortField) => {
    if (sortField === field) {
      // 현재 정렬 중인 컬럼: 단일 화살표
      return (
        <span className="sort-indicator">
          {sortDirection === 'asc' ? '▲' : '▼'}
        </span>
      )
    }
    // 정렬되지 않은 컬럼: 양방향 화살표
    return (
      <span className="sort-indicator sort-indicator--both">
        <span className="sort-arrow">▲</span>
        <span className="sort-arrow">▼</span>
      </span>
    )
  }

  const isEmpty = contracts.length === 0 && !isLoading

  return (
    <CenterPaneView
      visible={visible}
      title="전체 계약 보기"
      titleIcon={
        <span className="menu-icon-purple">
          <SFSymbol
            name="tablecells"
            size={SFSymbolSize.CALLOUT}
            weight={SFSymbolWeight.MEDIUM}
          />
        </span>
      }
      onClose={onClose}
      placeholderIcon="tablecells"
      placeholderMessage="전체 계약 보기 목록이 여기에 표시됩니다."
    >
      <div className="contract-all-view">
        {/* 검색 바 */}
        <div className="contract-search-bar">
          <div className="search-input-wrapper">
            <div className="search-icon">
              <SFSymbol name="magnifyingglass" size={SFSymbolSize.BODY} />
            </div>
            <input
              type="text"
              className="search-input"
              placeholder="고객명, 상품명, 증권번호로 검색..."
              value={searchValue}
              onChange={handleSearchInputChange}
            />
            {searchValue && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSearch}
                className="search-clear-button"
                aria-label="검색어 지우기"
              >
                <SFSymbol name="xmark.circle.fill" size={SFSymbolSize.CAPTION_1} />
              </Button>
            )}
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="contract-error">
            <p>{error}</p>
            <Button variant="secondary" size="sm" onClick={loadContracts}>
              다시 시도
            </Button>
          </div>
        )}

        {/* 결과 헤더 */}
        {!isLoading && !error && (
          <div className="contract-result-header">
            <div className="result-count">
              {/* 개발자 모드일 때만 삭제 버튼 표시 */}
              {isDevMode && (
                <Tooltip content={isDeleteMode ? '삭제 완료' : '삭제'}>
                  <button
                    type="button"
                    className={`edit-mode-icon-button ${isDeleteMode ? 'edit-mode-icon-button--active' : ''}`}
                    onClick={handleToggleDeleteMode}
                    aria-label={isDeleteMode ? '삭제 완료' : '삭제'}
                  >
                    {isDeleteMode ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <SFSymbol
                        name="trash"
                        size={SFSymbolSize.CAPTION_1}
                        weight={SFSymbolWeight.MEDIUM}
                        decorative={true}
                      />
                    )}
                  </button>
                </Tooltip>
              )}

              <span>총 {filteredContracts.length}건</span>
              {searchValue && contracts.length !== filteredContracts.length && (
                <span className="search-result-info"> (전체 {contracts.length}건 중)</span>
              )}

              {/* 🍎 도움말 버튼 */}
              <Tooltip content="도움말" placement="bottom">
                <button
                  type="button"
                  className="help-icon-button"
                  onClick={() => setHelpModalVisible(true)}
                  aria-label="도움말"
                >
                  <SFSymbol
                    name="questionmark.circle"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                </button>
              </Tooltip>

              {/* 삭제 모드일 때 선택 수 및 삭제 버튼 */}
              {isDeleteMode && (
                <>
                  <span className="selected-count-inline">
                    {selectedContractIds.size}개 선택됨
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting || selectedContractIds.size === 0}
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </Button>
                  {/* 전체 삭제 버튼 (개발 환경 전용) */}
                  {import.meta.env.DEV && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteAll}
                      disabled={isDeleting || contracts.length === 0}
                    >
                      전체 삭제
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 계약 목록 */}
        <div className="contract-list">
          {/* 로딩 */}
          {isLoading && (
            <div className="contract-loading">
              <div className="loading-spinner" />
              <span>계약 목록을 불러오는 중...</span>
            </div>
          )}

          {/* 빈 상태 */}
          {isEmpty && !error && (
            <div className="contract-empty">
              <SFSymbol
                name="doc.text"
                size={SFSymbolSize.TITLE_1}
                weight={SFSymbolWeight.LIGHT}
              />
              <p>등록된 계약이 없습니다.</p>
              <p className="contract-empty-hint">고객·계약 일괄등록에서 엑셀 파일을 업로드하세요.</p>
              {onNavigate && (
                <Button
                  variant="primary"
                  onClick={() => onNavigate('contracts-import')}
                  style={{ marginTop: '16px' }}
                >
                  고객·계약 일괄등록
                </Button>
              )}
            </div>
          )}

          {/* 컬럼 헤더 */}
          {!isEmpty && !isLoading && (
            <div className={`contract-list-header ${isDeleteMode ? 'contract-list-header--delete-mode' : ''}`}>
              {/* 삭제 모드일 때 전체 선택 체크박스 */}
              {isDeleteMode && (
                <div className="header-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedContractIds.size === visibleContracts.length && visibleContracts.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="전체 선택"
                  />
                </div>
              )}
              <div className="header-type header-sortable" onClick={() => handleColumnSort('customer_type')}>
                <span>유형</span>
                {renderSortIndicator('customer_type')}
              </div>
              <div className="header-customer header-sortable" onClick={() => handleColumnSort('customer_name')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                </svg>
                <span>고객명</span>
                {renderSortIndicator('customer_name')}
              </div>
              <div className="header-product header-sortable" onClick={() => handleColumnSort('product_name')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 6h6M5 8h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>상품명</span>
                {renderSortIndicator('product_name')}
              </div>
              <div className="header-date header-sortable" onClick={() => handleColumnSort('contract_date')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>계약일</span>
                {renderSortIndicator('contract_date')}
              </div>
              <div className="header-policy header-sortable" onClick={() => handleColumnSort('policy_number')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <path d="M4 2h8l2 2v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>증권번호</span>
                {renderSortIndicator('policy_number')}
                <Tooltip content={showFullPolicyNumber ? "간략 표시" : "10자리 표시"}>
                  <button
                    type="button"
                    className="format-toggle-btn"
                    onClick={(e) => { e.stopPropagation(); togglePolicyNumberFormat(); }}
                    aria-label={showFullPolicyNumber ? "간략 표시" : "10자리 표시"}
                  >
                    {showFullPolicyNumber ? '00' : '·'}
                  </button>
                </Tooltip>
              </div>
              <div className="header-premium header-sortable" onClick={() => handleColumnSort('premium')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 4v8M6 6h4M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>보험료</span>
                {renderSortIndicator('premium')}
              </div>
              <div className="header-payment-day header-sortable" onClick={() => handleColumnSort('payment_day')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="8" cy="10" r="1.5" fill="currentColor"/>
                </svg>
                <span>이체일</span>
                {renderSortIndicator('payment_day')}
              </div>
              <div className="header-cycle header-sortable" onClick={() => handleColumnSort('payment_cycle')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>납입주기</span>
                {renderSortIndicator('payment_cycle')}
              </div>
              <div className="header-insured header-sortable" onClick={() => handleColumnSort('insured_person')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="5" r="2.5" fill="currentColor"/>
                  <path d="M8 9c-2.5 0-4.5 1.5-4.5 3v1.5h9V12c0-1.5-2-3-4.5-3z" fill="currentColor"/>
                  <path d="M12 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                </svg>
                <span>피보험자</span>
                {renderSortIndicator('insured_person')}
              </div>
              <div className="header-status header-sortable" onClick={() => handleColumnSort('payment_status')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>납입상태</span>
                {renderSortIndicator('payment_status')}
              </div>
            </div>
          )}

          {/* 계약 행 */}
          {!isEmpty && !isLoading && visibleContracts.map((contract) => (
            <div
              key={contract._id}
              className={`contract-item ${isDeleteMode ? 'contract-item--delete-mode' : ''}`}
              onClick={isDeleteMode ? (e) => handleSelectContract(contract._id, e) : undefined}
            >
              {/* 삭제 모드일 때 체크박스 */}
              {isDeleteMode && (
                <div className="item-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedContractIds.has(contract._id)}
                    onChange={() => {
                      setSelectedContractIds(prev => {
                        const next = new Set(prev)
                        if (next.has(contract._id)) {
                          next.delete(contract._id)
                        } else {
                          next.add(contract._id)
                        }
                        return next
                      })
                    }}
                    aria-label={`${contract.customer_name} 계약 선택`}
                  />
                </div>
              )}
              {/* 고객 유형 아이콘 칼럼 (개인/법인) */}
              <span className="contract-type">
                {contract.customer_id && customerTypeMap.get(String(contract.customer_id)) === '법인' ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon customer-type-icon--corporate">
                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                    <path d="M6 5h2v2H6V5zm0 3h2v2H6V8zm0 3h2v2H6v-2zm3-6h2v2H9V5zm0 3h2v2H9V8zm0 3h2v2H9v-2zm3-6h2v2h-2V5zm0 3h2v2h-2V8zm0 3h2v2h-2v-2zM5 14h10v2H5v-2z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="customer-type-icon customer-type-icon--personal">
                    <circle cx="10" cy="10" r="10" opacity="0.2" />
                    <circle cx="10" cy="7" r="3" />
                    <path d="M10 11c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                  </svg>
                )}
              </span>
              <span
                className={`contract-customer ${contract.customer_id ? 'contract-customer--clickable' : ''}`}
                onClick={contract.customer_id ? (e) => handleCustomerClick(contract, e) : undefined}
                onDoubleClick={contract.customer_id ? (e) => handleCustomerDoubleClick(contract, e) : undefined}
              >
                {contract.customer_name || '-'}
              </span>
              <span className="contract-product" title={contract.product_name || '-'}>
                {contract.product_name || '-'}
              </span>
              <span className="contract-date">{formatDate(contract.contract_date)}</span>
              <span className="contract-policy">{formatPolicyNumber(contract.policy_number)}</span>
              <span className="contract-premium">{formatPremium(contract.premium)}</span>
              <span className="contract-payment-day">{contract.payment_day || '-'}</span>
              <span className="contract-cycle">{contract.payment_cycle || '-'}</span>
              <span className="contract-insured">
                {contract.insured_person || '-'}
              </span>
              <span className={`contract-status contract-status--${contract.payment_status === '납입중' ? 'active' : contract.payment_status === '납입완료' ? 'completed' : 'default'}`}>
                {contract.payment_status || '-'}
              </span>
            </div>
          ))}
        </div>

        {/* 페이지네이션 */}
        {!isLoading && !isEmpty && (
          <div className="contract-pagination">
            {/* 페이지당 항목 수 선택 */}
            <div className="pagination-limit">
              <Dropdown
                value={itemsPerPage}
                options={ITEMS_PER_PAGE_OPTIONS}
                onChange={handleItemsPerPageChange}
                aria-label="페이지당 항목 수"
              />
            </div>

            {/* 페이지 네비게이션 - 페이지가 2개 이상일 때만 표시 */}
            {pagination.totalPages > 1 && (
              <div className="pagination-controls">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={pagination.currentPage === 1}
                  className="pagination-button pagination-button--prev"
                  aria-label="이전 페이지"
                >
                  <span className={`pagination-arrow ${prevArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ‹
                  </span>
                </Button>

                <div className="pagination-info">
                  <span className="pagination-current">{pagination.currentPage}</span>
                  <span className="pagination-separator">/</span>
                  <span className="pagination-total">{pagination.totalPages}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="pagination-button pagination-button--next"
                  aria-label="다음 페이지"
                >
                  <span className={`pagination-arrow ${nextArrowClicked ? 'pagination-arrow--clicked' : ''}`}>
                    ›
                  </span>
                </Button>
              </div>
            )}

            {/* 페이지가 1개일 때 빈 공간 유지 */}
            {pagination.totalPages <= 1 && <div className="pagination-spacer"></div>}
          </div>
        )}
      </div>

      {/* 삭제 확인 모달 */}
      <Modal
        visible={deleteConfirmModal.isOpen}
        onClose={() => setDeleteConfirmModal({ isOpen: false, count: 0 })}
        title="계약 삭제"
        size="sm"
      >
        <div className="delete-confirm-content">
          <p>선택한 <strong>{deleteConfirmModal.count}건</strong>의 계약을 삭제하시겠습니까?</p>
          <p className="delete-warning">이 작업은 되돌릴 수 없습니다.</p>
          <div className="delete-confirm-actions">
            <Button
              variant="secondary"
              onClick={() => setDeleteConfirmModal({ isOpen: false, count: 0 })}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              삭제
            </Button>
          </div>
        </div>
      </Modal>

      {/* 전체 삭제 확인 모달 (개발 환경 전용) */}
      <Modal
        visible={deleteAllConfirmModal.isOpen}
        onClose={() => setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 })}
        title="⚠️ 전체 계약 삭제"
        size="sm"
      >
        <div className="delete-confirm-content">
          <p><strong>현재 등록된 모든 계약 ({deleteAllConfirmModal.totalCount}건)</strong>을 삭제하시겠습니까?</p>
          <p className="delete-warning">⚠️ 이 작업은 되돌릴 수 없습니다!</p>
          <p className="delete-warning">개발 환경 전용 기능입니다.</p>
          <div className="delete-confirm-actions">
            <Button
              variant="secondary"
              onClick={() => setDeleteAllConfirmModal({ isOpen: false, totalCount: 0 })}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteAll}
            >
              전체 삭제
            </Button>
          </div>
        </div>
      </Modal>

      {/* 미등록 고객 알림 모달 */}
      <Modal
        visible={notRegisteredModal.isOpen}
        onClose={() => setNotRegisteredModal({ isOpen: false, name: '' })}
        title="고객 정보"
        size="sm"
      >
        <div className="not-registered-content">
          <div className="not-registered-icon">
            <SFSymbol name="person.crop.circle.badge.exclamationmark" size={SFSymbolSize.LARGE_TITLE} />
          </div>
          <p className="not-registered-message">
            <strong>"{notRegisteredModal.name}"</strong>은(는) 등록된 고객이 아닙니다.
          </p>
          <div className="not-registered-actions">
            <Button
              variant="primary"
              onClick={() => setNotRegisteredModal({ isOpen: false, name: '' })}
            >
              확인
            </Button>
          </div>
        </div>
      </Modal>

      {/* 🍎 도움말 모달 */}
      <Modal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        title="📋 전체 계약 보기 사용법"
        size="md"
      >
        <div className="help-modal-content">
          <div className="help-modal-section">
            <p><strong>🔍 계약 검색</strong></p>
            <ul>
              <li><strong>"홍길동"</strong> → 해당 고객의 계약만</li>
              <li><strong>"종신보험"</strong> → 상품명으로 검색</li>
              <li><strong>증권번호</strong>로도 검색 가능</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>👤 고객 정보</strong></p>
            <ul>
              <li>고객명 <strong>클릭</strong> → 오른쪽에 상세 정보</li>
              <li>고객명 <strong>더블클릭</strong> → 전체 정보 화면</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>📊 정렬/필터</strong></p>
            <ul>
              <li>칼럼 헤더 클릭 → 오름차순/내림차순</li>
              <li>계약일, 보험료 등으로 정렬</li>
            </ul>
          </div>

          <div className="help-modal-section">
            <p><strong>💡 팁</strong></p>
            <ul>
              <li>새 계약: <strong>"고객·계약 일괄등록"</strong>에서 엑셀 업로드</li>
              <li>기존 고객에 추가 시 <strong>고객명 정확히</strong> 입력</li>
            </ul>
          </div>
        </div>
      </Modal>
    </CenterPaneView>
  )
}

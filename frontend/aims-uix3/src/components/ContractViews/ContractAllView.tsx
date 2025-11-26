/**
 * ContractAllView Component
 * @since 1.0.0
 *
 * 전체계약 뷰
 * DocumentLibraryView 패턴 기반 구현
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import CenterPaneView from '../CenterPaneView/CenterPaneView'
import { SFSymbol, SFSymbolSize, SFSymbolWeight } from '../SFSymbol'
import { Tooltip } from '@/shared/ui'
import Button from '@/shared/ui/Button'
import { ContractService } from '@/services/contractService'
import type { Contract } from '@/entities/contract'
import './ContractAllView.css'

interface ContractAllViewProps {
  visible: boolean
  onClose: () => void
}

type SortField = 'customer_name' | 'product_name' | 'contract_date' | 'policy_number' | 'premium' | 'payment_status'
type SortDirection = 'asc' | 'desc'

export default function ContractAllView({
  visible,
  onClose
}: ContractAllViewProps) {
  // 데이터 상태
  const [contracts, setContracts] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 정렬 상태
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  // 페이지네이션 클릭 애니메이션 상태
  const [prevArrowClicked, setPrevArrowClicked] = useState(false)
  const [nextArrowClicked, setNextArrowClicked] = useState(false)

  // 데이터 로드
  const loadContracts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await ContractService.getContracts({ limit: 10000 })
      setContracts(response.data)
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

  // 정렬된 계약 목록
  const sortedContracts = useMemo(() => {
    if (!sortField) return contracts

    return [...contracts].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      switch (sortField) {
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
  }, [contracts, sortField, sortDirection])

  // 페이지네이션
  const pagination = useMemo(() => {
    const totalItems = sortedContracts.length
    const totalPages = Math.ceil(totalItems / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
    return { totalItems, totalPages, startIndex, endIndex }
  }, [sortedContracts.length, currentPage])

  // 현재 페이지 계약 목록
  const visibleContracts = useMemo(() => {
    return sortedContracts.slice(pagination.startIndex, pagination.endIndex)
  }, [sortedContracts, pagination.startIndex, pagination.endIndex])

  // 정렬 핸들러
  const handleColumnSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
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

  // 계약일 포맷
  const formatDate = (date: string | null) => {
    if (!date) return '-'
    try {
      return new Date(date).toLocaleDateString('ko-KR')
    } catch {
      return date
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
      title="전체계약"
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
      placeholderMessage="전체계약 목록이 여기에 표시됩니다."
    >
      <div className="contract-all-view">
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
              <Tooltip content="새로고침">
                <button
                  type="button"
                  className="refresh-icon-button"
                  onClick={loadContracts}
                  aria-label="새로고침"
                >
                  <SFSymbol
                    name="arrow.clockwise"
                    size={SFSymbolSize.CAPTION_1}
                    weight={SFSymbolWeight.MEDIUM}
                    decorative={true}
                  />
                </button>
              </Tooltip>
              <span>총 {contracts.length}건</span>
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
              <p className="contract-empty-hint">계약 가져오기에서 엑셀 파일을 업로드하세요.</p>
            </div>
          )}

          {/* 컬럼 헤더 */}
          {!isEmpty && !isLoading && (
            <div className="contract-list-header">
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
              </div>
              <div className="header-premium header-sortable" onClick={() => handleColumnSort('premium')}>
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 4v8M6 6h4M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span>보험료</span>
                {renderSortIndicator('premium')}
              </div>
              <div className="header-cycle">
                <svg className="header-icon-svg" width="13" height="13" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>납입주기</span>
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
            <div key={contract._id} className="contract-item">
              <span className="contract-customer">{contract.customer_name || '-'}</span>
              <span className="contract-product" title={contract.product_name || '-'}>
                {contract.product_name || '-'}
              </span>
              <span className="contract-date">{formatDate(contract.contract_date)}</span>
              <span className="contract-policy">{contract.policy_number || '-'}</span>
              <span className="contract-premium">{formatPremium(contract.premium)}</span>
              <span className="contract-cycle">{contract.payment_cycle || '-'}</span>
              <span className={`contract-status contract-status--${contract.payment_status === '납입중' ? 'active' : contract.payment_status === '납입완료' ? 'completed' : 'default'}`}>
                {contract.payment_status || '-'}
              </span>
            </div>
          ))}
        </div>

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="contract-pagination">
            {/* 왼쪽 여백 */}
            <div className="pagination-spacer"></div>

            {/* 중앙 컨트롤 */}
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-button pagination-button--prev"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
              >
                <span className={`pagination-arrow ${prevArrowClicked ? 'pagination-arrow--clicked' : ''}`}>‹</span>
              </button>

              <span className="pagination-info">
                {currentPage} / {pagination.totalPages}
              </span>

              <button
                type="button"
                className="pagination-button pagination-button--next"
                onClick={handleNextPage}
                disabled={currentPage === pagination.totalPages}
                aria-label="다음 페이지"
              >
                <span className={`pagination-arrow ${nextArrowClicked ? 'pagination-arrow--clicked' : ''}`}>›</span>
              </button>
            </div>

            {/* 오른쪽 여백 */}
            <div className="pagination-spacer"></div>
          </div>
        )}

        {/* 페이지가 1개일 때 빈 공간 유지 */}
        {pagination.totalPages <= 1 && !isEmpty && !isLoading && (
          <div className="pagination-spacer-single"></div>
        )}
      </div>
    </CenterPaneView>
  )
}

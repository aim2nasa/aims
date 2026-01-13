/**
 * Annual Report 팝업 윈도우 전용 페이지
 * @since 2026-01-14
 *
 * window.open()으로 열리는 독립 팝업 창에서 Annual Report를 볼 수 있게 함
 * 브라우저 밖으로 이동 가능하며, 다른 앱 위에 띄울 수 있음
 */

import React, { useState, useEffect, useCallback } from 'react'
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../components/SFSymbol'
import Tooltip from '../shared/ui/Tooltip'
import type { AnnualReport, InsuranceContract } from '../features/customer/api/annualReportApi'
import { AnnualReportApi } from '../features/customer/api/annualReportApi'
import { formatDateTime, formatDate } from '@/shared/lib/timeUtils'
import './AnnualReportPage.css'

// 정렬 설정 타입
type SortConfig = {
  key: keyof InsuranceContract
  direction: 'asc' | 'desc'
} | null

const AnnualReportPage: React.FC = () => {
  const [report, setReport] = useState<AnnualReport | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)

  // 컴포넌트 마운트 시 localStorage에서 데이터 로드
  useEffect(() => {
    console.log('[AnnualReportPage] 팝업 페이지 로드')

    // localStorage에서 AR 데이터 읽기
    const storedData = localStorage.getItem('aims-ar-popup-data')
    if (storedData) {
      try {
        const data = JSON.parse(storedData)
        setReport(data.report)
        setCustomerName(data.customerName || '')
        console.log('[AnnualReportPage] AR 데이터 로드 완료:', data.report?.report_id)

        // 팝업 열림 상태 저장
        localStorage.setItem('aims-ar-popup-open', 'true')
      } catch (error) {
        console.error('[AnnualReportPage] AR 데이터 파싱 실패:', error)
      }
    }

    // 팝업 준비 완료 알림
    if (window.opener && !window.opener.closed) {
      console.log('[AnnualReportPage] 팝업 준비 완료, 부모에 알림')
      window.opener.postMessage({ type: 'AIMS_AR_POPUP_READY' }, window.location.origin)
    }

    // 창 닫힐 때 정리
    return () => {
      localStorage.removeItem('aims-ar-popup-open')
    }
  }, [])

  // 창 닫힐 때 localStorage 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem('aims-ar-popup-open')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // 브라우저 내로 이동 (팝업 → 메인 창)
  const handleMoveToMainWindow = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      // 팝업 닫힘 상태 제거
      localStorage.removeItem('aims-ar-popup-open')
      // 메인 창에 AR 모달 열기 이벤트 전송
      window.opener.postMessage({
        type: 'AIMS_AR_OPEN_IN_MAIN',
        report: JSON.stringify(report),
        customerName
      }, window.location.origin)
      // 팝업 창 닫기
      window.close()
    }
  }, [report, customerName])

  /**
   * 계약 상태에 따른 배지 스타일
   */
  const getStatusBadgeClass = (status?: string) => {
    if (!status) return 'contract-item__status--default'

    const lowerStatus = status.toLowerCase()
    if (lowerStatus.includes('유지') || lowerStatus.includes('정상')) {
      return 'contract-item__status--active'
    }
    if (lowerStatus.includes('만기') || lowerStatus.includes('해지')) {
      return 'contract-item__status--inactive'
    }
    return 'contract-item__status--default'
  }

  /**
   * 정렬 핸들러
   */
  const handleSort = (key: keyof InsuranceContract) => {
    let direction: 'asc' | 'desc' = 'asc'

    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }

    setSortConfig({ key, direction })
  }

  /**
   * 정렬된 계약 목록 생성
   */
  const getSortedContracts = (contracts: InsuranceContract[]): InsuranceContract[] => {
    if (!sortConfig) return contracts

    const sortedContracts = [...contracts]

    sortedContracts.sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]

      if (aValue == null && bValue == null) return 0
      if (aValue == null) return 1
      if (bValue == null) return -1

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
      }

      const aStr = String(aValue)
      const bStr = String(bValue)
      const comparison = aStr.localeCompare(bStr, 'ko-KR')

      return sortConfig.direction === 'asc' ? comparison : -comparison
    })

    return sortedContracts
  }

  /**
   * 정렬 아이콘 렌더링
   */
  const renderSortIcon = (columnKey: keyof InsuranceContract) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return (
        <Tooltip content="클릭하여 정렬">
          <span className="contracts-table__sort-icon">
            <SFSymbol
              name="arrow.up.arrow.down"
              size={SFSymbolSize.CAPTION_2}
              weight={SFSymbolWeight.REGULAR}
              decorative={true}
            />
          </span>
        </Tooltip>
      )
    }

    const tooltipText = sortConfig.direction === 'asc' ? '오름차순 정렬 중' : '내림차순 정렬 중'

    return (
      <Tooltip content={tooltipText}>
        <span className="contracts-table__sort-icon">
          <SFSymbol
            name={sortConfig.direction === 'asc' ? 'chevron.up' : 'chevron.down'}
            size={SFSymbolSize.CAPTION_2}
            weight={SFSymbolWeight.SEMIBOLD}
            decorative={true}
          />
        </span>
      </Tooltip>
    )
  }

  const isSortedColumn = (columnKey: keyof InsuranceContract) => {
    return sortConfig && sortConfig.key === columnKey
  }

  // 데이터 없음 상태
  if (!report) {
    return (
      <div className="annual-report-page">
        <div className="annual-report-page__empty">
          <SFSymbol
            name="doc.text.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>Annual Report 데이터가 없습니다.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="annual-report-page">
      {/* 헤더 */}
      <header className="annual-report-page__header">
        <div className="annual-report-page__header-title">
          <SFSymbol
            name="chart.bar.doc.horizontal"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.REGULAR}
          />
          <div>
            <h1>{report.customer_name || customerName}님의 Annual Report</h1>
            <p>
              {report.issue_date ? `발행일: ${formatDate(report.issue_date)}` : '정보 없음'}
              {` · ${report.contract_count}건`}
            </p>
          </div>
        </div>
        <div className="annual-report-page__header-actions">
          {/* 브라우저 내로 이동 버튼 */}
          {window.opener && !window.opener.closed && (
            <Tooltip content="브라우저 내로 이동">
              <button
                className="annual-report-page__action-button"
                onClick={handleMoveToMainWindow}
                aria-label="브라우저 내로 이동"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M9 2h5v5M14 2L8 8M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </Tooltip>
          )}
          {/* 닫기 버튼 */}
          <Tooltip content="창 닫기">
            <button
              className="annual-report-page__action-button annual-report-page__close-button"
              onClick={() => window.close()}
              aria-label="창 닫기"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </Tooltip>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="annual-report-page__content">
        {/* Summary Section */}
        <div className="annual-report-summary">
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">발행일</span>
            <span className="annual-report-summary__value">
              {formatDate(report.issue_date)}
            </span>
          </div>
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">총 월보험료</span>
            <span className="annual-report-summary__value annual-report-summary__value--primary">
              {AnnualReportApi.formatCurrency(report.total_monthly_premium)}
            </span>
          </div>
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">계약 건수</span>
            <span className="annual-report-summary__value">
              {AnnualReportApi.formatContractCount(report.contract_count)}
            </span>
          </div>
        </div>

        {/* Contracts Table */}
        <div className="annual-report-contracts">
          <h3 className="annual-report-contracts__title">
            보험 계약 목록 ({report.contract_count}건)
          </h3>

          <div className="contracts-table-wrapper">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>순번</th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('insurance_company') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('insurance_company')}
                  >
                    보험사 {renderSortIcon('insurance_company')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('contract_number') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('contract_number')}
                  >
                    증권번호 {renderSortIcon('contract_number')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('product_name') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('product_name')}
                  >
                    보험상품 {renderSortIcon('product_name')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('contractor_name') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('contractor_name')}
                  >
                    계약자 {renderSortIcon('contractor_name')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('insured_name') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('insured_name')}
                  >
                    피보험자 {renderSortIcon('insured_name')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('contract_date') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('contract_date')}
                  >
                    계약일 {renderSortIcon('contract_date')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('status') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('status')}
                  >
                    계약상태 {renderSortIcon('status')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('coverage_amount') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('coverage_amount')}
                  >
                    가입금액(만원) {renderSortIcon('coverage_amount')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('insurance_period') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('insurance_period')}
                  >
                    보험기간 {renderSortIcon('insurance_period')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('premium_payment_period') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('premium_payment_period')}
                  >
                    납입기간 {renderSortIcon('premium_payment_period')}
                  </th>
                  <th
                    className={`contracts-table__th--sortable ${isSortedColumn('monthly_premium') ? 'contracts-table__th--sorted' : ''}`}
                    onClick={() => handleSort('monthly_premium')}
                  >
                    보험료(원) {renderSortIcon('monthly_premium')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getSortedContracts(report.contracts).map((contract: InsuranceContract, index: number) => (
                  <tr key={index}>
                    <td className="contracts-table__cell--number">{index + 1}</td>
                    <td className="contracts-table__cell--company">{contract.insurance_company}</td>
                    <td className="contracts-table__cell--contract-number">{contract.contract_number}</td>
                    <td className="contracts-table__cell--product">{contract.product_name}</td>
                    <td className="contracts-table__cell--contractor">{contract.contractor_name || '-'}</td>
                    <td className="contracts-table__cell--insured">{contract.insured_name || '-'}</td>
                    <td className="contracts-table__cell--date">{contract.contract_date}</td>
                    <td className="contracts-table__cell--status">
                      <span className={`status-badge ${getStatusBadgeClass(contract.status)}`}>
                        {contract.status || '-'}
                      </span>
                    </td>
                    <td className="contracts-table__cell--coverage">
                      {(contract.coverage_amount / 10000).toLocaleString('ko-KR')}
                    </td>
                    <td className="contracts-table__cell--period">{contract.insurance_period || '-'}</td>
                    <td className="contracts-table__cell--payment">{contract.premium_payment_period || '-'}</td>
                    <td className="contracts-table__cell--premium contracts-table__cell--premium-highlight">
                      {contract.monthly_premium.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Info */}
        <div className="annual-report-page__footer">
          <span className="annual-report-page__footer-text">
            생성일: {formatDateTime(report.created_at)}
          </span>
        </div>
      </main>
    </div>
  )
}

export default AnnualReportPage

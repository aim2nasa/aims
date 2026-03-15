/**
 * Customer Review 팝업 윈도우 전용 페이지
 * @since 2026-02-07
 *
 * window.open()으로 열리는 독립 팝업 창에서 Customer Review를 볼 수 있게 함
 * AnnualReportPage.tsx와 동일한 패턴
 */

import React, { useState, useEffect, useCallback } from 'react'
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../components/SFSymbol'
import Tooltip from '../shared/ui/Tooltip'
import { CustomerReviewApi, type CustomerReview } from '../features/customer/api/customerReviewApi'
import { formatDateTime, formatDate } from '@/shared/lib/timeUtils'
import '../features/customer/components/CustomerReviewModal/CustomerReviewModal.layout.css'
import '../features/customer/components/CustomerReviewModal/CustomerReviewModal.compact.css'
import '../features/customer/components/CustomerReviewModal/CustomerReviewModal.mobile.css'
import './CustomerReviewPage.css'
import './CustomerReviewPage.mobile.css'

// 상품명에서 "발행" 이후 텍스트 제거
const extractProductName = (productName: string | undefined): string => {
  if (!productName) return '상품명 없음'
  const idx = productName.indexOf('발행')
  if (idx > 0) {
    return productName.substring(0, idx).trim()
  }
  return productName.trim()
}

// 기본/추가 값 표시 헬퍼
const formatDualValue = (
  basicValue: number | undefined | null,
  additionalValue: number | undefined | null,
  formatter: (v: number | undefined | null) => string
): { basic: string; additional: string | null; hasAdditional: boolean } => {
  const basic = formatter(basicValue)
  const hasAdditional = additionalValue !== undefined && additionalValue !== null && additionalValue !== 0
  return {
    basic,
    additional: hasAdditional ? formatter(additionalValue) : null,
    hasAdditional,
  }
}

// 펀드에 추가납입 데이터가 있는지 확인
const hasAnyAdditionalData = (funds: CustomerReview['fund_allocations']): boolean => {
  if (!funds) return false
  return funds.some(f =>
    (f.additional_accumulated && f.additional_accumulated > 0) ||
    (f.additional_return_rate !== undefined && f.additional_return_rate !== null && f.additional_return_rate !== 0) ||
    (f.additional_invested_principal && f.additional_invested_principal > 0)
  )
}

const CustomerReviewPage: React.FC = () => {
  const [review, setReview] = useState<CustomerReview | null>(null)

  // 컴포넌트 마운트 시 localStorage에서 데이터 로드
  useEffect(() => {
    console.log('[CustomerReviewPage] 팝업 페이지 로드')

    // 테마 적용
    const savedTheme = localStorage.getItem('aims-theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', savedTheme)
    }

    // localStorage에서 CR 데이터 읽기
    const storedData = localStorage.getItem('aims-cr-popup-data')
    if (storedData) {
      try {
        const data = JSON.parse(storedData)
        setReview(data.review)
        console.log('[CustomerReviewPage] CR 데이터 로드 완료')

        localStorage.setItem('aims-cr-popup-open', 'true')
      } catch (error) {
        console.error('[CustomerReviewPage] CR 데이터 파싱 실패:', error)
      }
    }

    // 팝업 준비 완료 알림
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'AIMS_CR_POPUP_READY' }, window.location.origin)
    }

    return () => {
      localStorage.removeItem('aims-cr-popup-open')
    }
  }, [])

  // 창 닫힐 때 localStorage 정리
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem('aims-cr-popup-open')
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // 브라우저 내로 이동 (팝업 → 메인 창)
  const handleMoveToMainWindow = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      localStorage.removeItem('aims-cr-popup-open')
      window.opener.postMessage({
        type: 'AIMS_CR_OPEN_IN_MAIN',
        review: JSON.stringify(review),
      }, window.location.origin)
      window.close()
    }
  }, [review])

  // 데이터 없음 상태
  if (!review) {
    return (
      <div className="customer-review-page">
        <div className="customer-review-page__empty">
          <SFSymbol
            name="doc.text.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>Customer Review 데이터가 없습니다.</span>
        </div>
      </div>
    )
  }

  const { contract_info, premium_info, fund_allocations } = review
  const cleanProductName = extractProductName(review.product_name)
  const showAdditional = hasAnyAdditionalData(fund_allocations)

  return (
    <div className="customer-review-page">
      {/* 헤더 */}
      <header className="customer-review-page__header">
        <div className="customer-review-page__header-title">
          <SFSymbol
            name="doc.text.magnifyingglass"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.REGULAR}
          />
          <div>
            <h1>{review.contractor_name || '고객'}님의 Customer Review Service</h1>
            <p>
              {review.issue_date ? `발행일: ${formatDate(review.issue_date)}` : '정보 없음'}
            </p>
          </div>
        </div>
        <div className="customer-review-page__header-actions">
          {window.opener && !window.opener.closed && (
            <Tooltip content="브라우저 내로 이동">
              <button
                className="customer-review-page__action-button"
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
          <Tooltip content="창 닫기">
            <button
              className="customer-review-page__action-button customer-review-page__close-button"
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
      <main className="customer-review-page__content">
        {/* 상품명 */}
        <div className="crm-product-name crm-product-name--centered">
          {cleanProductName}
        </div>

        {/* 인적사항 */}
        <div className="crm-persons-inline">
          <span><b>계약자</b> {review.contractor_name || '-'}</span>
          <span><b>피보험자</b> {review.insured_name || '-'}</span>
          <span><b>사망수익자</b> {review.death_beneficiary || '-'}</span>
          <span><b>FSR</b> {review.fsr_name || '-'}</span>
        </div>

        {/* 3컬럼 레이아웃 */}
        <div className="crm-three-columns">
          {/* 계약사항 */}
          <section className="crm-card crm-card--compact">
            <h2 className="crm-card__title">계약사항</h2>
            <div className="crm-list crm-list--compact">
              <div className="crm-list__item">
                <span>증권번호</span>
                <span>{contract_info?.policy_number || '-'}</span>
              </div>
              <div className="crm-list__item">
                <span>계약일자</span>
                <span>{contract_info?.contract_date ? formatDate(contract_info.contract_date) : '-'}</span>
              </div>
              <div className="crm-list__item">
                <span>보험가입금액</span>
                <span>{CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}</span>
              </div>
              <div className="crm-list__item">
                <span>적립금</span>
                <span className="crm-value--primary">{CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}</span>
              </div>
              <div className="crm-list__item">
                <span>투자수익률</span>
                <span className={(contract_info?.investment_return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}>
                  {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
                </span>
              </div>
              <div className="crm-list__item">
                <span>해지환급금</span>
                <span>{CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}</span>
              </div>
              <div className="crm-list__item">
                <span>해지환급율</span>
                <span>{CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}</span>
              </div>
              {(contract_info?.initial_premium ?? 0) > 0 && (
                <div className="crm-list__item">
                  <span>초회 납입 보험료</span>
                  <span>{CustomerReviewApi.formatCurrency(contract_info.initial_premium)}</span>
                </div>
              )}
              {(contract_info?.accumulation_rate ?? 0) > 0 && (
                <div className="crm-list__item crm-list__item--highlight">
                  <span>적립금비율</span>
                  <span>{CustomerReviewApi.formatPercent(contract_info.accumulation_rate)}</span>
                </div>
              )}
            </div>
          </section>

          {/* 보험료 납입현황 */}
          <section className="crm-card crm-card--compact">
            <h2 className="crm-card__title">보험료 납입현황</h2>
            <div className="crm-list crm-list--compact">
              <div className="crm-list__item">
                <span>기본 보험료(A)</span>
                <span>{CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}</span>
              </div>
              <div className="crm-list__item">
                <span>수시추가납(B)</span>
                <span>{CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}</span>
              </div>
              <div className="crm-list__item">
                <span>정기추가납(C)</span>
                <span>{CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}</span>
              </div>
              <div className="crm-list__item">
                <span>중도출금(D)</span>
                <span className="crm-value--error">{CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}</span>
              </div>
              <div className="crm-list__item crm-list__item--highlight">
                <span>계(A+B+C-D)</span>
                <span>{CustomerReviewApi.formatCurrency(premium_info?.net_premium)}</span>
              </div>
              <div className="crm-list__item">
                <span>약관대출</span>
                <span>{CustomerReviewApi.formatCurrency(premium_info?.policy_loan)}</span>
              </div>
            </div>
          </section>

          {/* 펀드 구성 현황 */}
          <section className="crm-card crm-card--compact">
            <div className="crm-card__header">
              <h2 className="crm-card__title">펀드 구성 현황</h2>
              <span className="crm-card__badge">{review.fund_count || fund_allocations?.length || 0}개</span>
            </div>
            {fund_allocations && fund_allocations.length > 0 ? (
              <div className={`crm-table crm-table--compact ${showAdditional ? 'crm-table--dual' : ''}`}>
                <div className="crm-table__head">
                  <div className="crm-table__cell crm-table__cell--name">펀드명</div>
                  <div className="crm-table__cell">적립금</div>
                  <div className="crm-table__cell">{showAdditional ? '구성비율' : '구성비'}</div>
                  <div className="crm-table__cell">수익률</div>
                  <div className="crm-table__cell">투입원금</div>
                </div>
                <div className="crm-table__body">
                  {fund_allocations.map((fund, index) => {
                    if (showAdditional) {
                      const accum = formatDualValue(fund.basic_accumulated, fund.additional_accumulated, CustomerReviewApi.formatCurrency)
                      const ratio = formatDualValue(fund.allocation_ratio, fund.additional_allocation_ratio, CustomerReviewApi.formatPercent)
                      const returnRate = formatDualValue(fund.return_rate, fund.additional_return_rate, CustomerReviewApi.formatPercent)
                      const principal = formatDualValue(fund.invested_principal, fund.additional_invested_principal, CustomerReviewApi.formatCurrency)

                      return (
                        <div key={index} className="crm-table__row">
                          <div className="crm-table__cell crm-table__cell--name">{fund.fund_name || '-'}</div>
                          <div className="crm-table__cell crm-table__cell--dual">
                            <span className="crm-dual-value__basic"><span className="crm-dual-value__label">기본납입</span><span className="crm-dual-value__amount">{accum.basic}</span></span>
                            {accum.hasAdditional && <span className="crm-dual-value__additional"><span className="crm-dual-value__label">추가납입</span><span className="crm-dual-value__amount">{accum.additional}</span></span>}
                          </div>
                          <div className="crm-table__cell crm-table__cell--dual">
                            <span className="crm-dual-value__basic"><span className="crm-dual-value__label">기본납입</span><span className="crm-dual-value__amount">{ratio.basic}</span></span>
                            {ratio.hasAdditional && <span className="crm-dual-value__additional"><span className="crm-dual-value__label">추가납입</span><span className="crm-dual-value__amount">{ratio.additional}</span></span>}
                          </div>
                          <div className="crm-table__cell crm-table__cell--dual">
                            <span className={`crm-dual-value__basic ${(fund.return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}`}>
                              <span className="crm-dual-value__label">기본납입</span><span className="crm-dual-value__amount">{returnRate.basic}</span>
                            </span>
                            {returnRate.hasAdditional && (
                              <span className={`crm-dual-value__additional ${(fund.additional_return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}`}>
                                <span className="crm-dual-value__label">추가납입</span><span className="crm-dual-value__amount">{returnRate.additional}</span>
                              </span>
                            )}
                          </div>
                          <div className="crm-table__cell crm-table__cell--dual">
                            <span className="crm-dual-value__basic"><span className="crm-dual-value__label">기본납입</span><span className="crm-dual-value__amount">{principal.basic}</span></span>
                            {principal.hasAdditional && <span className="crm-dual-value__additional"><span className="crm-dual-value__label">추가납입</span><span className="crm-dual-value__amount">{principal.additional}</span></span>}
                          </div>
                        </div>
                      )
                    } else {
                      return (
                        <div key={index} className="crm-table__row">
                          <div className="crm-table__cell crm-table__cell--name">{fund.fund_name || '-'}</div>
                          <div className="crm-table__cell">{CustomerReviewApi.formatCurrency(fund.basic_accumulated)}</div>
                          <div className="crm-table__cell">{CustomerReviewApi.formatPercent(fund.allocation_ratio)}</div>
                          <div className={`crm-table__cell ${(fund.return_rate || 0) >= 0 ? 'crm-table__cell--success' : 'crm-table__cell--error'}`}>
                            {CustomerReviewApi.formatPercent(fund.return_rate)}
                          </div>
                          <div className="crm-table__cell">{CustomerReviewApi.formatCurrency(fund.invested_principal)}</div>
                        </div>
                      )
                    }
                  })}
                </div>
                <div className="crm-table__foot">
                  <div className="crm-table__cell crm-table__cell--name">합계</div>
                  <div className="crm-table__cell crm-table__cell--primary">{CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}</div>
                  <div className="crm-table__cell">-</div>
                  <div className="crm-table__cell">-</div>
                  <div className="crm-table__cell">-</div>
                </div>
              </div>
            ) : (
              <div className="crm-empty-small">펀드 정보 없음</div>
            )}
          </section>
        </div>

        {/* Footer Info */}
        {review.parsed_at && (
          <div className="customer-review-page__footer">
            <span className="customer-review-page__footer-text">
              파싱일시: {formatDateTime(review.parsed_at)}
            </span>
          </div>
        )}
      </main>
    </div>
  )
}

export default CustomerReviewPage

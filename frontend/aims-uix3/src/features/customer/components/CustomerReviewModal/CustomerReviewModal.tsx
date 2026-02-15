/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 4.0.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - Annual Report와 동일한 레이아웃 형식 적용
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation';
import DraggableModal from '@/shared/ui/DraggableModal';
import Button from '@/shared/ui/Button';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import { CustomerReviewApi, type CustomerReview } from '../../api/customerReviewApi';
import { formatDate, formatDateTime } from '@/shared/lib/timeUtils';
import './CustomerReviewModal.css';

interface CustomerReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: CustomerReview | null;
}

// 상품명에서 "발행" 이후 텍스트 제거
const extractProductName = (productName: string | undefined): string => {
  if (!productName) return '상품명 없음';
  // "발행" 이전까지만 추출
  const idx = productName.indexOf('발행');
  if (idx > 0) {
    return productName.substring(0, idx).trim();
  }
  return productName.trim();
};

// 기본/추가 값 표시 헬퍼 (추가납입이 있을 경우 "기본 / 추가" 형식)
const formatDualValue = (
  basicValue: number | undefined | null,
  additionalValue: number | undefined | null,
  formatter: (v: number | undefined | null) => string
): { basic: string; additional: string | null; hasAdditional: boolean } => {
  const basic = formatter(basicValue);
  const hasAdditional = additionalValue !== undefined && additionalValue !== null && additionalValue !== 0;
  return {
    basic,
    additional: hasAdditional ? formatter(additionalValue) : null,
    hasAdditional,
  };
};

// 펀드에 추가납입 데이터가 있는지 확인
const hasAnyAdditionalData = (funds: CustomerReview['fund_allocations']): boolean => {
  if (!funds) return false;
  return funds.some(f =>
    (f.additional_accumulated && f.additional_accumulated > 0) ||
    (f.additional_return_rate !== undefined && f.additional_return_rate !== null && f.additional_return_rate !== 0) ||
    (f.additional_invested_principal && f.additional_invested_principal > 0)
  );
};

export const CustomerReviewModal: React.FC<CustomerReviewModalProps> = ({
  isOpen,
  onClose,
  review
}) => {
  // 모바일 감지: useDeviceOrientation 훅으로 폰 가로 모드도 대응
  const { isMobileLayout: isMobileView } = useDeviceOrientation();

  /**
   * 새 창에서 열기 핸들러
   * 새 창을 열고 브라우저 내 모달은 닫음
   */
  const handleOpenPopup = useCallback(() => {
    localStorage.setItem('aims-cr-popup-data', JSON.stringify({
      review,
    }));

    const width = 1200;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    window.open(
      '/customer-review',
      'aims-cr-popup',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    // 브라우저 내 모달 닫기
    onClose();
  }, [review, onClose]);

  if (!isOpen || !review) return null;

  const { contract_info, premium_info, fund_allocations } = review;
  const isParsed = contract_info?.policy_number || (fund_allocations && fund_allocations.length > 0);
  const cleanProductName = extractProductName(review.product_name);

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title={
        <div className="customer-document-preview__title">
          <SFSymbol
            name="doc.text.magnifyingglass"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.REGULAR}
          />
          <div>
            <h2>{review.contractor_name || '고객'}님의 Customer Review Service</h2>
            <p>
              {review.issue_date ? `발행일: ${formatDate(review.issue_date)}` : '정보 없음'}
            </p>
          </div>
        </div>
      }
      onOpenPopup={handleOpenPopup}
      initialWidth={1350}
      initialHeight={640}
      minWidth={1100}
      minHeight={500}
      footer={
        <div className="fulltext-modal-footer">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            className="fulltext-modal-button"
          >
            닫기
          </Button>
        </div>
      }
      className="customer-document-preview"
    >
      <main className="customer-document-preview__content">
        {!isParsed ? (
          <div className="crm-empty">
            <div className="crm-empty__icon">📄</div>
            <h3 className="crm-empty__title">파싱 대기 중</h3>
            <p className="crm-empty__desc">문서 파싱이 아직 완료되지 않았습니다.</p>
          </div>
        ) : isMobileView ? (
          <>
            {/* 모바일: 세로 스택 레이아웃 */}
            <div className="crm-mobile__product">{cleanProductName}</div>

            {/* 인적사항 - 2x2 그리드 */}
            <div className="crm-mobile__persons">
              <div className="crm-mobile__person">
                <span className="crm-mobile__person-label">계약자</span>
                <span className="crm-mobile__person-value">{review.contractor_name || '-'}</span>
              </div>
              <div className="crm-mobile__person">
                <span className="crm-mobile__person-label">피보험자</span>
                <span className="crm-mobile__person-value">{review.insured_name || '-'}</span>
              </div>
              <div className="crm-mobile__person">
                <span className="crm-mobile__person-label">사망수익자</span>
                <span className="crm-mobile__person-value">{review.death_beneficiary || '-'}</span>
              </div>
              <div className="crm-mobile__person">
                <span className="crm-mobile__person-label">FSR</span>
                <span className="crm-mobile__person-value">{review.fsr_name || '-'}</span>
              </div>
            </div>

            {/* 계약사항 */}
            <section className="crm-mobile__section">
              <h3 className="crm-mobile__section-title">계약사항</h3>
              <div className="crm-mobile__list">
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">증권번호</span>
                  <span className="crm-mobile__item-value">{contract_info?.policy_number || '-'}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">계약일자</span>
                  <span className="crm-mobile__item-value">{contract_info?.contract_date ? formatDate(contract_info.contract_date) : '-'}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">보험가입금액</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">적립금</span>
                  <span className="crm-mobile__item-value crm-value--primary">{CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">투자수익률</span>
                  <span className={`crm-mobile__item-value ${(contract_info?.investment_return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}`}>
                    {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
                  </span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">해지환급금</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">해지환급율</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}</span>
                </div>
                {(contract_info?.initial_premium ?? 0) > 0 && (
                  <div className="crm-mobile__item">
                    <span className="crm-mobile__item-label">초회 납입 보험료</span>
                    <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(contract_info.initial_premium)}</span>
                  </div>
                )}
                {(contract_info?.accumulation_rate ?? 0) > 0 && (
                  <div className="crm-mobile__item crm-mobile__item--highlight">
                    <span className="crm-mobile__item-label">적립금비율</span>
                    <span className="crm-mobile__item-value">{CustomerReviewApi.formatPercent(contract_info.accumulation_rate)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* 보험료 납입현황 */}
            <section className="crm-mobile__section">
              <h3 className="crm-mobile__section-title">보험료 납입현황</h3>
              <div className="crm-mobile__list">
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">기본 보험료(A)</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">수시추가납(B)</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">정기추가납(C)</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">중도출금(D)</span>
                  <span className="crm-mobile__item-value crm-value--error">{CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}</span>
                </div>
                <div className="crm-mobile__item crm-mobile__item--highlight">
                  <span className="crm-mobile__item-label">계(A+B+C-D)</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(premium_info?.net_premium)}</span>
                </div>
                <div className="crm-mobile__item">
                  <span className="crm-mobile__item-label">약관대출</span>
                  <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(premium_info?.policy_loan)}</span>
                </div>
              </div>
            </section>

            {/* 펀드 구성 현황 - 카드형 */}
            <section className="crm-mobile__section">
              <div className="crm-mobile__section-header">
                <h3 className="crm-mobile__section-title">펀드 구성 현황</h3>
                <span className="crm-mobile__badge">{review.fund_count || fund_allocations?.length || 0}개</span>
              </div>
              {fund_allocations && fund_allocations.length > 0 ? (
                <>
                  {fund_allocations.map((fund, index) => (
                    <div className="crm-mobile__fund-card" key={index}>
                      <div className="crm-mobile__fund-name">{fund.fund_name || '-'}</div>
                      <div className="crm-mobile__fund-body">
                        <div className="crm-mobile__item">
                          <span className="crm-mobile__item-label">적립금</span>
                          <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(fund.basic_accumulated)}</span>
                        </div>
                        <div className="crm-mobile__item">
                          <span className="crm-mobile__item-label">구성비</span>
                          <span className="crm-mobile__item-value">{CustomerReviewApi.formatPercent(fund.allocation_ratio)}</span>
                        </div>
                        <div className="crm-mobile__item">
                          <span className="crm-mobile__item-label">수익률</span>
                          <span className={`crm-mobile__item-value ${(fund.return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}`}>
                            {CustomerReviewApi.formatPercent(fund.return_rate)}
                          </span>
                        </div>
                        <div className="crm-mobile__item">
                          <span className="crm-mobile__item-label">투입원금</span>
                          <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(fund.invested_principal)}</span>
                        </div>
                        {hasAnyAdditionalData([fund]) && (
                          <>
                            <div className="crm-mobile__fund-divider">추가납입</div>
                            <div className="crm-mobile__item">
                              <span className="crm-mobile__item-label">적립금</span>
                              <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(fund.additional_accumulated)}</span>
                            </div>
                            <div className="crm-mobile__item">
                              <span className="crm-mobile__item-label">수익률</span>
                              <span className={`crm-mobile__item-value ${(fund.additional_return_rate || 0) >= 0 ? 'crm-value--success' : 'crm-value--error'}`}>
                                {CustomerReviewApi.formatPercent(fund.additional_return_rate)}
                              </span>
                            </div>
                            <div className="crm-mobile__item">
                              <span className="crm-mobile__item-label">투입원금</span>
                              <span className="crm-mobile__item-value">{CustomerReviewApi.formatCurrency(fund.additional_invested_principal)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="crm-mobile__fund-total">
                    <span className="crm-mobile__fund-total-label">합계 적립금</span>
                    <span className="crm-mobile__fund-total-value">{CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}</span>
                  </div>
                </>
              ) : (
                <div className="crm-mobile__empty">펀드 정보 없음</div>
              )}
            </section>

            {/* Footer */}
            {review.parsed_at && (
              <div className="annual-report-modal__footer">
                <span className="annual-report-modal__footer-text">
                  파싱일시: {formatDateTime(review.parsed_at)}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* 데스크탑: 기존 레이아웃 */}
            {/* 상품명 (중앙 정렬) */}
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

            {/* 3컬럼 레이아웃: 계약사항 + 보험료 납입현황 + 펀드 구성 현황 */}
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
                  (() => {
                    const showAdditional = hasAnyAdditionalData(fund_allocations);
                    return (
                      <div className={`crm-table crm-table--compact ${showAdditional ? 'crm-table--dual' : ''}`}>
                        <div className="crm-table__head">
                          <div className="crm-table__cell crm-table__cell--name">펀드명</div>
                          {showAdditional ? (
                            <>
                              <div className="crm-table__cell">적립금</div>
                              <div className="crm-table__cell">구성비율</div>
                              <div className="crm-table__cell">수익률</div>
                              <div className="crm-table__cell">투입원금</div>
                            </>
                          ) : (
                            <>
                              <div className="crm-table__cell">적립금</div>
                              <div className="crm-table__cell">구성비</div>
                              <div className="crm-table__cell">수익률</div>
                              <div className="crm-table__cell">투입원금</div>
                            </>
                          )}
                        </div>
                        <div className="crm-table__body">
                          {fund_allocations.map((fund, index) => {
                            if (showAdditional) {
                              // 추가납입 모드: 기본/추가 값을 함께 표시
                              const accum = formatDualValue(fund.basic_accumulated, fund.additional_accumulated, CustomerReviewApi.formatCurrency);
                              const ratio = formatDualValue(fund.allocation_ratio, fund.additional_allocation_ratio, CustomerReviewApi.formatPercent);
                              const returnRate = formatDualValue(fund.return_rate, fund.additional_return_rate, CustomerReviewApi.formatPercent);
                              const principal = formatDualValue(fund.invested_principal, fund.additional_invested_principal, CustomerReviewApi.formatCurrency);

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
                              );
                            } else {
                              // 기본 모드: 기존 형식 유지
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
                              );
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
                    );
                  })()
                ) : (
                  <div className="crm-empty-small">펀드 정보 없음</div>
                )}
              </section>
            </div>

            {/* Footer Info */}
            {review.parsed_at && (
              <div className="annual-report-modal__footer">
                <span className="annual-report-modal__footer-text">
                  파싱일시: {formatDateTime(review.parsed_at)}
                </span>
              </div>
            )}
          </>
        )}
      </main>
    </DraggableModal>
  );
};

export default CustomerReviewModal;

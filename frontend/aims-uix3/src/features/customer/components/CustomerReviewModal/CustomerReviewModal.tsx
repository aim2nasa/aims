/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 2.0.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - 원본 PDF 스타일 기반 시각적 레이아웃
 */

import React from 'react';
import DraggableModal from '@/shared/ui/DraggableModal';
import { CustomerReviewApi, type CustomerReview } from '../../api/customerReviewApi';
import './CustomerReviewModal.css';

interface CustomerReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  review: CustomerReview | null;
}

export const CustomerReviewModal: React.FC<CustomerReviewModalProps> = ({
  isOpen,
  onClose,
  review
}) => {
  if (!isOpen || !review) return null;

  const { contract_info, premium_info, fund_allocations } = review;
  const isParsed = contract_info?.policy_number || (fund_allocations && fund_allocations.length > 0);

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title="Customer Review Service"
      className="customer-review-modal"
      initialWidth={800}
      initialHeight={700}
    >
      <div className="crm">
        {/* 히어로 헤더 */}
        <header className="crm-hero">
          <div className="crm-hero__customer">
            <span className="crm-hero__name">{review.contractor_name || '고객'}</span>
            <span className="crm-hero__suffix">고객님을 위한</span>
          </div>
          <h1 className="crm-hero__title">Customer Review Service</h1>
        </header>

        {/* 상품 정보 배너 */}
        <div className="crm-product-banner">
          <div className="crm-product-banner__name">{review.product_name || '상품명 없음'}</div>
          <div className="crm-product-banner__date">
            발행(기준)일: {review.issue_date ? CustomerReviewApi.formatDate(review.issue_date) : '-'}
          </div>
        </div>

        {/* 계약자 정보 카드 */}
        <div className="crm-person-cards">
          <div className="crm-person-card">
            <span className="crm-person-card__label">계약자</span>
            <span className="crm-person-card__value">{review.contractor_name || '-'}</span>
          </div>
          <div className="crm-person-card">
            <span className="crm-person-card__label">피보험자</span>
            <span className="crm-person-card__value">{review.insured_name || '-'}</span>
          </div>
          <div className="crm-person-card">
            <span className="crm-person-card__label">사망 수익자</span>
            <span className="crm-person-card__value">{review.death_beneficiary || '-'}</span>
          </div>
        </div>

        {!isParsed ? (
          <div className="crm-empty-state">
            <div className="crm-empty-state__icon">📄</div>
            <h3 className="crm-empty-state__title">파싱 대기 중</h3>
            <p className="crm-empty-state__desc">
              문서 파싱이 아직 완료되지 않았습니다.<br />
              잠시 후 새로고침해 주세요.
            </p>
          </div>
        ) : (
          <>
            {/* 계약 정보 섹션 */}
            <section className="crm-section">
              <h2 className="crm-section__title">
                <span className="crm-section__bar"></span>
                계약사항
              </h2>
              <div className="crm-contract-grid">
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">증권번호</span>
                  <span className="crm-contract-item__value">{contract_info?.policy_number || '-'}</span>
                </div>
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">계약일자</span>
                  <span className="crm-contract-item__value">
                    {contract_info?.contract_date ? CustomerReviewApi.formatDate(contract_info.contract_date) : '-'}
                  </span>
                </div>
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">보험가입금액</span>
                  <span className="crm-contract-item__value">{CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}</span>
                </div>
                <div className="crm-contract-item crm-contract-item--highlight">
                  <span className="crm-contract-item__label">적립금</span>
                  <span className="crm-contract-item__value crm-contract-item__value--accent">
                    {CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}
                  </span>
                </div>
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">투자수익률</span>
                  <span className={`crm-contract-item__value ${(contract_info?.investment_return_rate || 0) >= 0 ? 'crm-contract-item__value--positive' : 'crm-contract-item__value--negative'}`}>
                    {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
                  </span>
                </div>
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">해지환급금(세전)</span>
                  <span className="crm-contract-item__value">{CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}</span>
                </div>
                <div className="crm-contract-item">
                  <span className="crm-contract-item__label">해지환급율</span>
                  <span className="crm-contract-item__value">{CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}</span>
                </div>
              </div>
            </section>

            {/* 보험료 납입현황 섹션 */}
            <section className="crm-section">
              <h2 className="crm-section__title">
                <span className="crm-section__bar"></span>
                보험료 납입현황
              </h2>
              <div className="crm-premium-table">
                <div className="crm-premium-table__header">
                  <div></div>
                  <div>항목</div>
                  <div className="text-right">금액</div>
                </div>
                <div className="crm-premium-table__body">
                  <div className="crm-premium-row">
                    <div className="crm-premium-row__category">납입원금</div>
                    <div className="crm-premium-row__label">기본 보험료(A)</div>
                    <div className="crm-premium-row__value">{CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}</div>
                  </div>
                  <div className="crm-premium-row">
                    <div className="crm-premium-row__category"></div>
                    <div className="crm-premium-row__label">수시추가납 보험료(B)</div>
                    <div className="crm-premium-row__value">{CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}</div>
                  </div>
                  <div className="crm-premium-row">
                    <div className="crm-premium-row__category"></div>
                    <div className="crm-premium-row__label">정기추가납 보험료(C)</div>
                    <div className="crm-premium-row__value">{CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}</div>
                  </div>
                  <div className="crm-premium-row">
                    <div className="crm-premium-row__category"></div>
                    <div className="crm-premium-row__label">중도출금(D)</div>
                    <div className="crm-premium-row__value crm-premium-row__value--negative">
                      {CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}
                    </div>
                  </div>
                  <div className="crm-premium-row crm-premium-row--total">
                    <div className="crm-premium-row__category"></div>
                    <div className="crm-premium-row__label">계(A+B+C-D)</div>
                    <div className="crm-premium-row__value crm-premium-row__value--highlight">
                      {CustomerReviewApi.formatCurrency(premium_info?.net_premium)}
                    </div>
                  </div>
                  <div className="crm-premium-row">
                    <div className="crm-premium-row__category"></div>
                    <div className="crm-premium-row__label">약관대출</div>
                    <div className="crm-premium-row__value">{CustomerReviewApi.formatCurrency(premium_info?.policy_loan)}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* 펀드 구성 현황 섹션 */}
            {fund_allocations && fund_allocations.length > 0 && (
              <section className="crm-section">
                <h2 className="crm-section__title">
                  <span className="crm-section__bar"></span>
                  펀드 구성 현황
                  <span className="crm-section__badge">{review.fund_count || fund_allocations.length}개</span>
                </h2>
                <div className="crm-fund-table">
                  <div className="crm-fund-table__header">
                    <div className="col-name">펀드명</div>
                    <div className="col-amount">적립금</div>
                    <div className="col-ratio">구성비율</div>
                    <div className="col-return">수익률</div>
                    <div className="col-principal">투입원금</div>
                  </div>
                  <div className="crm-fund-table__body">
                    {fund_allocations.map((fund, index) => (
                      <div key={index} className="crm-fund-row">
                        <div className="col-name">{fund.fund_name || '-'}</div>
                        <div className="col-amount">{CustomerReviewApi.formatCurrency(fund.basic_accumulated)}</div>
                        <div className="col-ratio">{CustomerReviewApi.formatPercent(fund.allocation_ratio)}</div>
                        <div className={`col-return ${(fund.return_rate || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {CustomerReviewApi.formatPercent(fund.return_rate)}
                        </div>
                        <div className="col-principal">{CustomerReviewApi.formatCurrency(fund.invested_principal)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="crm-fund-table__footer">
                    <div className="col-name">합계</div>
                    <div className="col-amount highlight">{CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}</div>
                    <div className="col-ratio">-</div>
                    <div className="col-return">-</div>
                    <div className="col-principal">-</div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* 푸터 */}
        {review.parsed_at && (
          <footer className="crm-footer">
            <span className="crm-footer__text">
              파싱일시: {CustomerReviewApi.formatDateTime(review.parsed_at)}
            </span>
          </footer>
        )}
      </div>
    </DraggableModal>
  );
};

export default CustomerReviewModal;

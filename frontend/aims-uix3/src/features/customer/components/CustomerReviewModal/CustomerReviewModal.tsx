/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 3.0.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - 모던하고 깔끔한 Apple 스타일 디자인
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
      initialWidth={720}
      initialHeight={680}
    >
      <div className="crm">
        {/* 히어로 헤더 */}
        <header className="crm-hero">
          <div className="crm-hero__badge">Customer Review Service</div>
          <h1 className="crm-hero__name">{review.contractor_name || '고객'}<span>님</span></h1>
          <p className="crm-hero__product">{review.product_name || '상품명 없음'}</p>
          <div className="crm-hero__date">
            {review.issue_date ? CustomerReviewApi.formatDate(review.issue_date) : '-'}
          </div>
        </header>

        {/* 계약자 정보 */}
        <div className="crm-info-row">
          <div className="crm-info-item">
            <span className="crm-info-item__label">계약자</span>
            <span className="crm-info-item__value">{review.contractor_name || '-'}</span>
          </div>
          <div className="crm-info-item">
            <span className="crm-info-item__label">피보험자</span>
            <span className="crm-info-item__value">{review.insured_name || '-'}</span>
          </div>
          <div className="crm-info-item">
            <span className="crm-info-item__label">사망수익자</span>
            <span className="crm-info-item__value">{review.death_beneficiary || '-'}</span>
          </div>
        </div>

        {!isParsed ? (
          <div className="crm-empty">
            <div className="crm-empty__icon">📄</div>
            <h3 className="crm-empty__title">파싱 대기 중</h3>
            <p className="crm-empty__desc">문서 파싱이 아직 완료되지 않았습니다.</p>
          </div>
        ) : (
          <>
            {/* 계약사항 */}
            <section className="crm-card">
              <h2 className="crm-card__title">계약사항</h2>
              <div className="crm-stats">
                <div className="crm-stat">
                  <span className="crm-stat__label">증권번호</span>
                  <span className="crm-stat__value">{contract_info?.policy_number || '-'}</span>
                </div>
                <div className="crm-stat">
                  <span className="crm-stat__label">계약일자</span>
                  <span className="crm-stat__value">
                    {contract_info?.contract_date ? CustomerReviewApi.formatDate(contract_info.contract_date) : '-'}
                  </span>
                </div>
                <div className="crm-stat">
                  <span className="crm-stat__label">보험가입금액</span>
                  <span className="crm-stat__value">{CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}</span>
                </div>
                <div className="crm-stat crm-stat--primary">
                  <span className="crm-stat__label">적립금</span>
                  <span className="crm-stat__value">{CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}</span>
                </div>
                <div className="crm-stat">
                  <span className="crm-stat__label">투자수익률</span>
                  <span className={`crm-stat__value ${(contract_info?.investment_return_rate || 0) >= 0 ? 'crm-stat__value--success' : 'crm-stat__value--error'}`}>
                    {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
                  </span>
                </div>
                <div className="crm-stat">
                  <span className="crm-stat__label">해지환급금</span>
                  <span className="crm-stat__value">{CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}</span>
                </div>
                <div className="crm-stat">
                  <span className="crm-stat__label">해지환급율</span>
                  <span className="crm-stat__value">{CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}</span>
                </div>
              </div>
            </section>

            {/* 보험료 납입현황 */}
            <section className="crm-card">
              <h2 className="crm-card__title">보험료 납입현황</h2>
              <div className="crm-list">
                <div className="crm-list__item">
                  <span>기본 보험료(A)</span>
                  <span>{CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}</span>
                </div>
                <div className="crm-list__item">
                  <span>수시추가납 보험료(B)</span>
                  <span>{CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}</span>
                </div>
                <div className="crm-list__item">
                  <span>정기추가납 보험료(C)</span>
                  <span>{CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}</span>
                </div>
                <div className="crm-list__item crm-list__item--negative">
                  <span>중도출금(D)</span>
                  <span>{CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}</span>
                </div>
                <div className="crm-list__item crm-list__item--total">
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
            {fund_allocations && fund_allocations.length > 0 && (
              <section className="crm-card">
                <div className="crm-card__header">
                  <h2 className="crm-card__title">펀드 구성 현황</h2>
                  <span className="crm-card__badge">{review.fund_count || fund_allocations.length}개</span>
                </div>
                <div className="crm-table">
                  <div className="crm-table__head">
                    <div className="crm-table__cell crm-table__cell--name">펀드명</div>
                    <div className="crm-table__cell">적립금</div>
                    <div className="crm-table__cell">구성비</div>
                    <div className="crm-table__cell">수익률</div>
                    <div className="crm-table__cell">투입원금</div>
                  </div>
                  <div className="crm-table__body">
                    {fund_allocations.map((fund, index) => (
                      <div key={index} className="crm-table__row">
                        <div className="crm-table__cell crm-table__cell--name">{fund.fund_name || '-'}</div>
                        <div className="crm-table__cell">{CustomerReviewApi.formatCurrency(fund.basic_accumulated)}</div>
                        <div className="crm-table__cell">{CustomerReviewApi.formatPercent(fund.allocation_ratio)}</div>
                        <div className={`crm-table__cell ${(fund.return_rate || 0) >= 0 ? 'crm-table__cell--success' : 'crm-table__cell--error'}`}>
                          {CustomerReviewApi.formatPercent(fund.return_rate)}
                        </div>
                        <div className="crm-table__cell">{CustomerReviewApi.formatCurrency(fund.invested_principal)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="crm-table__foot">
                    <div className="crm-table__cell crm-table__cell--name">합계</div>
                    <div className="crm-table__cell crm-table__cell--primary">{CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}</div>
                    <div className="crm-table__cell">-</div>
                    <div className="crm-table__cell">-</div>
                    <div className="crm-table__cell">-</div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* 푸터 */}
        {review.parsed_at && (
          <footer className="crm-footer">
            파싱일시: {CustomerReviewApi.formatDateTime(review.parsed_at)}
          </footer>
        )}
      </div>
    </DraggableModal>
  );
};

export default CustomerReviewModal;

/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 1.0.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - 계약 정보, 납입 원금, 펀드 구성 현황 표시
 * - Document-Controller-View 패턴 준수 (Layer 5: View)
 */

import React from 'react';
import DraggableModal from '@/shared/ui/DraggableModal';
import { CustomerReviewApi, type CustomerReview } from '../../api/customerReviewApi';
import './CustomerReviewModal.css';

interface CustomerReviewModalProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** Customer Review 데이터 */
  review: CustomerReview | null;
}

export const CustomerReviewModal: React.FC<CustomerReviewModalProps> = ({
  isOpen,
  onClose,
  review
}) => {
  if (!isOpen || !review) return null;

  const { contract_info, premium_info, fund_allocations } = review;

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title="Customer Review Service"
      className="customer-review-modal"
      initialWidth={700}
      initialHeight={600}
    >
      <div className="customer-review-modal__content">
        {/* 헤더 정보 */}
        <div className="cr-modal-header">
          <div className="cr-modal-header__main">
            <h2 className="cr-modal-header__product">{review.product_name || '-'}</h2>
            <div className="cr-modal-header__meta">
              {review.fsr_name && (
                <span className="cr-modal-header__fsr">FSR: {review.fsr_name}</span>
              )}
              {review.issue_date && (
                <span className="cr-modal-header__date">
                  발행일: {CustomerReviewApi.formatDate(review.issue_date)}
                </span>
              )}
            </div>
          </div>
          <div className="cr-modal-header__people">
            {review.contractor_name && (
              <span className="cr-modal-header__person">
                <span className="label">계약자</span>
                <span className="value">{review.contractor_name}</span>
              </span>
            )}
            {review.insured_name && (
              <span className="cr-modal-header__person">
                <span className="label">피보험자</span>
                <span className="value">{review.insured_name}</span>
              </span>
            )}
            {review.death_beneficiary && (
              <span className="cr-modal-header__person">
                <span className="label">사망 수익자</span>
                <span className="value">{review.death_beneficiary}</span>
              </span>
            )}
          </div>
        </div>

        {/* 계약 정보 섹션 */}
        <section className="cr-modal-section">
          <h3 className="cr-modal-section__title">계약 정보</h3>
          <div className="cr-modal-grid">
            <div className="cr-modal-grid__item">
              <span className="label">증권번호</span>
              <span className="value">{contract_info?.policy_number || '-'}</span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">계약일</span>
              <span className="value">
                {contract_info?.contract_date
                  ? CustomerReviewApi.formatDate(contract_info.contract_date)
                  : '-'}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">보험가입금액</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">적립금</span>
              <span className="value highlight">
                {CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">투자수익률</span>
              <span className={`value ${(contract_info?.investment_return_rate || 0) >= 0 ? 'positive' : 'negative'}`}>
                {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">해지환급금</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">해지환급율</span>
              <span className="value">
                {CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}
              </span>
            </div>
          </div>
        </section>

        {/* 납입 원금 섹션 */}
        <section className="cr-modal-section">
          <h3 className="cr-modal-section__title">납입 원금</h3>
          <div className="cr-modal-grid">
            <div className="cr-modal-grid__item">
              <span className="label">기본보험료(A)</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">수시추가납(B)</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">정기추가납(C)</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">중도출금(D)</span>
              <span className="value negative">
                {CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">계(A+B+C-D)</span>
              <span className="value highlight">
                {CustomerReviewApi.formatCurrency(premium_info?.net_premium)}
              </span>
            </div>
            <div className="cr-modal-grid__item">
              <span className="label">약관대출</span>
              <span className="value">
                {CustomerReviewApi.formatCurrency(premium_info?.policy_loan)}
              </span>
            </div>
          </div>
        </section>

        {/* 펀드 구성 현황 섹션 */}
        <section className="cr-modal-section">
          <h3 className="cr-modal-section__title">
            펀드 구성 현황
            {review.fund_count != null && (
              <span className="cr-modal-section__badge">{review.fund_count}개</span>
            )}
          </h3>
          {fund_allocations && fund_allocations.length > 0 ? (
            <div className="cr-modal-fund-table">
              <div className="cr-modal-fund-table__header">
                <div className="col-name">펀드명</div>
                <div className="col-accumulated">적립금</div>
                <div className="col-ratio">구성비율</div>
                <div className="col-return">수익률</div>
                <div className="col-principal">투입원금</div>
              </div>
              <div className="cr-modal-fund-table__body">
                {fund_allocations.map((fund, index) => (
                  <div key={index} className="cr-modal-fund-table__row">
                    <div className="col-name">{fund.fund_name || '-'}</div>
                    <div className="col-accumulated">
                      {CustomerReviewApi.formatCurrency(fund.basic_accumulated)}
                      {fund.additional_accumulated && fund.additional_accumulated > 0 && (
                        <span className="sub-value">
                          +{CustomerReviewApi.formatCurrency(fund.additional_accumulated)}
                        </span>
                      )}
                    </div>
                    <div className="col-ratio">
                      {CustomerReviewApi.formatPercent(fund.allocation_ratio)}
                    </div>
                    <div className={`col-return ${(fund.return_rate || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {CustomerReviewApi.formatPercent(fund.return_rate)}
                      {fund.additional_return_rate != null && (
                        <span className="sub-value">
                          ({CustomerReviewApi.formatPercent(fund.additional_return_rate)})
                        </span>
                      )}
                    </div>
                    <div className="col-principal">
                      {CustomerReviewApi.formatCurrency(fund.invested_principal)}
                    </div>
                  </div>
                ))}
              </div>
              {/* 합계 행 */}
              <div className="cr-modal-fund-table__footer">
                <div className="col-name">합계</div>
                <div className="col-accumulated highlight">
                  {CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}
                </div>
                <div className="col-ratio">-</div>
                <div className="col-return">-</div>
                <div className="col-principal">-</div>
              </div>
            </div>
          ) : (
            <div className="cr-modal-empty">펀드 정보가 없습니다.</div>
          )}
        </section>

        {/* 파싱 정보 */}
        {review.parsed_at && (
          <div className="cr-modal-footer">
            <span className="cr-modal-footer__text">
              파싱일시: {CustomerReviewApi.formatDateTime(review.parsed_at)}
            </span>
          </div>
        )}
      </div>
    </DraggableModal>
  );
};

export default CustomerReviewModal;

/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 4.0.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - Annual Report와 동일한 레이아웃 형식 적용
 */

import React from 'react';
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
      initialWidth={1200}
      initialHeight={640}
      minWidth={1000}
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
        ) : (
          <>
            {/* 헤더: 상품명 + 인적사항 한 줄 */}
            <div className="crm-header-row">
              <div className="crm-product-name">
                {review.product_name || '상품명 없음'}
              </div>
              <div className="crm-persons-inline">
                <span><b>계약자</b> {review.contractor_name || '-'}</span>
                <span><b>피보험자</b> {review.insured_name || '-'}</span>
                <span><b>사망수익자</b> {review.death_beneficiary || '상속인'}</span>
                <span><b>FSR</b> {review.fsr_name || '-'}</span>
              </div>
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
                  {contract_info?.accumulation_rate && (
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
                  <div className="crm-table crm-table--compact">
                    <div className="crm-table__head">
                      <div className="crm-table__cell crm-table__cell--name">펀드명</div>
                      <div className="crm-table__cell">적립금</div>
                      <div className="crm-table__cell">구성비</div>
                      <div className="crm-table__cell">수익률</div>
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
                        </div>
                      ))}
                    </div>
                    <div className="crm-table__foot">
                      <div className="crm-table__cell crm-table__cell--name">합계</div>
                      <div className="crm-table__cell crm-table__cell--primary">{CustomerReviewApi.formatCurrency(review.total_accumulated_amount)}</div>
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

/**
 * AIMS UIX-3 Customer Review Modal
 * @since 2026-01-02
 * @version 1.1.0
 *
 * Customer Review Service 상세 모달 컴포넌트
 * - 계약 정보, 납입 원금, 펀드 구성 현황 표시
 * - PARSING_RESULTS.md 스타일 테이블 레이아웃
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

  // 파싱 완료 여부
  const isParsed = contract_info?.policy_number || (fund_allocations && fund_allocations.length > 0);

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title="Customer Review Service"
      className="customer-review-modal"
      initialWidth={720}
      initialHeight={650}
    >
      <div className="customer-review-modal__content">
        {/* 헤더 정보 */}
        <div className="cr-modal-header">
          <div className="cr-modal-header__main">
            <h2 className="cr-modal-header__product">{review.product_name || '상품명 없음'}</h2>
            <div className="cr-modal-header__meta">
              {review.fsr_name && (
                <span className="cr-modal-header__fsr">담당 FSR: {review.fsr_name}</span>
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
                <span className="label">사망수익자</span>
                <span className="value">{review.death_beneficiary}</span>
              </span>
            )}
          </div>
        </div>

        {/* 파싱 데이터가 없는 경우 */}
        {!isParsed ? (
          <div className="cr-modal-empty-state">
            <div className="cr-modal-empty-state__icon">📄</div>
            <h3 className="cr-modal-empty-state__title">파싱 대기 중</h3>
            <p className="cr-modal-empty-state__desc">
              문서 파싱이 아직 완료되지 않았습니다.<br />
              잠시 후 새로고침해 주세요.
            </p>
          </div>
        ) : (
          <>
            {/* 계약 정보 섹션 - 테이블 스타일 */}
            <section className="cr-modal-section">
              <h3 className="cr-modal-section__title">계약 정보</h3>
              <table className="cr-modal-table">
                <tbody>
                  <tr>
                    <th>증권번호</th>
                    <td>{contract_info?.policy_number || '-'}</td>
                    <th>계약일자</th>
                    <td>
                      {contract_info?.contract_date
                        ? CustomerReviewApi.formatDate(contract_info.contract_date)
                        : '-'}
                    </td>
                  </tr>
                  <tr>
                    <th>보험가입금액</th>
                    <td>{CustomerReviewApi.formatCurrency(contract_info?.insured_amount)}</td>
                    <th>적립금</th>
                    <td className="value--highlight">
                      {CustomerReviewApi.formatCurrency(contract_info?.accumulated_amount)}
                    </td>
                  </tr>
                  <tr>
                    <th>투자수익률</th>
                    <td className={(contract_info?.investment_return_rate || 0) >= 0 ? 'value--positive' : 'value--negative'}>
                      {CustomerReviewApi.formatPercent(contract_info?.investment_return_rate)}
                    </td>
                    <th>해지환급율</th>
                    <td>{CustomerReviewApi.formatPercent(contract_info?.surrender_rate)}</td>
                  </tr>
                  <tr>
                    <th>해지환급금</th>
                    <td colSpan={3}>
                      {CustomerReviewApi.formatCurrency(contract_info?.surrender_value)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 납입 원금 섹션 - 테이블 스타일 */}
            <section className="cr-modal-section">
              <h3 className="cr-modal-section__title">납입 원금</h3>
              <table className="cr-modal-table">
                <tbody>
                  <tr>
                    <th>기본보험료(A)</th>
                    <td>{CustomerReviewApi.formatCurrency(premium_info?.basic_premium)}</td>
                    <th>수시추가납(B)</th>
                    <td>{CustomerReviewApi.formatCurrency(premium_info?.additional_premium)}</td>
                  </tr>
                  <tr>
                    <th>정기추가납(C)</th>
                    <td>{CustomerReviewApi.formatCurrency(premium_info?.regular_additional)}</td>
                    <th>중도출금(D)</th>
                    <td className="value--negative">
                      {CustomerReviewApi.formatCurrency(premium_info?.withdrawal)}
                    </td>
                  </tr>
                  <tr>
                    <th>계(A+B+C-D)</th>
                    <td className="value--highlight">
                      {CustomerReviewApi.formatCurrency(premium_info?.net_premium)}
                    </td>
                    <th>약관대출</th>
                    <td>{CustomerReviewApi.formatCurrency(premium_info?.policy_loan)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* 펀드 구성 현황 섹션 */}
            <section className="cr-modal-section">
              <h3 className="cr-modal-section__title">
                펀드 구성 현황
                {review.fund_count != null && review.fund_count > 0 && (
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
          </>
        )}

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

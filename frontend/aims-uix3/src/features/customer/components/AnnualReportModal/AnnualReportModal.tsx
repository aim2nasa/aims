/**
 * AIMS UIX-3 Annual Report Modal
 * @since 2025-10-16
 * @version 3.0.0
 *
 * 🍎 Annual Report 모달 컴포넌트
 * - 고객의 보험 계약 현황 표시 (Annual Review Report)
 * - Document-Controller-View 패턴 준수 (Layer 5: View)
 * - 순수 View 컴포넌트 (비즈니스 로직 없음)
 */

import React from 'react';
import type { AnnualReport, InsuranceContract } from '../../api/annualReportApi';
import { AnnualReportApi } from '../../api/annualReportApi';
import './AnnualReportModal.css';

/**
 * AnnualReportModal Props 인터페이스
 */
interface AnnualReportModalProps {
  /** 모달 열림/닫힘 상태 */
  isOpen: boolean;
  /** 모달 닫기 핸들러 */
  onClose: () => void;
  /** Annual Report 데이터 */
  report: AnnualReport | null;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 메시지 */
  error: string | null;
  /** 고객 이름 */
  customerName: string;
}

export const AnnualReportModal: React.FC<AnnualReportModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
  customerName
}) => {
  if (!isOpen) return null;

  /**
   * 계약 상태에 따른 배지 스타일
   */
  const getStatusBadgeClass = (status?: string) => {
    if (!status) return 'contract-item__status--default';

    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('유지') || lowerStatus.includes('정상')) {
      return 'contract-item__status--active';
    }
    if (lowerStatus.includes('만기') || lowerStatus.includes('해지')) {
      return 'contract-item__status--inactive';
    }
    return 'contract-item__status--default';
  };

  return (
    <div className="annual-report-modal-overlay" onClick={onClose}>
      <div className="annual-report-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="annual-report-modal__header">
          <h2 className="annual-report-modal__title">
            📊 {customerName}님의 Annual Report
          </h2>
          <button className="annual-report-modal__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="annual-report-modal__content">
          {/* 에러 표시 */}
          {error && (
            <div className="annual-report-modal__error">
              ⚠️ {error}
            </div>
          )}

          {/* 로딩 표시 */}
          {isLoading && (
            <div className="annual-report-modal__loading">
              Annual Report를 불러오는 중...
            </div>
          )}

          {/* 빈 상태 (Report 없음) */}
          {!isLoading && !error && !report && (
            <div className="annual-report-modal__empty">
              <div className="annual-report-modal__empty-icon">📄</div>
              <p className="annual-report-modal__empty-text">
                Annual Report가 없습니다.
              </p>
              <p className="annual-report-modal__empty-hint">
                Annual Report PDF를 업로드하면 자동으로 파싱됩니다.
              </p>
            </div>
          )}

          {/* Annual Report 표시 */}
          {!isLoading && report && (
            <>
              {/* Summary Section */}
              <div className="annual-report-summary">
                <div className="annual-report-summary__item">
                  <span className="annual-report-summary__label">발행일</span>
                  <span className="annual-report-summary__value">
                    {AnnualReportApi.formatDate(report.issue_date)}
                  </span>
                </div>
                <div className="annual-report-summary__item">
                  <span className="annual-report-summary__label">총 월 보험료</span>
                  <span className="annual-report-summary__value annual-report-summary__value--primary">
                    {AnnualReportApi.formatCurrency(report.total_monthly_premium)}
                  </span>
                </div>
                <div className="annual-report-summary__item">
                  <span className="annual-report-summary__label">총 보장금액</span>
                  <span className="annual-report-summary__value annual-report-summary__value--accent">
                    {AnnualReportApi.formatCurrency(report.total_coverage)}
                  </span>
                </div>
                <div className="annual-report-summary__item">
                  <span className="annual-report-summary__label">계약 건수</span>
                  <span className="annual-report-summary__value">
                    {AnnualReportApi.formatContractCount(report.contract_count)}
                  </span>
                </div>
              </div>

              {/* Contracts List */}
              <div className="annual-report-contracts">
                <h3 className="annual-report-contracts__title">
                  보험 계약 목록 ({report.contract_count}건)
                </h3>

                {report.contracts.map((contract: InsuranceContract, index: number) => (
                  <div key={index} className="contract-item">
                    {/* Contract Header */}
                    <div className="contract-item__header">
                      <div className="contract-item__company">
                        {contract.insurance_company}
                      </div>
                      {contract.status && (
                        <span className={`contract-item__status ${getStatusBadgeClass(contract.status)}`}>
                          {contract.status}
                        </span>
                      )}
                    </div>

                    {/* Contract Body */}
                    <div className="contract-item__body">
                      <div className="contract-item__product">
                        {contract.product_name}
                      </div>
                      <div className="contract-item__number">
                        계약번호: {contract.contract_number}
                      </div>
                    </div>

                    {/* Contract Details */}
                    <div className="contract-item__details">
                      <div className="contract-item__detail">
                        <span className="contract-item__detail-label">월 보험료</span>
                        <span className="contract-item__detail-value contract-item__detail-value--premium">
                          {AnnualReportApi.formatCurrency(contract.monthly_premium)}
                        </span>
                      </div>
                      <div className="contract-item__detail">
                        <span className="contract-item__detail-label">보장금액</span>
                        <span className="contract-item__detail-value contract-item__detail-value--coverage">
                          {AnnualReportApi.formatCurrency(contract.coverage_amount)}
                        </span>
                      </div>
                    </div>

                    {/* Contract Dates */}
                    <div className="contract-item__dates">
                      <div className="contract-item__date">
                        <span className="contract-item__date-label">계약일</span>
                        <span className="contract-item__date-value">
                          {AnnualReportApi.formatDate(contract.contract_date)}
                        </span>
                      </div>
                      {contract.maturity_date && (
                        <div className="contract-item__date">
                          <span className="contract-item__date-label">만기일</span>
                          <span className="contract-item__date-value">
                            {AnnualReportApi.formatDate(contract.maturity_date)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Optional Fields */}
                    {(contract.premium_payment_period || contract.insurance_period) && (
                      <div className="contract-item__periods">
                        {contract.premium_payment_period && (
                          <div className="contract-item__period">
                            <span className="contract-item__period-label">납입기간</span>
                            <span className="contract-item__period-value">
                              {contract.premium_payment_period}
                            </span>
                          </div>
                        )}
                        {contract.insurance_period && (
                          <div className="contract-item__period">
                            <span className="contract-item__period-label">보험기간</span>
                            <span className="contract-item__period-value">
                              {contract.insurance_period}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer Info */}
              <div className="annual-report-modal__footer">
                <span className="annual-report-modal__footer-text">
                  생성일: {new Date(report.created_at).toLocaleString('ko-KR')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnualReportModal;

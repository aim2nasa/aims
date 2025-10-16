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
                        <th>보험사</th>
                        <th>증권번호</th>
                        <th>보험상품</th>
                        <th>계약자</th>
                        <th>피보험자</th>
                        <th>계약일</th>
                        <th>계약상태</th>
                        <th>가입금액(만원)</th>
                        <th>보험기간</th>
                        <th>납입기간</th>
                        <th>보험료(원)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.contracts.map((contract: InsuranceContract, index: number) => (
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

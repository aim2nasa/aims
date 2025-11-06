/**
 * AIMS UIX-3 Annual Report Modal
 * @since 2025-10-16
 * @version 3.0.0
 *
 * 🍎 Annual Report 모달 컴포넌트
 * - 고객의 보험 계약 현황 표시 (Annual Review Report)
 * - Document-Controller-View 패턴 준수 (Layer 5: View)
 * - 순수 View 컴포넌트 (비즈니스 로직 없음)
 * - 문서 프리뷰 모달 디자인 적용
 */

import React, { useState } from 'react';
import DraggableModal from '@/shared/ui/DraggableModal';
import Button from '@/shared/ui/Button';
import SFSymbol, { SFSymbolSize, SFSymbolWeight } from '../../../../components/SFSymbol';
import Tooltip from '../../../../shared/ui/Tooltip';
import type { AnnualReport, InsuranceContract } from '../../api/annualReportApi';
import { AnnualReportApi } from '../../api/annualReportApi';
import { formatDateTime } from '@/shared/lib/timeUtils';
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

// 정렬 설정 타입
type SortConfig = {
  key: keyof InsuranceContract;
  direction: 'asc' | 'desc';
} | null;

export const AnnualReportModal: React.FC<AnnualReportModalProps> = ({
  isOpen,
  onClose,
  report,
  isLoading,
  error,
  customerName
}) => {
  // 정렬 상태
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

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


  /**
   * 정렬 핸들러 - 컬럼 클릭 시 오름차순/내림차순 토글
   */
  const handleSort = (key: keyof InsuranceContract) => {
    let direction: 'asc' | 'desc' = 'asc';

    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }

    setSortConfig({ key, direction });
  };

  /**
   * 정렬된 계약 목록 생성
   */
  const getSortedContracts = (contracts: InsuranceContract[]): InsuranceContract[] => {
    if (!sortConfig) return contracts;

    const sortedContracts = [...contracts];

    sortedContracts.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      // null/undefined 처리
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // 숫자 비교
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // 문자열 비교
      const aStr = String(aValue);
      const bStr = String(bValue);
      const comparison = aStr.localeCompare(bStr, 'ko-KR');

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return sortedContracts;
  };

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
      );
    }

    const tooltipText = sortConfig.direction === 'asc' ? '오름차순 정렬 중' : '내림차순 정렬 중';

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
    );
  };

  /**
   * 정렬된 헤더인지 확인
   */
  const isSortedColumn = (columnKey: keyof InsuranceContract) => {
    return sortConfig && sortConfig.key === columnKey;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="annual-report-modal__center">
          <span>Annual Report를 불러오는 중...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="annual-report-modal__center annual-report-modal__center--error">
          <SFSymbol
            name="exclamationmark.triangle.fill"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <p>{error}</p>
        </div>
      );
    }

    if (!report) {
      return (
        <div className="annual-report-modal__center">
          <SFSymbol
            name="doc.text.slash"
            size={SFSymbolSize.TITLE_3}
            weight={SFSymbolWeight.MEDIUM}
          />
          <span>Annual Report가 없습니다.</span>
        </div>
      );
    }

    return (
      <>
        {/* Summary Section */}
        <div className="annual-report-summary">
          <div className="annual-report-summary__item">
            <span className="annual-report-summary__label">발행일</span>
            <span className="annual-report-summary__value">
              {report.issue_date.split('T')[0]}
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
        <div className="annual-report-modal__footer">
          <span className="annual-report-modal__footer-text">
            생성일: {formatDateTime(report.created_at)}
          </span>
        </div>
      </>
    );
  };

  return (
    <DraggableModal
      visible={isOpen}
      onClose={onClose}
      title={
        <div className="customer-document-preview__title">
          <SFSymbol
            name="chart.bar.doc.horizontal"
            size={SFSymbolSize.BODY}
            weight={SFSymbolWeight.REGULAR}
          />
          <div>
            <h2>{customerName}님의 Annual Report</h2>
            <p>
              {report?.issue_date ? `발행일: ${report.issue_date.split('T')[0]}` : '정보 없음'}
              {report && ` · ${report.contract_count}건`}
            </p>
          </div>
        </div>
      }
      initialWidth={1200}
      initialHeight={800}
      minWidth={800}
      minHeight={600}
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
        {renderContent()}
      </main>
    </DraggableModal>
  );
};

export default AnnualReportModal;

/**
 * AIMS UIX-3 Annual Report Tab
 * @since 2025-10-16
 * @version 1.0.0
 *
 * 🍎 Annual Report 탭 컴포넌트
 * - Annual Report 조회 및 표시
 * - Document-Controller-View 패턴 준수
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dropdown } from '@/shared/ui';
import { AnnualReportModal } from '@/features/customer/components/AnnualReportModal';
import { AnnualReportApi, type AnnualReport } from '@/features/customer/api/annualReportApi';
import type { Customer } from '@/entities/customer/model';
import './AnnualReportTab.css';

interface AnnualReportTabProps {
  customer: Customer;
}

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '20', label: '20개씩' },
  { value: '50', label: '50개씩' },
];

export const AnnualReportTab: React.FC<AnnualReportTabProps> = ({ customer }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reports, setReports] = useState<AnnualReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 페이지네이션 상태
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [currentPage, setCurrentPage] = useState(1);

  // Annual Report 목록 로드
  useEffect(() => {
    loadAnnualReports();
  }, [customer._id]);

  const loadAnnualReports = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await AnnualReportApi.getAnnualReports(customer._id, 20);

      if (response.success && response.data) {
        // API 응답의 data 배열을 직접 AnnualReport 타입으로 변환
        const transformedReports: AnnualReport[] = response.data.reports.map((rawData: any) => {
          const transformedContracts = (rawData.contracts || []).map((contract: any) => ({
            insurance_company: '메트라이프',
            contract_number: contract['증권번호'] || '',
            product_name: contract['보험상품'] || '',
            contractor_name: contract['계약자'] || '',
            insured_name: contract['피보험자'] || '',
            monthly_premium: contract['보험료(원)'] || 0,
            coverage_amount: (contract['가입금액(만원)'] || 0) * 10000,
            contract_date: contract['계약일'] || '',
            maturity_date: undefined,
            premium_payment_period: contract['납입기간'] || '',
            insurance_period: contract['보험기간'] || '',
            status: contract['계약상태'] || ''
          }));

          return {
            report_id: rawData.file_id || `report_${rawData.parsed_at}`,
            issue_date: rawData.issue_date || '',
            customer_name: rawData.customer_name || customer.personal_info?.name || '',
            total_monthly_premium: rawData.total_monthly_premium || 0,
            total_coverage: rawData.total_coverage || 0,
            contract_count: rawData.total_contracts || rawData.contract_count || 0,
            contracts: transformedContracts,
            source_file_id: rawData.file_id,
            created_at: rawData.uploaded_at || '',
            parsed_at: rawData.parsed_at || ''
          };
        });

        setReports(transformedReports);
      } else {
        setError(response.error || 'Annual Report 조회에 실패했습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annual Report 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReport = (report: AnnualReport) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="annual-report-tab">
        <div className="annual-report-tab__loading">
          <div className="annual-report-tab__loading-spinner"></div>
          <p>Annual Report를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="annual-report-tab">
        <div className="annual-report-tab__error">
          <div className="annual-report-tab__error-icon">⚠️</div>
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={loadAnnualReports}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  // Annual Report 없음
  if (reports.length === 0) {
    return (
      <div className="annual-report-tab">
        <div className="annual-report-tab__empty">
          <div className="annual-report-tab__empty-icon">📄</div>
          <h3 className="annual-report-tab__empty-title">Annual Report가 없습니다</h3>
          <p className="annual-report-tab__empty-description">
            Annual Report PDF를 업로드하면 자동으로 파싱되어 여기에 표시됩니다.
          </p>
          <div className="annual-report-tab__empty-hint">
            <p className="annual-report-tab__empty-hint-text">
              💡 Annual Report는 보험 계약 현황을 요약한 문서입니다.
            </p>
          </div>
        </div>

        {/* Annual Report Modal */}
        <AnnualReportModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          report={null}
          isLoading={false}
          error={null}
          customerName={customer.personal_info?.name || '고객'}
        />
      </div>
    );
  }

  // 페이지네이션 계산
  const itemsPerPageNumber = parseInt(itemsPerPage, 10);
  const totalPages = Math.max(1, Math.ceil(reports.length / itemsPerPageNumber));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // 현재 페이지에 표시할 리포트들
  const visibleReports = reports.slice(
    (safeCurrentPage - 1) * itemsPerPageNumber,
    safeCurrentPage * itemsPerPageNumber
  );

  // 페이지 변경 핸들러
  const handlePrevPage = () => {
    if (safeCurrentPage > 1) {
      setCurrentPage(safeCurrentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (safeCurrentPage < totalPages) {
      setCurrentPage(safeCurrentPage + 1);
    }
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  // Annual Report 목록 있음
  return (
    <div className="annual-report-tab">
      {/* 테이블 컨테이너 */}
      <div className="annual-report-table-container">
        {/* 테이블 헤더 */}
        <div className="annual-report-table-header">
          <div className="header-issue-date">발행일</div>
          <div className="header-parsed-at">파싱일시</div>
          <div className="header-premium">총 월보험료</div>
          <div className="header-count">계약 수</div>
          <div className="header-status">상태</div>
        </div>

        {/* 테이블 바디 */}
        <div className="annual-report-table-body">
          {visibleReports.map((report) => {
            const isLatest = reports.indexOf(report) === 0;
            const formattedDate = report.issue_date.split('T')[0];

            return (
              <div
                key={report.report_id}
                className={`annual-report-row ${isLatest ? 'annual-report-row--latest' : ''}`}
                onClick={() => handleViewReport(report)}
              >
                <div className="row-issue-date">{formattedDate}</div>
                <div className="row-parsed-at">{AnnualReportApi.formatDateTime(report.parsed_at)}</div>
                <div className="row-premium">{AnnualReportApi.formatCurrency(report.total_monthly_premium)}</div>
                <div className="row-count">{report.contract_count}건</div>
                <div className="row-status">
                  {isLatest && <span className="status-badge">최신</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 페이지네이션 - 항상 표시 (전체보기와 동일) */}
      <div className="annual-report-pagination">
        {/* 페이지당 항목 수 선택 */}
        <div className="pagination-limit">
          <Dropdown
            value={itemsPerPage}
            options={ITEMS_PER_PAGE_OPTIONS}
            onChange={handleItemsPerPageChange}
            aria-label="페이지당 항목 수"
          />
        </div>

        {/* 페이지 네비게이션 - 항상 표시 */}
        <div className="pagination-controls">
          <button
            className="pagination-button pagination-button--prev"
            onClick={handlePrevPage}
            disabled={safeCurrentPage === 1}
            aria-label="이전 페이지"
          >
            <span className="pagination-arrow">‹</span>
          </button>

          <div className="pagination-info">
            <span className="pagination-current">{safeCurrentPage}</span>
            <span className="pagination-separator">/</span>
            <span className="pagination-total">{totalPages}</span>
          </div>

          <button
            className="pagination-button pagination-button--next"
            onClick={handleNextPage}
            disabled={safeCurrentPage === totalPages}
            aria-label="다음 페이지"
          >
            <span className="pagination-arrow">›</span>
          </button>
        </div>
      </div>

      {/* Annual Report Modal */}
      <AnnualReportModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        report={selectedReport}
        isLoading={false}
        error={null}
        customerName={customer.personal_info?.name || '고객'}
      />
    </div>
  );
};

export default AnnualReportTab;

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
import { AnnualReportModal } from '@/features/customer/components/AnnualReportModal';
import { AnnualReportApi, type AnnualReport } from '@/features/customer/api/annualReportApi';
import type { Customer } from '@/entities/customer/model';
import './AnnualReportTab.css';

interface AnnualReportTabProps {
  customer: Customer;
}

export const AnnualReportTab: React.FC<AnnualReportTabProps> = ({ customer }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reports, setReports] = useState<AnnualReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        // 각 report를 AnnualReport 타입으로 변환
        const transformedReports: AnnualReport[] = await Promise.all(
          response.data.reports.map(async (summary) => {
            // 각 report의 상세 정보 가져오기 (현재는 summary만 있으므로 latestAnnualReport API 활용)
            // TODO: 개별 report 조회 API 추가 필요 시 수정
            const detailResponse = await AnnualReportApi.getLatestAnnualReport(customer._id);

            if (detailResponse.success && detailResponse.data) {
              const rawData = detailResponse.data as any;

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
                report_id: rawData.file_id || summary.report_id,
                issue_date: rawData.issue_date || summary.issue_date,
                customer_name: rawData.customer_name || customer.personal_info?.name || '',
                total_monthly_premium: rawData.total_monthly_premium || summary.total_monthly_premium,
                total_coverage: rawData.total_coverage || summary.total_coverage,
                contract_count: rawData.total_contracts || summary.contract_count,
                contracts: transformedContracts,
                source_file_id: rawData.file_id,
                created_at: rawData.uploaded_at || summary.created_at
              };
            }

            // 상세 정보 조회 실패 시 summary만 사용
            return {
              report_id: summary.report_id,
              issue_date: summary.issue_date,
              customer_name: summary.customer_name,
              total_monthly_premium: summary.total_monthly_premium,
              total_coverage: summary.total_coverage,
              contract_count: summary.contract_count,
              contracts: [],
              created_at: summary.created_at
            };
          })
        );

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

  // Annual Report 목록 있음
  return (
    <div className="annual-report-tab">
      <div className="annual-report-tab__header">
        <h3 className="annual-report-tab__title">Annual Report 목록</h3>
        <Button variant="secondary" size="sm" onClick={loadAnnualReports} leftIcon={<span>🔄</span>}>
          새로고침
        </Button>
      </div>

      {/* Annual Report 카드 목록 */}
      <div className="annual-report-tab__list">
        {reports.map((report, index) => {
          const isLatest = index === 0; // 첫 번째를 최신으로 간주

          return (
            <div
              key={report.report_id}
              className={`annual-report-card ${isLatest ? 'annual-report-card--latest' : ''}`}
              onClick={() => handleViewReport(report)}
            >
              {/* 카드 헤더 */}
              <div className="annual-report-card__header">
                <div className="annual-report-card__date">
                  <span className="annual-report-card__date-icon">📊</span>
                  <span className="annual-report-card__date-text">
                    {AnnualReportApi.formatDate(report.issue_date)}
                  </span>
                </div>
                {isLatest && <span className="annual-report-card__badge">최신</span>}
              </div>

              {/* 카드 내용 */}
              <div className="annual-report-card__stats">
                <div className="annual-report-card__stat">
                  <span className="annual-report-card__stat-label">총 월 보험료</span>
                  <span className="annual-report-card__stat-value annual-report-card__stat-value--premium">
                    {AnnualReportApi.formatCurrency(report.total_monthly_premium)}
                  </span>
                </div>
                <div className="annual-report-card__stat">
                  <span className="annual-report-card__stat-label">총 보장금액</span>
                  <span className="annual-report-card__stat-value annual-report-card__stat-value--coverage">
                    {AnnualReportApi.formatCurrency(report.total_coverage)}
                  </span>
                </div>
                <div className="annual-report-card__stat">
                  <span className="annual-report-card__stat-label">계약 건수</span>
                  <span className="annual-report-card__stat-value">
                    {AnnualReportApi.formatContractCount(report.contract_count)}
                  </span>
                </div>
              </div>

              {/* 카드 푸터 */}
              <div className="annual-report-card__footer">
                <span className="annual-report-card__footer-text">
                  클릭하여 상세 정보 보기
                </span>
                <span className="annual-report-card__footer-icon">→</span>
              </div>
            </div>
          );
        })}
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

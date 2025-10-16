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
  const [latestReport, setLatestReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 최신 Annual Report 로드
  useEffect(() => {
    loadLatestReport();
  }, [customer._id]);

  const loadLatestReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await AnnualReportApi.getLatestAnnualReport(customer._id);

      if (response.success && response.data) {
        // API 응답 구조: { success: true, data: { customer_name, total_contracts, contracts, ... } }
        const rawData = response.data as any;

        // 계약 데이터 변환 (한글 필드명 → 영어 필드명)
        const transformedContracts = (rawData.contracts || []).map((contract: any) => ({
          insurance_company: '메트라이프', // Annual Report는 메트라이프 고정
          contract_number: contract['증권번호'] || '',
          product_name: contract['보험상품'] || '',
          monthly_premium: contract['보험료(원)'] || 0,
          coverage_amount: (contract['가입금액(만원)'] || 0) * 10000, // 만원 → 원 변환
          contract_date: contract['계약일'] || '',
          maturity_date: undefined,
          premium_payment_period: contract['납입기간'] || '',
          insurance_period: contract['보험기간'] || '',
          status: contract['계약상태'] || ''
        }));

        // 프론트엔드 타입에 맞게 변환
        const transformedReport: AnnualReport = {
          report_id: rawData.file_id || 'unknown',
          issue_date: rawData.issue_date || '',
          customer_name: rawData.customer_name || customer.personal_info?.name || '',
          total_monthly_premium: rawData.total_monthly_premium || 0,
          total_coverage: rawData.total_coverage || 0,
          contract_count: rawData.total_contracts || 0,
          contracts: transformedContracts,
          source_file_id: rawData.file_id,
          created_at: rawData.uploaded_at || new Date().toISOString()
        };

        setLatestReport(transformedReport);
      } else {
        setError(response.error || 'Annual Report 조회에 실패했습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annual Report 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReport = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
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
          <Button variant="secondary" size="sm" onClick={loadLatestReport}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  // Annual Report 없음
  if (!latestReport) {
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

  // Annual Report 있음
  return (
    <div className="annual-report-tab">
      <div className="annual-report-tab__summary">
        <h3 className="annual-report-tab__summary-title">최신 Annual Report</h3>

        {/* 발행일 */}
        <div className="annual-report-tab__info-row">
          <span className="annual-report-tab__info-label">발행일</span>
          <span className="annual-report-tab__info-value">
            {AnnualReportApi.formatDate(latestReport.issue_date)}
          </span>
        </div>

        {/* 보험료 및 보장금액 */}
        <div className="annual-report-tab__stats">
          <div className="annual-report-tab__stat-item">
            <span className="annual-report-tab__stat-label">총 월 보험료</span>
            <span className="annual-report-tab__stat-value annual-report-tab__stat-value--premium">
              {AnnualReportApi.formatCurrency(latestReport.total_monthly_premium)}
            </span>
          </div>
          <div className="annual-report-tab__stat-item">
            <span className="annual-report-tab__stat-label">총 보장금액</span>
            <span className="annual-report-tab__stat-value annual-report-tab__stat-value--coverage">
              {AnnualReportApi.formatCurrency(latestReport.total_coverage)}
            </span>
          </div>
          <div className="annual-report-tab__stat-item">
            <span className="annual-report-tab__stat-label">계약 건수</span>
            <span className="annual-report-tab__stat-value">
              {AnnualReportApi.formatContractCount(latestReport.contract_count)}
            </span>
          </div>
        </div>

        {/* 상세 보기 버튼 */}
        <div className="annual-report-tab__actions">
          <Button
            variant="primary"
            size="md"
            onClick={handleViewReport}
            leftIcon={<span>📊</span>}
          >
            상세 보기
          </Button>
          <Button variant="secondary" size="md" onClick={loadLatestReport} leftIcon={<span>🔄</span>}>
            새로고침
          </Button>
        </div>

        {/* 계약 미리보기 (처음 3개만) */}
        {latestReport.contracts && latestReport.contracts.length > 0 && (
          <div className="annual-report-tab__preview">
            <h4 className="annual-report-tab__preview-title">계약 미리보기</h4>
            {latestReport.contracts.slice(0, 3).map((contract, index) => (
              <div key={index} className="annual-report-tab__contract-preview">
                <div className="annual-report-tab__contract-header">
                  <span className="annual-report-tab__contract-company">
                    {contract.insurance_company}
                  </span>
                  {contract.status && (
                    <span className="annual-report-tab__contract-status">{contract.status}</span>
                  )}
                </div>
                <div className="annual-report-tab__contract-product">{contract.product_name}</div>
                <div className="annual-report-tab__contract-details">
                  <span>월 {AnnualReportApi.formatCurrency(contract.monthly_premium)}</span>
                  <span>·</span>
                  <span>보장 {AnnualReportApi.formatCurrency(contract.coverage_amount)}</span>
                </div>
              </div>
            ))}
            {latestReport.contracts.length > 3 && (
              <div className="annual-report-tab__preview-more">
                외 {latestReport.contracts.length - 3}건 더 보기...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Annual Report Modal */}
      <AnnualReportModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        report={latestReport}
        isLoading={false}
        error={null}
        customerName={customer.personal_info?.name || '고객'}
      />
    </div>
  );
};

export default AnnualReportTab;

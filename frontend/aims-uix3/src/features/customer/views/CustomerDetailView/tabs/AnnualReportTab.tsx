/**
 * AIMS UIX-3 Annual Report Tab
 * @since 2025-10-16
 * @version 1.0.0
 *
 * 🍎 Annual Report 탭 컴포넌트
 * - Annual Report 조회 및 표시
 * - Document-Controller-View 패턴 준수
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dropdown } from '@/shared/ui';
import { AnnualReportModal } from '@/features/customer/components/AnnualReportModal';
import { AnnualReportApi, type AnnualReport } from '@/features/customer/api/annualReportApi';
import { api } from '@/shared/lib/api';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { useAppleConfirmController } from '../../../../../controllers/useAppleConfirmController';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { UserContextService } from '../../../../../components/DocumentViews/DocumentRegistrationView/services/userContextService';
import type { Customer } from '@/entities/customer/model';
import './AnnualReportTab.css';

// 백엔드 원시 응답 타입 정의
interface RawAnnualReportData {
  report_id?: string;
  issue_date: string;
  customer_name: string;
  total_monthly_premium: number;
  total_coverage: number;
  contract_count: number;
  total_contracts?: number;
  created_at?: string;
  uploaded_at?: string;
  parsed_at?: string;
  file_hash?: string;
  file_id?: string;
  contracts?: Array<{
    '증권번호': string;
    '보험상품': string;
    '계약자'?: string;
    '피보험자'?: string;
    '보험료(원)'?: number;
    '월납입보험료'?: number;
    '보장금액(원)'?: number;
    '가입금액(만원)'?: number;
    '계약일'?: string;
    '납입기간'?: string;
    '보험기간'?: string;
    '계약상태'?: string;
  }>;
}

interface PendingDocument {
  file_id: string;
  filename: string;
  status: string;
  created_at: string;
}

interface AnnualReportTabProps {
  customer: Customer;
  onAnnualReportCountChange?: (count: number) => void;
  refreshTrigger?: number;
}

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
];

export const AnnualReportTab: React.FC<AnnualReportTabProps> = ({ customer, onAnnualReportCountChange, refreshTrigger }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reports, setReports] = useState<AnnualReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 페이지네이션 상태
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [currentPage, setCurrentPage] = useState(1);
  // 삭제 기능 상태
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  // AR 파싱 대기/진행 중인 문서 상태
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  // Page Visibility API: 백그라운드 탭에서 폴링 중지
  const [isPageVisible, setPageVisible] = useState(true);

  // 개발자 모드 - 전역 상태 사용
  const { isDevMode } = useDevModeStore();

  // Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController();

  // Page Visibility API: 브라우저 탭이 백그라운드일 때 폴링 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setPageVisible(isVisible);

      // 탭이 다시 보이면 즉시 데이터 새로고침
      if (isVisible && pendingCount > 0) {
        loadPendingDocuments();
        loadAnnualReports();
      }
    };

    // 초기 상태 설정
    setPageVisible(document.visibilityState === 'visible');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pendingCount]);

  // 개발자 모드 OFF시 선택 초기화
  useEffect(() => {
    if (!isDevMode) {
      setSelectedIndices(new Set());
    }
  }, [isDevMode]);

  // 🍎 동적 칼럼 폭 계산: 소유주(customer_name) 기준
  const ownerColumnWidth = useMemo(() => {
    if (reports.length === 0) return 80; // 기본값
    const maxLength = Math.max(...reports.map(r => (r.customer_name || '').length));
    // 글자당 약 10px (한글), 최소 60px, 최대 150px
    const calculatedWidth = Math.max(60, Math.min(150, maxLength * 10 + 16));
    return calculatedWidth;
  }, [reports]);

  // 🍎 동적 칼럼 폭 계산: 총 월보험료 기준
  const premiumColumnWidth = useMemo(() => {
    if (reports.length === 0) return 120; // 기본값
    const maxLength = Math.max(
      ...reports.map(r => AnnualReportApi.formatCurrency(r.total_monthly_premium).length)
    );
    // 글자당 약 8px, 최소 80px, 최대 180px
    const calculatedWidth = Math.max(80, Math.min(180, maxLength * 8 + 16));
    return calculatedWidth;
  }, [reports]);

  // 🍎 동적 칼럼 폭 계산: 파싱일시 기준
  const parsedAtColumnWidth = useMemo(() => {
    if (reports.length === 0) return 130; // 기본값
    const maxLength = Math.max(
      ...reports.map(r => AnnualReportApi.formatDateTime(r.parsed_at).length)
    );
    // 글자당 약 7px, 최소 100px, 최대 180px
    const calculatedWidth = Math.max(100, Math.min(180, maxLength * 7 + 16));
    return calculatedWidth;
  }, [reports]);

  // Annual Report 목록 로드
  useEffect(() => {
    loadAnnualReports();
    loadPendingDocuments();
  }, [customer._id, refreshTrigger]);

  // 주기적으로 파싱 대기 문서 확인 (10초마다)
  // 페이지가 보일 때만 폴링
  useEffect(() => {
    if (!isPageVisible) return; // 백그라운드 탭에서는 폴링 중지

    const interval = setInterval(() => {
      if (pendingCount > 0) {
        loadPendingDocuments();
        loadAnnualReports(); // 파싱 완료된 것이 있을 수 있으므로
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [pendingCount, customer._id, isPageVisible]);

  // 🍎 Annual Report 개수 변경 시 부모에게 알림
  useEffect(() => {
    onAnnualReportCountChange?.(reports.length);
  }, [reports.length, onAnnualReportCountChange]);

  const loadPendingDocuments = async () => {
    try {
      // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
      const data = await api.get<{ success: boolean; data: { pending_count: number; documents: PendingDocument[] } }>(
        `/api/customers/${customer._id}/annual-reports/pending`
      );

      if (data.success) {
        setPendingCount(data.data.pending_count);
        setPendingDocs(data.data.documents);
      }
    } catch (err) {
      console.error('Failed to load pending AR documents:', err);
    }
  };

  const loadAnnualReports = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const userId = UserContextService.getContext().identifierValue;

      // ⭐ 먼저 Documents 탭의 문서들을 가져와서 중복 AR 정리
      try {
        // ⭐ 공유 api 클라이언트 사용 (JWT 토큰 자동 포함)
        const docsData = await api.get<{ success: boolean; data: { documents: any[] } }>(
          `/api/customers/${customer._id}/documents`
        );

        if (docsData.success && docsData.data?.documents) {
          const arDocuments = docsData.data.documents.filter(
            (doc: any) => doc.relationship === 'annual_report' && doc.linkedAt && doc.ar_metadata?.issue_date
          );

          if (arDocuments.length > 0) {
            console.log(`[AnnualReportTab] 자동 중복 정리 시작: ${arDocuments.length}개 AR 문서 발견`);

            for (const doc of arDocuments) {
              const issueDate = doc.ar_metadata.issue_date.split('T')[0];
              const customerName = doc.ar_metadata.customer_name;

              console.log(`[AnnualReportTab] AR 중복 정리: issue_date=${issueDate}, customer_name=${customerName}, linkedAt=${doc.linkedAt}`);

              const result = await AnnualReportApi.cleanupDuplicates(
                customer._id,
                userId,
                issueDate,
                doc.linkedAt,
                customerName
              );

              if (result.deleted_count && result.deleted_count > 0) {
                console.log(`[AnnualReportTab] ✅ 중복 AR 정리 완료 (${issueDate}): ${result.deleted_count}건 삭제`);
              }
            }
          }
        }
      } catch (cleanupError) {
        console.warn('[AnnualReportTab] 자동 중복 정리 실패 (무시):', cleanupError);
      }

      const response = await AnnualReportApi.getAnnualReports(customer._id, userId, 20);

      if (response.success && response.data) {
        // API 응답의 data 배열을 직접 AnnualReport 타입으로 변환
        const transformedReports: AnnualReport[] = response.data.reports.map((rawData: RawAnnualReportData) => {
          const transformedContracts = (rawData.contracts || []).map((contract) => ({
            insurance_company: '메트라이프',
            contract_number: contract['증권번호'] || '',
            product_name: contract['보험상품'] || '',
            contractor_name: contract['계약자'] || '',
            insured_name: contract['피보험자'] || '',
            monthly_premium: contract['보험료(원)'] || 0,
            coverage_amount: (contract['가입금액(만원)'] || 0) * 10000,
            contract_date: contract['계약일'] || '',
            maturity_date: '',  // 백엔드 데이터에 없음
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
            source_file_id: rawData.file_id || '',
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

  // 체크박스 전체 선택/해제
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIndices = new Set(visibleReports.map((_, idx) => (currentPage - 1) * parseInt(itemsPerPage) + idx));
      setSelectedIndices(allIndices);
    } else {
      setSelectedIndices(new Set());
    }
  };

  // 개별 체크박스 선택/해제
  const handleSelectReport = (globalIndex: number, event: React.MouseEvent) => {
    event.stopPropagation(); // 행 클릭 이벤트 방지
    setSelectedIndices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(globalIndex)) {
        newSet.delete(globalIndex);
      } else {
        newSet.add(globalIndex);
      }
      return newSet;
    });
  };

  // Annual Reports 삭제
  const handleDeleteSelected = async () => {
    if (selectedIndices.size === 0) {
      await confirmModal.actions.openModal({
        title: '선택 항목 없음',
        message: '삭제할 항목을 선택해주세요.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'warning'
      });
      return;
    }

    const confirmed = await confirmModal.actions.openModal({
      title: 'Annual Report 삭제',
      message: `${selectedIndices.size}개 항목을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`,
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const userId = UserContextService.getContext().identifierValue;
      const result = await AnnualReportApi.deleteAnnualReports(
        customer._id,
        userId,
        Array.from(selectedIndices)
      );

      // 삭제 작업 완료 후 즉시 isDeleting을 false로 설정
      setIsDeleting(false);

      if (result.success) {
        setSelectedIndices(new Set());
        await loadAnnualReports(); // 목록 새로고침

        // 성공 모달은 마지막에 표시
        await confirmModal.actions.openModal({
          title: '완료',
          message: `${result.deleted_count}건 삭제되었습니다.`,
          confirmText: '확인',
          showCancel: false,
          iconType: 'success'
        });
      } else {
        await confirmModal.actions.openModal({
          title: '실패',
          message: result.message,
          confirmText: '확인',
          showCancel: false,
          iconType: 'error'
        });
      }
    } catch (err) {
      setIsDeleting(false);
      await confirmModal.actions.openModal({
        title: '오류',
        message: '삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
      console.error('Delete error:', err);
    }
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
        {/* AR 파싱 진행 중 알림 (빈 상태에서도 표시) */}
        {pendingCount > 0 && (
          <div className="annual-report-parsing-notice">
            <div className="parsing-notice-icon">
              <div className="parsing-spinner"></div>
            </div>
            <div className="parsing-notice-content">
              <div className="parsing-notice-title">
                Annual Report 분석 중
              </div>
              <div className="parsing-notice-description">
                {pendingCount}개의 문서를 백그라운드에서 분석하고 있습니다. 완료되면 자동으로 목록에 추가됩니다.
              </div>
              {pendingDocs.length > 0 && (
                <div className="parsing-notice-files">
                  {pendingDocs.map(doc => (
                    <div key={doc.file_id} className="parsing-file-item">
                      <span className="parsing-file-name">{doc.filename}</span>
                      <span className="parsing-file-status">
                        {doc.status === 'processing' ? '분석 중...' : '대기 중...'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="annual-report-tab__empty">
          <div className="annual-report-tab__empty-icon">📄</div>
          <h3 className="annual-report-tab__empty-title">
            {pendingCount > 0 ? '분석이 완료되면 여기에 표시됩니다' : 'Annual Report가 없습니다'}
          </h3>
          <p className="annual-report-tab__empty-description">
            {pendingCount > 0
              ? '백그라운드에서 문서를 분석하고 있습니다. 잠시만 기다려주세요.'
              : 'Annual Report를 업로드하면 자동 분석하여 여기에 표시됩니다.'}
          </p>
          {pendingCount === 0 && (
            <div className="annual-report-tab__empty-hint">
              <p className="annual-report-tab__empty-hint-text">
                💡 Annual Report는 보험 계약 현황을 요약한 문서입니다.
              </p>
            </div>
          )}
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

  // 전체 선택 여부 (현재 페이지 기준)
  const isAllSelected = visibleReports.length > 0 && visibleReports.every((_, idx) => {
    const globalIndex = (safeCurrentPage - 1) * itemsPerPageNumber + idx;
    return selectedIndices.has(globalIndex);
  });

  // Annual Report 목록 있음
  return (
    <div className="annual-report-tab">
      {/* AR 파싱 진행 중 알림 */}
      {pendingCount > 0 && (
        <div className="annual-report-parsing-notice">
          <div className="parsing-notice-icon">
            <div className="parsing-spinner"></div>
          </div>
          <div className="parsing-notice-content">
            <div className="parsing-notice-title">
              Annual Report 분석 중
            </div>
            <div className="parsing-notice-description">
              {pendingCount}개의 문서를 백그라운드에서 분석하고 있습니다. 완료되면 자동으로 목록에 추가됩니다.
            </div>
            {pendingDocs.length > 0 && (
              <div className="parsing-notice-files">
                {pendingDocs.map(doc => (
                  <div key={doc.file_id} className="parsing-file-item">
                    <span className="parsing-file-name">{doc.filename}</span>
                    <span className="parsing-file-status">
                      {doc.status === 'processing' ? '분석 중...' : '대기 중...'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 삭제 버튼 (개발자 모드 전용) */}
      {isDevMode && selectedIndices.size > 0 && (
        <div className="annual-report-actions">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            title="개발자 전용 기능 (Ctrl+Shift+D)"
          >
            {isDeleting ? '삭제 중...' : `🗑️ 선택 항목 삭제 (${selectedIndices.size})`}
          </Button>
        </div>
      )}

      {/* 테이블 컨테이너 */}
      <div
        className="annual-report-table-container"
        style={{
          '--owner-column-width': `${ownerColumnWidth}px`,
          '--parsed-at-column-width': `${parsedAtColumnWidth}px`,
          '--premium-column-width': `${premiumColumnWidth}px`,
        } as React.CSSProperties}
      >
        {/* 테이블 헤더 */}
        <div className="annual-report-table-header">
          {isDevMode && (
            <div className="header-checkbox">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleSelectAll}
                aria-label="전체 선택"
              />
            </div>
          )}
          <div className="header-owner">소유주</div>
          <div className="header-issue-date">발행일</div>
          <div className="header-parsed-at">파싱일시</div>
          <div className="header-premium">총 월보험료</div>
          <div className="header-count">계약 수</div>
          <div className="header-status">상태</div>
        </div>

        {/* 테이블 바디 */}
        <div className="annual-report-table-body">
          {visibleReports.map((report) => {
            const globalIndex = reports.indexOf(report);
            const isLatest = globalIndex === 0;
            const formattedDate = report.issue_date.split('T')[0];
            const isSelected = selectedIndices.has(globalIndex);

            return (
              <div
                key={report.report_id}
                className={`annual-report-row ${isLatest ? 'annual-report-row--latest' : ''} ${isSelected ? 'annual-report-row--selected' : ''}`}
                onClick={() => handleViewReport(report)}
              >
                {isDevMode && (
                  <div className="row-checkbox" onClick={(e) => handleSelectReport(globalIndex, e)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      aria-label={`${formattedDate} 리포트 선택`}
                    />
                  </div>
                )}
                <div className="row-owner">{report.customer_name || '-'}</div>
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

      {/* Apple Confirm Modal */}
      <AppleConfirmModal
        state={confirmModal.state}
        actions={confirmModal.actions}
      />
    </div>
  );
};

export default AnnualReportTab;

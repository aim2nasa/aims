/**
 * AIMS UIX-3 Annual Report Tab
 * @since 2025-10-16
 * @version 1.0.0
 *
 * 🍎 Annual Report 탭 컴포넌트
 * - Annual Report 조회 및 표시
 * - Document-Controller-View 패턴 준수
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/shared/ui/Button';
import { Dropdown } from '@/shared/ui';
import { ContextMenu, useContextMenu, type ContextMenuSection } from '@/shared/ui/ContextMenu';
import { useToastContext } from '@/shared/ui/Toast';
import { AnnualReportModal } from '@/features/customer/components/AnnualReportModal';
import { AnnualReportApi, type AnnualReport } from '@/features/customer/api/annualReportApi';
import { api } from '@/shared/lib/api';
import { formatDate } from '@/shared/lib/timeUtils';
import { AppleConfirmModal } from '../../../../../components/DocumentViews/DocumentRegistrationView/AppleConfirmModal/AppleConfirmModal';
import { useAppleConfirmController } from '../../../../../controllers/useAppleConfirmController';
import { useDevModeStore } from '@/shared/store/useDevModeStore';
import { useCustomerSSE } from '@/shared/hooks/useCustomerSSE';
import { UserContextService } from '../../../../../components/DocumentViews/DocumentRegistrationView/services/userContextService';
import type { Customer } from '@/entities/customer/model';
import type { CustomerDocumentItem } from '@/services/DocumentService';
import { errorReporter } from '@/shared/lib/errorReporter';
import { useColumnResize, type ColumnConfig } from '@/hooks/useColumnResize';
import './AnnualReportTab.css';

// 🍎 정렬 필드 타입
type SortField = 'customer_name' | 'issue_date' | 'parsed_at' | 'total_monthly_premium' | 'contract_count' | 'status';
type SortDirection = 'asc' | 'desc';

// 백엔드 원시 응답 타입 정의
interface RawAnnualReportData {
  report_id?: string;
  issue_date?: string;  // 실패 문서는 null일 수 있음
  customer_name?: string;  // 실패 문서는 null일 수 있음
  total_monthly_premium?: number | null;  // 실패 문서는 null
  total_coverage?: number;
  contract_count?: number | null;  // 실패 문서는 null
  total_contracts?: number | null;  // 실패 문서는 null
  created_at?: string;
  uploaded_at?: string;
  parsed_at?: string | null;  // 실패/진행중 문서는 null
  file_hash?: string;
  file_id?: string;
  source_file_id?: string;  // 파일 ID (재시도용)
  status?: 'completed' | 'error' | 'processing' | 'pending';  // 파싱 상태
  error_message?: string;  // 에러 메시지
  retry_count?: number;  // 재시도 횟수 (1~3)
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
  /** 🍎 외부에서 제공하는 검색어 (CustomerFullDetailView에서 사용) */
  searchTerm?: string;
  /** 🍎 외부 검색어 변경 핸들러 */
  onSearchChange?: (term: string) => void;
}

// 🍎 페이지당 항목 수 옵션 (자동 옵션 포함)
const ITEMS_PER_PAGE_OPTIONS_BASE = [
  { value: 'auto', label: '자동' },
  { value: '10', label: '10개씩' },
  { value: '25', label: '25개씩' },
  { value: '50', label: '50개씩' },
  { value: '100', label: '100개씩' },
];

// 🍎 행 높이 상수 (CSS와 동일하게 유지)
const ROW_HEIGHT = 32;   // CSS height: 32px
const ROW_GAP = 2;       // CSS gap: 2px (행 사이 간격)
// 🍎 기본 높이값 (실제 DOM 측정이 안될 때 fallback)
const DEFAULT_TABLE_HEADER_HEIGHT = 32;
const DEFAULT_PAGINATION_HEIGHT = 26;

// 🍎 컬럼 리사이즈 설정
const ANNUAL_REPORT_COLUMNS: ColumnConfig[] = [
  { id: 'owner', minWidth: 50, maxWidth: 150 },
  { id: 'issueDate', minWidth: 70, maxWidth: 120 },
  { id: 'parsedAt', minWidth: 100, maxWidth: 180 },
  { id: 'premium', minWidth: 80, maxWidth: 180 },
  { id: 'count', minWidth: 50, maxWidth: 100 },
  { id: 'status', minWidth: 40, maxWidth: 80 }
];

// 🍎 기본 컬럼 폭 (고정값)
const DEFAULT_ISSUE_DATE_WIDTH = 80;
const DEFAULT_COUNT_WIDTH = 70;
const DEFAULT_STATUS_WIDTH = 40;

export const AnnualReportTab: React.FC<AnnualReportTabProps> = ({
  customer,
  onAnnualReportCountChange,
  refreshTrigger,
  searchTerm: externalSearchTerm,
  onSearchChange
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reports, setReports] = useState<AnnualReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🍎 검색어 상태 (외부/내부)
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const _setSearchTerm = onSearchChange ?? setInternalSearchTerm;
  // 🍎 페이지네이션 상태 ('auto' 또는 숫자)
  const [itemsPerPageMode, setItemsPerPageMode] = useState<'auto' | number>('auto');
  const [currentPage, setCurrentPage] = useState(1);
  const [containerHeight, setContainerHeight] = useState(0);
  const sectionContainerRef = useRef<HTMLDivElement>(null);
  // 삭제 기능 상태
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  // AR 파싱 대기/진행 중인 문서 상태
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);

  // 🍎 정렬 상태
  const [sortField, setSortField] = useState<SortField>('issue_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // 개발자 모드 - 전역 상태 사용
  const { isDevMode } = useDevModeStore();

  // Apple Confirm Modal 컨트롤러
  const confirmModal = useAppleConfirmController();

  // 🍎 Toast 알림
  const toast = useToastContext();

  // 🍎 AR 컨텍스트 메뉴 훅
  const reportContextMenu = useContextMenu<AnnualReport>();

  // SSE 새로고침 콜백 (pending + reports 모두 갱신)
  const handleSSERefresh = useCallback(() => {
    loadPendingDocuments();
    loadAnnualReports();
  }, []);

  // SSE 실시간 업데이트 - 통합 SSE 사용
  // HTTP/1.1 연결 제한 문제 해결을 위해 개별 SSE 대신 통합 SSE 사용
  const { isConnected: sseConnected } = useCustomerSSE(customer._id, {
    onRefreshAR: handleSSERefresh,
  }, {
    enabled: Boolean(customer._id),
  });

  // 🔄 폴링 fallback: 분석 중인 문서가 있을 때 10초마다 상태 확인
  // SSE가 끊겨도 안정적으로 업데이트
  useEffect(() => {
    if (!customer._id || pendingCount === 0) return;

    console.log(`[AnnualReportTab] 폴링 시작 - pendingCount: ${pendingCount}, SSE 연결: ${sseConnected}`);

    const pollInterval = setInterval(() => {
      console.log('[AnnualReportTab] 폴링 실행 (10초 간격)');
      loadPendingDocuments();
      loadAnnualReports();
    }, 10000); // 10초마다

    return () => {
      console.log('[AnnualReportTab] 폴링 중지');
      clearInterval(pollInterval);
    };
  }, [customer._id, pendingCount, sseConnected]);

  // 개발자 모드 OFF시 선택 초기화
  useEffect(() => {
    if (!isDevMode) {
      setSelectedIndices(new Set());
    }
  }, [isDevMode]);

  // 🍎 검색어 변경 시 첫 페이지로 이동
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // 🍎 자동 모드일 때 컨테이너 높이 기반 항목 수 계산 (ContractsTab/DocumentsTab과 동일한 DOM 측정 방식)
  // ⚠️ CustomerFullDetailView에서는 일부 요소가 display:none으로 숨겨지므로 실제 DOM 요소 높이를 측정해야 함.
  const autoCalculatedItems = useMemo(() => {
    if (containerHeight <= 0) return 10; // 기본값

    const container = sectionContainerRef.current;
    if (!container) return 10;

    // 요약 헤더 높이 측정 (CustomerFullDetailView에서는 display:none → 0)
    const summaryHeader = container.querySelector('.annual-report-tab__header') as HTMLElement | null;
    const summaryHeight = summaryHeader ? summaryHeader.getBoundingClientRect().height : 0;

    // 테이블 헤더 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const tableHeader = container.querySelector('.annual-report-table-header') as HTMLElement | null;
    const measuredTableHeaderHeight = tableHeader ? tableHeader.getBoundingClientRect().height : 0;
    const tableHeaderHeight = measuredTableHeaderHeight > 0 ? measuredTableHeaderHeight : DEFAULT_TABLE_HEADER_HEIGHT;

    // 페이지네이션 높이 측정 (⚠️ 0이면 기본값 사용 - 렌더링 전 상태 대응)
    const pagination = container.querySelector('.annual-report-pagination') as HTMLElement | null;
    const measuredPaginationHeight = pagination ? pagination.getBoundingClientRect().height : 0;
    const paginationHeight = measuredPaginationHeight > 0 ? measuredPaginationHeight : DEFAULT_PAGINATION_HEIGHT;

    // 컨테이너 gap 측정 (요약 헤더가 보일 때만 적용)
    const containerStyle = getComputedStyle(container);
    const gap = parseFloat(containerStyle.gap) || 0;

    // fixedHeight 계산: 실제 보이는 요소들의 높이 합
    const fixedHeight = summaryHeight + (summaryHeight > 0 ? gap : 0) + tableHeaderHeight + paginationHeight;
    const availableHeight = containerHeight - fixedHeight;

    // N개 행의 총 높이 = N * ROW_HEIGHT + (N-1) * ROW_GAP
    // 이를 풀면: N <= (availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)
    const maxItems = Math.max(1, Math.floor((availableHeight + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)));

    // 디버그 로그 (개발 모드에서만)
    if (import.meta.env.DEV) {
      console.log('[AnnualReportTab] 자동 페이지네이션 계산:', {
        containerHeight,
        summaryHeight,
        tableHeaderHeight: `${measuredTableHeaderHeight} → ${tableHeaderHeight}`,
        paginationHeight: `${measuredPaginationHeight} → ${paginationHeight}`,
        gap,
        fixedHeight,
        availableHeight,
        maxItems
      });
    }

    return maxItems;
  }, [containerHeight]);

  // 🍎 실제 적용되는 페이지당 항목 수
  const itemsPerPage = itemsPerPageMode === 'auto' ? autoCalculatedItems : itemsPerPageMode;

  // 🍎 섹션 컨테이너 높이 측정 (ResizeObserver)
  useEffect(() => {
    const container = sectionContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // 🍎 드롭다운 옵션 (자동 모드일 때 계산된 값 표시)
  const itemsPerPageOptions = useMemo(() => {
    return ITEMS_PER_PAGE_OPTIONS_BASE.map(opt => {
      if (opt.value === 'auto') {
        return {
          value: 'auto',
          label: itemsPerPageMode === 'auto' ? `자동(${autoCalculatedItems})` : '자동'
        };
      }
      return opt;
    });
  }, [itemsPerPageMode, autoCalculatedItems]);

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

  // 🍎 컬럼 리사이즈: 기본 폭 계산
  const defaultColumnWidths = useMemo(() => ({
    owner: ownerColumnWidth,
    issueDate: DEFAULT_ISSUE_DATE_WIDTH,
    parsedAt: parsedAtColumnWidth,
    premium: premiumColumnWidth,
    count: DEFAULT_COUNT_WIDTH,
    status: DEFAULT_STATUS_WIDTH,
  }), [ownerColumnWidth, parsedAtColumnWidth, premiumColumnWidth])

  // 🍎 컬럼 리사이즈 훅
  const {
    columnWidths,
    isResizing,
    getResizeHandleProps,
    wasJustResizing
  } = useColumnResize({
    storageKey: 'annual-report-tab',
    columns: ANNUAL_REPORT_COLUMNS,
    defaultWidths: defaultColumnWidths
  })

  // Annual Report 목록 로드
  useEffect(() => {
    loadAnnualReports();
    loadPendingDocuments();
  }, [customer._id, refreshTrigger]);

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
      errorReporter.reportApiError(err as Error, { component: 'AnnualReportTab.loadPendingDocuments', payload: { customerId: customer._id } });
    }
  };

  const loadAnnualReports = async () => {
    console.log('[AnnualReportTab] 🔴 loadAnnualReports 시작');
    setIsLoading(true);
    setError(null);

    try {
      const userId = UserContextService.getContext().identifierValue;
      console.log('[AnnualReportTab] 🔴 API 호출 시작:', customer._id);

      const response = await AnnualReportApi.getAnnualReports(customer._id, userId, 20);
      console.log('[AnnualReportTab] 🔴 API 응답:', response);

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

          // 🔥 status 필드 처리: error/processing 상태는 null 값 유지
          const status = rawData.status || 'completed';
          const isFailedOrProcessing = status === 'error' || status === 'processing';

          return {
            report_id: rawData.file_id || rawData.source_file_id || `report_${rawData.parsed_at}`,
            issue_date: rawData.issue_date || '',
            // ⚠️ customer_name이 없으면 고객명으로 fallback하지 않음
            // AR 문서의 소유주는 고객과 다를 수 있음 (예: 가족의 AR 문서)
            customer_name: rawData.customer_name || '',
            // 실패/진행중 문서는 null 유지, 완료된 문서는 0으로 fallback
            total_monthly_premium: isFailedOrProcessing ? rawData.total_monthly_premium : (rawData.total_monthly_premium || 0),
            total_coverage: rawData.total_coverage || 0,
            contract_count: isFailedOrProcessing ? (rawData.total_contracts ?? rawData.contract_count) : (rawData.total_contracts || rawData.contract_count || 0),
            contracts: transformedContracts,
            source_file_id: rawData.source_file_id || rawData.file_id || '',
            created_at: rawData.uploaded_at || '',
            parsed_at: isFailedOrProcessing ? rawData.parsed_at : (rawData.parsed_at || ''),
            status: status,
            error_message: rawData.error_message,
            retry_count: rawData.retry_count  // 재시도 횟수
          };
        });

        setReports(transformedReports);
      } else {
        setError(response.error || 'Annual Report 조회에 실패했습니다.');
      }
    } catch (err) {
      console.error('[AnnualReportTab] Annual Report 조회 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'AnnualReportTab.loadAnnualReports', payload: { customerId: customer._id } });
      setError(err instanceof Error ? err.message : 'Annual Report 조회 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReport = (report: AnnualReport) => {
    // 실패/진행중 문서는 모달 열지 않음
    if (report.status === 'error' || report.status === 'processing') {
      return;
    }
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  // 🔄 AR 파싱 재시도 핸들러
  const handleRetryParsing = async (report: AnnualReport, event: React.MouseEvent) => {
    event.stopPropagation();  // 행 클릭 이벤트 방지

    const fileId = report.source_file_id;
    if (!fileId) {
      console.error('[AnnualReportTab] 재시도 불가: file_id 없음');
      errorReporter.reportApiError(new Error('AR 재시도 불가: file_id 없음'), { component: 'AnnualReportTab.handleRetryParsing.validation', payload: { reportId: report.report_id } });
      await confirmModal.actions.openModal({
        title: '재시도 불가',
        message: '파일 정보를 찾을 수 없습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
      return;
    }

    try {
      const result = await AnnualReportApi.retryParsing(fileId);

      if (result.success) {
        await confirmModal.actions.openModal({
          title: '재시도 시작',
          message: 'AR 파싱 재시도가 시작되었습니다.\n잠시 후 목록이 업데이트됩니다.',
          confirmText: '확인',
          showCancel: false,
          iconType: 'success'
        });
        // 목록 새로고침
        loadAnnualReports();
        loadPendingDocuments();
      } else {
        await confirmModal.actions.openModal({
          title: '재시도 실패',
          message: result.message,
          confirmText: '확인',
          showCancel: false,
          iconType: 'error'
        });
      }
    } catch (err) {
      console.error('[AnnualReportTab] 재시도 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'AnnualReportTab.handleRetry', payload: { fileId } });
      await confirmModal.actions.openModal({
        title: '오류',
        message: '재시도 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
    }
  };

  // 🍎 정렬 핸들러
  const handleSort = useCallback((field: SortField) => {
    // 리사이즈 직후 클릭은 무시 (정렬 방지)
    if (wasJustResizing()) return;

    if (sortField === field) {
      // 같은 필드 클릭 시 방향 토글
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭 시 해당 필드로 변경, 기본 내림차순
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField, wasJustResizing]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  // 🍎 AR 우클릭 컨텍스트 메뉴 열기
  const handleReportContextMenu = useCallback((e: React.MouseEvent, report: AnnualReport) => {
    reportContextMenu.open(e, report);
  }, [reportContextMenu]);

  // 🍎 보험계약 등록 핸들러
  const handleRegisterContracts = useCallback(async (report: AnnualReport) => {
    const confirmed = await confirmModal.actions.openModal({
      title: '보험계약 등록',
      message: `"${report.customer_name}" 님의 AR (발행일: ${formatDate(report.issue_date)})에서\n${report.contract_count}건의 계약 정보를 보험계약 탭에 등록합니다.`,
      confirmText: '등록',
      cancelText: '취소',
      showCancel: true,
      iconType: 'info'
    });

    if (!confirmed) return;

    try {
      const result = await AnnualReportApi.registerARContracts(
        customer._id,
        report.issue_date || '',
        report.customer_name
      );

      if (result.success) {
        if (result.duplicate) {
          // 이미 등록된 경우 - 토스트 알림 (3초)
          toast.info('이미 등록된 Annual Report입니다', 3000);
        } else {
          // 등록 성공
          toast.success('보험계약이 등록되었습니다', 3000);
        }
      } else {
        toast.error(result.message || '보험계약 등록에 실패했습니다');
      }
    } catch (err) {
      console.error('[AnnualReportTab] 보험계약 등록 오류:', err);
      toast.error('보험계약 등록 중 오류가 발생했습니다');
    }
  }, [confirmModal.actions, customer._id, toast]);

  // 🍎 단일 AR 삭제 핸들러
  const handleDeleteReport = useCallback(async (report: AnnualReport) => {
    // 보험계약 탭에 등록된 AR인 경우 추가 경고
    const contractWarning = report.registered_at
      ? '\n\n⚠️ 이 AR은 보험계약 탭에 등록되어 있습니다.\n함께 삭제됩니다.'
      : '';

    const confirmed = await confirmModal.actions.openModal({
      title: 'Annual Report 삭제',
      message: `"${report.customer_name}" 님의 AR (발행일: ${formatDate(report.issue_date)})을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.${contractWarning}`,
      confirmText: '삭제',
      cancelText: '취소',
      confirmStyle: 'destructive',
      showCancel: true,
      iconType: 'warning'
    });

    if (!confirmed) return;

    const globalIndex = reports.indexOf(report);
    if (globalIndex === -1) {
      console.error('[AnnualReportTab] 삭제할 AR을 찾을 수 없습니다');
      return;
    }

    setIsDeleting(true);
    try {
      const userId = UserContextService.getContext().identifierValue;
      const result = await AnnualReportApi.deleteAnnualReports(
        customer._id,
        userId,
        [globalIndex]
      );

      setIsDeleting(false);

      if (result.success) {
        // 목록 새로고침
        await Promise.all([
          loadAnnualReports(),
          loadPendingDocuments()
        ]);

        await confirmModal.actions.openModal({
          title: '완료',
          message: 'Annual Report가 삭제되었습니다.',
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
      console.error('[AnnualReportTab] 삭제 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'AnnualReportTab.handleDeleteReport', payload: { customerId: customer._id } });
      await confirmModal.actions.openModal({
        title: '오류',
        message: '삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
    }
  }, [reports, customer._id, confirmModal.actions]);

  // 체크박스 전체 선택/해제
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const allIndices = new Set(visibleReports.map((_, idx) => (currentPage - 1) * itemsPerPage + idx));
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
    // 보험계약 탭에 등록된 AR이 포함되어 있는지 확인
    const hasRegisteredAR = Array.from(selectedIndices).some(idx => reports[idx]?.registered_at);
    const contractWarning = hasRegisteredAR
      ? '\n\n⚠️ 보험계약 탭에 등록된 AR이 포함되어 있습니다.\n함께 삭제됩니다.'
      : '';


    const confirmed = await confirmModal.actions.openModal({
      title: 'Annual Report 삭제',
      message: `${selectedIndices.size}개 항목을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.${contractWarning}`,
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
        // 목록 새로고침 (pending + reports 모두)
        await Promise.all([
          loadAnnualReports(),
          loadPendingDocuments()
        ]);

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
      console.error('[AnnualReportTab] 삭제 오류:', err);
      errorReporter.reportApiError(err as Error, { component: 'AnnualReportTab.handleDeleteSelected', payload: { customerId: customer._id, count: selectedIndices.size } });
      await confirmModal.actions.openModal({
        title: '오류',
        message: '삭제 중 오류가 발생했습니다.',
        confirmText: '확인',
        showCancel: false,
        iconType: 'error'
      });
    }
  };

  // 🍎 검색어로 필터링된 리포트 목록
  const filteredReports = useMemo(() => {
    if (!searchTerm.trim()) return reports;

    const term = searchTerm.toLowerCase().trim();
    return reports.filter(report => {
      // 소유주(customer_name), 발행일(issue_date), 파싱일시(parsed_at)로 검색
      const customerName = (report.customer_name || '').toLowerCase();
      const issueDate = formatDate(report.issue_date).toLowerCase();
      const parsedAt = AnnualReportApi.formatDateTime(report.parsed_at).toLowerCase();

      return customerName.includes(term) ||
             issueDate.includes(term) ||
             parsedAt.includes(term);
    });
  }, [reports, searchTerm]);

  // 🍎 정렬된 리포트 목록 (hooks는 조건부 반환 이전에 호출해야 함)
  const sortedReports = useMemo(() => {
    return [...filteredReports].sort((a, b) => {
      let comparison = 0;
      const aIndex = reports.indexOf(a);
      const bIndex = reports.indexOf(b);

      switch (sortField) {
        case 'customer_name':
          comparison = (a.customer_name || '').localeCompare(b.customer_name || '', 'ko');
          break;
        case 'issue_date':
          comparison = new Date(a.issue_date || 0).getTime() - new Date(b.issue_date || 0).getTime();
          break;
        case 'parsed_at':
          comparison = new Date(a.parsed_at || 0).getTime() - new Date(b.parsed_at || 0).getTime();
          break;
        case 'total_monthly_premium':
          comparison = (a.total_monthly_premium || 0) - (b.total_monthly_premium || 0);
          break;
        case 'contract_count':
          comparison = (a.contract_count || 0) - (b.contract_count || 0);
          break;
        case 'status':
          // status는 최신(index 0)인지 여부로 정렬
          comparison = aIndex - bIndex;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredReports, reports, sortField, sortDirection]);

  // 🍎 AR 컨텍스트 메뉴 섹션 정의
  const reportContextMenuSections: ContextMenuSection[] = useMemo(() => {
    const report = reportContextMenu.targetData;
    if (!report) return [];

    const sections: ContextMenuSection[] = [];
    const actionItems: ContextMenuSection['items'] = [];

    // 완료 상태: 상세 보기, 보험계약 등록
    if (report.status === 'completed') {
      actionItems.push({
        id: 'view',
        label: '상세 보기',
        onClick: () => handleViewReport(report),
      });
      actionItems.push({
        id: 'register-contracts',
        label: '보험계약 등록',
        onClick: () => handleRegisterContracts(report),
      });
    }

    // 에러 상태: 재시도
    if (report.status === 'error') {
      actionItems.push({
        id: 'retry',
        label: '재시도',
        onClick: (e?: React.MouseEvent) => {
          if (e) handleRetryParsing(report, e);
        },
      });
    }

    if (actionItems.length > 0) {
      sections.push({ id: 'actions', items: actionItems });
    }

    // 삭제 섹션 (항상)
    sections.push({
      id: 'danger',
      items: [{
        id: 'delete',
        label: '삭제',
        danger: true,
        onClick: () => handleDeleteReport(report),
      }]
    });

    return sections;
  }, [reportContextMenu.targetData, handleViewReport, handleRegisterContracts, handleDeleteReport]);

  // 🍎 페이지네이션 계산 (hooks 이후에 배치)
  const itemsPerPageNumber = itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(sortedReports.length / itemsPerPageNumber));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // 현재 페이지에 표시할 리포트들
  const visibleReports = sortedReports.slice(
    (safeCurrentPage - 1) * itemsPerPageNumber,
    safeCurrentPage * itemsPerPageNumber
  );

  // 전체 선택 여부 (현재 페이지 기준)
  const isAllSelected = visibleReports.length > 0 && visibleReports.every((_, idx) => {
    const globalIndex = (safeCurrentPage - 1) * itemsPerPageNumber + idx;
    return selectedIndices.has(globalIndex);
  });

  // 로딩 상태
  if (isLoading) {
    return (
      <div ref={sectionContainerRef} className="annual-report-tab">
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
      <div ref={sectionContainerRef} className="annual-report-tab">
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
      <div ref={sectionContainerRef} className="annual-report-tab">
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

  // 🍎 페이지당 항목 수 변경 ('auto' 또는 숫자)
  const handleItemsPerPageChange = (value: string) => {
    if (import.meta.env.DEV) {
      console.log('[AnnualReportTab] handleItemsPerPageChange 호출:', { value, currentMode: itemsPerPageMode })
    }
    if (value === 'auto') {
      setItemsPerPageMode('auto');
    } else {
      setItemsPerPageMode(Number(value));
    }
    setCurrentPage(1);
  };

  // Annual Report 목록 있음
  return (
    <div ref={sectionContainerRef} className="annual-report-tab">
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
        className={`annual-report-table-container${isResizing ? ' is-resizing' : ''}`}
        style={{
          '--owner-column-width': `${columnWidths['owner'] || ownerColumnWidth}px`,
          '--issue-date-column-width': `${columnWidths['issueDate'] || DEFAULT_ISSUE_DATE_WIDTH}px`,
          '--parsed-at-column-width': `${columnWidths['parsedAt'] || parsedAtColumnWidth}px`,
          '--premium-column-width': `${columnWidths['premium'] || premiumColumnWidth}px`,
          '--count-column-width': `${columnWidths['count'] || DEFAULT_COUNT_WIDTH}px`,
          '--status-column-width': `${columnWidths['status'] || DEFAULT_STATUS_WIDTH}px`,
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
          <div
            className="header-owner annual-report-table__sortable resizable-header"
            onClick={() => handleSort('customer_name')}
          >
            <span className="annual-report-table__header-content">
              소유주
              <span className={`annual-report-table__sort-icon ${sortField === 'customer_name' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'customer_name' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('owner')} />
          </div>
          <div
            className="header-issue-date annual-report-table__sortable resizable-header"
            onClick={() => handleSort('issue_date')}
          >
            <span className="annual-report-table__header-content">
              발행일
              <span className={`annual-report-table__sort-icon ${sortField === 'issue_date' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'issue_date' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('issueDate')} />
          </div>
          <div
            className="header-parsed-at annual-report-table__sortable resizable-header"
            onClick={() => handleSort('parsed_at')}
          >
            <span className="annual-report-table__header-content">
              파싱일시
              <span className={`annual-report-table__sort-icon ${sortField === 'parsed_at' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'parsed_at' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('parsedAt')} />
          </div>
          <div
            className="header-premium annual-report-table__sortable resizable-header"
            onClick={() => handleSort('total_monthly_premium')}
          >
            <span className="annual-report-table__header-content">
              총 월보험료
              <span className={`annual-report-table__sort-icon ${sortField === 'total_monthly_premium' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'total_monthly_premium' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('premium')} />
          </div>
          <div
            className="header-count annual-report-table__sortable resizable-header"
            onClick={() => handleSort('contract_count')}
          >
            <span className="annual-report-table__header-content">
              계약 수
              <span className={`annual-report-table__sort-icon ${sortField === 'contract_count' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'contract_count' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('count')} />
          </div>
          <div
            className="header-status annual-report-table__sortable resizable-header"
            onClick={() => handleSort('status')}
          >
            <span className="annual-report-table__header-content">
              상태
              <span className={`annual-report-table__sort-icon ${sortField === 'status' ? 'annual-report-table__sort-icon--active' : ''}`}>
                {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : '▼'}
              </span>
            </span>
            <div {...getResizeHandleProps('status')} />
          </div>
        </div>

        {/* 테이블 바디 */}
        <div className="annual-report-table-body">
          {visibleReports.map((report) => {
            const globalIndex = reports.indexOf(report);
            const formattedDate = formatDate(report.issue_date);
            const isSelected = selectedIndices.has(globalIndex);
            const isError = report.status === 'error';
            const isProcessing = report.status === 'processing';
            const isPending = report.status === 'pending';

            return (
              <div
                key={report.report_id}
                className={`annual-report-row ${isSelected ? 'annual-report-row--selected' : ''} ${isError ? 'annual-report-row--error' : ''} ${isProcessing ? 'annual-report-row--processing' : ''} ${isPending ? 'annual-report-row--pending' : ''}`}
                onClick={() => handleViewReport(report)}
                onContextMenu={(e) => handleReportContextMenu(e, report)}
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
                <div className="row-issue-date">{formattedDate || '-'}</div>
                <div className="row-parsed-at">
                  {report.parsed_at ? AnnualReportApi.formatDateTime(report.parsed_at) : '-'}
                </div>
                <div className="row-premium">
                  {report.total_monthly_premium != null ? AnnualReportApi.formatCurrency(report.total_monthly_premium) : '-'}
                </div>
                <div className="row-count">
                  {report.contract_count != null ? `${report.contract_count}건` : '-'}
                </div>
                <div className="row-status">
                  {/* 에러 상태: 실패 배지 + 재시도 버튼 */}
                  {isError && (
                    <>
                      <span
                        className="status-badge status-badge--error"
                        title={report.error_message || '파싱 실패'}
                      >
                        실패{report.retry_count ? ` (${report.retry_count}/3)` : ''}
                      </span>
                      <button
                        type="button"
                        className="retry-button"
                        onClick={(e) => handleRetryParsing(report, e)}
                        title={`AR 파싱 재시도\n${report.error_message || ''}`}
                      >
                        재시도
                      </button>
                    </>
                  )}
                  {/* 처리중 상태: 스피너 + 처리중 배지 + [1/3] */}
                  {isProcessing && (
                    <>
                      <span className="status-badge status-badge--processing">
                        <span className="status-spinner"></span>
                        처리중
                      </span>
                      <span className="retry-indicator">[{report.retry_count || 1}/3]</span>
                    </>
                  )}
                  {/* 대기중 상태: 대기중 배지 + [1/3] */}
                  {isPending && (
                    <>
                      <span className="status-badge status-badge--pending">
                        대기중
                      </span>
                      <span className="retry-indicator">[{report.retry_count || 1}/3]</span>
                    </>
                  )}
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
            value={itemsPerPageMode === 'auto' ? 'auto' : String(itemsPerPageMode)}
            options={itemsPerPageOptions}
            onChange={handleItemsPerPageChange}
            aria-label="페이지당 항목 수"
            width={100}
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

      {/* 🍎 AR 컨텍스트 메뉴 */}
      <ContextMenu
        visible={reportContextMenu.isOpen}
        position={reportContextMenu.position}
        sections={reportContextMenuSections}
        onClose={reportContextMenu.close}
      />

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

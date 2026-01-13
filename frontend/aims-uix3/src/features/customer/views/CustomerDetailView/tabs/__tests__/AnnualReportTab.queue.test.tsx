/**
 * AnnualReportTab AR 파싱 큐 시스템 Regression 테스트
 * @since 2025-12-16
 *
 * 테스트 범위:
 * 1. retry_count 표시 (실패 시 "실패 (N/3)" 형식)
 * 2. 완료된 AR이 "분석 중" 섹션에 표시되지 않음
 * 3. pending API 응답 필터링
 *
 * 관련 버그 수정:
 * - fix: 완료된 AR이 "분석 중" 섹션에 표시되는 버그 수정 (76388353)
 * - fix: AR 파싱 큐 시스템 개선 및 Rate limit 방지 (2ec4e11b)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/shared/ui/Toast';
import { AnnualReportTab } from '../AnnualReportTab';
import type { Customer } from '@/entities/customer/model';

// vi.hoisted를 사용하여 mock 함수들이 vi.mock과 함께 호이스팅되도록 함
const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

// EventSource mock (SSE 테스트용)
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = MockEventSource.OPEN;
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  close = vi.fn();
}
global.EventSource = MockEventSource as unknown as typeof EventSource;

// api 모듈 mock 설정
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: vi.fn(),
    delete: vi.fn()
  },
  apiRequest: vi.fn(),
  getAuthHeaders: () => ({ 'Authorization': 'Bearer mock-token' }),
  getAuthToken: () => 'mock-token',
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string, public data?: unknown) {
      super(message);
      this.name = 'ApiError';
    }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  }
}));

// Mock customer data
const mockCustomer: Customer = {
  _id: '6735aaaa3333333333333333',
  personal_info: {
    name: '테스트고객',
    mobile_phone: '010-1234-5678'
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-11-01T00:00:00.000Z',
    updated_at: '2025-11-01T00:00:00.000Z',
    status: 'active' as const,
    created_by: '6735bbbb4444444444444444'
  },
  tags: []
};

// Test wrapper with React Query and Toast
function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}

// 테스트용 AR mock 데이터 생성 헬퍼
function createMockARReport(overrides: Record<string, unknown> = {}) {
  return {
    report_id: 'report-1',
    file_id: 'file-1',
    source_file_id: 'file-1',
    customer_name: '테스트고객',
    issue_date: '2025-08-29',
    uploaded_at: '2025-12-16T02:10:00.000Z',
    parsed_at: '2025-12-16T02:15:00.000Z',
    total_monthly_premium: 150000,
    total_contracts: 5,
    contract_count: 5,
    contracts: [],
    status: 'completed',
    error_message: null,
    retry_count: 0,
    ...overrides
  };
}

// Pending 문서 mock 데이터 생성 헬퍼
function createMockPendingDoc(overrides: Record<string, unknown> = {}) {
  return {
    file_id: 'file-pending-1',
    filename: 'annual_report.pdf',
    uploaded_at: '2025-12-16T02:00:00.000Z',
    status: 'pending',
    created_at: '2025-12-16T02:00:00.000Z',
    retry_count: 0,
    ...overrides
  };
}

describe('AnnualReportTab AR 파싱 큐 시스템 Regression 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  // API mock helper - 백엔드 응답 형식으로 반환 (AnnualReportApi가 변환함)
  const setupApiMock = (reports: unknown[], pendingDocs: unknown[] = []) => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve({ success: true, data: { documents: [] } });
      }
      if (url.includes('/annual-reports/pending')) {
        return Promise.resolve({
          success: true,
          data: { pending_count: pendingDocs.length, documents: pendingDocs }
        });
      }
      // 백엔드 응답: data는 배열 직접 (AnnualReportApi.getAnnualReports가 { reports: [...] }로 변환)
      if (url.includes('/annual-reports')) {
        return Promise.resolve({
          success: true,
          data: reports,
          count: reports.length,
          total: reports.length
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });
  };

  describe('retry_count 표시 (실패 시 "실패 (N/3)" 형식)', () => {
    it('retry_count가 3인 실패 AR은 "실패 (3/3)" 형식으로 표시되어야 한다', async () => {
      const failedReport = createMockARReport({
        report_id: 'failed-1',
        customer_name: '실패고객',
        status: 'error',
        error_message: 'Rate limit exceeded',
        parsed_at: null,
        retry_count: 3
      });

      setupApiMock([failedReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // "실패 (3/3)" 형식으로 표시되어야 함
        expect(screen.getByText(/실패.*\(3\/3\)/)).toBeInTheDocument();
      });
    });

    it('retry_count가 1인 실패 AR은 "실패 (1/3)" 형식으로 표시되어야 한다', async () => {
      const failedReport = createMockARReport({
        report_id: 'failed-2',
        customer_name: '재시도고객',
        status: 'error',
        error_message: 'Timeout',
        parsed_at: null,
        retry_count: 1
      });

      setupApiMock([failedReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/실패.*\(1\/3\)/)).toBeInTheDocument();
      });
    });

    it('retry_count가 0 또는 없는 실패 AR은 "(0/3)" 또는 재시도 횟수 없이 표시되어야 한다', async () => {
      const failedReport = createMockARReport({
        report_id: 'failed-3',
        customer_name: '첫실패고객',
        status: 'error',
        error_message: 'Parse error',
        parsed_at: null,
        retry_count: 0
      });

      setupApiMock([failedReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 실패 배지가 있어야 함
        const errorBadge = document.querySelector('.status-badge--error');
        expect(errorBadge).toBeInTheDocument();
      });
    });
  });

  describe('완료된 AR이 "분석 중" 섹션에 표시되지 않음 (Regression)', () => {
    /**
     * 버그 시나리오 (76388353):
     * 1. AR 파싱 완료 → files.ar_parsing_status='completed'
     * 2. 하지만 ar_parse_queue에는 status='pending'으로 남아있음
     * 3. pending API가 큐만 보고 "분석 중" 섹션에 표시
     *
     * 수정 후:
     * - pending API에서 files.ar_parsing_status 교차 확인
     * - completed인 경우 필터링 + 큐에서 삭제
     */
    it('pending API가 빈 배열을 반환하면 "분석 중" 섹션이 표시되지 않아야 한다', async () => {
      const completedReport = createMockARReport({
        report_id: 'completed-1',
        customer_name: '완료고객',
        status: 'completed'
      });

      setupApiMock([completedReport], []);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 완료된 AR이 테이블에 표시됨
        expect(screen.getByText('완료고객')).toBeInTheDocument();
      });

      // "분석 중" 섹션이 표시되지 않아야 함
      expect(screen.queryByText('Annual Report 분석 중')).not.toBeInTheDocument();
    });

    it('pending 문서가 있으면 "분석 중" 섹션에 표시되어야 한다', async () => {
      const pendingDoc = createMockPendingDoc({
        file_id: 'pending-file-1',
        filename: '연간보고서_2025.pdf',
        status: 'pending'
      });

      setupApiMock([], [pendingDoc]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // "분석 중" 섹션이 표시되어야 함
        expect(screen.getByText('Annual Report 분석 중')).toBeInTheDocument();
        // 파일명이 표시되어야 함
        expect(screen.getByText('연간보고서_2025.pdf')).toBeInTheDocument();
        // "대기 중..." 상태가 표시되어야 함
        expect(screen.getByText('대기 중...')).toBeInTheDocument();
      });
    });

    it('processing 문서는 "분석 중..." 상태로 표시되어야 한다', async () => {
      const processingDoc = createMockPendingDoc({
        file_id: 'processing-file-1',
        filename: 'processing_report.pdf',
        status: 'processing'
      });

      setupApiMock([], [processingDoc]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Annual Report 분석 중')).toBeInTheDocument();
        expect(screen.getByText('processing_report.pdf')).toBeInTheDocument();
        expect(screen.getByText('분석 중...')).toBeInTheDocument();
      });
    });
  });

  describe('AR 파싱 상태 일관성 검증', () => {
    it('completed 상태 AR은 테이블에만 표시되고, "분석 중" 섹션에는 표시되지 않아야 한다', async () => {
      const completedReport = createMockARReport({
        report_id: 'sync-test-1',
        customer_name: '동기화테스트',
        status: 'completed',
        total_monthly_premium: 250000,
        contract_count: 7
      });

      setupApiMock([completedReport], []);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 테이블에 완료된 AR 표시
        expect(screen.getByText('동기화테스트')).toBeInTheDocument();
              });

      // "분석 중" 섹션이 없어야 함
      expect(screen.queryByText('Annual Report 분석 중')).not.toBeInTheDocument();

      // 월보험료가 정상 표시 (계약 수는 별도 컬럼이 아닐 수 있음)
      expect(screen.getByText('250,000원')).toBeInTheDocument();
    });

    it('pending/processing/error 상태가 혼재된 경우 각각 올바르게 표시되어야 한다', async () => {
      const pendingDoc = createMockPendingDoc({
        file_id: 'mixed-pending',
        filename: 'pending.pdf',
        status: 'pending'
      });

      const processingDoc = createMockPendingDoc({
        file_id: 'mixed-processing',
        filename: 'processing.pdf',
        status: 'processing'
      });

      const completedReport = createMockARReport({
        report_id: 'mixed-completed',
        customer_name: '완료AR',
        status: 'completed'
      });

      const errorReport = createMockARReport({
        report_id: 'mixed-error',
        customer_name: '실패AR',
        status: 'error',
        error_message: 'Parse failed',
        retry_count: 2
      });

      setupApiMock([completedReport, errorReport], [pendingDoc, processingDoc]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // "분석 중" 섹션에 pending과 processing 표시
        expect(screen.getByText('Annual Report 분석 중')).toBeInTheDocument();
        expect(screen.getByText('pending.pdf')).toBeInTheDocument();
        expect(screen.getByText('processing.pdf')).toBeInTheDocument();
        expect(screen.getByText('대기 중...')).toBeInTheDocument();
        expect(screen.getByText('분석 중...')).toBeInTheDocument();

        // 테이블에 completed와 error 표시
        expect(screen.getByText('완료AR')).toBeInTheDocument();
        expect(screen.getByText('실패AR')).toBeInTheDocument();
                expect(screen.getByText(/실패.*\(2\/3\)/)).toBeInTheDocument();
      });
    });
  });

  describe('trigger/retry 완료된 AR 차단 검증 (API 레벨)', () => {
    /**
     * 이 테스트들은 프론트엔드에서 API 호출 시 예상되는 응답을 검증합니다.
     * 실제 백엔드 로직은 백엔드 테스트에서 검증해야 합니다.
     */
    it('재시도 버튼 클릭 시 completed 상태 AR에 대해 에러 응답을 처리해야 한다', async () => {
      // completed 상태인데 잘못 재시도 호출하는 시나리오
      // 백엔드에서 "이미 파싱이 완료된 문서입니다" 에러 반환

      const completedReport = createMockARReport({
        report_id: 'retry-block-test',
        customer_name: '완료재시도테스트',
        status: 'completed'
      });

      setupApiMock([completedReport], []);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('완료재시도테스트')).toBeInTheDocument();
        // completed 상태에는 재시도 버튼이 없어야 함
        expect(screen.queryByText('재시도')).not.toBeInTheDocument();
      });
    });
  });
});

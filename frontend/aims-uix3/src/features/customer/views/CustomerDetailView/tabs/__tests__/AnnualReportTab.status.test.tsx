/**
 * AnnualReportTab 파싱 상태 표시 테스트
 * @since 2025-12-16
 *
 * 테스트 범위:
 * 1. pending 상태 표시 (대기중 배지)
 * 2. processing 상태 표시 (처리중 배지 + 스피너)
 * 3. error 상태 표시 (실패 배지 + 재시도 버튼)
 * 4. completed 상태 표시 (최신 배지)
 * 5. AR 문서 등록 시 즉시 Annual Report 탭에 표시
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnnualReportTab } from '../AnnualReportTab';
import type { Customer } from '@/entities/customer/model';

// vi.hoisted를 사용하여 mock 함수들이 vi.mock과 함께 호이스팅되도록 함
const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

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
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string, public data?: unknown) {
      super(message);
      this.name = 'ApiError';
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

// Test wrapper with React Query
function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
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
    ...overrides
  };
}

describe('AnnualReportTab 파싱 상태 표시', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
  });

  // Documents API mock helper
  const mockDocumentsApi = (documents: unknown[] = []) => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve({
          success: true,
          data: { documents }
        });
      }
      // Annual Reports API (annual_report_api 서버)
      if (url.includes('/annual-reports')) {
        return Promise.resolve({
          success: true,
          data: [],
          count: 0,
          total: 0
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });
  };

  // Annual Reports API mock helper
  const mockAnnualReportsApi = (reports: unknown[]) => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve({
          success: true,
          data: { documents: [] }
        });
      }
      // Annual Reports API
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

  describe('pending 상태 (대기중)', () => {
    it('pending 상태인 AR은 "대기중" 배지를 표시해야 한다', async () => {
      const pendingReport = createMockARReport({
        report_id: 'pending-1',
        customer_name: '대기고객',
        status: 'pending',
        parsed_at: null,
        total_monthly_premium: null,
        contract_count: null
      });

      mockAnnualReportsApi([pendingReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('대기중')).toBeInTheDocument();
      });
    });

    it('pending 상태인 AR은 월보험료가 "-"로 표시되어야 한다', async () => {
      const pendingReport = createMockARReport({
        status: 'pending',
        parsed_at: null,
        total_monthly_premium: null,
        contract_count: null
      });

      mockAnnualReportsApi([pendingReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('대기중')).toBeInTheDocument();
      });

      // pending 상태는 값이 null이므로 "-"로 표시
      const cells = screen.getAllByText('-');
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  describe('processing 상태 (처리중)', () => {
    it('processing 상태인 AR은 "처리중" 배지를 표시해야 한다', async () => {
      const processingReport = createMockARReport({
        status: 'processing',
        parsed_at: null,
        total_monthly_premium: null
      });

      mockAnnualReportsApi([processingReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('처리중')).toBeInTheDocument();
      });
    });

    it('processing 상태는 스피너를 포함해야 한다', async () => {
      const processingReport = createMockARReport({
        status: 'processing',
        parsed_at: null
      });

      mockAnnualReportsApi([processingReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        const processingBadge = screen.getByText('처리중').closest('.status-badge--processing');
        expect(processingBadge).toBeInTheDocument();
        expect(processingBadge?.querySelector('.status-spinner')).toBeInTheDocument();
      });
    });
  });

  describe('error 상태 (실패)', () => {
    it('error 상태인 AR은 "실패" 배지를 표시해야 한다', async () => {
      const errorReport = createMockARReport({
        status: 'error',
        error_message: 'API 한도 초과',
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('실패')).toBeInTheDocument();
      });
    });

    it('error 상태인 AR은 재시도 버튼을 표시해야 한다', async () => {
      const errorReport = createMockARReport({
        status: 'error',
        error_message: 'timeout',
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('재시도')).toBeInTheDocument();
      });
    });

    it('error 상태인 AR은 에러 원인 요약을 표시해야 한다', async () => {
      const errorReport = createMockARReport({
        status: 'error',
        error_message: 'Rate limit exceeded',
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Rate limit -> "API 한도"로 요약됨
        expect(screen.getByText('API 한도')).toBeInTheDocument();
      });
    });
  });

  describe('completed 상태 (완료)', () => {
    it('completed 상태인 최신 AR은 "최신" 배지를 표시해야 한다', async () => {
      const completedReport = createMockARReport({
        status: 'completed',
        parsed_at: '2025-12-16T02:30:00.000Z',
        total_monthly_premium: 200000,
        contract_count: 5
      });

      mockAnnualReportsApi([completedReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('최신')).toBeInTheDocument();
      });
    });

    it('completed 상태인 AR은 파싱일시가 표시되어야 한다', async () => {
      const completedReport = createMockARReport({
        status: 'completed',
        parsed_at: '2025-12-16T02:30:00.000Z'
      });

      mockAnnualReportsApi([completedReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 파싱일시가 포맷되어 표시
        expect(screen.getByText(/2025\.12\.16/)).toBeInTheDocument();
      });
    });
  });

  describe('혼합 상태 표시', () => {
    it('여러 상태의 AR이 함께 표시되어야 한다', async () => {
      const reports = [
        createMockARReport({
          report_id: 'c1',
          customer_name: '완료고객A',
          status: 'completed',
          uploaded_at: '2025-12-16T02:30:00.000Z'
        }),
        createMockARReport({
          report_id: 'p1',
          customer_name: '대기고객B',
          status: 'pending',
          parsed_at: null,
          uploaded_at: '2025-12-16T02:20:00.000Z'
        }),
        createMockARReport({
          report_id: 'e1',
          customer_name: '실패고객C',
          status: 'error',
          error_message: 'timeout',
          parsed_at: null,
          uploaded_at: '2025-12-16T02:10:00.000Z'
        })
      ];

      mockAnnualReportsApi(reports);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 상태 배지 확인
        expect(screen.getByText('최신')).toBeInTheDocument();
        expect(screen.getByText('대기중')).toBeInTheDocument();
        // 실패 배지는 status-badge--error 클래스 내에서만 확인
        const errorBadge = document.querySelector('.status-badge--error');
        expect(errorBadge).toBeInTheDocument();
        expect(errorBadge?.textContent).toBe('실패');
      });
    });

    it('미완료 상태(pending/processing/error)는 "최신" 배지가 표시되지 않아야 한다', async () => {
      // pending이 가장 최신이지만 "최신" 배지는 completed 중에서만 표시
      const reports = [
        createMockARReport({
          report_id: 'p1',
          customer_name: '대기고객',
          status: 'pending',
          parsed_at: null,
          uploaded_at: '2025-12-16T03:00:00.000Z'  // 가장 최신
        }),
        createMockARReport({
          report_id: 'c1',
          customer_name: '완료고객',
          status: 'completed',
          uploaded_at: '2025-12-16T02:30:00.000Z'
        })
      ];

      mockAnnualReportsApi(reports);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('대기중')).toBeInTheDocument();
        expect(screen.getByText('최신')).toBeInTheDocument();
      });

      // pending 행에는 "최신" 배지가 없어야 함
      const pendingRow = screen.getByText('대기고객').closest('.annual-report-row');
      // pending 행에서 status-badge 중 status-badge--pending만 있어야 함
      const badges = pendingRow?.querySelectorAll('.status-badge');
      badges?.forEach(badge => {
        if (!badge.classList.contains('status-badge--pending')) {
          expect(badge.textContent).not.toBe('최신');
        }
      });
    });
  });

  describe('AR 문서-파싱 1:1 매칭 (핵심 요구사항)', () => {
    it('AR 문서가 등록되면 파싱 결과가 없어도 목록에 표시되어야 한다', async () => {
      // 파싱이 아직 완료되지 않은 AR 문서 (pending 상태)
      const pendingReport = createMockARReport({
        customer_name: '신규고객',
        issue_date: null,  // 파싱 전이라 없음
        status: 'pending',
        parsed_at: null,
        total_monthly_premium: null,
        contract_count: null
      });

      mockAnnualReportsApi([pendingReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 파싱 전이지만 목록에 표시
        expect(screen.getByText('신규고객')).toBeInTheDocument();
        expect(screen.getByText('대기중')).toBeInTheDocument();
      });
    });

    it('파싱 실패한 AR 문서도 목록에 표시되어야 한다', async () => {
      const errorReport = createMockARReport({
        customer_name: '실패고객',
        status: 'error',
        error_message: 'PDF 파싱 실패',
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('실패고객')).toBeInTheDocument();
        expect(screen.getByText('실패')).toBeInTheDocument();
        expect(screen.getByText('재시도')).toBeInTheDocument();
      });
    });

    it('AR 문서 수와 Annual Report 목록 수가 일치해야 한다', async () => {
      // 3개의 AR 문서: 1 completed, 1 pending, 1 error
      const reports = [
        createMockARReport({ report_id: 'r1', customer_name: '완료고객X', status: 'completed' }),
        createMockARReport({ report_id: 'r2', customer_name: '대기고객Y', status: 'pending', parsed_at: null }),
        createMockARReport({ report_id: 'r3', customer_name: '에러고객Z', status: 'error', parsed_at: null })
      ];

      mockAnnualReportsApi(reports);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 3개 고객명 모두 표시되어야 함
        expect(screen.getByText('완료고객X')).toBeInTheDocument();
        expect(screen.getByText('대기고객Y')).toBeInTheDocument();
        expect(screen.getByText('에러고객Z')).toBeInTheDocument();
      });

      // 행 수 확인
      const rows = document.querySelectorAll('.annual-report-row');
      expect(rows.length).toBe(3);
    });
  });

  describe('에러 원인 요약 표시', () => {
    it.each([
      ['Rate limit exceeded', 'API 한도'],
      ['429 Too Many Requests', 'API 한도'],
      ['timeout error', '시간 초과'],
      ['Timeout waiting for response', '시간 초과'],
      ['파일을 찾을 수 없습니다', '파일 없음'],
      ['JSON parsing error', '파싱 실패'],
      ['DB connection failed', 'DB 오류'],
      ['저장 실패', 'DB 오류'],
      ['PDF extraction failed', 'PDF 오류'],
    ])('에러 메시지 "%s"는 "%s"로 요약되어야 한다', async (errorMessage, expectedSummary) => {
      const errorReport = createMockARReport({
        status: 'error',
        error_message: errorMessage,
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(expectedSummary)).toBeInTheDocument();
      });
    });

    it('10자 이상의 알 수 없는 에러는 잘려서 표시되어야 한다', async () => {
      const errorReport = createMockARReport({
        status: 'error',
        error_message: 'Unknown error occurred in system',
        parsed_at: null
      });

      mockAnnualReportsApi([errorReport]);

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // 10자 + "..."로 잘림
        expect(screen.getByText('Unknown er...')).toBeInTheDocument();
      });
    });
  });
});

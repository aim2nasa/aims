/**
 * AnnualReportTab 중복 AR 자동 정리 Integration Tests
 * @since 2025-11-03
 *
 * 테스트 범위:
 * 1. Annual Report 탭 로드 시 자동 정리 실행
 * 2. 중복 AR 발견 및 정리
 * 3. 에러 처리 (정리 실패 시에도 AR 목록 표시)
 * 4. 여러 AR 문서에 대한 연속 정리
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnnualReportTab } from '../AnnualReportTab';
import type { Customer } from '@/entities/customer/model';

// Fetch mock 설정 (cleanup API, annual-reports API 등에서 사용)
global.fetch = vi.fn();

// api 모듈 mock 설정 (documents, pending 조회에서 사용)
const mockApiGet = vi.fn();
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
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

describe('AnnualReportTab 중복 AR 자동 정리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockReset();
  });

  describe('자동 정리 실행', () => {
    it('탭 로드 시 AR 문서를 가져와 중복 정리를 실행해야 한다', async () => {
      // Documents API 응답 (AR 문서 2개)
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',
              ar_metadata: {
                issue_date: '2025-08-29T00:00:00Z'
              }
            },
            {
              _id: 'doc2',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:30:00.000Z',
              ar_metadata: {
                issue_date: '2025-07-15T00:00:00Z'
              }
            }
          ]
        }
      };

      // Cleanup API 응답
      const mockCleanupResponse1 = {
        success: true,
        message: '2개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 2
      };

      const mockCleanupResponse2 = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
      };

      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: [
          {
            issue_date: '2025-08-29T00:00:00Z',
            parsed_at: '2025-11-03T06:25:00.000Z',
            customer_name: '테스트고객'
          }
        ]
      };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({  // Cleanup 1
          ok: true,
          json: async () => mockCleanupResponse1
        })
        .mockResolvedValueOnce({  // Cleanup 2
          ok: true,
          json: async () => mockCleanupResponse2
        })
        .mockResolvedValueOnce({  // Annual Reports API
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 2번 호출되었는지 확인
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(2);
      });
    });

    it('AR 문서가 없으면 정리를 실행하지 않아야 한다', async () => {
      // Documents API 응답 (AR 문서 없음)
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'contract',  // AR이 아님
              linkedAt: '2025-11-03T06:24:00.000Z'
            }
          ]
        }
      };

      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: []
      };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({  // Annual Reports API
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 호출되지 않았는지 확인
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(0);
      });
    });

    it('linkedAt이 없는 AR 문서는 정리에서 제외해야 한다', async () => {
      // Documents API 응답
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',  // linkedAt 있음
              ar_metadata: {
                issue_date: '2025-08-29T00:00:00Z'
              }
            },
            {
              _id: 'doc2',
              relationship: 'annual_report',
              // linkedAt 없음
              ar_metadata: {
                issue_date: '2025-07-15T00:00:00Z'
              }
            }
          ]
        }
      };

      // Cleanup API 응답
      const mockCleanupResponse = {
        success: true,
        message: '1개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 1
      };

      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: []
      };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({  // Cleanup (doc1만)
          ok: true,
          json: async () => mockCleanupResponse
        })
        .mockResolvedValueOnce({  // Annual Reports API
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 1번만 호출되었는지 확인 (linkedAt 있는 것만)
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(1);
      });
    });

    it('issue_date가 없는 AR 문서는 정리에서 제외해야 한다', async () => {
      // Documents API 응답
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',
              ar_metadata: {
                issue_date: '2025-08-29T00:00:00Z'
              }
            },
            {
              _id: 'doc2',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:30:00.000Z',
              ar_metadata: {
                // issue_date 없음
                customer_name: '테스트고객'
              }
            }
          ]
        }
      };

      // Cleanup API 응답
      const mockCleanupResponse = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
      };

      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: []
      };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({  // Cleanup (doc1만)
          ok: true,
          json: async () => mockCleanupResponse
        })
        .mockResolvedValueOnce({  // Annual Reports API
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 1번만 호출되었는지 확인
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(1);
      });
    });
  });

  describe('에러 처리', () => {
    it('정리 실패 시에도 AR 목록을 표시해야 한다', async () => {
      // Documents API 응답
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',
              ar_metadata: {
                issue_date: '2025-08-29T00:00:00Z'
              }
            }
          ]
        }
      };

      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: [
          {
            issue_date: '2025-08-29T00:00:00Z',
            parsed_at: '2025-11-03T06:25:00.000Z',
            customer_name: '테스트고객'
          }
        ]
      };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(  // Cleanup 실패
          new Error('Network error')
        )
        .mockResolvedValueOnce({  // Annual Reports API (정리 실패해도 실행됨)
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      // AR 목록이 표시되는지 확인 (에러에도 불구하고)
      await waitFor(() => {
        // Annual Reports API가 호출되었는지 확인
        const arCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('/annual-reports') && !call[0].includes('cleanup')
        );
        expect(arCalls.length).toBeGreaterThan(0);
      });
    });

    it('Documents API 실패 시 정리를 건너뛰고 AR 목록을 표시해야 한다', async () => {
      // Annual Reports API 응답
      const mockAnnualReports = {
        success: true,
        data: [
          {
            issue_date: '2025-08-29T00:00:00Z',
            parsed_at: '2025-11-03T06:25:00.000Z',
            customer_name: '테스트고객'
          }
        ]
      };

      // Documents API 실패 (api.get)
      mockApiGet.mockRejectedValue(new Error('Network error'));

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({  // Annual Reports API (정리 없이 바로 실행)
          ok: true,
          json: async () => mockAnnualReports
        });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 호출되지 않았는지 확인
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(0);

        // Annual Reports API는 호출되었는지 확인
        const arCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('/annual-reports') && !call[0].includes('cleanup')
        );
        expect(arCalls.length).toBeGreaterThan(0);
      });
    });
  });

  describe('회귀 테스트', () => {
    it('여러 AR 문서에 대해 순차적으로 정리를 실행해야 한다', async () => {
      // Documents API 응답 (3개 AR 문서)
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',
              ar_metadata: { issue_date: '2025-08-29T00:00:00Z' }
            },
            {
              _id: 'doc2',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:30:00.000Z',
              ar_metadata: { issue_date: '2025-07-15T00:00:00Z' }
            },
            {
              _id: 'doc3',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:35:00.000Z',
              ar_metadata: { issue_date: '2025-06-10T00:00:00Z' }
            }
          ]
        }
      };

      // Cleanup API 응답 (3번)
      const mockCleanupResponse1 = { success: true, deleted_count: 2 };
      const mockCleanupResponse2 = { success: true, deleted_count: 1 };
      const mockCleanupResponse3 = { success: true, deleted_count: 0 };

      // Annual Reports API 응답
      const mockAnnualReports = { success: true, data: [] };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockCleanupResponse1 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCleanupResponse2 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCleanupResponse3 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockAnnualReports });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API가 3번 호출되었는지 확인
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(3);
      });
    });

    it('issue_date에서 날짜 부분만 추출하여 정리해야 한다', async () => {
      // Documents API 응답
      const mockDocuments = {
        success: true,
        data: {
          documents: [
            {
              _id: 'doc1',
              relationship: 'annual_report',
              linkedAt: '2025-11-03T06:24:00.000Z',
              ar_metadata: {
                issue_date: '2025-08-29T12:34:56.789Z'  // 시간 포함
              }
            }
          ]
        }
      };

      // Cleanup API 응답
      const mockCleanupResponse = { success: true, deleted_count: 1 };

      // Annual Reports API 응답
      const mockAnnualReports = { success: true, data: [] };

      // Documents API는 이제 api.get 사용
      mockApiGet.mockResolvedValue(mockDocuments);

      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => mockCleanupResponse })
        .mockResolvedValueOnce({ ok: true, json: async () => mockAnnualReports });

      render(
        <Wrapper>
          <AnnualReportTab customer={mockCustomer} />
        </Wrapper>
      );

      await waitFor(() => {
        // Cleanup API 호출 검증
        const cleanupCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
          call => call[0].includes('cleanup-duplicates')
        );
        expect(cleanupCalls.length).toBe(1);

        // issue_date가 날짜만 추출되어 전송되었는지 확인
        const firstCall = cleanupCalls[0];
        if (!firstCall) throw new Error('cleanup call not found');
        const requestBody = JSON.parse(firstCall[1].body);
        expect(requestBody.issue_date).toBe('2025-08-29');
      });
    });
  });
});

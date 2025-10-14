/**
 * useCustomersController 훅 테스트 (Features 버전)
 *
 * 고객 목록 조회 및 관리 컨트롤러 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomersController } from '../useCustomersController';

// fetch mock
global.fetch = vi.fn();

describe('useCustomersController (Features)', () => {
  const mockCustomers = [
    {
      _id: 'customer-1',
      personal_info: { name: '홍길동' },
      meta: { created_at: '2025-01-01T00:00:00Z' }
    },
    {
      _id: 'customer-2',
      personal_info: { name: '김철수' },
      meta: { created_at: '2025-01-02T00:00:00Z' }
    }
  ];

  const mockPagination = {
    currentPage: 1,
    totalPages: 3,
    totalCount: 50,
    limit: 20
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('초기화', () => {
    it('초기 customers는 빈 배열이어야 함', () => {
      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      expect(result.current.customers).toEqual([]);
    });

    it('초기 pagination이 설정되어야 함', () => {
      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      expect(result.current.pagination).toEqual({
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        limit: 20
      });
    });

    it('initialLimit을 설정할 수 있어야 함', () => {
      const { result } = renderHook(() =>
        useCustomersController({ initialLimit: 50, autoLoad: false })
      );

      expect(result.current.pagination.limit).toBe(50);
    });

    it('autoLoad가 true면 자동으로 로드해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      renderHook(() => useCustomersController({ autoLoad: true }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('autoLoad가 false면 자동 로드하지 않아야 함', () => {
      renderHook(() => useCustomersController({ autoLoad: false }));

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('searchCustomers', () => {
    it('검색을 실행하고 고객 목록을 로드해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({ search: '홍길동' });
      });

      await waitFor(() => {
        expect(result.current.customers).toEqual(mockCustomers);
      });
    });

    it('검색 시 페이지를 1로 리셋해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({ search: '홍길동' });
      });

      await waitFor(() => {
        expect(result.current.searchQuery.page).toBe(1);
      });
    });

    it('API 호출 시 올바른 쿼리 파라미터를 전달해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({
          search: '홍길동',
          status: 'active',
          customerType: '개인'
        });
      });

      await waitFor(() => {
        const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
        expect(callUrl).toContain('search=%ED%99%8D%EA%B8%B8%EB%8F%99');
        expect(callUrl).toContain('status=active');
        expect(callUrl).toContain('customerType=%EA%B0%9C%EC%9D%B8');
      });
    });
  });

  describe('loadMore', () => {
    it('다음 페이지를 로드하고 기존 목록에 추가해야 함', async () => {
      const page1Customers = [mockCustomers[0]];
      const page2Customers = [mockCustomers[1]];

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              customers: page1Customers,
              pagination: { ...mockPagination, currentPage: 1 }
            }
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              customers: page2Customers,
              pagination: { ...mockPagination, currentPage: 2 }
            }
          })
        } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      // 첫 페이지 로드
      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      // 다음 페이지 로드
      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(2);
      });
    });

    it('마지막 페이지에서는 loadMore가 작동하지 않아야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            customers: mockCustomers,
            pagination: { ...mockPagination, currentPage: 3, totalPages: 3 }
          }
        })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(2);
      });

      const callCountBefore = vi.mocked(global.fetch).mock.calls.length;

      await act(async () => {
        result.current.loadMore();
      });

      expect(vi.mocked(global.fetch).mock.calls.length).toBe(callCountBefore);
    });
  });

  describe('goToPage', () => {
    it('특정 페이지로 이동해야 함', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              customers: mockCustomers,
              pagination: { ...mockPagination, currentPage: 1, totalPages: 3 }
            }
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              customers: mockCustomers,
              pagination: { ...mockPagination, currentPage: 2, totalPages: 3 }
            }
          })
        } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      // 먼저 초기 로드 (totalPages 설정)
      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.pagination.totalPages).toBe(3);
      });

      // 페이지 이동
      await act(async () => {
        result.current.goToPage(2);
      });

      await waitFor(() => {
        expect(result.current.pagination.currentPage).toBe(2);
      });
    });

    it('범위를 벗어난 페이지는 무시해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            customers: mockCustomers,
            pagination: { ...mockPagination, currentPage: 1, totalPages: 3 }
          }
        })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(2);
      });

      const callCountBefore = vi.mocked(global.fetch).mock.calls.length;

      await act(async () => {
        result.current.goToPage(10); // totalPages는 3
      });

      expect(vi.mocked(global.fetch).mock.calls.length).toBe(callCountBefore);
    });
  });

  describe('refresh', () => {
    it('현재 쿼리로 다시 로드해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({ search: '홍길동' });
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(2);
      });

      vi.mocked(global.fetch).mockClear();

      await act(async () => {
        result.current.refresh();
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(callUrl).toContain('search=%ED%99%8D%EA%B8%B8%EB%8F%99');
    });
  });

  describe('handleSearchChange', () => {
    it('검색어를 변경하고 검색을 실행해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.handleSearchChange('김철수');
      });

      await waitFor(() => {
        expect(result.current.searchQuery.search).toBe('김철수');
      });
    });
  });

  describe('handleFilterChange', () => {
    it('필터를 변경하고 검색을 실행해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.handleFilterChange({ status: 'active', customerType: '개인' });
      });

      await waitFor(() => {
        expect(result.current.searchQuery.status).toBe('active');
        expect(result.current.searchQuery.customerType).toBe('개인');
      });
    });
  });

  describe('계산된 상태', () => {
    it('hasMore는 currentPage < totalPages일 때 true여야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            customers: mockCustomers,
            pagination: { ...mockPagination, currentPage: 1, totalPages: 3 }
          }
        })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.hasMore).toBe(true);
      });
    });

    it('isEmpty는 로딩 중이 아니고 customers가 비었을 때 true여야 함', () => {
      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      expect(result.current.isEmpty).toBe(true);
    });

    it('totalCustomers는 pagination.totalCount와 같아야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: { customers: mockCustomers, pagination: mockPagination } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.totalCustomers).toBe(50);
      });
    });
  });

  describe('에러 처리', () => {
    it('API 응답이 ok가 아니면 에러를 설정해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'API 에러' })
      } as Response);

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.error).toBe('API 에러');
      });
    });

    it('네트워크 에러를 처리해야 함', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('네트워크 에러'));

      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      await act(async () => {
        result.current.searchCustomers({});
      });

      await waitFor(() => {
        expect(result.current.error).toBe('네트워크 에러');
      });
    });

    it('에러를 수동으로 설정할 수 있어야 함', () => {
      const { result } = renderHook(() =>
        useCustomersController({ autoLoad: false })
      );

      act(() => {
        result.current.setError('커스텀 에러');
      });

      expect(result.current.error).toBe('커스텀 에러');
    });
  });
});

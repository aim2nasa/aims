/**
 * AnnualReportApi 테스트
 *
 * 최근 변경사항 테스트:
 * - cleanupDuplicates: 중복 AR 정리 (issue_date + customer_name 기반)
 * - deleteAnnualReports: AR 삭제 API
 *
 * @since 2025-11-28
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnnualReportApi } from '../annualReportApi';

// vi.hoisted를 사용하여 mock 함수들이 vi.mock과 함께 호이스팅되도록 함
const { mockApiPost } = vi.hoisted(() => ({
  mockApiPost: vi.fn(),
}));

// api 모듈 mock 설정
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: mockApiPost,
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  },
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string, public data?: unknown) {
      super(message);
      this.name = 'ApiError';
    }
  }
}));

// Mock localStorage for auth
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage });

describe('AnnualReportApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    // Set up auth token
    mockLocalStorage.setItem('auth-storage', JSON.stringify({
      state: { token: 'test-jwt-token' }
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // cleanupDuplicates 테스트
  // ============================================
  describe('cleanupDuplicates', () => {
    const customerId = 'customer123';
    const userId = 'user123';
    const issueDate = '2025-08-29';
    const referenceLinkedAt = '2025-11-03T06:25:33Z';
    const customerName = '홍길동';

    it('중복 AR이 있으면 정리하고 성공 응답을 반환한다', async () => {
      const mockResponse = {
        success: true,
        message: '중복 Annual Reports가 정리되었습니다',
        deleted_count: 2,
        kept_report: {
          issue_date: '2025-08-29',
          parsed_at: '2025-11-03T06:25:00.000Z',
          customer_name: '홍길동'
        }
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      expect(result.success).toBe(true);
      expect(result.deleted_count).toBe(2);
      expect(result.kept_report?.customer_name).toBe('홍길동');

      // API 호출 확인
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.stringContaining(`/customers/${customerId}/annual-reports/cleanup-duplicates`),
        expect.objectContaining({
          issue_date: issueDate,
          reference_linked_at: referenceLinkedAt,
          customer_name: customerName
        })
      );
    });

    it('중복이 없으면 deleted_count: 0을 반환한다', async () => {
      const mockResponse = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      expect(result.success).toBe(true);
      expect(result.deleted_count).toBe(0);
    });

    it('customer_name 없이도 호출할 수 있다', async () => {
      const mockResponse = {
        success: true,
        message: '처리 완료',
        deleted_count: 0
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt
        // customerName 생략
      );

      expect(result.success).toBe(true);

      // customer_name이 undefined로 전송됨
      const [, callBody] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];
      expect(callBody.customer_name).toBeUndefined();
    });

    it('API 오류 시 success: false와 에러 메시지를 반환한다', async () => {
      const { ApiError } = await import('@/shared/lib/api');
      mockApiPost.mockRejectedValueOnce(new ApiError('서버 오류', 500, 'Internal Server Error'));

      const result = await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('서버 오류');
    });

    it('네트워크 오류 시 success: false와 에러 메시지를 반환한다', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Network error'));

      const result = await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error');
    });

    it('userId가 쿼리 파라미터로 전달된다', async () => {
      const mockResponse = { success: true, deleted_count: 0 };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      const [callUrl] = mockApiPost.mock.calls[0] as [string, unknown];
      expect(callUrl).toContain(`userId=${encodeURIComponent(userId)}`);
    });

    it('Authorization 헤더가 api 모듈에 의해 자동 포함된다', async () => {
      // api 모듈이 헤더를 자동으로 처리하므로 호출만 확인
      const mockResponse = { success: true, deleted_count: 0 };
      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        customerId,
        userId,
        issueDate,
        referenceLinkedAt,
        customerName
      );

      // api.post가 호출되었는지 확인 (헤더는 api 모듈이 자동 처리)
      expect(mockApiPost).toHaveBeenCalled();
    });
  });

  // ============================================
  // 중복 판단 기준 테스트 (issue_date + customer_name)
  // ============================================
  describe('중복 판단 기준', () => {
    it('issue_date와 customer_name이 둘 다 같아야 중복으로 처리된다', async () => {
      // 이 테스트는 백엔드 로직을 문서화하는 역할
      // 실제 중복 판단은 백엔드에서 수행됨
      const mockResponse = {
        success: true,
        message: '중복 Annual Reports가 정리되었습니다',
        deleted_count: 1,
        kept_report: {
          issue_date: '2025-08-29',
          customer_name: '홍길동'
        }
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        'customer123',
        'user123',
        '2025-08-29',
        '2025-11-03T06:25:33Z',
        '홍길동'  // customer_name 포함
      );

      expect(result.deleted_count).toBe(1);
      expect(result.kept_report?.customer_name).toBe('홍길동');
    });

    it('customer_name이 다르면 같은 issue_date라도 중복이 아니다', async () => {
      // customer_name이 다른 경우 중복으로 판단하지 않음
      const mockResponse = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      // 홍길동의 AR에 대해 정리 요청했지만
      // 같은 발행일에 다른 고객명(김철수)의 AR이 있어도 삭제되지 않음
      const result = await AnnualReportApi.cleanupDuplicates(
        'customer123',
        'user123',
        '2025-08-29',
        '2025-11-03T06:25:33Z',
        '김철수'  // 다른 customer_name
      );

      expect(result.deleted_count).toBe(0);
    });
  });
});

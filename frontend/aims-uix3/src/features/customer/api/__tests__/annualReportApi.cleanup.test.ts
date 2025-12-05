/**
 * AnnualReportApi cleanupDuplicates 메서드 Unit Tests
 * @since 2025-11-03
 *
 * 테스트 범위:
 * 1. cleanupDuplicates() 성공 케이스
 * 2. cleanupDuplicates() 에러 처리
 * 3. API 응답 형식 검증
 * 4. 파라미터 검증
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnnualReportApi } from '../annualReportApi';

// api 모듈 mock 설정
const mockApiPost = vi.fn();

vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockApiPost(...args),
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

describe('AnnualReportApi.cleanupDuplicates', () => {
  const mockCustomerId = '6735aaaa3333333333333333';
  const mockUserId = '6735bbbb4444444444444444';
  const mockIssueDate = '2025-08-29';
  const mockReferenceLinkedAt = '2025-11-03T06:25:30.000Z';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('성공 케이스', () => {
    it('중복 AR이 성공적으로 정리되면 deleted_count를 반환해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: '2개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 2,
        kept_report: {
          issue_date: '2025-08-29T00:00:00Z',
          parsed_at: '2025-11-03T06:25:00.000Z',
          customer_name: '테스트고객'
        }
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(true);
      expect(result.deleted_count).toBe(2);
      expect(result.message).toContain('2개의 중복');
      expect(result.kept_report).toBeDefined();
      expect(result.kept_report?.customer_name).toBe('테스트고객');
    });

    it('중복이 없으면 deleted_count가 0이어야 한다', async () => {
      const mockResponse = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(true);
      expect(result.deleted_count).toBe(0);
      expect(result.message).toContain('중복된 Annual Report가 없습니다');
    });

    it('올바른 API 엔드포인트를 호출해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        deleted_count: 1
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(mockApiPost).toHaveBeenCalledWith(
        `/api/customers/${mockCustomerId}/annual-reports/cleanup-duplicates?userId=${mockUserId}`,
        expect.objectContaining({
          issue_date: mockIssueDate,
          reference_linked_at: mockReferenceLinkedAt
        })
      );
    });

    it('올바른 요청 body를 전송해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        deleted_count: 1
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      const [, requestBody] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];

      // userId는 query string에 있고, body에는 issue_date와 reference_linked_at만 있음
      expect(requestBody).toEqual({
        issue_date: mockIssueDate,
        reference_linked_at: mockReferenceLinkedAt,
        customer_name: undefined
      });
    });
  });

  describe('에러 처리', () => {
    it('네트워크 에러 시 에러 메시지를 반환해야 한다', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Network error'));

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
      expect(result.deleted_count).toBeUndefined();
    });

    it('HTTP 404 에러 시 에러 메시지를 반환해야 한다', async () => {
      const { ApiError } = await import('@/shared/lib/api');
      mockApiPost.mockRejectedValueOnce(new ApiError('고객을 찾을 수 없습니다', 404, 'Not Found'));

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('고객을 찾을 수 없습니다');
    });

    it('HTTP 403 에러 시 에러 메시지를 반환해야 한다', async () => {
      const { ApiError } = await import('@/shared/lib/api');
      mockApiPost.mockRejectedValueOnce(new ApiError('권한이 없습니다', 403, 'Forbidden'));

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('권한이 없습니다');
    });

    it('HTTP 500 에러 시 서버 에러 메시지를 반환해야 한다', async () => {
      const { ApiError } = await import('@/shared/lib/api');
      mockApiPost.mockRejectedValueOnce(new ApiError('서버 오류가 발생했습니다', 500, 'Internal Server Error'));

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('응답 success가 false일 때 에러를 처리해야 한다', async () => {
      mockApiPost.mockResolvedValueOnce({
        success: false,
        message: 'Bad Request'
      });

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('파라미터 검증', () => {
    it('customerId가 빈 문자열이면 API를 호출해야 한다 (서버에서 검증)', async () => {
      const mockResponse = {
        success: false,
        message: '유효하지 않은 customer_id',
        deleted_count: 0
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        '',
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(mockApiPost).toHaveBeenCalled();
    });

    it('issue_date가 T로 구분된 ISO 형식이어도 처리해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: 'OK',
        deleted_count: 1
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        '2025-08-29T00:00:00Z',  // ISO 형식
        mockReferenceLinkedAt
      );

      const [, requestBody] = mockApiPost.mock.calls[0] as [string, Record<string, unknown>];
      expect(requestBody.issue_date).toBe('2025-08-29T00:00:00Z');
    });
  });

  describe('응답 형식 검증', () => {
    it('kept_report가 모든 필드를 포함해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: '1개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 1,
        kept_report: {
          issue_date: '2025-08-29T00:00:00Z',
          parsed_at: '2025-11-03T06:25:00.000Z',
          customer_name: '테스트고객',
          fsr_name: '담당자',
          report_title: '2025년 8월 리포트'
        }
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.kept_report).toEqual({
        issue_date: '2025-08-29T00:00:00Z',
        parsed_at: '2025-11-03T06:25:00.000Z',
        customer_name: '테스트고객',
        fsr_name: '담당자',
        report_title: '2025년 8월 리포트'
      });
    });

    it('kept_report가 없을 때도 정상 처리해야 한다', async () => {
      const mockResponse = {
        success: true,
        message: '중복된 Annual Report가 없습니다',
        deleted_count: 0
        // kept_report 없음
      };

      mockApiPost.mockResolvedValueOnce(mockResponse);

      const result = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result.kept_report).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });

  describe('회귀 테스트', () => {
    it('여러 고객에 대해 독립적으로 동작해야 한다', async () => {
      const customer1Id = '6735aaaa1111111111111111';
      const customer2Id = '6735aaaa2222222222222222';

      const mockResponse1 = {
        success: true,
        message: '2개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 2
      };

      const mockResponse2 = {
        success: true,
        message: '1개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 1
      };

      mockApiPost
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result1 = await AnnualReportApi.cleanupDuplicates(
        customer1Id,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      const result2 = await AnnualReportApi.cleanupDuplicates(
        customer2Id,
        mockUserId,
        mockIssueDate,
        mockReferenceLinkedAt
      );

      expect(result1.deleted_count).toBe(2);
      expect(result2.deleted_count).toBe(1);
      expect(mockApiPost).toHaveBeenCalledTimes(2);
    });

    it('연속된 정리 작업이 올바르게 동작해야 한다', async () => {
      const issueDate1 = '2025-08-29';
      const issueDate2 = '2025-07-15';

      const mockResponse1 = {
        success: true,
        message: '1개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 1
      };

      const mockResponse2 = {
        success: true,
        message: '2개의 중복 Annual Report가 삭제되었습니다',
        deleted_count: 2
      };

      mockApiPost
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const result1 = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        issueDate1,
        mockReferenceLinkedAt
      );

      const result2 = await AnnualReportApi.cleanupDuplicates(
        mockCustomerId,
        mockUserId,
        issueDate2,
        '2025-11-01T10:15:00.000Z'
      );

      expect(result1.deleted_count).toBe(1);
      expect(result2.deleted_count).toBe(2);
    });
  });
});

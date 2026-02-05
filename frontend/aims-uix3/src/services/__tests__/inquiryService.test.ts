/**
 * Inquiry Service Unit Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. getInquiries - 문의 목록 조회
 * 2. getInquiry - 문의 상세 조회
 * 3. createInquiry - 문의 등록
 * 4. addMessage - 메시지 추가
 * 5. getAttachmentUrl - 첨부파일 URL 생성
 * 6. formatFileSize - 파일 크기 포맷팅
 * 7. 알림 관련 API (getUnreadCount, getUnreadIds, markAsRead)
 * 8. getNotificationStreamUrl - SSE 스트림 URL
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInquiries,
  getInquiry,
  getAttachmentUrl,
  formatFileSize,
  getUnreadCount,
  getUnreadIds,
  markAsRead,
  getNotificationStreamUrl,
} from '../inquiryService';

// Mock api module
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    put: vi.fn(),
  },
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
  getAuthToken: vi.fn(() => 'test-token'),
  API_CONFIG: {
    BASE_URL: 'http://localhost:3010',
  },
}));

import { api, getAuthToken, API_CONFIG } from '@/shared/lib/api';

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const mockGetAuthToken = getAuthToken as ReturnType<typeof vi.fn>;

describe('inquiryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =============================================================================
  // 1. getInquiries 테스트
  // =============================================================================

  describe('getInquiries', () => {
    const mockInquiriesResponse = {
      inquiries: [
        {
          _id: 'inq-001',
          title: '테스트 문의',
          status: 'open',
          createdAt: '2026-02-05T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    };

    it('문의 목록을 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockInquiriesResponse,
      });

      const result = await getInquiries({});

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries?');
      expect(result).toEqual(mockInquiriesResponse);
    });

    it('상태 필터로 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockInquiriesResponse,
      });

      await getInquiries({ status: 'open' });

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries?status=open');
    });

    it('페이지네이션 파라미터를 전달해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockInquiriesResponse,
      });

      await getInquiries({ page: 2, limit: 10 });

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries?page=2&limit=10');
    });

    it('모든 파라미터를 함께 전달해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockInquiriesResponse,
      });

      await getInquiries({ status: 'resolved', page: 3, limit: 15 });

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries?status=resolved&page=3&limit=15');
    });
  });

  // =============================================================================
  // 2. getInquiry 테스트
  // =============================================================================

  describe('getInquiry', () => {
    const mockInquiry = {
      _id: 'inq-001',
      title: '테스트 문의',
      content: '문의 내용입니다.',
      status: 'open',
      messages: [],
      createdAt: '2026-02-05T10:00:00Z',
    };

    it('문의 상세를 조회해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: mockInquiry,
      });

      const result = await getInquiry('inq-001');

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries/inq-001');
      expect(result).toEqual(mockInquiry);
    });
  });

  // =============================================================================
  // 5. getAttachmentUrl 테스트
  // =============================================================================

  describe('getAttachmentUrl', () => {
    it('토큰이 있을 때 URL에 토큰을 포함해야 함', () => {
      mockGetAuthToken.mockReturnValue('test-token');

      const url = getAttachmentUrl('inq-001', 'document.pdf');

      expect(url).toBe(
        'http://localhost:3010/api/inquiries/attachments/inq-001/document.pdf?token=test-token'
      );
    });

    it('토큰이 없을 때 URL만 반환해야 함', () => {
      mockGetAuthToken.mockReturnValue(null);

      const url = getAttachmentUrl('inq-001', 'document.pdf');

      expect(url).toBe('http://localhost:3010/api/inquiries/attachments/inq-001/document.pdf');
    });

    it('특수문자가 포함된 파일명을 처리해야 함', () => {
      mockGetAuthToken.mockReturnValue('test-token');

      const url = getAttachmentUrl('inq-001', '파일 (1).pdf');

      expect(url).toContain('파일 (1).pdf');
    });
  });

  // =============================================================================
  // 6. formatFileSize 테스트
  // =============================================================================

  describe('formatFileSize', () => {
    describe('바이트 단위 (1024 미만)', () => {
      it('0B', () => {
        expect(formatFileSize(0)).toBe('0B');
      });

      it('1B', () => {
        expect(formatFileSize(1)).toBe('1B');
      });

      it('500B', () => {
        expect(formatFileSize(500)).toBe('500B');
      });

      it('1023B', () => {
        expect(formatFileSize(1023)).toBe('1023B');
      });
    });

    describe('킬로바이트 단위 (1024 ~ 1MB)', () => {
      it('1024 → 1.0KB', () => {
        expect(formatFileSize(1024)).toBe('1.0KB');
      });

      it('1536 → 1.5KB', () => {
        expect(formatFileSize(1536)).toBe('1.5KB');
      });

      it('10240 → 10.0KB', () => {
        expect(formatFileSize(10240)).toBe('10.0KB');
      });

      it('1048575 → 1024.0KB', () => {
        expect(formatFileSize(1048575)).toBe('1024.0KB');
      });
    });

    describe('메가바이트 단위 (1MB 이상)', () => {
      it('1048576 → 1.0MB', () => {
        expect(formatFileSize(1048576)).toBe('1.0MB');
      });

      it('1572864 → 1.5MB', () => {
        expect(formatFileSize(1572864)).toBe('1.5MB');
      });

      it('10485760 → 10.0MB', () => {
        expect(formatFileSize(10485760)).toBe('10.0MB');
      });

      it('52428800 → 50.0MB', () => {
        expect(formatFileSize(52428800)).toBe('50.0MB');
      });
    });

    describe('경계값 테스트', () => {
      it('1023 → 1023B (KB 경계 미만)', () => {
        expect(formatFileSize(1023)).toBe('1023B');
      });

      it('1024 → 1.0KB (KB 경계)', () => {
        expect(formatFileSize(1024)).toBe('1.0KB');
      });

      it('1048575 → 1024.0KB (MB 경계 미만)', () => {
        expect(formatFileSize(1048575)).toBe('1024.0KB');
      });

      it('1048576 → 1.0MB (MB 경계)', () => {
        expect(formatFileSize(1048576)).toBe('1.0MB');
      });
    });
  });

  // =============================================================================
  // 7. 알림 관련 API 테스트
  // =============================================================================

  describe('getUnreadCount', () => {
    it('미확인 문의 개수를 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: { count: 5 },
      });

      const result = await getUnreadCount();

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries/unread-count');
      expect(result).toBe(5);
    });

    it('0개일 때 0을 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: { count: 0 },
      });

      const result = await getUnreadCount();

      expect(result).toBe(0);
    });
  });

  describe('getUnreadIds', () => {
    it('미확인 문의 ID 목록을 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: { ids: ['inq-001', 'inq-002', 'inq-003'] },
      });

      const result = await getUnreadIds();

      expect(mockApi.get).toHaveBeenCalledWith('/api/inquiries/unread');
      expect(result).toEqual(['inq-001', 'inq-002', 'inq-003']);
    });

    it('빈 배열을 반환해야 함', async () => {
      mockApi.get.mockResolvedValue({
        success: true,
        data: { ids: [] },
      });

      const result = await getUnreadIds();

      expect(result).toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('문의를 읽음 처리해야 함', async () => {
      mockApi.put.mockResolvedValue({ success: true });

      await markAsRead('inq-001');

      expect(mockApi.put).toHaveBeenCalledWith('/api/inquiries/inq-001/mark-read');
    });
  });

  // =============================================================================
  // 8. getNotificationStreamUrl 테스트
  // =============================================================================

  describe('getNotificationStreamUrl', () => {
    it('토큰이 있을 때 URL에 토큰을 포함해야 함', () => {
      mockGetAuthToken.mockReturnValue('test-token');

      const url = getNotificationStreamUrl();

      expect(url).toBe(
        'http://localhost:3010/api/inquiries/notifications/stream?token=test-token'
      );
    });

    it('토큰이 없을 때 URL만 반환해야 함', () => {
      mockGetAuthToken.mockReturnValue(null);

      const url = getNotificationStreamUrl();

      expect(url).toBe('http://localhost:3010/api/inquiries/notifications/stream');
    });
  });
});

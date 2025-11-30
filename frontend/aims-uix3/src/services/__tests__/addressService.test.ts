/**
 * AddressService 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AddressService } from '../addressService';
import type { AddressHistoryItem } from '@/entities/customer/model';

// api 모듈 mock 설정
const mockApiGet = vi.fn();
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

describe('AddressService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAddressHistory', () => {
    it('고객의 주소 이력을 조회해야 함', async () => {
      const mockHistory: AddressHistoryItem[] = [
        {
          address: {
            postal_code: '06234',
            address1: '서울시 강남구 테헤란로 123',
            address2: '456호',
          },
          changed_at: '2025-01-15T10:30:00.000Z',
          changed_by: 'admin',
        },
        {
          address: {
            postal_code: '06123',
            address1: '서울시 서초구 반포대로 456',
          },
          changed_at: '2024-12-01T09:00:00.000Z',
          changed_by: 'system',
        },
      ];

      // api.get()은 이미 파싱된 JSON을 반환
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: mockHistory,
      });

      const result = await AddressService.getAddressHistory('customer123');

      expect(mockApiGet).toHaveBeenCalledWith('/api/customers/customer123/address-history');
      expect(result).toEqual(mockHistory);
      expect(result).toHaveLength(2);
    });

    it('빈 고객 ID의 경우 에러를 발생시켜야 함', async () => {
      await expect(AddressService.getAddressHistory('')).rejects.toThrow('고객 ID가 필요합니다');
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('success가 false인 경우 에러를 발생시켜야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: false,
        message: '권한이 없습니다',
      });

      await expect(AddressService.getAddressHistory('customer123')).rejects.toThrow(
        '권한이 없습니다'
      );
    });

    it('success가 false이지만 message가 없는 경우 기본 에러 메시지를 사용해야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: false,
      });

      await expect(AddressService.getAddressHistory('customer123')).rejects.toThrow(
        '주소 이력 조회에 실패했습니다'
      );
    });

    it('data가 없는 경우 빈 배열을 반환해야 함', async () => {
      mockApiGet.mockResolvedValueOnce({
        success: true,
        data: null,
      });

      const result = await AddressService.getAddressHistory('customer123');
      expect(result).toEqual([]);
    });

    it('네트워크 에러 시 에러를 발생시켜야 함', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Network error'));

      await expect(AddressService.getAddressHistory('customer123')).rejects.toThrow(
        'Network error'
      );
    });

    it('알 수 없는 에러 시 기본 에러 메시지를 사용해야 함', async () => {
      mockApiGet.mockRejectedValueOnce('Unknown error');

      await expect(AddressService.getAddressHistory('customer123')).rejects.toThrow(
        '주소 이력을 불러오는 중 오류가 발생했습니다'
      );
    });
  });

  describe('formatAddress', () => {
    it('전체 주소를 포맷팅해야 함', () => {
      const address = {
        postal_code: '06234',
        address1: '서울시 강남구 테헤란로 123',
        address2: '456호',
      };

      const result = AddressService.formatAddress(address);
      expect(result).toBe('[06234] 서울시 강남구 테헤란로 123 456호');
    });

    it('우편번호와 기본 주소만 있는 경우 포맷팅해야 함', () => {
      const address = {
        postal_code: '06234',
        address1: '서울시 강남구 테헤란로 123',
      };

      const result = AddressService.formatAddress(address);
      expect(result).toBe('[06234] 서울시 강남구 테헤란로 123');
    });

    it('기본 주소만 있는 경우 포맷팅해야 함', () => {
      const address = {
        address1: '서울시 강남구 테헤란로 123',
      };

      const result = AddressService.formatAddress(address);
      expect(result).toBe('서울시 강남구 테헤란로 123');
    });

    it('상세 주소만 있는 경우 포맷팅해야 함', () => {
      const address = {
        address2: '456호',
      };

      const result = AddressService.formatAddress(address);
      expect(result).toBe('456호');
    });

    it('빈 주소 객체의 경우 "주소 없음"을 반환해야 함', () => {
      const address = {};

      const result = AddressService.formatAddress(address);
      expect(result).toBe('주소 없음');
    });

    it('null 주소의 경우 "주소 없음"을 반환해야 함', () => {
      const result = AddressService.formatAddress(null as any);
      expect(result).toBe('주소 없음');
    });

    it('undefined 주소의 경우 "주소 없음"을 반환해야 함', () => {
      const result = AddressService.formatAddress(undefined as any);
      expect(result).toBe('주소 없음');
    });
  });

  describe('formatDate', () => {
    it('ISO 날짜 문자열을 포맷팅해야 함', () => {
      const dateString = '2025-01-15T10:30:00.000Z';
      const result = AddressService.formatDate(dateString);

      // 새 표준 형식: YYYY.MM.DD HH:mm:ss (24시간제)
      // UTC 10:30 → KST 19:30
      expect(result).toBe('2025.01.15 19:30:00');
    });

    it('다른 형식의 날짜 문자열도 포맷팅해야 함', () => {
      const dateString = '2025-12-31T23:59:59.999Z';
      const result = AddressService.formatDate(dateString);

      // UTC 23:59 → KST 다음날 08:59
      expect(result).toBe('2026.01.01 08:59:59');
    });

    it('잘못된 날짜 문자열의 경우 "잘못된 시간"을 반환해야 함', () => {
      const dateString = 'invalid-date';
      const result = AddressService.formatDate(dateString);

      // formatDateTime() 유틸리티는 잘못된 날짜에 대해 "잘못된 시간"을 반환
      expect(result).toBe('잘못된 시간');
    });

    it('빈 문자열의 경우 "-"를 반환해야 함', () => {
      const dateString = '';
      const result = AddressService.formatDate(dateString);

      // formatDateTime() 유틸리티는 빈 문자열에 대해 "-"를 반환
      expect(result).toBe('-');
    });
  });
});

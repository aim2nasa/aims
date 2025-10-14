/**
 * useAddressArchiveController 훅 테스트
 *
 * 주소 보관소 컨트롤러 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAddressArchiveController } from '../useAddressArchiveController';
import { AddressService } from '@/services/addressService';
import type { AddressHistoryItem } from '@/entities/customer/model';

vi.mock('@/services/addressService');

describe('useAddressArchiveController', () => {
  const mockCustomerId = 'customer-123';
  const mockAddressHistory: AddressHistoryItem[] = [
    {
      address: {
        postal_code: '12345',
        address1: '서울시 강남구',
        address2: '101호'
      },
      changed_at: '2025-01-01T00:00:00Z'
    },
    {
      address: {
        postal_code: '54321',
        address1: '부산시 해운대구',
        address2: '202호'
      },
      changed_at: '2025-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('초기화', () => {
    it('초기 isOpen은 false여야 함', () => {
      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      expect(result.current.isOpen).toBe(false);
    });

    it('초기 addressHistory는 빈 배열이어야 함', () => {
      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      expect(result.current.addressHistory).toEqual([]);
    });

    it('초기 isLoading은 false여야 함', () => {
      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      expect(result.current.isLoading).toBe(false);
    });

    it('초기 error는 null이어야 함', () => {
      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      expect(result.current.error).toBeNull();
    });
  });

  describe('open', () => {
    it('모달을 열어야 함', () => {
      vi.mocked(AddressService.getAddressHistory).mockResolvedValue(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('모달을 열 때 주소 이력을 로드해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockResolvedValue(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      act(() => {
        result.current.open();
      });

      await waitFor(() => {
        expect(AddressService.getAddressHistory).toHaveBeenCalledWith(mockCustomerId);
      });
    });
  });

  describe('close', () => {
    it('모달을 닫아야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockResolvedValue(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('모달을 닫을 때 에러를 초기화해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockRejectedValue(
        new Error('로드 실패')
      );

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      act(() => {
        result.current.open();
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      act(() => {
        result.current.close();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('loadAddressHistory', () => {
    it('주소 이력을 성공적으로 로드해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockResolvedValue(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.addressHistory).toEqual(mockAddressHistory);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('로딩 중에는 isLoading이 true여야 함', async () => {
      let resolveLoad: ((value: any) => void) | null = null;

      vi.mocked(AddressService.getAddressHistory).mockImplementation(
        () => new Promise(resolve => {
          resolveLoad = resolve;
        })
      );

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      act(() => {
        result.current.loadAddressHistory(mockCustomerId);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      act(() => {
        resolveLoad?.(mockAddressHistory);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('로드 실패 시 에러를 설정해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockRejectedValue(
        new Error('API 에러')
      );

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.error).toBe('API 에러');
      expect(result.current.addressHistory).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('customerId가 없으면 에러를 설정해야 함', async () => {
      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      await act(async () => {
        await result.current.loadAddressHistory('');
      });

      expect(result.current.error).toBe('고객 ID가 필요합니다');
      expect(AddressService.getAddressHistory).not.toHaveBeenCalled();
    });

    it('로드 시작 시 이전 에러를 초기화해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory)
        .mockRejectedValueOnce(new Error('첫 번째 에러'))
        .mockResolvedValueOnce(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      // 첫 번째 로드 실패
      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.error).toBe('첫 번째 에러');

      // 두 번째 로드 성공
      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.addressHistory).toEqual(mockAddressHistory);
    });

    it('Error 객체가 아닌 에러도 처리해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockRejectedValue('문자열 에러');

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.error).toBe('주소 이력을 불러오는데 실패했습니다.');
    });
  });

  describe('통합 시나리오', () => {
    it('open → 로드 성공 → close 플로우가 정상 작동해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory).mockResolvedValue(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      // 1. 모달 열기
      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);

      // 2. 로드 완료 대기
      await waitFor(() => {
        expect(result.current.addressHistory).toEqual(mockAddressHistory);
      });

      expect(result.current.error).toBeNull();

      // 3. 모달 닫기
      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('open → 로드 실패 → 재시도 → 성공 플로우가 정상 작동해야 함', async () => {
      vi.mocked(AddressService.getAddressHistory)
        .mockRejectedValueOnce(new Error('첫 번째 실패'))
        .mockResolvedValueOnce(mockAddressHistory);

      const { result } = renderHook(() =>
        useAddressArchiveController(mockCustomerId)
      );

      // 1. 모달 열기 (첫 번째 로드 실패)
      act(() => {
        result.current.open();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('첫 번째 실패');
      });

      // 2. 재시도 (두 번째 로드 성공)
      await act(async () => {
        await result.current.loadAddressHistory(mockCustomerId);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.addressHistory).toEqual(mockAddressHistory);
    });

    it('customerId 변경 시 새로운 고객의 주소 이력을 로드해야 함', async () => {
      const anotherCustomerId = 'customer-456';
      const anotherHistory: AddressHistoryItem[] = [
        {
          address: {
            postal_code: '99999',
            address1: '대구시',
            address2: '303호'
          },
          changed_at: '2025-01-01T00:00:00Z'
        }
      ];

      vi.mocked(AddressService.getAddressHistory)
        .mockResolvedValueOnce(mockAddressHistory)
        .mockResolvedValueOnce(anotherHistory);

      const { result, rerender } = renderHook(
        ({ customerId }) => useAddressArchiveController(customerId),
        { initialProps: { customerId: mockCustomerId } }
      );

      // 첫 번째 고객의 주소 로드
      act(() => {
        result.current.open();
      });

      await waitFor(() => {
        expect(result.current.addressHistory).toEqual(mockAddressHistory);
      });

      act(() => {
        result.current.close();
      });

      // customerId 변경
      rerender({ customerId: anotherCustomerId });

      // 두 번째 고객의 주소 로드
      act(() => {
        result.current.open();
      });

      await waitFor(() => {
        expect(AddressService.getAddressHistory).toHaveBeenCalledWith(anotherCustomerId);
      });
    });
  });
});

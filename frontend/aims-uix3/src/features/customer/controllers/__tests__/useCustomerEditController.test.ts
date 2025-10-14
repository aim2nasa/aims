/**
 * useCustomerEditController 훅 테스트
 *
 * 고객 정보 수정 컨트롤러 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomerEditController } from '../useCustomerEditController';
import { CustomerDocument } from '@/stores/CustomerDocument';
import type { Customer } from '@/entities/customer';

vi.mock('@/stores/CustomerDocument');

describe('useCustomerEditController', () => {
  const mockCustomer: Customer = {
    _id: 'customer-123',
    personal_info: {
      name: '홍길동',
      mobile_phone: '010-1234-5678',
      email: 'hong@example.com',
      birth_date: '1990-01-01',
      gender: 'M',
      address: {
        postal_code: '12345',
        address1: '서울시 강남구',
        address2: '101호'
      }
    },
    insurance_info: {
      customer_type: '개인'
    },
    contracts: [],
    documents: [],
    consultations: [],
    tags: [],
    meta: {
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      status: 'active'
    }
  };

  const mockDocument = {
    updateCustomer: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CustomerDocument.getInstance).mockReturnValue(mockDocument as any);
  });

  describe('초기화', () => {
    it('customer 데이터로 formData를 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      expect(result.current.formData.personal_info).toEqual(mockCustomer.personal_info);
      expect(result.current.formData.insurance_info).toEqual(mockCustomer.insurance_info);
    });

    it('초기 activeTab은 "info"여야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      expect(result.current.activeTab).toBe('info');
    });

    it('초기 errors는 빈 객체여야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      expect(result.current.errors).toEqual({});
    });

    it('초기 isSubmitting은 false여야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      expect(result.current.isSubmitting).toBe(false);
    });

    it('customer prop이 변경되면 formData를 업데이트해야 함', () => {
      const { result, rerender } = renderHook(
        ({ customer }) => useCustomerEditController(customer),
        { initialProps: { customer: mockCustomer } }
      );

      const updatedCustomer: Customer = {
        ...mockCustomer,
        personal_info: {
          ...mockCustomer.personal_info,
          name: '김철수'
        }
      };

      rerender({ customer: updatedCustomer });

      expect(result.current.formData.personal_info?.name).toBe('김철수');
    });
  });

  describe('handleFieldChange', () => {
    it('단순 필드 값을 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.name', '김철수');
      });

      expect(result.current.formData.personal_info?.name).toBe('김철수');
    });

    it('중첩된 필드 값을 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.address.address1', '부산시 해운대구');
      });

      expect(result.current.formData.personal_info?.address?.address1).toBe('부산시 해운대구');
    });

    it('여러 단계 중첩된 필드를 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('insurance_info.customer_type', '법인');
      });

      expect(result.current.formData.insurance_info?.customer_type).toBe('법인');
    });

    it('필드 변경 시 해당 필드의 에러를 제거해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      // 에러 설정
      act(() => {
        result.current.handleFieldChange('personal_info.name', '');
      });

      act(() => {
        result.current.validateAllFields();
      });

      expect(result.current.errors['personal_info.name']).toBeTruthy();

      // 필드 변경으로 에러 제거
      act(() => {
        result.current.handleFieldChange('personal_info.name', '김철수');
      });

      expect(result.current.errors['personal_info.name']).toBeUndefined();
    });

    it('빈 필드 경로는 무시해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      const prevData = result.current.formData;

      act(() => {
        result.current.handleFieldChange('', '값');
      });

      expect(result.current.formData).toBe(prevData);
    });

    it('존재하지 않는 중첩 경로를 생성할 수 있어야 함', () => {
      const customerWithoutAddress: Customer = {
        ...mockCustomer,
        personal_info: {
          name: '홍길동'
        }
      };

      const { result } = renderHook(() => useCustomerEditController(customerWithoutAddress));

      act(() => {
        result.current.handleFieldChange('personal_info.address.postal_code', '54321');
      });

      expect(result.current.formData.personal_info?.address?.postal_code).toBe('54321');
    });
  });

  describe('handleTabChange', () => {
    it('탭을 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleTabChange('contact');
      });

      expect(result.current.activeTab).toBe('contact');
    });

    it('모든 탭으로 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      const tabs: Array<'info' | 'contact' | 'address' | 'insurance'> = [
        'info',
        'contact',
        'address',
        'insurance'
      ];

      tabs.forEach(tab => {
        act(() => {
          result.current.handleTabChange(tab);
        });

        expect(result.current.activeTab).toBe(tab);
      });
    });
  });

  describe('validateAllFields', () => {
    it('고객명이 있으면 유효성 검증 통과해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      let isValid = false;
      act(() => {
        isValid = result.current.validateAllFields();
      });

      expect(isValid).toBe(true);
      expect(result.current.errors).toEqual({});
    });

    it('고객명이 없으면 유효성 검증 실패해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.name', '');
      });

      let isValid = false;
      act(() => {
        isValid = result.current.validateAllFields();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors?.['personal_info.name']).toBe('고객명은 필수입니다');
    });

    it('고객명이 공백만 있으면 유효성 검증 실패해야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.name', '   ');
      });

      let isValid = false;
      act(() => {
        isValid = result.current.validateAllFields();
      });

      expect(isValid).toBe(false);
      expect(result.current.errors?.['personal_info.name']).toBeTruthy();
    });

    it('고객명 외의 필드는 검증하지 않아야 함', () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.mobile_phone', '');
        result.current.handleFieldChange('personal_info.email', '');
      });

      let isValid = false;
      act(() => {
        isValid = result.current.validateAllFields();
      });

      expect(isValid).toBe(true);
      expect(result.current.errors).toEqual({});
    });
  });

  describe('handleSave', () => {
    it('유효성 검증 통과 시 고객 정보를 저장해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      let success = false;
      await act(async () => {
        success = await result.current.handleSave();
      });

      expect(success).toBe(true);
      expect(mockDocument.updateCustomer).toHaveBeenCalledWith(
        mockCustomer._id,
        expect.objectContaining({
          personal_info: expect.objectContaining({
            name: '홍길동'
          })
        })
      );
    });

    it('유효성 검증 실패 시 저장하지 않아야 함', async () => {
      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.name', '');
      });

      let success = false;
      await act(async () => {
        success = await result.current.handleSave();
      });

      expect(success).toBe(false);
      expect(mockDocument.updateCustomer).not.toHaveBeenCalled();
    });

    it('저장 중에는 isSubmitting이 true여야 함', async () => {
      let resolveUpdate: (() => void) | null = null;

      mockDocument.updateCustomer.mockImplementation(
        () => new Promise(resolve => {
          resolveUpdate = resolve as () => void;
        })
      );

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleSave();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });

      act(() => {
        resolveUpdate?.();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
      });
    });

    it('저장 실패 시 에러를 설정해야 함', async () => {
      mockDocument.updateCustomer.mockRejectedValue(new Error('저장 실패'));

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      let success = false;
      await act(async () => {
        success = await result.current.handleSave();
      });

      expect(success).toBe(false);
      expect(result.current.errors?.['submit']).toBeTruthy();
      expect(result.current.isSubmitting).toBe(false);
    });

    it('null/빈값 필드를 제거하고 저장해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.mobile_phone', '');
        result.current.handleFieldChange('personal_info.email', '');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.personal_info?.mobile_phone).toBeUndefined();
      expect(callArgs?.personal_info?.email).toBeUndefined();
    });

    it('gender는 "M" 또는 "F"만 허용해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.gender', 'X' as any);
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.personal_info?.gender).toBeUndefined();
    });

    it('유효한 gender("M")는 포함해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.gender', 'F');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.personal_info?.gender).toBe('F');
    });

    it('빈 주소 필드는 제거해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.address.postal_code', '');
        result.current.handleFieldChange('personal_info.address.address1', '');
        result.current.handleFieldChange('personal_info.address.address2', '');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.personal_info?.address).toBeUndefined();
    });

    it('일부만 채워진 주소는 채워진 필드만 포함해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('personal_info.address.postal_code', '54321');
        result.current.handleFieldChange('personal_info.address.address1', '');
        result.current.handleFieldChange('personal_info.address.address2', '');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.personal_info?.address).toEqual({
        postal_code: '54321'
      });
    });

    it('insurance_info는 그대로 전달해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      act(() => {
        result.current.handleFieldChange('insurance_info.customer_type', '법인');
      });

      await act(async () => {
        await result.current.handleSave();
      });

      const callArgs = mockDocument.updateCustomer.mock.calls?.[0]?.[1];
      expect(callArgs?.insurance_info?.customer_type).toBe('법인');
    });
  });

  describe('통합 시나리오', () => {
    it('필드 변경 → 검증 → 저장 플로우가 정상 작동해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      // 1. 필드 변경
      act(() => {
        result.current.handleFieldChange('personal_info.name', '김철수');
        result.current.handleFieldChange('personal_info.mobile_phone', '010-9876-5432');
      });

      expect(result.current.formData.personal_info?.name).toBe('김철수');

      // 2. 검증
      let isValid = false;
      act(() => {
        isValid = result.current.validateAllFields();
      });

      expect(isValid).toBe(true);

      // 3. 저장
      let success = false;
      await act(async () => {
        success = await result.current.handleSave();
      });

      expect(success).toBe(true);
      expect(mockDocument.updateCustomer).toHaveBeenCalled();
    });

    it('탭 변경 → 필드 수정 → 저장 플로우가 정상 작동해야 함', async () => {
      mockDocument.updateCustomer.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCustomerEditController(mockCustomer));

      // 1. 탭 변경
      act(() => {
        result.current.handleTabChange('contact');
      });

      expect(result.current.activeTab).toBe('contact');

      // 2. 필드 수정
      act(() => {
        result.current.handleFieldChange('personal_info.mobile_phone', '010-9999-9999');
      });

      // 3. 저장
      let success = false;
      await act(async () => {
        success = await result.current.handleSave();
      });

      expect(success).toBe(true);
    });
  });
});

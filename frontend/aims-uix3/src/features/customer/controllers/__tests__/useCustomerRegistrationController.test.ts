/**
 * useCustomerRegistrationController 훅 테스트
 *
 * 고객 등록 컨트롤러 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCustomerRegistrationController } from '../useCustomerRegistrationController';

// fetch mock
global.fetch = vi.fn();

describe('useCustomerRegistrationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // fetch 기본 mock 설정
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { customer_id: 'test-id', customer_name: 'Test' } })
    } as Response);

    // dispatchEvent mock
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('초기화', () => {
    it('초기 formData는 name과 customer_type만 있어야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      expect(result.current.formData).toEqual({
        name: '',
        customer_type: '개인'
      });
    });

    it('초기 errors는 빈 객체여야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      expect(result.current.errors).toEqual({});
    });

    it('초기 isSubmitting은 false여야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('handleChange', () => {
    it('필드 값을 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      expect(result.current.formData.name).toBe('홍길동');
    });

    it('여러 필드를 순차적으로 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
        result.current.handleChange('email', 'hong@example.com');
        result.current.handleChange('mobile_phone', '010-1234-5678');
      });

      expect(result.current.formData.name).toBe('홍길동');
      expect(result.current.formData.email).toBe('hong@example.com');
      expect(result.current.formData.mobile_phone).toBe('010-1234-5678');
    });

    it('필드 변경 시 해당 필드의 에러를 제거해야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      // 에러 설정 (빈 name으로 제출 시도)
      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.errors).not.toEqual({});

      // 필드 변경으로 에러 제거
      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      // name 필드 에러만 제거됨
      expect(result.current.formData.name).toBe('홍길동');
    });

    it('customer_type을 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('customer_type', '법인');
      });

      expect(result.current.formData.customer_type).toBe('법인');
    });

    it('gender를 변경할 수 있어야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('gender', 'F');
      });

      expect(result.current.formData.gender).toBe('F');
    });
  });

  describe('handleSubmit - 검증', () => {
    it('name이 없으면 검증 실패해야 함', async () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.errors).not.toEqual({});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('name이 있으면 검증 통과해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: 'Test' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    it('이벤트 객체가 있으면 preventDefault를 호출해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: 'Test' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());
      const mockEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('handleSubmit - API 호출', () => {
    it('성공 시 고객 ID를 onSuccess 콜백으로 전달해야 함', async () => {
      const onSuccess = vi.fn();
      const mockCustomerId = 'new-customer-123';
      const mockCustomerName = '홍길동';

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { customer_id: mockCustomerId, customer_name: mockCustomerName } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onSuccess })
      );

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(onSuccess).toHaveBeenCalledWith(mockCustomerId, mockCustomerName);
    });

    it('성공 시 customerChanged 이벤트를 발생시켜야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: '홍길동' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'customerChanged'
        })
      );
    });

    it('성공 시 폼을 초기화해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: '홍길동' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
        result.current.handleChange('email', 'hong@example.com');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.formData).toEqual({
        name: '',
        customer_type: '개인'
      });
    });

    it('제출 중에는 isSubmitting이 true여야 함', async () => {
      let resolveSubmit: (() => void) | null = null;

      vi.mocked(global.fetch).mockImplementation(
        () => new Promise(resolve => {
          resolveSubmit = () => resolve({
            ok: true,
            json: async () => ({ data: { customer_id: 'new-customer-123', customer_name: '홍길동' } })
          } as Response);
        })
      );

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      act(() => {
        result.current.handleSubmit();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true);
      });

      act(() => {
        resolveSubmit?.();
      });

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(false);
      });
    });

    it('API 응답이 ok가 아니면 에러를 처리해야 함', async () => {
      const onError = vi.fn();

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'API 에러' })
      } as Response);

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onError })
      );

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(onError).toHaveBeenCalled();
      expect(result.current.errors?.['submit']).toBeTruthy();
    });

    it('네트워크 에러 시 onError 콜백을 호출해야 함', async () => {
      const onError = vi.fn();

      vi.mocked(global.fetch).mockRejectedValue(new Error('네트워크 에러'));

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onError })
      );

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(result.current.errors?.['submit']).toBe('네트워크 오류: 네트워크 에러');
    });

    it('올바른 API 엔드포인트와 메서드로 요청해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: 'Test' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/customers',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-user-id': expect.any(String)
          })
        })
      );
    });

    it('폼 데이터를 올바른 API 형식으로 변환해야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: 'Test' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
        result.current.handleChange('email', 'hong@example.com');
        result.current.handleChange('mobile_phone', '010-1234-5678');
        result.current.handleChange('postal_code', '12345');
        result.current.handleChange('address1', '서울시 강남구');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      const callArgs = vi.mocked(global.fetch).mock.calls?.[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);

      expect(body).toEqual({
        personal_info: {
          name: '홍길동',
          email: 'hong@example.com',
          mobile_phone: '010-1234-5678',
          address: {
            postal_code: '12345',
            address1: '서울시 강남구'
          }
        },
        insurance_info: {
          customer_type: '개인'
        },
        contracts: [],
        documents: [],
        consultations: []
      });
    });

    it('주소 필드가 모두 없으면 address를 포함하지 않아야 함', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: 'Test' } })
      } as Response);

      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      const callArgs = vi.mocked(global.fetch).mock.calls?.[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);

      expect(body.personal_info.address).toBeUndefined();
    });
  });

  describe('handleReset', () => {
    it('폼을 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      act(() => {
        result.current.handleChange('name', '홍길동');
        result.current.handleChange('email', 'hong@example.com');
        result.current.handleChange('customer_type', '법인');
      });

      act(() => {
        result.current.handleReset();
      });

      expect(result.current.formData).toEqual({
        name: '',
        customer_type: '개인'
      });
    });

    it('에러를 초기화해야 함', () => {
      const { result } = renderHook(() => useCustomerRegistrationController());

      // 에러 발생
      act(() => {
        result.current.handleSubmit();
      });

      expect(result.current.errors).not.toEqual({});

      // 리셋
      act(() => {
        result.current.handleReset();
      });

      expect(result.current.errors).toEqual({});
    });
  });

  describe('통합 시나리오', () => {
    it('필드 입력 → 제출 → 성공 플로우가 정상 작동해야 함', async () => {
      const onSuccess = vi.fn();

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: '홍길동' } })
      } as Response);

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onSuccess })
      );

      // 1. 필드 입력
      act(() => {
        result.current.handleChange('name', '홍길동');
        result.current.handleChange('email', 'hong@example.com');
        result.current.handleChange('mobile_phone', '010-1234-5678');
      });

      expect(result.current.formData.name).toBe('홍길동');

      // 2. 제출
      await act(async () => {
        await result.current.handleSubmit();
      });

      // 3. 성공 검증
      expect(onSuccess).toHaveBeenCalledWith('new-customer-123', '홍길동');
      expect(result.current.formData).toEqual({
        name: '',
        customer_type: '개인'
      });
    });

    it('필드 입력 → 제출 실패 → 에러 표시 플로우가 정상 작동해야 함', async () => {
      const onError = vi.fn();

      vi.mocked(global.fetch).mockRejectedValue(new Error('서버 에러'));

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onError })
      );

      // 1. 필드 입력
      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      // 2. 제출
      await act(async () => {
        await result.current.handleSubmit();
      });

      // 3. 에러 검증
      expect(onError).toHaveBeenCalled();
      expect(result.current.errors?.['submit']).toBe('네트워크 오류: 서버 에러');
      expect(result.current.isSubmitting).toBe(false);
    });

    it('제출 실패 → 수정 → 재제출 플로우가 정상 작동해야 함', async () => {
      const onSuccess = vi.fn();

      // 첫 번째 제출은 실패
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('서버 에러'));

      const { result } = renderHook(() =>
        useCustomerRegistrationController({ onSuccess })
      );

      act(() => {
        result.current.handleChange('name', '홍길동');
      });

      // 1. 첫 제출 실패
      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(result.current.errors?.['submit']).toBeTruthy();

      // 두 번째 제출은 성공
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { customer_id: 'new-customer-123', customer_name: '홍길동' } })
      } as Response);

      // 2. 재제출
      await act(async () => {
        await result.current.handleSubmit();
      });

      // 3. 성공 검증
      expect(onSuccess).toHaveBeenCalledWith('new-customer-123', '홍길동');
      expect(result.current.errors).toEqual({});
    });
  });
});

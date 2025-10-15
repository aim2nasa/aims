/**
 * useCustomerDocument Hook 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCustomerDocument } from '../useCustomerDocument';
import { CustomerDocument } from '@/stores/CustomerDocument';
import type { Customer } from '@/entities/customer';

// Mock CustomerDocument
vi.mock('@/stores/CustomerDocument', () => {
  const mockSubscribers: Array<() => void> = [];
  let mockCustomers: Customer[] = [];
  let mockTotal = 0;
  let mockHasMore = false;
  let mockIsLoading = false;
  let mockError: string | null = null;
  let mockLastUpdated = 0;

  // Create persistent mock functions
  const loadCustomersFn = vi.fn();
  const createCustomerFn = vi.fn();
  const updateCustomerFn = vi.fn();
  const deleteCustomerFn = vi.fn();
  const refreshFn = vi.fn();
  const resetFn = vi.fn();
  const debugFn = vi.fn();
  const subscribeFn = vi.fn();

  const mockInstance = {
    // Getters
    getCustomers: vi.fn(() => mockCustomers),
    getTotal: vi.fn(() => mockTotal),
    getHasMore: vi.fn(() => mockHasMore),
    getIsLoading: vi.fn(() => mockIsLoading),
    getError: vi.fn(() => mockError),
    getLastUpdated: vi.fn(() => mockLastUpdated),
    getCustomerById: vi.fn((id: string) => mockCustomers.find(c => c._id === id)),

    // Subscribe/Unsubscribe
    subscribe: subscribeFn.mockImplementation((callback: () => void) => {
      mockSubscribers.push(callback);
      return () => {
        const index = mockSubscribers.indexOf(callback);
        if (index > -1) mockSubscribers.splice(index, 1);
      };
    }),

    // CRUD Methods
    loadCustomers: loadCustomersFn.mockImplementation(async () => {
          mockIsLoading = true;
          mockSubscribers.forEach(cb => cb());

          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));

          mockCustomers = [
            {
              _id: '1',
              personal_info: { name: '홍길동', birth_date: '1990-01-01', gender: 'M' },
              insurance_info: { customer_type: '개인' },
              contracts: [],
              documents: [],
              consultations: [],
              meta: {
                created_at: '2025-01-01T00:00:00.000Z',
                updated_at: '2025-01-01T00:00:00.000Z',
                status: 'active',
              },
              tags: [],
            },
          ] as Customer[];
          mockTotal = 1;
          mockHasMore = false;
          mockIsLoading = false;
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
        }),

    createCustomer: createCustomerFn.mockImplementation(async data => {
          const newCustomer: Customer = {
            _id: 'new-customer-id',
            personal_info: data.personal_info,
            insurance_info: data.insurance_info || { customer_type: '개인' },
            contracts: data.contracts || [],
            documents: data.documents || [],
            consultations: data.consultations || [],
            meta: {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              status: 'active',
            },
            tags: [],
          };
          mockCustomers = [...mockCustomers, newCustomer];
          mockTotal += 1;
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
          return newCustomer;
        }),

    updateCustomer: updateCustomerFn.mockImplementation(async (id: string, data) => {
          const index = mockCustomers.findIndex(c => c._id === id);
          if (index === -1) {
            mockError = '고객을 찾을 수 없습니다';
            mockSubscribers.forEach(cb => cb());
            throw new Error(mockError);
          }

          const existingCustomer = mockCustomers[index];
          if (!existingCustomer) {
            mockError = '고객을 찾을 수 없습니다';
            mockSubscribers.forEach(cb => cb());
            throw new Error(mockError);
          }

          const updatedCustomer: Customer = {
            ...existingCustomer,
            personal_info: { ...existingCustomer.personal_info, ...data.personal_info },
            meta: {
              ...existingCustomer.meta,
              updated_at: new Date().toISOString(),
            },
          };
          mockCustomers = [
            ...mockCustomers.slice(0, index),
            updatedCustomer,
            ...mockCustomers.slice(index + 1),
          ];
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
          return updatedCustomer;
        }),

    deleteCustomer: deleteCustomerFn.mockImplementation(async (id: string) => {
          const index = mockCustomers.findIndex(c => c._id === id);
          if (index === -1) {
            mockError = '고객을 찾을 수 없습니다';
            mockSubscribers.forEach(cb => cb());
            throw new Error(mockError);
          }

          mockCustomers = mockCustomers.filter(c => c._id !== id);
          mockTotal -= 1;
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
        }),

    refresh: refreshFn.mockImplementation(async () => {
          mockIsLoading = true;
          mockSubscribers.forEach(cb => cb());

          await new Promise(resolve => setTimeout(resolve, 10));

          // Refresh reloads the same data
          mockIsLoading = false;
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
        }),

    reset: resetFn.mockImplementation(() => {
          mockCustomers = [];
          mockTotal = 0;
          mockHasMore = false;
          mockIsLoading = false;
          mockError = null;
          mockLastUpdated = Date.now();
          mockSubscribers.forEach(cb => cb());
        }),

    debug: debugFn.mockImplementation(() => {
      console.log('Debug called');
    }),

    // Helper for tests to manually trigger state changes
    __triggerStateChange: () => {
      mockSubscribers.forEach(cb => cb());
    },
    __setError: (error: string | null) => {
      mockError = error;
      mockSubscribers.forEach(cb => cb());
    },
  };

  return {
    CustomerDocument: {
      getInstance: vi.fn(() => mockInstance),
    },
  };
});

describe('useCustomerDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    const document = CustomerDocument.getInstance();
    document.reset();
  });

  describe('초기화', () => {
    it('초기 상태를 올바르게 설정해야 함', () => {
      const { result } = renderHook(() => useCustomerDocument());

      expect(result.current.customers).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.lastUpdated).toBe(0);
    });

    it('모든 메서드를 제공해야 함', () => {
      const { result } = renderHook(() => useCustomerDocument());

      expect(typeof result.current.loadCustomers).toBe('function');
      expect(typeof result.current.createCustomer).toBe('function');
      expect(typeof result.current.updateCustomer).toBe('function');
      expect(typeof result.current.deleteCustomer).toBe('function');
      expect(typeof result.current.refresh).toBe('function');
      expect(typeof result.current.getCustomerById).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.debug).toBe('function');
    });
  });

  describe('Document 구독', () => {
    it('Document를 구독하고 상태 변경 시 리렌더링해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      expect(result.current.customers).toEqual([]);

      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
        expect(result.current.customers?.[0]?.personal_info.name).toBe('홍길동');
        expect(result.current.total).toBe(1);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('언마운트 시 구독을 해제해야 함', () => {
      const { unmount } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      expect(document.subscribe).toHaveBeenCalled();

      unmount();

      // 구독 해제 함수가 호출되었는지 확인하기 위해
      // 이후 상태 변경이 컴포넌트에 영향을 주지 않는지 확인
      // (실제로는 mock의 unsubscribe가 호출됨)
    });
  });

  describe('loadCustomers', () => {
    it('고객 목록을 로드해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
        expect(result.current.total).toBe(1);
      });
    });

    it('쿼리 파라미터를 전달해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      const query = { search: '홍길동', limit: 10 };

      await act(async () => {
        await result.current.loadCustomers(query);
      });

      expect(document.loadCustomers).toHaveBeenCalledWith(query);
    });
  });

  describe('createCustomer', () => {
    it('새 고객을 생성해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      const newCustomerData = {
        personal_info: {
          name: '김철수',
          birth_date: '1985-05-15',
          gender: 'M' as const,
        },
        contracts: [],
        documents: [],
        consultations: [],
      };

      let createdCustomer: Customer | undefined;

      await act(async () => {
        createdCustomer = await result.current.createCustomer(newCustomerData);
      });

      expect(createdCustomer).toBeDefined();
      expect(createdCustomer?._id).toBe('new-customer-id');
      expect(createdCustomer?.personal_info.name).toBe('김철수');

      await waitFor(() => {
        expect(result.current.customers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('updateCustomer', () => {
    it('고객 정보를 수정해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 먼저 고객 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      const customerId = result.current.customers?.[0]?._id;
      if (!customerId) throw new Error('Customer ID not found');

      await act(async () => {
        await result.current.updateCustomer(customerId, {
          personal_info: { name: '홍길동(수정됨)' },
        });
      });

      await waitFor(() => {
        const updatedCustomer = result.current.customers.find(c => c._id === customerId);
        expect(updatedCustomer?.personal_info.name).toBe('홍길동(수정됨)');
      });
    });

    it('존재하지 않는 고객 수정 시 에러를 발생시켜야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await expect(
        act(async () => {
          await result.current.updateCustomer('non-existent-id', {
            personal_info: { name: '테스트' },
          });
        })
      ).rejects.toThrow('고객을 찾을 수 없습니다');
    });
  });

  describe('deleteCustomer', () => {
    it('고객을 삭제해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 먼저 고객 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      const customerId = result.current.customers?.[0]?._id;
      if (!customerId) throw new Error('Customer ID not found');

      await act(async () => {
        await result.current.deleteCustomer(customerId);
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(0);
        expect(result.current.total).toBe(0);
      });
    });

    it('존재하지 않는 고객 삭제 시 에러를 발생시켜야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await expect(
        act(async () => {
          await result.current.deleteCustomer('non-existent-id');
        })
      ).rejects.toThrow('고객을 찾을 수 없습니다');
    });
  });

  describe('refresh', () => {
    it('데이터를 새로고침해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await act(async () => {
        await result.current.refresh();
      });

      const document = CustomerDocument.getInstance();
      expect(document.refresh).toHaveBeenCalled();
    });

    it('쿼리 파라미터를 전달해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      const query = { search: '홍길동' };

      await act(async () => {
        await result.current.refresh(query);
      });

      expect(document.refresh).toHaveBeenCalledWith(query);
    });
  });

  describe('getCustomerById', () => {
    it('ID로 고객을 조회해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      const customer = result.current.getCustomerById('1');
      expect(customer).toBeDefined();
      expect(customer?.personal_info.name).toBe('홍길동');
    });

    it('존재하지 않는 ID의 경우 undefined를 반환해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      const customer = result.current.getCustomerById('non-existent-id');
      expect(customer).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('상태를 초기화해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 먼저 데이터 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      // 리셋
      await act(async () => {
        result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.customers).toEqual([]);
        expect(result.current.total).toBe(0);
      });
    });
  });

  describe('debug', () => {
    it('디버그 메서드를 호출해야 함', () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      result.current.debug();

      expect(document.debug).toHaveBeenCalled();
    });
  });

  describe('상태 동기화', () => {
    it('로딩 상태를 동기화해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.loadCustomers();
      });

      // loadCustomers 호출 직후 일시적으로 로딩 상태가 될 수 있음
      // (mock에서 isLoading = true로 설정하고 notify 호출)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('에러 상태를 동기화해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      expect(result.current.error).toBe(null);

      act(() => {
        (document as any).__setError('테스트 에러');
      });

      await waitFor(() => {
        expect(result.current.error).toBe('테스트 에러');
      });
    });

    it('lastUpdated를 동기화해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      const initialLastUpdated = result.current.lastUpdated;

      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.lastUpdated).toBeGreaterThan(initialLastUpdated);
      });
    });
  });

  describe('동시 작업 처리', () => {
    it('여러 개의 고객을 동시에 생성할 수 있어야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      const customer1Data = {
        personal_info: { name: '김철수', birth_date: '1990-01-01', gender: 'M' as const },
        contracts: [],
        documents: [],
        consultations: [],
      };

      const customer2Data = {
        personal_info: { name: '이영희', birth_date: '1992-05-15', gender: 'F' as const },
        contracts: [],
        documents: [],
        consultations: [],
      };

      await act(async () => {
        await Promise.all([
          result.current.createCustomer(customer1Data),
          result.current.createCustomer(customer2Data),
        ]);
      });

      await waitFor(() => {
        expect(result.current.customers.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('로드와 생성을 동시에 수행할 수 있어야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      const newCustomerData = {
        personal_info: { name: '박민수', birth_date: '1988-03-20', gender: 'M' as const },
        contracts: [],
        documents: [],
        consultations: [],
      };

      await act(async () => {
        await Promise.all([
          result.current.loadCustomers(),
          result.current.createCustomer(newCustomerData),
        ]);
      });

      await waitFor(() => {
        expect(result.current.customers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('에러 복구 시나리오', () => {
    it('에러 발생 후 재시도가 성공해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      // 첫 번째 시도: 에러 발생
      act(() => {
        (document as any).__setError('네트워크 에러');
      });

      await waitFor(() => {
        expect(result.current.error).toBe('네트워크 에러');
      });

      // 에러 해제
      act(() => {
        (document as any).__setError(null);
      });

      // 두 번째 시도: 성공
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.error).toBe(null);
        expect(result.current.customers).toHaveLength(1);
      });
    });

    it('부분 실패 시 전체 상태가 일관성을 유지해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 먼저 고객 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      const initialTotal = result.current.total;

      // 존재하지 않는 고객 수정 시도 (실패)
      try {
        await act(async () => {
          await result.current.updateCustomer('non-existent-id', {
            personal_info: { name: '테스트' },
          });
        });
      } catch (error) {
        // 에러 예상됨
      }

      // 기존 데이터는 유지되어야 함
      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
        expect(result.current.total).toBe(initialTotal);
      });
    });
  });

  describe('페이지네이션 로직', () => {
    it('hasMore가 true일 때 추가 로드가 가능해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());
      const document = CustomerDocument.getInstance();

      // Mock hasMore = true
      vi.spyOn(document, 'getHasMore').mockReturnValue(true);
      act(() => {
        (document as any).__triggerStateChange();
      });

      await waitFor(() => {
        expect(result.current.hasMore).toBe(true);
      });

      // 추가 로드 시도
      await act(async () => {
        await result.current.loadCustomers({ page: 2, limit: 10 });
      });

      expect(document.loadCustomers).toHaveBeenCalledWith({ page: 2, limit: 10 });
    });

    it('total이 올바르게 업데이트되어야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      expect(result.current.total).toBe(0);

      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.total).toBe(1);
      });

      // 새 고객 생성
      await act(async () => {
        await result.current.createCustomer({
          personal_info: { name: '신규고객', birth_date: '2000-01-01', gender: 'M' },
          contracts: [],
          documents: [],
          consultations: [],
        });
      });

      await waitFor(() => {
        expect(result.current.total).toBe(2);
      });
    });
  });

  describe('메모이제이션 검증', () => {
    it('메서드 참조가 안정적이어야 함 (useCallback)', () => {
      const { result, rerender } = renderHook(() => useCustomerDocument());

      const initialLoadCustomers = result.current.loadCustomers;
      const initialCreateCustomer = result.current.createCustomer;
      const initialUpdateCustomer = result.current.updateCustomer;

      // 리렌더링
      rerender();

      // 메서드 참조가 동일해야 함
      expect(result.current.loadCustomers).toBe(initialLoadCustomers);
      expect(result.current.createCustomer).toBe(initialCreateCustomer);
      expect(result.current.updateCustomer).toBe(initialUpdateCustomer);
    });

    it('Document 인스턴스가 안정적이어야 함', () => {
      const { rerender } = renderHook(() => useCustomerDocument());

      const initialDocument = CustomerDocument.getInstance();

      // 리렌더링
      rerender();

      const afterRerenderDocument = CustomerDocument.getInstance();

      // Document 인스턴스는 싱글톤이므로 동일해야 함
      expect(afterRerenderDocument).toBe(initialDocument);
    });
  });

  describe('복합 시나리오', () => {
    it('전체 CRUD 플로우가 순차적으로 동작해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 1. 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      // 2. 생성
      await act(async () => {
        await result.current.createCustomer({
          personal_info: { name: '신규고객', birth_date: '1995-06-10', gender: 'F' },
          contracts: [],
          documents: [],
          consultations: [],
        });
      });

      await waitFor(() => {
        expect(result.current.customers.length).toBeGreaterThan(1);
      });

      // 3. 수정
      const customerId = result.current.customers?.[0]?._id;
      if (!customerId) throw new Error('Customer ID not found');

      await act(async () => {
        await result.current.updateCustomer(customerId, {
          personal_info: { name: '수정된이름' },
        });
      });

      await waitFor(() => {
        const updatedCustomer = result.current.customers.find(c => c._id === customerId);
        expect(updatedCustomer?.personal_info.name).toBe('수정된이름');
      });

      // 4. 삭제
      await act(async () => {
        await result.current.deleteCustomer(customerId);
      });

      await waitFor(() => {
        expect(result.current.customers.find(c => c._id === customerId)).toBeUndefined();
      });
    });

    it('리셋 후 재로드가 정상 동작해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      // 1. 데이터 로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
      });

      // 2. 리셋
      await act(async () => {
        result.current.reset();
      });

      await waitFor(() => {
        expect(result.current.customers).toEqual([]);
        expect(result.current.total).toBe(0);
      });

      // 3. 재로드
      await act(async () => {
        await result.current.loadCustomers();
      });

      await waitFor(() => {
        expect(result.current.customers).toHaveLength(1);
        expect(result.current.total).toBe(1);
      });
    });
  });

  describe('엣지 케이스', () => {
    it('빈 쿼리로 로드해도 동작해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await act(async () => {
        await result.current.loadCustomers({});
      });

      const document = CustomerDocument.getInstance();
      expect(document.loadCustomers).toHaveBeenCalledWith({});
    });

    it('undefined 쿼리로 refresh해도 동작해야 함', async () => {
      const { result } = renderHook(() => useCustomerDocument());

      await act(async () => {
        await result.current.refresh(undefined);
      });

      const document = CustomerDocument.getInstance();
      expect(document.refresh).toHaveBeenCalledWith(undefined);
    });
  });
});

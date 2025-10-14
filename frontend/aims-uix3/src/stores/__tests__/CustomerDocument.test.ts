/**
 * CustomerDocument Unit Tests
 * @since 2025-10-14
 * @description Singleton + Observer 패턴을 사용하는 CustomerDocument 종합 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CustomerDocument } from '../CustomerDocument'
import { CustomerService } from '@/services/customerService'
import type { Customer } from '@/entities/customer'

// CustomerService 모킹
vi.mock('@/services/customerService', () => ({
  CustomerService: {
    getCustomers: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
  },
}))

describe('CustomerDocument', () => {
  let document: CustomerDocument

  beforeEach(() => {
    // 각 테스트마다 새로운 인스턴스를 얻음
    document = CustomerDocument.getInstance()
    // 상태 초기화
    document.reset()
    vi.clearAllMocks()
  })

  afterEach(() => {
    // 테스트 후 정리
    document.reset()
  })

  // ============================================================================
  // 1. Singleton 패턴
  // ============================================================================
  describe('Singleton Pattern', () => {
    it('getInstance()는 항상 동일한 인스턴스를 반환해야 함', () => {
      const instance1 = CustomerDocument.getInstance()
      const instance2 = CustomerDocument.getInstance()
      const instance3 = CustomerDocument.getInstance()

      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
    })

    it('여러 번 호출해도 단일 인스턴스만 존재해야 함', () => {
      const instances: CustomerDocument[] = []

      for (let i = 0; i < 10; i++) {
        instances.push(CustomerDocument.getInstance())
      }

      const firstInstance = instances[0]
      instances.forEach((instance) => {
        expect(instance).toBe(firstInstance)
      })
    })
  })

  // ============================================================================
  // 2. Observer 패턴
  // ============================================================================
  describe('Observer Pattern', () => {
    it('subscribe()는 unsubscribe 함수를 반환해야 함', () => {
      const callback = vi.fn()
      const unsubscribe = document.subscribe(callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('상태 변경 시 모든 구독자에게 알림을 보내야 함', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      document.subscribe(callback1)
      document.subscribe(callback2)
      document.subscribe(callback3)

      // notify는 private이므로 상태를 변경하는 public 메서드를 통해 테스트
      document.reset() // reset은 notify를 호출함

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe 후에는 알림을 받지 않아야 함', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsubscribe1 = document.subscribe(callback1)
      document.subscribe(callback2)

      // callback1 구독 해제
      unsubscribe1()

      document.reset()

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })

    it('동일한 콜백을 여러 번 구독할 수 있어야 함', () => {
      const callback = vi.fn()

      document.subscribe(callback)
      document.subscribe(callback)

      document.reset()

      // Set을 사용하므로 중복 제거되어 1번만 호출됨
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('여러 구독자 중 일부만 해제할 수 있어야 함', () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      const unsubscribe1 = document.subscribe(callback1)
      const unsubscribe2 = document.subscribe(callback2)
      document.subscribe(callback3)

      unsubscribe1()
      unsubscribe2()

      document.reset()

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).not.toHaveBeenCalled()
      expect(callback3).toHaveBeenCalledTimes(1)
    })

    it('구독자가 없을 때도 안전하게 동작해야 함', () => {
      expect(() => {
        document.reset()
      }).not.toThrow()
    })
  })

  // ============================================================================
  // 3. 초기 상태
  // ============================================================================
  describe('Initial State', () => {
    it('초기 customers는 빈 배열이어야 함', () => {
      expect(document.getCustomers()).toEqual([])
    })

    it('초기 total은 0이어야 함', () => {
      expect(document.getTotal()).toBe(0)
    })

    it('초기 hasMore는 false여야 함', () => {
      expect(document.getHasMore()).toBe(false)
    })

    it('초기 isLoading은 false여야 함', () => {
      expect(document.getIsLoading()).toBe(false)
    })

    it('초기 error는 null이어야 함', () => {
      expect(document.getError()).toBeNull()
    })
  })

  // ============================================================================
  // 4. loadCustomers() - 고객 목록 로딩
  // ============================================================================
  describe('loadCustomers', () => {
    it('고객 목록을 로드해야 함', async () => {
      const mockCustomers: Customer[] = [
        {
          _id: 'customer1',
          name: '홍길동',
          birth: '1990-01-01',
          gender: 'M',
          phone: '010-1234-5678',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
        },
      ]

      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: mockCustomers,
        total: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      })

      await document.loadCustomers()

      expect(document.getCustomers()).toEqual(mockCustomers)
      expect(document.getTotal()).toBe(1)
      expect(document.getHasMore()).toBe(false)
    })

    it('로딩 중 isLoading을 true로 설정해야 함', async () => {
      vi.mocked(CustomerService.getCustomers).mockImplementationOnce(() => {
        // 로딩 중 상태 확인
        expect(document.getIsLoading()).toBe(true)
        return Promise.resolve({ customers: [], total: 0, hasMore: false, offset: 0, limit: 10 })
      })

      await document.loadCustomers()

      expect(document.getIsLoading()).toBe(false)
    })

    it('로딩 완료 후 isLoading을 false로 설정해야 함', async () => {
      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
      })

      await document.loadCustomers()

      expect(document.getIsLoading()).toBe(false)
    })

    it('에러 발생 시 error를 설정해야 함', async () => {
      const errorMessage = 'Failed to load customers'
      vi.mocked(CustomerService.getCustomers).mockRejectedValueOnce(new Error(errorMessage))

      await document.loadCustomers()

      expect(document.getError()).toBe(errorMessage)
      expect(document.getIsLoading()).toBe(false)
    })

    it('쿼리 파라미터를 전달해야 함', async () => {
      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 20,
      })

      await document.loadCustomers({ limit: 20, offset: 10 })

      expect(CustomerService.getCustomers).toHaveBeenCalledWith({ limit: 20, offset: 10 })
    })

    it('구독자에게 알림을 보내야 함', async () => {
      const callback = vi.fn()
      document.subscribe(callback)

      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
      })

      await document.loadCustomers()

      // 로딩 시작, 로딩 완료로 최소 2번 호출됨
      expect(callback).toHaveBeenCalled()
    })

    it('lastUpdated를 갱신해야 함', async () => {
      const beforeTime = Date.now()

      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 10,
      })

      await document.loadCustomers()

      const afterTime = Date.now()
      const lastUpdated = document.getLastUpdated()

      expect(lastUpdated).toBeGreaterThanOrEqual(beforeTime)
      expect(lastUpdated).toBeLessThanOrEqual(afterTime)
    })
  })

  // ============================================================================
  // 5. createCustomer() - 고객 생성
  // ============================================================================
  describe('createCustomer', () => {
    it('새 고객을 생성하고 목록에 추가해야 함', async () => {
      const newCustomer: Customer = {
        _id: 'new-customer',
        name: '김철수',
        birth: '1985-05-15',
        gender: 'M',
        phone: '010-9876-5432',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
      }

      vi.mocked(CustomerService.createCustomer).mockResolvedValueOnce(newCustomer)

      const result = await document.createCustomer({
        name: '김철수',
        birth: '1985-05-15',
        gender: 'M',
        phone: '010-9876-5432',
      })

      expect(result).toEqual(newCustomer)
      expect(document.getCustomers()).toContainEqual(newCustomer)
      expect(document.getTotal()).toBe(1)
    })

    it('구독자에게 알림을 보내야 함', async () => {
      const callback = vi.fn()
      document.subscribe(callback)

      vi.mocked(CustomerService.createCustomer).mockResolvedValueOnce({
        _id: 'new-customer',
        name: '김철수',
        birth: '1985-05-15',
        gender: 'M',
        phone: '010-9876-5432',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
      })

      await document.createCustomer({
        name: '김철수',
        birth: '1985-05-15',
        gender: 'M',
        phone: '010-9876-5432',
      })

      expect(callback).toHaveBeenCalled()
    })

    it('에러 발생 시 에러를 던져야 함', async () => {
      vi.mocked(CustomerService.createCustomer).mockRejectedValueOnce(
        new Error('Create failed')
      )

      await expect(
        document.createCustomer({
          name: '김철수',
          birth: '1985-05-15',
          gender: 'M',
          phone: '010-9876-5432',
        })
      ).rejects.toThrow('Create failed')
    })
  })

  // ============================================================================
  // 6. updateCustomer() - 고객 수정
  // ============================================================================
  describe('updateCustomer', () => {
    it('고객 정보를 수정하고 목록을 업데이트해야 함', async () => {
      const existingCustomer: Customer = {
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-1234-5678',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
      }

      // 기존 고객 추가
      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [existingCustomer],
        total: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      })
      await document.loadCustomers()

      const updatedCustomer: Customer = {
        ...existingCustomer,
        phone: '010-9999-9999',
        updatedAt: '2025-10-14T11:00:00Z',
      }

      vi.mocked(CustomerService.updateCustomer).mockResolvedValueOnce(updatedCustomer)

      const result = await document.updateCustomer('customer1', { phone: '010-9999-9999' })

      expect(result).toEqual(updatedCustomer)
      expect(document.getCustomers()[0].phone).toBe('010-9999-9999')
    })

    it('존재하지 않는 고객 수정 시에도 처리해야 함', async () => {
      const updatedCustomer: Customer = {
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-9999-9999',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
      }

      vi.mocked(CustomerService.updateCustomer).mockResolvedValueOnce(updatedCustomer)

      const result = await document.updateCustomer('customer1', { phone: '010-9999-9999' })

      expect(result).toEqual(updatedCustomer)
    })

    it('구독자에게 알림을 보내야 함', async () => {
      const callback = vi.fn()
      document.subscribe(callback)

      vi.mocked(CustomerService.updateCustomer).mockResolvedValueOnce({
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-9999-9999',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
      })

      await document.updateCustomer('customer1', { phone: '010-9999-9999' })

      expect(callback).toHaveBeenCalled()
    })

    it('에러 발생 시 에러를 던져야 함', async () => {
      vi.mocked(CustomerService.updateCustomer).mockRejectedValueOnce(
        new Error('Update failed')
      )

      await expect(
        document.updateCustomer('customer1', { phone: '010-9999-9999' })
      ).rejects.toThrow('Update failed')
    })
  })

  // ============================================================================
  // 7. deleteCustomer() - 고객 삭제
  // ============================================================================
  describe('deleteCustomer', () => {
    it('고객을 삭제하고 목록에서 제거해야 함', async () => {
      const customers: Customer[] = [
        {
          _id: 'customer1',
          name: '홍길동',
          birth: '1990-01-01',
          gender: 'M',
          phone: '010-1234-5678',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
        },
        {
          _id: 'customer2',
          name: '김철수',
          birth: '1985-05-15',
          gender: 'M',
          phone: '010-9876-5432',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
        },
      ]

      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers,
        total: 2,
        hasMore: false,
        offset: 0,
        limit: 10,
      })
      await document.loadCustomers()

      vi.mocked(CustomerService.deleteCustomer).mockResolvedValueOnce(undefined)

      await document.deleteCustomer('customer1')

      expect(document.getCustomers()).toHaveLength(1)
      expect(document.getCustomers()[0]._id).toBe('customer2')
      expect(document.getTotal()).toBe(1)
    })

    it('구독자에게 알림을 보내야 함', async () => {
      const callback = vi.fn()
      document.subscribe(callback)

      vi.mocked(CustomerService.deleteCustomer).mockResolvedValueOnce(undefined)

      await document.deleteCustomer('customer1')

      expect(callback).toHaveBeenCalled()
    })

    it('에러 발생 시 에러를 던져야 함', async () => {
      vi.mocked(CustomerService.deleteCustomer).mockRejectedValueOnce(
        new Error('Delete failed')
      )

      await expect(document.deleteCustomer('customer1')).rejects.toThrow('Delete failed')
    })
  })

  // ============================================================================
  // 8. getCustomerById() - ID로 고객 조회
  // ============================================================================
  describe('getCustomerById', () => {
    it('ID로 고객을 찾아야 함', async () => {
      const customers: Customer[] = [
        {
          _id: 'customer1',
          name: '홍길동',
          birth: '1990-01-01',
          gender: 'M',
          phone: '010-1234-5678',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
        },
      ]

      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers,
        total: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      })
      await document.loadCustomers()

      const customer = document.getCustomerById('customer1')

      expect(customer).toBeDefined()
      expect(customer?._id).toBe('customer1')
    })

    it('존재하지 않는 ID는 undefined를 반환해야 함', () => {
      const customer = document.getCustomerById('non-existent')

      expect(customer).toBeUndefined()
    })
  })

  // ============================================================================
  // 9. refresh() - 강제 새로고침
  // ============================================================================
  describe('refresh', () => {
    it('현재 쿼리로 목록을 새로고침해야 함', async () => {
      const mockCustomers: Customer[] = [
        {
          _id: 'customer1',
          name: '홍길동',
          birth: '1990-01-01',
          gender: 'M',
          phone: '010-1234-5678',
          createdAt: '2025-10-14T10:00:00Z',
          updatedAt: '2025-10-14T10:00:00Z',
        },
      ]

      vi.mocked(CustomerService.getCustomers).mockResolvedValue({
        customers: mockCustomers,
        total: 1,
        hasMore: false,
        offset: 0,
        limit: 10,
      })

      await document.refresh()

      expect(CustomerService.getCustomers).toHaveBeenCalled()
      expect(document.getCustomers()).toEqual(mockCustomers)
    })

    it('쿼리 파라미터를 전달할 수 있어야 함', async () => {
      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit: 20,
      })

      await document.refresh({ limit: 20 })

      expect(CustomerService.getCustomers).toHaveBeenCalledWith({ limit: 20 })
    })
  })

  // ============================================================================
  // 10. reset() - 상태 초기화
  // ============================================================================
  describe('reset', () => {
    it('모든 상태를 초기값으로 리셋해야 함', async () => {
      // 상태 변경
      vi.mocked(CustomerService.getCustomers).mockResolvedValueOnce({
        customers: [
          {
            _id: 'customer1',
            name: '홍길동',
            birth: '1990-01-01',
            gender: 'M',
            phone: '010-1234-5678',
            createdAt: '2025-10-14T10:00:00Z',
            updatedAt: '2025-10-14T10:00:00Z',
          },
        ],
        total: 1,
        hasMore: true,
        offset: 0,
        limit: 10,
      })
      await document.loadCustomers()

      // 리셋
      document.reset()

      expect(document.getCustomers()).toEqual([])
      expect(document.getTotal()).toBe(0)
      expect(document.getHasMore()).toBe(false)
      expect(document.getIsLoading()).toBe(false)
      expect(document.getError()).toBeNull()
      // notify()가 lastUpdated를 갱신하므로 0보다 큰 값이어야 함
      expect(document.getLastUpdated()).toBeGreaterThan(0)
    })

    it('구독자에게 알림을 보내야 함', () => {
      const callback = vi.fn()
      document.subscribe(callback)

      document.reset()

      expect(callback).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // 11. debug() - 디버깅
  // ============================================================================
  describe('debug', () => {
    it('에러 없이 실행되어야 함', () => {
      expect(() => {
        document.debug()
      }).not.toThrow()
    })
  })

  // ============================================================================
  // 12. 복합 시나리오
  // ============================================================================
  describe('Complex Scenarios', () => {
    it('CRUD 작업을 순차적으로 수행해야 함', async () => {
      // Create
      vi.mocked(CustomerService.createCustomer).mockResolvedValueOnce({
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-1234-5678',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
      })

      await document.createCustomer({
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-1234-5678',
      })

      expect(document.getCustomers()).toHaveLength(1)

      // Update
      vi.mocked(CustomerService.updateCustomer).mockResolvedValueOnce({
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-9999-9999',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T11:00:00Z',
      })

      await document.updateCustomer('customer1', { phone: '010-9999-9999' })

      expect(document.getCustomers()[0].phone).toBe('010-9999-9999')

      // Delete
      vi.mocked(CustomerService.deleteCustomer).mockResolvedValueOnce(undefined)

      await document.deleteCustomer('customer1')

      expect(document.getCustomers()).toHaveLength(0)
    })

    it('여러 구독자가 동시에 동작해야 함', async () => {
      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      document.subscribe(callback1)
      document.subscribe(callback2)
      document.subscribe(callback3)

      vi.mocked(CustomerService.createCustomer).mockResolvedValueOnce({
        _id: 'customer1',
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-1234-5678',
        createdAt: '2025-10-14T10:00:00Z',
        updatedAt: '2025-10-14T10:00:00Z',
      })

      await document.createCustomer({
        name: '홍길동',
        birth: '1990-01-01',
        gender: 'M',
        phone: '010-1234-5678',
      })

      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
      expect(callback3).toHaveBeenCalled()
    })
  })
})

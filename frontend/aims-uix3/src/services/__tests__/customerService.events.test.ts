/**
 * customerService.events.test.ts
 * @since 2025-12-07
 * @version 1.0.0
 *
 * CustomerService의 이벤트 발생 검증 테스트
 * - deleteCustomer: customerChanged 이벤트 + Zustand store 필터 변경
 * - restoreCustomer: customerChanged 이벤트 + Zustand store 필터 변경
 * - permanentDeleteCustomer: customerChanged, contractChanged, documentChanged 이벤트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CustomerService } from '../customerService'
import { api } from '@/shared/lib/api'
import type { Customer } from '@/entities/customer'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string) {
      super(message)
      this.name = 'ApiError'
    }
  },
}))

// queryClient 모듈 모킹 — invalidateQueries가 queryClient 싱글턴에 의존하므로
vi.mock('@/app/queryClient', () => ({
  invalidateQueries: {
    customers: vi.fn(),
    customer: vi.fn(),
    relationships: vi.fn(),
    documents: vi.fn(),
    all: vi.fn(),
    allCustomers: vi.fn(),
    allRelationships: vi.fn(),
    customerChanged: vi.fn(() => {
      // 레거시 호환 이벤트 발생 (실제 구현과 동일)
      window.dispatchEvent(new CustomEvent('customerChanged'))
    }),
    contractChanged: vi.fn(() => {
      window.dispatchEvent(new CustomEvent('contractChanged'))
    }),
    documentChanged: vi.fn(() => {
      window.dispatchEvent(new CustomEvent('documentChanged'))
    }),
    relationshipChanged: vi.fn(() => {
      window.dispatchEvent(new CustomEvent('relationshipChanged'))
    }),
    documentLinked: vi.fn(),
    refreshDocumentLibrary: vi.fn(),
  },
  queryClient: {
    invalidateQueries: vi.fn(),
  },
  queryKeys: {
    all: ['aims'],
    customers: () => ['aims', 'customers'],
    relationships: () => ['aims', 'relationships'],
    documents: () => ['aims', 'documents'],
  },
}))

// customerStatusFilterStore 모킹 — Zustand store
const mockRequestFilterChange = vi.fn()
vi.mock('@/shared/store/useCustomerStatusFilterStore', () => ({
  useCustomerStatusFilterStore: {
    getState: () => ({
      requestFilterChange: mockRequestFilterChange,
    }),
  },
}))

// ==================== Mock Data ====================

const createMockCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  _id: 'cust-001',
  personal_info: {
    name: '홍길동',
    mobile_phone: '010-1234-5678',
  },
  insurance_info: {
    customer_type: '개인',
  },
  contracts: [],
  documents: [],
  consultations: [],
  meta: {
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-15T00:00:00.000Z',
    status: 'active',
  },
  tags: [],
  ...overrides,
})

// ==================== Tests ====================

describe('CustomerService - Event Dispatching', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>
  let dispatchedEvents: Array<{ type: string; detail?: unknown }>

  beforeEach(() => {
    vi.clearAllMocks()
    dispatchedEvents = []

    // window.dispatchEvent 모킹 - 이벤트 타입과 detail 캡처
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      if (event instanceof CustomEvent) {
        dispatchedEvents.push({
          type: event.type,
          detail: event.detail,
        })
      }
      return true
    })
  })

  afterEach(() => {
    dispatchEventSpy.mockRestore()
  })

  // ===== deleteCustomer 이벤트 =====

  describe('deleteCustomer 이벤트', () => {
    const inactiveCustomer = createMockCustomer({
      meta: {
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-15T00:00:00.000Z',
        status: 'inactive',
        deleted_at: '2025-01-15T00:00:00.000Z',
      },
    })

    beforeEach(() => {
      vi.mocked(api.delete).mockResolvedValue({
        success: true,
        message: '고객이 휴면 처리되었습니다',
        soft_delete: true,
        customer: inactiveCustomer,
      })
    })

    it('customerChanged 이벤트가 발생해야 함', async () => {
      await CustomerService.deleteCustomer('cust-001')

      const customerChangedEvent = dispatchedEvents.find((e) => e.type === 'customerChanged')
      expect(customerChangedEvent).toBeDefined()
    })

    it('Zustand store에 활성 필터 변경이 요청되어야 함', async () => {
      await CustomerService.deleteCustomer('cust-001')

      expect(mockRequestFilterChange).toHaveBeenCalledWith('active')
    })

    it('API 호출 실패 시 이벤트가 발생하지 않아야 함', async () => {
      vi.mocked(api.delete).mockRejectedValueOnce(new Error('삭제 실패'))

      try {
        await CustomerService.deleteCustomer('cust-001')
      } catch {
        // 에러 무시
      }

      expect(dispatchedEvents).toHaveLength(0)
    })
  })

  // ===== restoreCustomer 이벤트 =====

  describe('restoreCustomer 이벤트', () => {
    const activeCustomer = createMockCustomer({
      meta: {
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-15T00:00:00.000Z',
        status: 'active',
      },
    })

    beforeEach(() => {
      vi.mocked(api.post).mockResolvedValue({
        success: true,
        data: activeCustomer,
      })
    })

    it('customerChanged 이벤트가 발생해야 함', async () => {
      await CustomerService.restoreCustomer('cust-001')

      const customerChangedEvent = dispatchedEvents.find((e) => e.type === 'customerChanged')
      expect(customerChangedEvent).toBeDefined()
    })

    it('Zustand store에 활성 필터 변경이 요청되어야 함', async () => {
      await CustomerService.restoreCustomer('cust-001')

      expect(mockRequestFilterChange).toHaveBeenCalledWith('active')
    })

    it('API 호출 실패 시 이벤트가 발생하지 않아야 함', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('복원 실패'))

      try {
        await CustomerService.restoreCustomer('cust-001')
      } catch {
        // 에러 무시
      }

      expect(dispatchedEvents).toHaveLength(0)
    })

    it('success가 false일 때 이벤트가 발생하지 않아야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: false,
        data: null,
      })

      try {
        await CustomerService.restoreCustomer('cust-001')
      } catch {
        // 에러 무시
      }

      expect(dispatchedEvents).toHaveLength(0)
    })
  })

  // ===== permanentDeleteCustomer 이벤트 (이미 별도 테스트 파일에 있지만 여기서도 검증) =====

  describe('permanentDeleteCustomer 이벤트', () => {
    beforeEach(() => {
      vi.mocked(api.delete).mockResolvedValue({
        success: true,
        deletedRelationships: 0,
        deletedContracts: 0,
        deletedDocuments: 0,
      })
    })

    it('총 3개의 이벤트가 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-001')

      expect(dispatchedEvents).toHaveLength(3)
    })

    it('customerChanged, contractChanged, documentChanged 이벤트가 모두 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-001')

      const eventTypes = dispatchedEvents.map((e) => e.type)
      expect(eventTypes).toContain('customerChanged')
      expect(eventTypes).toContain('contractChanged')
      expect(eventTypes).toContain('documentChanged')
    })
  })

  // ===== 이벤트 리스닝 통합 테스트 =====

  describe('이벤트 리스닝 통합', () => {
    it('deleteCustomer 후 대시보드가 이벤트를 수신할 수 있어야 함', async () => {
      const inactiveCustomer = createMockCustomer({
        meta: {
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-15T00:00:00.000Z',
          status: 'inactive',
        },
      })

      vi.mocked(api.delete).mockResolvedValue({
        success: true,
        message: '고객이 휴면 처리되었습니다',
        soft_delete: true,
        customer: inactiveCustomer,
      })

      // 이벤트 리스너 등록 (시뮬레이션)
      let customerChangedReceived = false
      const mockListener = vi.fn(() => {
        customerChangedReceived = true
      })

      // dispatchEvent를 실제로 호출하도록 모킹 변경
      dispatchEventSpy.mockRestore()
      window.addEventListener('customerChanged', mockListener)

      await CustomerService.deleteCustomer('cust-001')

      expect(mockListener).toHaveBeenCalled()
      expect(customerChangedReceived).toBe(true)

      window.removeEventListener('customerChanged', mockListener)
    })

    it('restoreCustomer 후 Zustand store에 필터 변경이 요청되어야 함', async () => {
      const activeCustomer = createMockCustomer()

      vi.mocked(api.post).mockResolvedValue({
        success: true,
        data: activeCustomer,
      })

      await CustomerService.restoreCustomer('cust-001')

      expect(mockRequestFilterChange).toHaveBeenCalledWith('active')
    })
  })
})

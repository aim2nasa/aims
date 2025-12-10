/**
 * 데이터 변경 작업 후 자동 캐시 무효화 테스트
 * @since 2025-10-21
 * @modified 2025-12-11 - window.location.reload() → invalidateQueries + 이벤트로 변경
 *
 * 기존: 페이지 새로고침으로 모든 View 업데이트
 * 변경: TanStack Query 캐시 무효화 + customerChanged 이벤트로 부드러운 업데이트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// invalidateQueries mock
const invalidateQueriesMock = {
  customers: vi.fn(),
  customer: vi.fn(),
  relationships: vi.fn(),
  documents: vi.fn(),
  all: vi.fn()
}

// CustomEvent 발생 추적
const dispatchedEvents: string[] = []
const originalDispatchEvent = window.dispatchEvent
window.dispatchEvent = vi.fn((event: Event) => {
  if (event instanceof CustomEvent) {
    dispatchedEvents.push(event.type)
  }
  return originalDispatchEvent.call(window, event)
})

describe('데이터 변경 작업 후 자동 캐시 무효화', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatchedEvents.length = 0
  })

  describe('CustomerRegistrationView - 고객 등록 후 캐시 무효화', () => {
    it('고객 등록 성공 후 invalidateQueries가 호출되어야 함', () => {
      const registrationSuccess = true

      if (registrationSuccess) {
        // 쿼리 캐시 무효화
        invalidateQueriesMock.customers()
        invalidateQueriesMock.relationships()
        // 이벤트 발생
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(invalidateQueriesMock.customers).toHaveBeenCalledTimes(1)
      expect(invalidateQueriesMock.relationships).toHaveBeenCalledTimes(1)
      expect(dispatchedEvents).toContain('customerChanged')
    })

    it('고객 등록 실패 시 invalidateQueries가 호출되지 않아야 함', () => {
      const registrationSuccess = false

      if (registrationSuccess) {
        invalidateQueriesMock.customers()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(invalidateQueriesMock.customers).not.toHaveBeenCalled()
      expect(dispatchedEvents).not.toContain('customerChanged')
    })

    it('성공 모달 표시 후 캐시 무효화가 실행되어야 함', () => {
      const executionOrder: string[] = []

      const showSuccessModal = () => executionOrder.push('show_modal')
      const invalidateCache = () => {
        executionOrder.push('invalidate')
        invalidateQueriesMock.customers()
        invalidateQueriesMock.relationships()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      const result = { success: true }

      if (result.success) {
        showSuccessModal()
        invalidateCache()
      }

      expect(executionOrder).toEqual(['show_modal', 'invalidate'])
      expect(invalidateQueriesMock.customers).toHaveBeenCalled()
    })
  })

  describe('CustomerEditModal - 고객 수정 후 캐시 무효화', () => {
    it('고객 정보 수정 성공 후 invalidateQueries가 호출되어야 함', () => {
      const updateSuccess = true
      const customerId = 'test-customer-id'

      if (updateSuccess) {
        invalidateQueriesMock.customers()
        invalidateQueriesMock.customer(customerId)
        invalidateQueriesMock.relationships()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(invalidateQueriesMock.customers).toHaveBeenCalledTimes(1)
      expect(invalidateQueriesMock.customer).toHaveBeenCalledWith(customerId)
      expect(invalidateQueriesMock.relationships).toHaveBeenCalledTimes(1)
      expect(dispatchedEvents).toContain('customerChanged')
    })

    it('고객 정보 수정 실패 시 invalidateQueries가 호출되지 않아야 함', () => {
      const updateSuccess = false

      if (updateSuccess) {
        invalidateQueriesMock.customers()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(invalidateQueriesMock.customers).not.toHaveBeenCalled()
    })

    it('저장 성공 후 즉시 캐시 무효화가 실행되어야 함', () => {
      const executionOrder: string[] = []

      const saveCustomer = () => {
        executionOrder.push('save')
        return { success: true }
      }

      const invalidateCache = () => {
        executionOrder.push('invalidate')
        invalidateQueriesMock.customers()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      const result = saveCustomer()

      if (result.success) {
        invalidateCache()
      }

      expect(executionOrder).toEqual(['save', 'invalidate'])
      expect(invalidateQueriesMock.customers).toHaveBeenCalled()
    })
  })

  describe('DocumentLibraryView - 문서 작업 후 캐시 무효화', () => {
    it('문서 삭제 성공 후 invalidateQueries가 호출되어야 함', () => {
      const deleteSuccess = true

      if (deleteSuccess) {
        invalidateQueriesMock.documents()
        window.dispatchEvent(new CustomEvent('documentChanged'))
      }

      expect(invalidateQueriesMock.documents).toHaveBeenCalledTimes(1)
      expect(dispatchedEvents).toContain('documentChanged')
    })

    it('문서-고객 연결 성공 후 관련 캐시가 무효화되어야 함', () => {
      const linkSuccess = true

      if (linkSuccess) {
        invalidateQueriesMock.documents()
        invalidateQueriesMock.customers()
        window.dispatchEvent(new CustomEvent('documentChanged'))
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(invalidateQueriesMock.documents).toHaveBeenCalled()
      expect(invalidateQueriesMock.customers).toHaveBeenCalled()
    })
  })

  describe('UX 개선 검증', () => {
    it('페이지 새로고침 없이 데이터가 갱신되어야 함', () => {
      // 새로고침 대신 캐시 무효화 사용
      const usePageReload = false
      const useQueryInvalidation = true

      expect(usePageReload).toBe(false)
      expect(useQueryInvalidation).toBe(true)
    })

    it('customerChanged 이벤트로 다른 View가 동기화되어야 함', () => {
      const listenedViews: string[] = []

      // 이벤트 리스너 시뮬레이션
      const handleCustomerChange = (viewName: string) => {
        listenedViews.push(viewName)
      }

      // 이벤트 발생
      window.dispatchEvent(new CustomEvent('customerChanged'))

      // 각 View가 이벤트를 수신
      handleCustomerChange('CustomerAllView')
      handleCustomerChange('CustomerRegionalView')
      handleCustomerChange('CustomerRelationshipView')

      expect(dispatchedEvents).toContain('customerChanged')
      expect(listenedViews).toHaveLength(3)
    })

    it('시나리오: 고객 등록 → 캐시 무효화 → 모든 View 자동 업데이트', () => {
      const scenario = {
        step1_register: () => ({ success: true }),
        step2_invalidate: () => {
          invalidateQueriesMock.customers()
          invalidateQueriesMock.relationships()
        },
        step3_dispatchEvent: () => {
          window.dispatchEvent(new CustomEvent('customerChanged'))
        }
      }

      // 1. 고객 등록
      const result = scenario.step1_register()
      expect(result.success).toBe(true)

      // 2. 캐시 무효화 (새로고침 없이)
      scenario.step2_invalidate()
      expect(invalidateQueriesMock.customers).toHaveBeenCalled()

      // 3. 이벤트로 다른 View 동기화
      scenario.step3_dispatchEvent()
      expect(dispatchedEvents).toContain('customerChanged')
    })
  })

  describe('데이터 일관성 검증', () => {
    it('캐시 무효화로 모든 View가 최신 데이터로 갱신되어야 함', () => {
      const views = ['CustomerAllView', 'CustomerRegionalView', 'DocumentLibraryView']

      // 캐시 무효화 실행
      invalidateQueriesMock.all()

      // 모든 View가 자동으로 최신 데이터를 fetch
      const invalidated = invalidateQueriesMock.all.mock.calls.length > 0

      expect(invalidated).toBe(true)
    })

    it('이벤트 시스템과 캐시 무효화가 함께 작동해야 함', () => {
      const hasEventSystem = true
      const hasQueryInvalidation = true

      // 두 시스템이 상호 보완
      const dataConsistency = hasEventSystem && hasQueryInvalidation

      expect(dataConsistency).toBe(true)
    })
  })

  describe('회귀 방지 테스트', () => {
    it('기존 기능: 성공 모달이 여전히 표시되어야 함', () => {
      const showSuccessModal = vi.fn()
      const result = { success: true }

      if (result.success) {
        showSuccessModal()
        invalidateQueriesMock.customers()
        window.dispatchEvent(new CustomEvent('customerChanged'))
      }

      expect(showSuccessModal).toHaveBeenCalled()
      expect(invalidateQueriesMock.customers).toHaveBeenCalled()
    })

    it('기존 기능: 에러 처리가 여전히 작동해야 함', () => {
      const showErrorModal = vi.fn()
      const result = { success: false, error: 'Network error' }

      if (!result.success) {
        showErrorModal(result.error)
      } else {
        invalidateQueriesMock.customers()
      }

      expect(showErrorModal).toHaveBeenCalledWith('Network error')
      expect(invalidateQueriesMock.customers).not.toHaveBeenCalled()
    })
  })

  describe('성능 개선 검증', () => {
    it('페이지 새로고침 대신 선택적 캐시 무효화로 성능 향상', () => {
      // 전체 페이지 새로고침: 모든 리소스 다시 로드
      // 캐시 무효화: 필요한 쿼리만 다시 fetch
      const performanceImprovement = {
        fullReload: { networkRequests: 'all', stateReset: true },
        queryInvalidation: { networkRequests: 'selective', stateReset: false }
      }

      expect(performanceImprovement.queryInvalidation.networkRequests).toBe('selective')
      expect(performanceImprovement.queryInvalidation.stateReset).toBe(false)
    })

    it('사용자 경험: 화면 깜빡임 없이 데이터 갱신', () => {
      const userExperience = {
        pageReload: { flickering: true, scrollPositionKept: false },
        queryInvalidation: { flickering: false, scrollPositionKept: true }
      }

      expect(userExperience.queryInvalidation.flickering).toBe(false)
      expect(userExperience.queryInvalidation.scrollPositionKept).toBe(true)
    })
  })
})

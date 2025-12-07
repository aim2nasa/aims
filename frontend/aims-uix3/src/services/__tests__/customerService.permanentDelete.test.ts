/**
 * customerService.permanentDelete.test.ts
 * @since 2025-12-07
 * @version 1.0.0
 *
 * CustomerService.permanentDeleteCustomer 메서드에 대한 테스트
 * - API 호출 검증
 * - 응답 데이터 처리
 * - 에러 처리
 * - 이벤트 발생 검증
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CustomerService } from '../customerService'
import { api, ApiError } from '@/shared/lib/api'

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

describe('CustomerService.permanentDeleteCustomer', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>
  let dispatchedEvents: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    dispatchedEvents = []

    // window.dispatchEvent 모킹
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
      if (event instanceof CustomEvent) {
        dispatchedEvents.push(event.type)
      }
      return true
    })
  })

  afterEach(() => {
    dispatchEventSpy.mockRestore()
  })

  // ===== 입력 검증 =====

  describe('입력 검증', () => {
    it('빈 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(CustomerService.permanentDeleteCustomer('')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })

    it('공백만 있는 ID로 호출 시 에러를 던져야 함', async () => {
      await expect(CustomerService.permanentDeleteCustomer('   ')).rejects.toThrow(
        '고객 ID가 필요합니다'
      )
      expect(api.delete).not.toHaveBeenCalled()
    })
  })

  // ===== API 호출 =====

  describe('API 호출', () => {
    it('올바른 엔드포인트로 DELETE 요청을 해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 0,
        deletedContracts: 0,
        deletedDocuments: 0,
      })

      await CustomerService.permanentDeleteCustomer('cust-123')

      expect(api.delete).toHaveBeenCalledWith('/api/customers/cust-123?permanent=true')
    })

    it('permanent=true 쿼리 파라미터가 포함되어야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 0,
        deletedContracts: 0,
        deletedDocuments: 0,
      })

      await CustomerService.permanentDeleteCustomer('customer-abc')

      const calledUrl = vi.mocked(api.delete).mock.calls[0][0]
      expect(calledUrl).toContain('permanent=true')
    })
  })

  // ===== 응답 데이터 처리 =====

  describe('응답 데이터 처리', () => {
    it('삭제 통계를 올바르게 반환해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 5,
        deletedContracts: 3,
        deletedDocuments: 12,
      })

      const result = await CustomerService.permanentDeleteCustomer('cust-456')

      expect(result).toEqual({
        deletedRelationships: 5,
        deletedContracts: 3,
        deletedDocuments: 12,
      })
    })

    it('응답에 통계값이 없으면 0으로 기본값 처리해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        // 통계값 누락
      })

      const result = await CustomerService.permanentDeleteCustomer('cust-789')

      expect(result).toEqual({
        deletedRelationships: 0,
        deletedContracts: 0,
        deletedDocuments: 0,
      })
    })

    it('일부 통계값만 있는 경우 누락된 값은 0으로 처리해야 함', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedContracts: 7,
        // deletedRelationships, deletedDocuments 누락
      })

      const result = await CustomerService.permanentDeleteCustomer('cust-partial')

      expect(result).toEqual({
        deletedRelationships: 0,
        deletedContracts: 7,
        deletedDocuments: 0,
      })
    })
  })

  // ===== 이벤트 발생 =====

  describe('이벤트 발생', () => {
    beforeEach(() => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 1,
        deletedContracts: 2,
        deletedDocuments: 3,
      })
    })

    it('customerChanged 이벤트가 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-event-1')

      expect(dispatchedEvents).toContain('customerChanged')
    })

    it('contractChanged 이벤트가 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-event-2')

      expect(dispatchedEvents).toContain('contractChanged')
    })

    it('documentChanged 이벤트가 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-event-3')

      expect(dispatchedEvents).toContain('documentChanged')
    })

    it('모든 이벤트가 순서대로 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-event-4')

      expect(dispatchedEvents).toEqual([
        'customerChanged',
        'contractChanged',
        'documentChanged',
      ])
    })

    it('총 3개의 이벤트가 발생해야 함', async () => {
      await CustomerService.permanentDeleteCustomer('cust-event-5')

      expect(dispatchEventSpy).toHaveBeenCalledTimes(3)
    })
  })

  // ===== 에러 처리 =====

  describe('에러 처리', () => {
    it('404 Not Found 에러를 전파해야 함', async () => {
      const error = new ApiError('고객을 찾을 수 없습니다', 404, 'Not Found')
      vi.mocked(api.delete).mockRejectedValueOnce(error)

      await expect(CustomerService.permanentDeleteCustomer('not-found')).rejects.toThrow(
        '고객을 찾을 수 없습니다'
      )
    })

    it('403 Forbidden 에러를 전파해야 함', async () => {
      const error = new ApiError('삭제 권한이 없습니다', 403, 'Forbidden')
      vi.mocked(api.delete).mockRejectedValueOnce(error)

      await expect(CustomerService.permanentDeleteCustomer('forbidden')).rejects.toThrow(
        '삭제 권한이 없습니다'
      )
    })

    it('500 서버 에러를 전파해야 함', async () => {
      const error = new ApiError('서버 오류', 500, 'Internal Server Error')
      vi.mocked(api.delete).mockRejectedValueOnce(error)

      await expect(CustomerService.permanentDeleteCustomer('server-error')).rejects.toThrow(
        '서버 오류'
      )
    })

    it('에러 발생 시 이벤트가 발생하지 않아야 함', async () => {
      vi.mocked(api.delete).mockRejectedValueOnce(new Error('삭제 실패'))

      try {
        await CustomerService.permanentDeleteCustomer('error-case')
      } catch {
        // 에러 무시
      }

      expect(dispatchedEvents).toHaveLength(0)
    })
  })

  // ===== 통합 시나리오 =====

  describe('통합 시나리오', () => {
    it('연결된 모든 데이터가 삭제되는 시나리오', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 10,
        deletedContracts: 5,
        deletedDocuments: 25,
      })

      const result = await CustomerService.permanentDeleteCustomer('heavy-customer')

      // 결과 확인
      expect(result.deletedRelationships).toBe(10)
      expect(result.deletedContracts).toBe(5)
      expect(result.deletedDocuments).toBe(25)

      // 이벤트 확인
      expect(dispatchedEvents).toHaveLength(3)
    })

    it('연결된 데이터가 없는 고객 삭제 시나리오', async () => {
      vi.mocked(api.delete).mockResolvedValueOnce({
        success: true,
        deletedRelationships: 0,
        deletedContracts: 0,
        deletedDocuments: 0,
      })

      const result = await CustomerService.permanentDeleteCustomer('clean-customer')

      // 결과 확인 (모두 0)
      expect(result.deletedRelationships).toBe(0)
      expect(result.deletedContracts).toBe(0)
      expect(result.deletedDocuments).toBe(0)

      // 이벤트는 여전히 발생해야 함
      expect(dispatchedEvents).toHaveLength(3)
    })
  })
})

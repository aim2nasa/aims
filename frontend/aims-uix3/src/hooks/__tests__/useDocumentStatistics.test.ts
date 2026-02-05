/**
 * useDocumentStatistics Hook Tests
 * @since 2026-02-05
 *
 * 문서 처리 현황 통계 훅 테스트
 * - 통계 조회 API 호출
 * - batchId 필터링
 * - 에러 처리
 * - refresh 함수
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Mock 모듈 설정
vi.mock('@/shared/lib/api', () => ({
  getAuthHeaders: vi.fn(() => ({ 'Authorization': 'Bearer test-token' }))
}))

vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn()
  }
}))

// SSE 구독 모킹
vi.mock('@/shared/hooks/useSSESubscription', () => ({
  useSSESubscription: vi.fn()
}))

// useDocumentStatistics 동적 import
async function importHook() {
  const module = await import('../useDocumentStatistics')
  return module.useDocumentStatistics
}

describe('useDocumentStatistics', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('초기화 및 기본 동작', () => {
    it('enabled=true일 때 통계를 조회해야 함', async () => {
      const mockStats = {
        pending: 5,
        processing: 3,
        completed: 10,
        error: 1,
        credit_pending: 2
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: mockStats })
      })

      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: true }))

      await waitFor(() => {
        expect(result.current.statistics).not.toBeNull()
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/statistics'),
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer test-token' }
        })
      )
    })

    it('enabled=false일 때 API를 호출하지 않아야 함', async () => {
      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: false }))

      // enabled=false일 때 즉시 null 반환
      expect(result.current.statistics).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })

    it('boolean 인자로 호환성 유지', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 5 } })
      })

      const useDocumentStatistics = await importHook()
      renderHook(() => useDocumentStatistics(true))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })

    it('기본값으로 enabled=true가 적용되어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 5 } })
      })

      const useDocumentStatistics = await importHook()
      renderHook(() => useDocumentStatistics())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })
  })

  describe('batchId 필터링', () => {
    it('batchId가 있으면 쿼리 파라미터로 추가되어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 3 } })
      })

      const useDocumentStatistics = await importHook()
      renderHook(() => useDocumentStatistics({ enabled: true, batchId: 'batch-123' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('batchId=batch-123'),
          expect.any(Object)
        )
      })
    })

    it('batchId가 null이면 쿼리 파라미터 없이 호출되어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 5 } })
      })

      const useDocumentStatistics = await importHook()
      renderHook(() => useDocumentStatistics({ enabled: true, batchId: null }))

      await waitFor(() => {
        const callUrl = mockFetch.mock.calls[0]?.[0] as string
        expect(callUrl).not.toContain('batchId')
      })
    })
  })

  describe('에러 처리', () => {
    it('API 에러 시 isLoading이 false가 되어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: true }))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('refresh 함수', () => {
    it('refresh가 함수로 제공되어야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 5 } })
      })

      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: true }))

      await waitFor(() => {
        expect(typeof result.current.refresh).toBe('function')
      })
    })

    it('refresh 호출 시 통계가 다시 조회되어야 함', async () => {
      let callCount = 0
      mockFetch.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { completed: callCount * 5 } })
        })
      })

      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: true }))

      await waitFor(() => {
        expect(result.current.statistics?.completed).toBe(5)
      })

      // refresh 호출
      await result.current.refresh()

      await waitFor(() => {
        expect(result.current.statistics?.completed).toBe(10)
      })
    })
  })

  describe('반환값 구조', () => {
    it('statistics, isLoading, refresh를 반환해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { completed: 5 } })
      })

      const useDocumentStatistics = await importHook()
      const { result } = renderHook(() => useDocumentStatistics({ enabled: true }))

      await waitFor(() => {
        expect(result.current).toHaveProperty('statistics')
        expect(result.current).toHaveProperty('isLoading')
        expect(result.current).toHaveProperty('refresh')
      })
    })
  })
})

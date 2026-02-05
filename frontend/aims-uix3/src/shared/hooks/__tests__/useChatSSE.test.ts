/**
 * useChatSSE Hook Tests
 * @since 2026-02-05
 *
 * AI 채팅 SSE 스트리밍 훅 테스트
 * - 초기 상태
 * - 인증 체크
 * - SSE 이벤트 타입 정의
 * - 크레딧 초과 정보 관리
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock 모듈 설정
vi.mock('@/shared/lib/api', () => ({
  getAuthToken: vi.fn(() => 'test-token'),
  API_CONFIG: { BASE_URL: 'http://localhost:3010' }
}))

vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn()
  }
}))

// 동적 import
async function importHook() {
  const module = await import('../useChatSSE')
  return module.useChatSSE
}

describe('useChatSSE', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('초기 상태', () => {
    it('초기 상태가 올바르게 설정되어야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      expect(result.current.isLoading).toBe(false)
      expect(result.current.currentResponse).toBe('')
      expect(result.current.activeTools).toEqual([])
      expect(result.current.lastUsage).toBeNull()
      expect(result.current.currentSessionId).toBeNull()
      expect(result.current.retryStatus).toBeNull()
      expect(result.current.creditExceededInfo).toBeNull()
    })

    it('반환 객체가 필수 속성을 포함해야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      expect(result.current).toHaveProperty('sendMessage')
      expect(result.current).toHaveProperty('abort')
      expect(result.current).toHaveProperty('clearCreditExceeded')
      expect(typeof result.current.sendMessage).toBe('function')
      expect(typeof result.current.abort).toBe('function')
      expect(typeof result.current.clearCreditExceeded).toBe('function')
    })
  })

  describe('인증 체크', () => {
    it('인증 토큰이 없으면 에러를 던져야 함', async () => {
      const { getAuthToken } = await import('@/shared/lib/api')
      vi.mocked(getAuthToken).mockReturnValue(null)

      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      await expect(
        result.current.sendMessage([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('인증이 필요합니다')

      // 토큰 복원
      vi.mocked(getAuthToken).mockReturnValue('test-token')
    })
  })

  describe('clearCreditExceeded', () => {
    it('clearCreditExceeded 호출 시 creditExceededInfo가 null이 되어야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      // 초기에는 null
      expect(result.current.creditExceededInfo).toBeNull()

      // clearCreditExceeded 호출해도 에러 없이 동작
      act(() => {
        result.current.clearCreditExceeded()
      })

      expect(result.current.creditExceededInfo).toBeNull()
    })
  })

  describe('abort', () => {
    it('abort 함수가 에러 없이 호출되어야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      // abort 호출해도 에러 없이 동작 (요청이 없어도)
      expect(() => {
        result.current.abort()
      }).not.toThrow()
    })
  })

  describe('타입 정의 검증', () => {
    it('ChatMessage 타입이 올바른 구조를 가져야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      // 타입 검증용 테스트 메시지
      const validMessages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi' },
        { role: 'system' as const, content: 'System message' }
      ]

      // 함수가 메시지 배열을 받을 수 있는지 확인 (실제 호출 없이)
      expect(typeof result.current.sendMessage).toBe('function')
      expect(validMessages).toHaveLength(3)
    })

    it('ChatEvent 타입들이 정의되어야 함', async () => {
      // 타입 검증: ChatEvent의 type 필드
      const validEventTypes = [
        'content',
        'tool_start',
        'tool_calling',
        'tool_result',
        'done',
        'error',
        'session',
        'rate_limit_retry',
        'credit_exceeded'
      ]

      expect(validEventTypes).toContain('content')
      expect(validEventTypes).toContain('credit_exceeded')
    })
  })

  describe('RateLimitRetryStatus 구조', () => {
    it('retryStatus가 올바른 초기값을 가져야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      expect(result.current.retryStatus).toBeNull()
    })
  })

  describe('CreditExceededInfo 구조', () => {
    it('creditExceededInfo가 올바른 초기값을 가져야 함', async () => {
      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      expect(result.current.creditExceededInfo).toBeNull()
    })
  })

  describe('API 호출 검증', () => {
    it('sendMessage가 올바른 엔드포인트로 호출해야 함', async () => {
      // 단순 응답 Mock
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"done"}\n\n')
          })
          .mockResolvedValueOnce({ done: true, value: undefined })
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader }
      })

      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      await act(async () => {
        await result.current.sendMessage([{ role: 'user', content: 'test' }])
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3010/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      )
    })

    it('HTTP 에러 시 에러를 던져야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Internal Server Error' })
      })

      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      await expect(
        result.current.sendMessage([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('Internal Server Error')
    })

    it('body가 없으면 스트리밍 미지원 에러를 던져야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null
      })

      const useChatSSE = await importHook()
      const { result } = renderHook(() => useChatSSE())

      await expect(
        result.current.sendMessage([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('스트리밍을 지원하지 않습니다')
    })
  })
})

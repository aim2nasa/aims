/**
 * batchUploadApi.test.ts
 * @since 2025-12-07
 * @version 1.0.0
 *
 * BatchUploadApi의 모든 메서드에 대한 종합 테스트
 * - getCustomersForMatching: 고객 목록 조회
 * - uploadFile: 파일 업로드 (XMLHttpRequest 기반)
 * - saveBatchHistory: 배치 이력 저장
 * - getBatchHistory: 배치 이력 조회
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BatchUploadApi } from '../batchUploadApi'
import { api, ApiError } from '@/shared/lib/api'
import type { CustomerForMatching } from '../../utils/customerMatcher'

// API 모듈 모킹
vi.mock('@/shared/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string) {
      super(message)
      this.name = 'ApiError'
    }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NetworkError'
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'TimeoutError'
    }
  },
  getAuthHeaders: vi.fn(() => ({ 'Authorization': 'Bearer test-token' })),
}))

// errorReporter 모킹
vi.mock('@/shared/lib/errorReporter', () => ({
  errorReporter: {
    reportApiError: vi.fn(),
  },
}))

// 바이러스 검사 API 모킹 (테스트에서는 비활성화)
vi.mock('@/shared/lib/fileValidation/virusScanApi', () => ({
  isScanAvailable: vi.fn(() => Promise.resolve(false)),
  scanFile: vi.fn(() => Promise.resolve({ scanned: false, infected: false, skipped: true })),
}))

// ==================== XMLHttpRequest Mock ====================

interface MockXHRInstance {
  open: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
  setRequestHeader: ReturnType<typeof vi.fn>
  upload: {
    addEventListener: ReturnType<typeof vi.fn>
  }
  addEventListener: ReturnType<typeof vi.fn>
  status: number
  statusText: string
  timeout: number
  response: unknown
  // 테스트용 헬퍼
  _eventHandlers: Record<string, (...args: unknown[]) => void>
  _uploadEventHandlers: Record<string, (...args: unknown[]) => void>
  _triggerEvent: (eventName: string, event?: unknown) => void
  _triggerUploadEvent: (eventName: string, event?: unknown) => void
}

function createMockXHR(): MockXHRInstance {
  const eventHandlers: Record<string, (...args: unknown[]) => void> = {}
  const uploadEventHandlers: Record<string, (...args: unknown[]) => void> = {}

  return {
    open: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    setRequestHeader: vi.fn(),
    upload: {
      addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        uploadEventHandlers[event] = handler
      }),
    },
    addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = handler
    }),
    status: 200,
    statusText: 'OK',
    timeout: 0,
    response: null,
    _eventHandlers: eventHandlers,
    _uploadEventHandlers: uploadEventHandlers,
    _triggerEvent(eventName: string, event?: unknown) {
      if (eventHandlers[eventName]) {
        eventHandlers[eventName](event)
      }
    },
    _triggerUploadEvent(eventName: string, event?: unknown) {
      if (uploadEventHandlers[eventName]) {
        uploadEventHandlers[eventName](event)
      }
    },
  }
}

// ==================== Mock Data ====================

const mockCustomers: CustomerForMatching[] = [
  { _id: 'cust-001', name: '홍길동', mobile_phone: '010-1234-5678' },
  { _id: 'cust-002', name: '김영희', mobile_phone: '010-9876-5432' },
  { _id: 'cust-003', name: '박철수', mobile_phone: '010-5555-6666' },
]

const mockBatchHistory = {
  batchId: 'batch-001',
  userId: 'user-001',
  startedAt: '2025-12-07T10:00:00.000Z',
  completedAt: '2025-12-07T10:05:00.000Z',
  totalFolders: 5,
  totalFiles: 20,
  successCount: 18,
  failureCount: 2,
  status: 'completed' as const,
}

// ==================== Tests ====================

describe('BatchUploadApi', () => {
  let mockXHR: MockXHRInstance
  let originalXHR: typeof XMLHttpRequest

  beforeEach(() => {
    vi.clearAllMocks()

    // XMLHttpRequest 모킹
    mockXHR = createMockXHR()
    originalXHR = global.XMLHttpRequest
    global.XMLHttpRequest = vi.fn(() => mockXHR) as unknown as typeof XMLHttpRequest

    // localStorage 모킹
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'test-user-id'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => {
    global.XMLHttpRequest = originalXHR
  })

  // ===== 1. getCustomersForMatching() =====

  describe('getCustomersForMatching', () => {
    it('고객 목록을 성공적으로 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: { customers: mockCustomers },
      })

      const result = await BatchUploadApi.getCustomersForMatching()

      expect(api.get).toHaveBeenCalledWith('/api/customers?limit=1000')
      expect(result.success).toBe(true)
      expect(result.customers).toEqual(mockCustomers)
      expect(result.customers).toHaveLength(3)
    })

    it('빈 고객 목록을 처리해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: { customers: [] },
      })

      const result = await BatchUploadApi.getCustomersForMatching()

      expect(result.success).toBe(true)
      expect(result.customers).toEqual([])
    })

    it('data가 undefined일 때 빈 배열을 반환해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
      })

      const result = await BatchUploadApi.getCustomersForMatching()

      expect(result.success).toBe(true)
      expect(result.customers).toEqual([])
    })

    it('ApiError 발생 시 에러 메시지를 반환해야 함', async () => {
      const apiError = new ApiError('서버 오류', 500, 'Internal Server Error')
      vi.mocked(api.get).mockRejectedValueOnce(apiError)

      const result = await BatchUploadApi.getCustomersForMatching()

      expect(result.success).toBe(false)
      expect(result.customers).toEqual([])
      expect(result.error).toBe('서버 오류')
    })

    it('일반 에러 발생 시 기본 에러 메시지를 반환해야 함', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('네트워크 에러'))

      const result = await BatchUploadApi.getCustomersForMatching()

      expect(result.success).toBe(false)
      expect(result.customers).toEqual([])
      expect(result.error).toBe('고객 목록 조회 중 오류가 발생했습니다')
    })
  })

  // ===== 2. uploadFile() =====

  describe('uploadFile', () => {
    const createMockFile = (name: string, size: number = 1024): File => {
      return new File(['test content'], name, { type: 'application/pdf' })
    }

    describe('성공 케이스', () => {
      it('파일 업로드가 성공해야 함', async () => {
        const file = createMockFile('document.pdf')
        mockXHR.status = 200
        mockXHR.statusText = 'OK'

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')

        // 비동기적으로 load 이벤트 트리거
        setTimeout(() => mockXHR._triggerEvent('load'), 0)

        const result = await uploadPromise

        expect(result.success).toBe(true)
        expect(result.fileName).toBe('document.pdf')
        expect(result.customerId).toBe('cust-001')
        expect(result.error).toBeUndefined()
      })

      it('FormData에 올바른 필드가 포함되어야 함', async () => {
        const file = createMockFile('report.pdf')
        mockXHR.status = 200

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-002')
        setTimeout(() => mockXHR._triggerEvent('load'), 0)

        await uploadPromise

        // send가 호출되었는지 확인
        expect(mockXHR.send).toHaveBeenCalled()
        const sentData = mockXHR.send.mock.calls[0][0] as FormData
        expect(sentData).toBeInstanceOf(FormData)
        expect(sentData.get('file')).toBe(file)
        expect(sentData.get('customerId')).toBe('cust-002')
        expect(sentData.get('userId')).toBe('test-user-id')
      })

      it('진행률 콜백이 호출되어야 함', async () => {
        const file = createMockFile('large-file.pdf')
        mockXHR.status = 200
        const onProgress = vi.fn()

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001', onProgress)

        // 비동기 바이러스 검사 대기 후 XHR 이벤트 트리거
        await new Promise(resolve => setTimeout(resolve, 0))

        // progress 이벤트 트리거
        mockXHR._triggerUploadEvent('progress', {
          lengthComputable: true,
          loaded: 512,
          total: 1024,
        })

        setTimeout(() => mockXHR._triggerEvent('load'), 10)
        await uploadPromise

        expect(onProgress).toHaveBeenCalledWith(512, 1024, 'large-file.pdf')
      })

      it('lengthComputable이 false일 때 진행률 콜백이 호출되지 않아야 함', async () => {
        const file = createMockFile('unknown-size.pdf')
        mockXHR.status = 200
        const onProgress = vi.fn()

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001', onProgress)

        mockXHR._triggerUploadEvent('progress', {
          lengthComputable: false,
          loaded: 512,
          total: 0,
        })

        setTimeout(() => mockXHR._triggerEvent('load'), 0)
        await uploadPromise

        expect(onProgress).not.toHaveBeenCalled()
      })
    })

    // Note: 덮어쓰기 옵션은 hash 기반 중복 검사에서 무의미하므로 제거됨

    describe('에러 처리', () => {
      it('HTTP 404 에러를 처리해야 함', async () => {
        const file = createMockFile('missing.pdf')
        mockXHR.status = 404
        mockXHR.statusText = 'Not Found'

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')
        setTimeout(() => mockXHR._triggerEvent('load'), 0)

        const result = await uploadPromise

        expect(result.success).toBe(false)
        expect(result.error).toBe('HTTP 404: Not Found')
      })

      it('HTTP 500 에러를 처리해야 함', async () => {
        const file = createMockFile('server-error.pdf')
        mockXHR.status = 500
        mockXHR.statusText = 'Internal Server Error'

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')
        setTimeout(() => mockXHR._triggerEvent('load'), 0)

        const result = await uploadPromise

        expect(result.success).toBe(false)
        expect(result.error).toBe('HTTP 500: Internal Server Error')
      })

      it('네트워크 에러를 처리해야 함', async () => {
        const file = createMockFile('network-fail.pdf')

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')
        setTimeout(() => mockXHR._triggerEvent('error'), 0)

        const result = await uploadPromise

        expect(result.success).toBe(false)
        expect(result.error).toBe('네트워크 오류가 발생했습니다')
      })

      it('타임아웃을 처리해야 함', async () => {
        const file = createMockFile('timeout.pdf')

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')
        setTimeout(() => mockXHR._triggerEvent('timeout'), 0)

        const result = await uploadPromise

        expect(result.success).toBe(false)
        expect(result.error).toBe('업로드 시간이 초과되었습니다')
      })

      it('타임아웃이 5분으로 설정되어야 함', async () => {
        const file = createMockFile('check-timeout.pdf')

        BatchUploadApi.uploadFile(file, 'cust-001')

        // 비동기 바이러스 검사 대기 후 XHR 속성 확인
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(mockXHR.timeout).toBe(5 * 60 * 1000)
      })
    })

    describe('취소 처리', () => {
      it('AbortController로 업로드를 취소할 수 있어야 함', async () => {
        const file = createMockFile('cancelable.pdf')
        const abortController = new AbortController()

        const uploadPromise = BatchUploadApi.uploadFile(
          file,
          'cust-001',
          undefined,
          abortController.signal
        )

        // abort 시그널 발생
        setTimeout(() => abortController.abort(), 0)

        const result = await uploadPromise

        expect(result.success).toBe(false)
        expect(result.error).toBe('업로드가 취소되었습니다')
        expect(mockXHR.abort).toHaveBeenCalled()
      })
    })

    describe('요청 설정', () => {
      it('올바른 엔드포인트로 POST 요청이 되어야 함', async () => {
        const file = createMockFile('endpoint.pdf')
        mockXHR.status = 200

        const uploadPromise = BatchUploadApi.uploadFile(file, 'cust-001')
        setTimeout(() => mockXHR._triggerEvent('load'), 0)

        await uploadPromise

        expect(mockXHR.open).toHaveBeenCalledWith(
          'POST',
          'https://n8nd.giize.com/webhook/docprep-main'
        )
      })
    })
  })

  // ===== 3. saveBatchHistory() =====

  describe('saveBatchHistory', () => {
    const historyData = {
      userId: 'user-001',
      startedAt: '2025-12-07T10:00:00.000Z',
      completedAt: '2025-12-07T10:05:00.000Z',
      totalFolders: 5,
      totalFiles: 20,
      successCount: 18,
      failureCount: 2,
      status: 'completed' as const,
    }

    it('배치 이력을 성공적으로 저장해야 함', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({
        success: true,
        data: { batchId: 'batch-new-001' },
      })

      const result = await BatchUploadApi.saveBatchHistory(historyData)

      expect(api.post).toHaveBeenCalledWith('/api/batch-uploads/history', historyData)
      expect(result.success).toBe(true)
      expect(result.batchId).toBe('batch-new-001')
    })

    it('ApiError 발생 시 에러를 반환해야 함', async () => {
      const apiError = new ApiError('저장 실패', 500, 'Internal Server Error')
      vi.mocked(api.post).mockRejectedValueOnce(apiError)

      // console.warn 모킹
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await BatchUploadApi.saveBatchHistory(historyData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('저장 실패')
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('일반 에러 발생 시 기본 에러 메시지를 반환해야 함', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('Unknown'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await BatchUploadApi.saveBatchHistory(historyData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('이력 저장 실패')

      warnSpy.mockRestore()
    })
  })

  // ===== 4. getBatchHistory() =====

  describe('getBatchHistory', () => {
    it('배치 이력을 성공적으로 조회해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: [mockBatchHistory],
      })

      const result = await BatchUploadApi.getBatchHistory()

      expect(api.get).toHaveBeenCalledWith('/api/batch-uploads/history?limit=10')
      expect(result.success).toBe(true)
      expect(result.history).toHaveLength(1)
      expect(result.history[0]).toEqual(mockBatchHistory)
    })

    it('limit 파라미터가 적용되어야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
        data: [],
      })

      await BatchUploadApi.getBatchHistory(25)

      expect(api.get).toHaveBeenCalledWith('/api/batch-uploads/history?limit=25')
    })

    it('data가 undefined일 때 빈 배열을 반환해야 함', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        success: true,
      })

      const result = await BatchUploadApi.getBatchHistory()

      expect(result.success).toBe(true)
      expect(result.history).toEqual([])
    })

    it('ApiError 발생 시 에러를 반환해야 함', async () => {
      const apiError = new ApiError('조회 실패', 500, 'Internal Server Error')
      vi.mocked(api.get).mockRejectedValueOnce(apiError)

      const result = await BatchUploadApi.getBatchHistory()

      expect(result.success).toBe(false)
      expect(result.history).toEqual([])
      expect(result.error).toBe('조회 실패')
    })

    it('일반 에러 발생 시 기본 에러 메시지를 반환해야 함', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network Error'))

      const result = await BatchUploadApi.getBatchHistory()

      expect(result.success).toBe(false)
      expect(result.history).toEqual([])
      expect(result.error).toBe('이력 조회 실패')
    })
  })
})

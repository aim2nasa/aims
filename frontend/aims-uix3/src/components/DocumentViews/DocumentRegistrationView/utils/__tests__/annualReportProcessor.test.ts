/**
 * annualReportProcessor 유틸리티 테스트
 * @since 1.0.0
 *
 * Annual Report 처리 로직 테스트
 * - 문서 중복 검사 (캐시 기반 해시 일괄 조회)
 * - AR 문서 등록 처리
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  processAnnualReportFile,
  registerArDocument,
  clearDuplicateCheckCache
} from '../annualReportProcessor'
import { calculateFileHash } from '@/features/customer/utils/fileHash'

// Mock dependencies
vi.mock('@/features/customer/utils/fileHash')

describe('processAnnualReportFile', () => {
  let mockFile: File
  const mockCustomerId = 'customer-123'

  beforeEach(() => {
    mockFile = new File(['test content'], 'annual-report.pdf', { type: 'application/pdf' })
    vi.clearAllMocks()
    clearDuplicateCheckCache() // 테스트 간 캐시 초기화
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('문서 중복 검사 성공', () => {
    it('중복 문서가 없으면 shouldUploadDoc=true를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      // 새 API: /api/customers/:id/document-hashes → 빈 해시 목록
      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve({ success: true, hashes: [], total: 0 })
      } as Response)

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false,
        isDuplicateIssueDate: false,
        duplicateIssueDate: undefined
      })
    })

    it('기존 문서가 있지만 해시가 다르면 shouldUploadDoc=true를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-new')
      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          hashes: ['hash-old-1', 'hash-old-2'],
          total: 2
        })
      } as Response)

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false,
        isDuplicateIssueDate: false,
        duplicateIssueDate: undefined
      })
    })

    it('중복 문서가 있으면 shouldUploadDoc=false를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-duplicate')
      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          hashes: ['hash-different', 'hash-duplicate'],
          total: 2
        })
      } as Response)

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: false,
        isDuplicateDoc: true,
        isDuplicateIssueDate: false,
        duplicateIssueDate: undefined
      })
    })

    it('캐시된 해시로 API 호출 없이 중복을 감지해야 함', async () => {
      // 첫 번째 호출: API에서 해시 로드
      vi.mocked(calculateFileHash).mockResolvedValue('hash-first')
      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          hashes: ['hash-existing'],
          total: 1
        })
      } as Response)

      await processAnnualReportFile(mockFile, mockCustomerId)

      // 두 번째 호출: 같은 고객 → 캐시에서 조회 (API 재호출 없음)
      vi.mocked(calculateFileHash).mockResolvedValue('hash-existing')
      const fetchCallCount = vi.mocked(global.fetch).mock.calls.length

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result.isDuplicateDoc).toBe(true)
      // 캐시 히트 → fetch 추가 호출 없음
      expect(vi.mocked(global.fetch).mock.calls.length).toBe(fetchCallCount)
    })
  })

  describe('에러 처리', () => {
    it('파일 해시 계산 실패 시 안전하게 진행해야 함', async () => {
      vi.mocked(calculateFileHash).mockRejectedValue(new Error('Hash calculation failed'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false,
        isDuplicateIssueDate: false,
        duplicateIssueDate: undefined
      })
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('해시 일괄 조회 API 실패 시 안전하게 진행해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false,
        isDuplicateIssueDate: false,
        duplicateIssueDate: undefined
      })
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('API 실패 후에도 캐시가 설정되어 중복 재호출을 방지해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // 첫 번째 호출: API 실패
      await processAnnualReportFile(mockFile, mockCustomerId)
      const callsAfterFirst = vi.mocked(global.fetch).mock.calls.length

      // 두 번째 호출: 캐시 히트 (빈 Set이 캐시됨)
      await processAnnualReportFile(mockFile, mockCustomerId)

      // 캐시에서 조회하므로 fetch 추가 호출 없음
      expect(vi.mocked(global.fetch).mock.calls.length).toBe(callsAfterFirst)

      consoleErrorSpy.mockRestore()
    })
  })
})

describe('registerArDocument', () => {
  let mockFile: File
  const mockCustomerId = 'customer-456'
  const mockIssueDate = '2024-01-01'
  let mockCallbacks: any

  beforeEach(() => {
    mockFile = new File(['test'], 'ar-2024.pdf', { type: 'application/pdf' })

    mockCallbacks = {
      addLog: vi.fn(),
      generateFileId: vi.fn(() => 'file-id-123'),
      addToUploadQueue: vi.fn(),
      trackArFile: vi.fn()
    }

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('등록 처리 (중복 검사는 호출자 책임)', () => {
    it('추적 등록 및 업로드 큐에 추가해야 함', async () => {
      const result = await registerArDocument(
        mockFile,
        mockCustomerId,
        mockIssueDate,
        mockCallbacks
      )

      expect(result).toEqual({
        success: true,
        isDuplicate: false,
        isDuplicateIssueDate: false
      })

      expect(mockCallbacks.trackArFile).toHaveBeenCalledWith(mockFile.name, mockCustomerId)
      expect(mockCallbacks.addToUploadQueue).toHaveBeenCalled()
    })

    it('파일 ID를 생성하고 업로드 큐에 추가해야 함', async () => {
      await registerArDocument(mockFile, mockCustomerId, mockIssueDate, mockCallbacks)

      expect(mockCallbacks.generateFileId).toHaveBeenCalled()
      expect(mockCallbacks.addToUploadQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'file-id-123',
          file: mockFile,
          status: 'pending',
          progress: 0
        })
      )
    })
  })

  describe('실행 순서', () => {
    it('추적 등록 → 큐 추가 순서로 실행해야 함', async () => {
      const executionOrder: string[] = []

      mockCallbacks.trackArFile.mockImplementation(() => {
        executionOrder.push('trackArFile')
      })
      mockCallbacks.addToUploadQueue.mockImplementation(() => {
        executionOrder.push('addToUploadQueue')
      })

      await registerArDocument(mockFile, mockCustomerId, mockIssueDate, mockCallbacks)

      expect(executionOrder).toEqual(['trackArFile', 'addToUploadQueue'])
    })
  })
})

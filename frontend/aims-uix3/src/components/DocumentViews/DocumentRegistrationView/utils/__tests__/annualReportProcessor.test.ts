/**
 * annualReportProcessor 유틸리티 테스트
 * @since 1.0.0
 *
 * Annual Report 처리 로직 테스트
 * - 문서 중복 검사
 * - AR 문서 등록 처리
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  processAnnualReportFile,
  registerArDocument
} from '../annualReportProcessor'
import { DocumentService } from '@/services/DocumentService'
import { calculateFileHash } from '@/features/customer/utils/fileHash'

// Mock dependencies
vi.mock('@/services/DocumentService')
vi.mock('@/features/customer/utils/fileHash')

describe('processAnnualReportFile', () => {
  let mockFile: File
  const mockCustomerId = 'customer-123'

  beforeEach(() => {
    mockFile = new File(['test content'], 'annual-report.pdf', { type: 'application/pdf' })
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('문서 중복 검사 성공', () => {
    it('중복 문서가 없으면 shouldUploadDoc=true를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [],
        total: 0
      } as any)

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false
      })
    })

    it('기존 문서가 있지만 해시가 다르면 shouldUploadDoc=true를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-new')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [{ _id: 'doc1' }, { _id: 'doc2' }],
        total: 2
      } as any)

      vi.mocked(global.fetch).mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.includes('doc1')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-old-1' } } }
            })
          } as Response)
        }
        if (urlStr.includes('doc2')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-old-2' } } }
            })
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false
      })
    })

    it('중복 문서가 있으면 shouldUploadDoc=false를 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-duplicate')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [{ _id: 'doc1' }, { _id: 'doc2' }],
        total: 2
      } as any)

      vi.mocked(global.fetch).mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.includes('doc1')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-different' } } }
            })
          } as Response)
        }
        if (urlStr.includes('doc2')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-duplicate' } } }
            })
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: false,
        isDuplicateDoc: true
      })
    })

    it('첫 번째 문서에서 중복이 발견되면 즉시 반환해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-match')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [{ _id: 'doc1' }, { _id: 'doc2' }, { _id: 'doc3' }],
        total: 3
      } as any)

      const fetchSpy = vi.fn()
      vi.mocked(global.fetch).mockImplementation((url) => {
        fetchSpy(url)
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.includes('doc1')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-match' } } }
            })
          } as Response)
        }
        return Promise.reject(new Error('Should not reach here'))
      })

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result.isDuplicateDoc).toBe(true)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('에러 처리', () => {
    it('파일 해시 계산 실패 시 안전하게 진행해야 함', async () => {
      vi.mocked(calculateFileHash).mockRejectedValue(new Error('Hash calculation failed'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false
      })
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('문서 목록 조회 실패 시 안전하게 진행해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(DocumentService.getCustomerDocuments).mockRejectedValue(new Error('Network error'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result).toEqual({
        shouldUploadDoc: true,
        isDuplicateDoc: false
      })
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })

    it('개별 문서 상태 조회 실패 시 다음 문서 계속 확인해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [{ _id: 'doc1' }, { _id: 'doc2' }],
        total: 2
      } as any)

      vi.mocked(global.fetch).mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString()
        if (urlStr.includes('doc1')) {
          return Promise.reject(new Error('Network error'))
        }
        if (urlStr.includes('doc2')) {
          return Promise.resolve({
            json: () => Promise.resolve({
              success: true,
              data: { raw: { meta: { file_hash: 'hash-different' } } }
            })
          } as Response)
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await processAnnualReportFile(mockFile, mockCustomerId)

      expect(result.isDuplicateDoc).toBe(false)
      expect(consoleErrorSpy).toHaveBeenCalled()

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
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('정상 처리', () => {
    it('중복이 아닌 문서는 성공적으로 등록해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash123')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [],
        total: 0
      } as any)

      const result = await registerArDocument(
        mockFile,
        mockCustomerId,
        mockIssueDate,
        mockCallbacks
      )

      expect(result).toEqual({
        success: true,
        isDuplicate: false
      })

      expect(mockCallbacks.trackArFile).toHaveBeenCalledWith(mockFile.name, mockCustomerId)
      expect(mockCallbacks.addToUploadQueue).toHaveBeenCalled()
    })

    it('파일 ID를 생성하고 업로드 큐에 추가해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash456')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [],
        total: 0
      } as any)

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

  describe('중복 문서 처리', () => {
    it('중복 문서는 경고 후 종료해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash-dup')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [{ _id: 'doc1' }],
        total: 1
      } as any)
      vi.mocked(global.fetch).mockResolvedValue({
        json: () => Promise.resolve({
          success: true,
          data: { raw: { meta: { file_hash: 'hash-dup' } } }
        })
      } as Response)

      const result = await registerArDocument(
        mockFile,
        mockCustomerId,
        mockIssueDate,
        mockCallbacks
      )

      expect(result).toEqual({
        success: false,
        isDuplicate: true
      })

      expect(mockCallbacks.addLog).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('중복 문서 감지'),
        expect.any(String)
      )

      expect(mockCallbacks.addToUploadQueue).not.toHaveBeenCalled()
      expect(mockCallbacks.trackArFile).not.toHaveBeenCalled()
    })
  })

  describe('전체 처리 흐름', () => {
    it('정상 흐름: 중복 검사 → 추적 등록 → 큐 추가 순서로 실행해야 함', async () => {
      vi.mocked(calculateFileHash).mockResolvedValue('hash789')
      vi.mocked(DocumentService.getCustomerDocuments).mockResolvedValue({
        customer_id: mockCustomerId,
        documents: [],
        total: 0
      } as any)

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

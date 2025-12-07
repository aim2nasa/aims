/**
 * Duplicate Checker Utility Tests
 * @since 2025-12-07
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCustomerFileHashes,
  checkDuplicateFile,
  checkDuplicateFiles,
  getUniqueFileName,
  type ExistingFileHash,
} from '../duplicateChecker'
import { api } from '../../../../shared/lib/api'
import { calculateFileHash } from '../../../customer/utils/fileHash'

// Mock modules
vi.mock('../../../../shared/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

vi.mock('../../../customer/utils/fileHash', () => ({
  calculateFileHash: vi.fn(),
}))

const mockApi = vi.mocked(api)
const mockCalculateFileHash = vi.mocked(calculateFileHash)

describe('duplicateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getCustomerFileHashes', () => {
    it('빈 고객 ID 시 빈 배열 반환', async () => {
      const result = await getCustomerFileHashes('')
      expect(result).toEqual([])
      expect(mockApi.get).not.toHaveBeenCalled()
    })

    it('공백만 있는 고객 ID 시 빈 배열 반환', async () => {
      const result = await getCustomerFileHashes('   ')
      expect(result).toEqual([])
      expect(mockApi.get).not.toHaveBeenCalled()
    })

    it('문서가 없는 고객은 빈 배열 반환', async () => {
      mockApi.get.mockResolvedValueOnce({
        success: true,
        documents: [],
        total: 0,
      })

      const result = await getCustomerFileHashes('customer-123')

      expect(result).toEqual([])
      expect(mockApi.get).toHaveBeenCalledWith('/api/customers/customer-123/documents')
    })

    it('문서 해시 목록 정상 조회', async () => {
      // 고객 문서 목록 응답
      mockApi.get.mockResolvedValueOnce({
        success: true,
        documents: [
          { _id: 'doc-1', originalName: 'file1.pdf', fileSize: 1000, uploadedAt: '2025-12-01' },
          { _id: 'doc-2', originalName: 'file2.pdf', fileSize: 2000, uploadedAt: '2025-12-02' },
        ],
        total: 2,
      })

      // 각 문서 상태 응답
      mockApi.get
        .mockResolvedValueOnce({
          success: true,
          data: { raw: { meta: { file_hash: 'hash-abc123' } } },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { raw: { meta: { file_hash: 'hash-def456' } } },
        })

      const result = await getCustomerFileHashes('customer-123')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        documentId: 'doc-1',
        fileName: 'file1.pdf',
        fileHash: 'hash-abc123',
        fileSize: 1000,
        uploadedAt: '2025-12-01',
      })
      expect(result[1]).toEqual({
        documentId: 'doc-2',
        fileName: 'file2.pdf',
        fileHash: 'hash-def456',
        fileSize: 2000,
        uploadedAt: '2025-12-02',
      })
    })

    it('해시가 없는 문서는 결과에서 제외', async () => {
      mockApi.get.mockResolvedValueOnce({
        success: true,
        documents: [
          { _id: 'doc-1', originalName: 'file1.pdf', fileSize: 1000 },
          { _id: 'doc-2', originalName: 'file2.pdf', fileSize: 2000 },
        ],
        total: 2,
      })

      // doc-1은 해시 있음, doc-2는 해시 없음
      mockApi.get
        .mockResolvedValueOnce({
          success: true,
          data: { raw: { meta: { file_hash: 'hash-abc123' } } },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { raw: { meta: {} } }, // 해시 없음
        })

      const result = await getCustomerFileHashes('customer-123')

      expect(result).toHaveLength(1)
      expect(result[0].documentId).toBe('doc-1')
    })

    it('개별 문서 조회 실패 시 해당 문서만 제외', async () => {
      mockApi.get.mockResolvedValueOnce({
        success: true,
        documents: [
          { _id: 'doc-1', originalName: 'file1.pdf', fileSize: 1000 },
          { _id: 'doc-2', originalName: 'file2.pdf', fileSize: 2000 },
        ],
        total: 2,
      })

      // doc-1 성공, doc-2 실패
      mockApi.get
        .mockResolvedValueOnce({
          success: true,
          data: { raw: { meta: { file_hash: 'hash-abc123' } } },
        })
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await getCustomerFileHashes('customer-123')

      expect(result).toHaveLength(1)
      expect(result[0].documentId).toBe('doc-1')
    })

    it('전체 API 실패 시 빈 배열 반환', async () => {
      mockApi.get.mockRejectedValueOnce(new Error('API Error'))

      const result = await getCustomerFileHashes('customer-123')

      expect(result).toEqual([])
    })
  })

  describe('checkDuplicateFile', () => {
    const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })

    it('중복 파일 감지', async () => {
      const existingHashes: ExistingFileHash[] = [
        {
          documentId: 'doc-1',
          fileName: 'existing.pdf',
          fileHash: 'hash-match',
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
      ]

      mockCalculateFileHash.mockResolvedValueOnce('hash-match')

      const result = await checkDuplicateFile(mockFile, existingHashes)

      expect(result.isDuplicate).toBe(true)
      expect(result.existingDoc).toEqual(existingHashes[0])
      expect(result.newFileHash).toBe('hash-match')
    })

    it('새로운 파일 (중복 아님)', async () => {
      const existingHashes: ExistingFileHash[] = [
        {
          documentId: 'doc-1',
          fileName: 'existing.pdf',
          fileHash: 'hash-existing',
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
      ]

      mockCalculateFileHash.mockResolvedValueOnce('hash-new')

      const result = await checkDuplicateFile(mockFile, existingHashes)

      expect(result.isDuplicate).toBe(false)
      expect(result.existingDoc).toBeUndefined()
      expect(result.newFileHash).toBe('hash-new')
    })

    it('빈 해시 목록에서는 항상 중복 아님', async () => {
      mockCalculateFileHash.mockResolvedValueOnce('hash-any')

      const result = await checkDuplicateFile(mockFile, [])

      expect(result.isDuplicate).toBe(false)
      expect(result.existingDoc).toBeUndefined()
    })
  })

  describe('checkDuplicateFiles', () => {
    it('여러 파일 일괄 중복 검사', async () => {
      const file1 = new File(['content1'], 'file1.pdf', { type: 'application/pdf' })
      const file2 = new File(['content2'], 'file2.pdf', { type: 'application/pdf' })
      const file3 = new File(['content3'], 'file3.pdf', { type: 'application/pdf' })

      const existingHashes: ExistingFileHash[] = [
        {
          documentId: 'doc-1',
          fileName: 'existing.pdf',
          fileHash: 'hash-1', // file1과 일치
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
      ]

      mockCalculateFileHash
        .mockResolvedValueOnce('hash-1') // file1 - 중복
        .mockResolvedValueOnce('hash-2') // file2 - 새 파일
        .mockResolvedValueOnce('hash-3') // file3 - 새 파일

      const results = await checkDuplicateFiles([file1, file2, file3], existingHashes)

      expect(results.size).toBe(3)

      const result1 = results.get(file1)
      expect(result1?.isDuplicate).toBe(true)

      const result2 = results.get(file2)
      expect(result2?.isDuplicate).toBe(false)

      const result3 = results.get(file3)
      expect(result3?.isDuplicate).toBe(false)
    })

    it('빈 파일 목록', async () => {
      const results = await checkDuplicateFiles([], [])
      expect(results.size).toBe(0)
    })
  })

  describe('getUniqueFileName', () => {
    it('중복 없으면 원본 파일명 반환', () => {
      const result = getUniqueFileName('report.pdf', [])
      expect(result).toBe('report.pdf')
    })

    it('중복 없으면 원본 파일명 반환 (다른 파일 있음)', () => {
      const result = getUniqueFileName('report.pdf', ['other.pdf', 'another.pdf'])
      expect(result).toBe('report.pdf')
    })

    it('중복 시 (1) 추가', () => {
      const result = getUniqueFileName('report.pdf', ['report.pdf'])
      expect(result).toBe('report (1).pdf')
    })

    it('(1)도 중복 시 (2) 추가', () => {
      const result = getUniqueFileName('report.pdf', ['report.pdf', 'report (1).pdf'])
      expect(result).toBe('report (2).pdf')
    })

    it('연속 번호 찾기', () => {
      const result = getUniqueFileName('report.pdf', [
        'report.pdf',
        'report (1).pdf',
        'report (2).pdf',
        'report (3).pdf',
      ])
      expect(result).toBe('report (4).pdf')
    })

    it('확장자 없는 파일', () => {
      const result = getUniqueFileName('README', ['README'])
      expect(result).toBe('README (1)')
    })

    it('여러 점이 있는 파일명', () => {
      const result = getUniqueFileName('report.2024.01.pdf', ['report.2024.01.pdf'])
      expect(result).toBe('report.2024.01 (1).pdf')
    })

    it('점으로 시작하는 파일명', () => {
      const result = getUniqueFileName('.gitignore', ['.gitignore'])
      expect(result).toBe('.gitignore (1)')
    })
  })
})

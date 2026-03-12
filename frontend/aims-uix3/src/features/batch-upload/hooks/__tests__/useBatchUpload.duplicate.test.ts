/**
 * useBatchUpload Hook - Duplicate Detection Tests
 * @since 2025-12-07
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBatchUpload } from '../useBatchUpload'
import { BatchUploadApi } from '../../api/batchUploadApi'
import * as duplicateChecker from '@/shared/lib/fileValidation'
import type { FolderMapping } from '../../types'

// Mock modules
vi.mock('../../api/batchUploadApi', () => ({
  BatchUploadApi: {
    uploadFile: vi.fn(),
    getCustomersForMatching: vi.fn(),
  },
}))

vi.mock('@/shared/lib/fileValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/fileValidation')>()
  return {
    ...actual,
    getCustomerFileHashes: vi.fn(),
    checkDuplicateFile: vi.fn(),
    getUniqueFileName: vi.fn(),
  }
})

const mockUploadFile = vi.mocked(BatchUploadApi.uploadFile)
const mockGetCustomerFileHashes = vi.mocked(duplicateChecker.getCustomerFileHashes)
const mockCheckDuplicateFile = vi.mocked(duplicateChecker.checkDuplicateFile)
const mockGetUniqueFileName = vi.mocked(duplicateChecker.getUniqueFileName)

describe('useBatchUpload - Duplicate Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetCustomerFileHashes.mockResolvedValue([])
    mockCheckDuplicateFile.mockResolvedValue({
      isDuplicate: false,
      newFileHash: 'new-hash-123',
    })
    mockUploadFile.mockResolvedValue({
      success: true,
      fileName: 'test.pdf',
      customerId: 'customer-1',
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const createMockFile = (name: string, content = 'test content'): File => {
    return new File([content], name, { type: 'application/pdf' })
  }

  const createMockMapping = (overrides: Partial<FolderMapping> = {}): FolderMapping => ({
    folderName: '홍길동',
    customerId: 'customer-1',
    customerName: '홍길동',
    matched: true,
    files: [createMockFile('test.pdf')],
    fileCount: 1,
    totalSize: 1000,
    ...overrides,
  })

  describe('초기 상태', () => {
    it('duplicateState가 올바르게 초기화됨', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(result.current.progress.duplicateState).toEqual({
        isChecking: false,
        currentDuplicate: null,
        pendingDuplicates: [],
        resolvedCount: 0,
        totalDuplicates: 0,
        applyToAllAction: null,
      })
    })

    it('skippedFiles가 0으로 초기화됨', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(result.current.progress.skippedFiles).toBe(0)
    })
  })

  describe('중복 검사', () => {
    it('업로드 시작 시 고객별 해시 캐시를 로드함', async () => {
      const mapping = createMockMapping()

      mockGetCustomerFileHashes.mockResolvedValueOnce([
        {
          documentId: 'doc-1',
          fileName: 'existing.pdf',
          fileHash: 'existing-hash',
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
      ])

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      expect(mockGetCustomerFileHashes).toHaveBeenCalledWith('customer-1')
    })

    it('중복이 아닌 파일은 바로 업로드됨', async () => {
      const mapping = createMockMapping()

      mockCheckDuplicateFile.mockResolvedValueOnce({
        isDuplicate: false,
        newFileHash: 'new-hash',
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      expect(mockUploadFile).toHaveBeenCalled()
      expect(result.current.progress.completedFiles).toBe(1)
    })

    it('중복 파일 발견 시 상태가 paused로 변경됨', async () => {
      const mapping = createMockMapping()

      mockCheckDuplicateFile.mockResolvedValueOnce({
        isDuplicate: true,
        existingDoc: {
          documentId: 'existing-doc-1',
          fileName: 'test.pdf',
          fileHash: 'existing-hash',
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
        newFileHash: 'new-hash',
      })

      const { result } = renderHook(() => useBatchUpload())

      // 업로드 시작 (비동기로 실행)
      act(() => {
        result.current.startUpload([mapping])
      })

      // 중복 발견으로 인한 일시정지 대기
      await waitFor(
        () => {
          expect(result.current.progress.duplicateState.currentDuplicate).not.toBeNull()
        },
        { timeout: 5000 }
      )

      expect(result.current.progress.state).toBe('paused')
      expect(result.current.progress.duplicateState.currentDuplicate?.existingFileName).toBe(
        'test.pdf'
      )
    })
  })

  describe('handleDuplicateAction', () => {
    it('skip 액션 시 파일이 건너뛰어짐', async () => {
      const mapping = createMockMapping()

      mockCheckDuplicateFile.mockResolvedValueOnce({
        isDuplicate: true,
        existingDoc: {
          documentId: 'existing-doc-1',
          fileName: 'test.pdf',
          fileHash: 'existing-hash',
          fileSize: 1000,
          uploadedAt: '2025-12-01',
        },
        newFileHash: 'new-hash',
      })

      const { result } = renderHook(() => useBatchUpload())

      // 업로드 시작
      act(() => {
        result.current.startUpload([mapping])
      })

      // 중복 다이얼로그 대기
      await waitFor(
        () => {
          expect(result.current.progress.duplicateState.currentDuplicate).not.toBeNull()
        },
        { timeout: 5000 }
      )

      // skip 액션 실행
      act(() => {
        result.current.handleDuplicateAction('skip', false)
      })

      // 완료 대기
      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 5000 }
      )

      expect(result.current.progress.skippedFiles).toBe(1)
      expect(result.current.progress.completedFiles).toBe(0)
      expect(mockUploadFile).not.toHaveBeenCalled()
    })

    // Note: overwrite/keep_both 테스트는 hash 기반 중복 검사에서 무의미하므로 제거됨

    it('applyToAll=true 시 후속 중복 파일에 자동 적용됨', async () => {
      const mapping = createMockMapping({
        files: [createMockFile('file1.pdf'), createMockFile('file2.pdf')],
        fileCount: 2,
      })

      // 두 파일 모두 중복
      mockCheckDuplicateFile
        .mockResolvedValueOnce({
          isDuplicate: true,
          existingDoc: {
            documentId: 'doc-1',
            fileName: 'file1.pdf',
            fileHash: 'hash-1',
            fileSize: 1000,
            uploadedAt: '2025-12-01',
          },
          newFileHash: 'new-hash-1',
        })
        .mockResolvedValueOnce({
          isDuplicate: true,
          existingDoc: {
            documentId: 'doc-2',
            fileName: 'file2.pdf',
            fileHash: 'hash-2',
            fileSize: 1000,
            uploadedAt: '2025-12-01',
          },
          newFileHash: 'new-hash-2',
        })

      const { result } = renderHook(() => useBatchUpload())

      // 업로드 시작
      act(() => {
        result.current.startUpload([mapping])
      })

      // 첫 번째 중복 다이얼로그 대기
      await waitFor(
        () => {
          expect(result.current.progress.duplicateState.currentDuplicate).not.toBeNull()
        },
        { timeout: 5000 }
      )

      // skip + applyToAll 실행
      act(() => {
        result.current.handleDuplicateAction('skip', true)
      })

      // 완료 대기 (두 번째 파일도 자동으로 skip됨)
      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 5000 }
      )

      // 두 파일 모두 건너뛰어짐
      expect(result.current.progress.skippedFiles).toBe(2)
      expect(result.current.progress.completedFiles).toBe(0)
    })
  })

  describe('reset', () => {
    it('reset 시 duplicateState도 초기화됨', async () => {
      const { result } = renderHook(() => useBatchUpload())

      // 상태 변경
      act(() => {
        result.current.handleDuplicateAction('skip', true)
      })

      // reset 실행
      act(() => {
        result.current.reset()
      })

      expect(result.current.progress.duplicateState).toEqual({
        isChecking: false,
        currentDuplicate: null,
        pendingDuplicates: [],
        resolvedCount: 0,
        totalDuplicates: 0,
        applyToAllAction: null,
      })
    })
  })
})

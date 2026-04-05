/**
 * useBatchUpload Hook 테스트
 * @since 2025-12-05
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBatchUpload } from '../useBatchUpload'
import type { FolderMapping } from '../../types'

// BatchUploadApi 모킹
vi.mock('../../api/batchUploadApi', () => ({
  BatchUploadApi: {
    uploadFile: vi.fn().mockResolvedValue({
      success: true,
      fileName: 'test.pdf',
      customerId: 'c1',
    }),
  },
}))

// duplicateChecker 모킹 (Web Crypto API 의존성 해결)
vi.mock('@/shared/lib/fileValidation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/fileValidation')>()
  return {
    ...actual,
    getCustomerFileHashes: vi.fn().mockResolvedValue([]),
    checkDuplicateFile: vi.fn().mockResolvedValue({
      isDuplicate: false,
      newFileHash: 'mock-hash',
    }),
    getUniqueFileName: vi.fn((name: string) => name),
  }
})

/**
 * 테스트용 매핑 데이터 생성
 */
function createMockMapping(overrides: Partial<FolderMapping> = {}): FolderMapping {
  return {
    folderName: '홍길동',
    customerId: 'c1',
    customerName: '홍길동',
    matched: true,
    files: [],
    fileCount: 0,
    totalSize: 0,
    ...overrides,
  }
}

/**
 * 테스트용 파일 생성
 */
function createMockFile(name: string, _size: number = 1024): File {
  const blob = new Blob(['test content'], { type: 'application/pdf' })
  return new File([blob], name, { type: 'application/pdf' })
}

describe('useBatchUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('초기 상태', () => {
    test('초기 상태는 idle이다', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(result.current.progress.state).toBe('idle')
      expect(result.current.progress.totalFiles).toBe(0)
      expect(result.current.progress.completedFiles).toBe(0)
      expect(result.current.progress.failedFiles).toBe(0)
      expect(result.current.progress.overallProgress).toBe(0)
    })

    test('folders와 files 배열이 비어있다', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(result.current.progress.folders).toEqual([])
      expect(result.current.progress.files).toEqual([])
    })
  })

  describe('reset', () => {
    test('상태를 초기화한다', async () => {
      const { result } = renderHook(() => useBatchUpload())

      // 매핑 데이터 준비
      const mappings: FolderMapping[] = [
        createMockMapping({
          files: [createMockFile('test.pdf')],
          fileCount: 1,
        }),
      ]

      // 업로드 시작 후 리셋
      await act(async () => {
        await result.current.startUpload(mappings)
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.progress.state).toBe('idle')
      expect(result.current.progress.totalFiles).toBe(0)
    })
  })

  describe('cancelUpload', () => {
    test('업로드를 취소한다', async () => {
      const { result } = renderHook(() => useBatchUpload())

      const mappings: FolderMapping[] = [
        createMockMapping({
          files: [createMockFile('test.pdf')],
          fileCount: 1,
        }),
      ]

      // 업로드 시작 (startUpload 내부 50ms cleanup 대기 후 실제 업로드 진행)
      let uploadPromise: Promise<void>
      act(() => {
        uploadPromise = result.current.startUpload(mappings)
      })

      // startUpload의 cleanup 대기(50ms) 이후 취소해야 실제 취소됨
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
      })

      act(() => {
        result.current.cancelUpload()
      })

      // 업로드 완료 대기
      await act(async () => {
        await uploadPromise
      })

      expect(result.current.progress.state).toBe('cancelled')
    })
  })

  describe('pauseUpload / resumeUpload', () => {
    test('일시정지 상태로 전환한다', () => {
      const { result } = renderHook(() => useBatchUpload())

      act(() => {
        result.current.pauseUpload()
      })

      expect(result.current.progress.state).toBe('paused')
    })

    test('재개 상태로 전환한다', () => {
      const { result } = renderHook(() => useBatchUpload())

      act(() => {
        result.current.pauseUpload()
      })

      act(() => {
        result.current.resumeUpload()
      })

      expect(result.current.progress.state).toBe('uploading')
    })
  })

  describe('반환된 함수들', () => {
    test('필요한 모든 함수가 반환된다', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(typeof result.current.startUpload).toBe('function')
      expect(typeof result.current.pauseUpload).toBe('function')
      expect(typeof result.current.resumeUpload).toBe('function')
      expect(typeof result.current.cancelUpload).toBe('function')
      expect(typeof result.current.retryFailed).toBe('function')
      expect(typeof result.current.reset).toBe('function')
    })
  })
})

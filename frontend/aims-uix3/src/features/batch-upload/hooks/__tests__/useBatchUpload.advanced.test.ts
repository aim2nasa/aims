/**
 * useBatchUpload Hook - Advanced Scenario Tests
 * @since 2025-12-07
 * @version 1.0.0
 *
 * 고급 시나리오 테스트:
 * - 동시 업로드 관리 (MAX_CONCURRENT_UPLOADS = 3)
 * - 재시도 로직 (MAX_RETRY_COUNT = 3)
 * - 복합 중복 처리 시나리오
 * - 메모리/리소스 정리
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

describe('useBatchUpload - Advanced Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mocks
    mockGetCustomerFileHashes.mockResolvedValue([])
    mockCheckDuplicateFile.mockResolvedValue({
      isDuplicate: false,
      newFileHash: 'mock-hash',
    })
    mockUploadFile.mockResolvedValue({
      success: true,
      fileName: 'test.pdf',
      customerId: 'customer-1',
    })
    mockGetUniqueFileName.mockImplementation((name) => name)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ==================== 헬퍼 함수 ====================

  const createMockFile = (name: string, size: number = 1024): File => {
    const content = 'x'.repeat(size)
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

  const createMultipleFiles = (count: number): File[] => {
    return Array.from({ length: count }, (_, i) => createMockFile(`file${i + 1}.pdf`))
  }

  // ==================== 동시 업로드 관리 ====================

  describe('동시 업로드 관리', () => {
    it('여러 파일이 동시에 업로드됨', async () => {
      const files = createMultipleFiles(5)
      const mapping = createMockMapping({
        files,
        fileCount: 5,
      })

      // 업로드 완료 순서 추적
      const uploadOrder: string[] = []
      mockUploadFile.mockImplementation(async (file) => {
        uploadOrder.push(file.name)
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      // 모든 파일이 업로드됨
      expect(result.current.progress.completedFiles).toBe(5)
      expect(mockUploadFile).toHaveBeenCalledTimes(5)
    })

    it('매핑되지 않은 폴더는 무시됨', async () => {
      const mappings: FolderMapping[] = [
        createMockMapping({
          folderName: '홍길동',
          matched: true,
          files: [createMockFile('matched.pdf')],
        }),
        createMockMapping({
          folderName: '미매칭',
          matched: false,
          customerId: undefined,
          files: [createMockFile('unmatched.pdf')],
        }),
      ]

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload(mappings)
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      // matched된 파일만 업로드됨
      expect(mockUploadFile).toHaveBeenCalledTimes(1)
      expect(result.current.progress.completedFiles).toBe(1)
    })

    it('여러 고객 폴더가 동시에 처리됨', async () => {
      const mappings: FolderMapping[] = [
        createMockMapping({
          folderName: '홍길동',
          customerId: 'customer-1',
          files: createMultipleFiles(2),
          fileCount: 2,
        }),
        createMockMapping({
          folderName: '김영희',
          customerId: 'customer-2',
          files: createMultipleFiles(2),
          fileCount: 2,
        }),
      ]

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload(mappings)
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      expect(result.current.progress.completedFiles).toBe(4)
      expect(result.current.progress.totalFolders).toBe(2)
    })
  })

  // ==================== 재시도 로직 ====================

  describe('재시도 로직', () => {
    it('업로드 실패 시 자동 재시도됨', async () => {
      const mapping = createMockMapping()

      // 첫 2번 실패, 3번째 성공
      mockUploadFile
        .mockResolvedValueOnce({
          success: false,
          fileName: 'test.pdf',
          customerId: 'customer-1',
          error: '일시적 오류',
        })
        .mockResolvedValueOnce({
          success: false,
          fileName: 'test.pdf',
          customerId: 'customer-1',
          error: '일시적 오류',
        })
        .mockResolvedValueOnce({
          success: true,
          fileName: 'test.pdf',
          customerId: 'customer-1',
        })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 10000 }
      )

      // 3번 호출됨 (2번 실패 + 1번 성공)
      expect(mockUploadFile).toHaveBeenCalledTimes(3)
      expect(result.current.progress.completedFiles).toBe(1)
      expect(result.current.progress.failedFiles).toBe(0)
    })

    it('최대 재시도 횟수 초과 시 실패 처리됨', async () => {
      const mapping = createMockMapping()

      // 모든 시도 실패
      mockUploadFile.mockResolvedValue({
        success: false,
        fileName: 'test.pdf',
        customerId: 'customer-1',
        error: '영구 오류',
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 15000 }
      )

      // MAX_RETRY_COUNT (3) 만큼 호출됨
      expect(mockUploadFile).toHaveBeenCalledTimes(3)
      expect(result.current.progress.failedFiles).toBe(1)
      expect(result.current.progress.completedFiles).toBe(0)
    })

    it('일부 파일만 실패하는 경우', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(3),
        fileCount: 3,
      })

      // file1, file3는 성공, file2는 실패
      mockUploadFile.mockImplementation(async (file) => {
        if (file.name === 'file2.pdf') {
          return {
            success: false,
            fileName: file.name,
            customerId: 'customer-1',
            error: '업로드 실패',
          }
        }
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 15000 }
      )

      // file2는 3번 재시도 후 실패
      expect(result.current.progress.completedFiles).toBe(2)
      expect(result.current.progress.failedFiles).toBe(1)
    })
  })

  // ==================== 폴더 상태 관리 ====================

  describe('폴더 상태 관리', () => {
    it('모든 파일 완료 시 폴더 상태가 completed로 변경됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(3),
        fileCount: 3,
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      const folder = result.current.progress.folders.find((f) => f.folderName === '홍길동')
      expect(folder?.status).toBe('completed')
      expect(folder?.completedFiles).toBe(3)
    })

    it('일부 파일 실패 시 폴더 상태가 partial로 변경됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(3),
        fileCount: 3,
      })

      // 2번 파일만 실패
      mockUploadFile.mockImplementation(async (file) => {
        if (file.name === 'file2.pdf') {
          return {
            success: false,
            fileName: file.name,
            customerId: 'customer-1',
            error: '실패',
          }
        }
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 15000 }
      )

      const folder = result.current.progress.folders.find((f) => f.folderName === '홍길동')
      expect(folder?.status).toBe('partial')
      expect(folder?.completedFiles).toBe(2)
      expect(folder?.failedFiles).toBe(1)
    })

    it('모든 파일 실패 시 폴더 상태가 failed로 변경됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(2),
        fileCount: 2,
      })

      mockUploadFile.mockResolvedValue({
        success: false,
        fileName: 'test.pdf',
        customerId: 'customer-1',
        error: '실패',
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(
        () => {
          expect(result.current.progress.state).toBe('completed')
        },
        { timeout: 15000 }
      )

      const folder = result.current.progress.folders.find((f) => f.folderName === '홍길동')
      expect(folder?.status).toBe('failed')
    })
  })

  // ==================== 진행률 계산 ====================

  describe('진행률 계산', () => {
    it('전체 진행률이 올바르게 계산됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(4),
        fileCount: 4,
      })

      let _uploadCount = 0
      mockUploadFile.mockImplementation(async (file) => {
        _uploadCount++
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      // 완료 시 100%
      expect(result.current.progress.overallProgress).toBe(100)
    })

    it('빈 파일 목록의 진행률은 0', () => {
      const { result } = renderHook(() => useBatchUpload())

      expect(result.current.progress.overallProgress).toBe(0)
    })
  })

  // ==================== 취소 처리 ====================

  describe('취소 처리', () => {
    it('업로드 중 취소 시 pending 파일이 cancelled로 변경됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(5),
        fileCount: 5,
      })

      // 업로드를 느리게 만들어 취소할 시간 확보
      mockUploadFile.mockImplementation(async (file) => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      // 업로드 시작 (비동기) — startUpload 내부 50ms cleanup 대기 후 실제 업로드
      act(() => {
        result.current.startUpload([mapping])
      })

      // cleanup 대기(50ms) 이후 취소해야 실제 취소됨
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
      })

      act(() => {
        result.current.cancelUpload()
      })

      // 취소 상태 확인
      expect(result.current.progress.state).toBe('cancelled')
    })

    it('취소 후 상태가 cancelled로 유지됨', async () => {
      const mapping = createMockMapping()

      const { result } = renderHook(() => useBatchUpload())

      act(() => {
        result.current.startUpload([mapping])
      })

      // cleanup 대기(50ms) 이후 취소해야 실제 취소됨
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
      })

      act(() => {
        result.current.cancelUpload()
      })

      // 상태 확인
      expect(result.current.progress.state).toBe('cancelled')

      // 잠시 대기 후에도 상태 유지
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(result.current.progress.state).toBe('cancelled')
    })
  })

  // ==================== 일시정지/재개 ====================

  describe('일시정지/재개', () => {
    it('일시정지 상태에서 업로드가 중단됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(5),
        fileCount: 5,
      })

      let _uploadCount = 0
      mockUploadFile.mockImplementation(async (file) => {
        _uploadCount++
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          success: true,
          fileName: file.name,
          customerId: 'customer-1',
        }
      })

      const { result } = renderHook(() => useBatchUpload())

      // 업로드 시작
      act(() => {
        result.current.startUpload([mapping])
      })

      // 즉시 일시정지
      act(() => {
        result.current.pauseUpload()
      })

      expect(result.current.progress.state).toBe('paused')
    })

    it('재개 시 업로드가 계속됨', async () => {
      const { result } = renderHook(() => useBatchUpload())

      // 일시정지 후 재개
      act(() => {
        result.current.pauseUpload()
      })

      expect(result.current.progress.state).toBe('paused')

      act(() => {
        result.current.resumeUpload()
      })

      expect(result.current.progress.state).toBe('uploading')
    })
  })

  // ==================== 리소스 정리 ====================

  describe('리소스 정리', () => {
    it('reset 호출 시 모든 상태가 초기화됨', async () => {
      const mapping = createMockMapping({
        files: createMultipleFiles(3),
        fileCount: 3,
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      // reset 실행
      act(() => {
        result.current.reset()
      })

      // 초기 상태 확인
      expect(result.current.progress.state).toBe('idle')
      expect(result.current.progress.totalFiles).toBe(0)
      expect(result.current.progress.completedFiles).toBe(0)
      expect(result.current.progress.files).toHaveLength(0)
      expect(result.current.progress.folders).toHaveLength(0)
    })

    it('취소 후 reset이 가능함', async () => {
      const mapping = createMockMapping()

      const { result } = renderHook(() => useBatchUpload())

      act(() => {
        result.current.startUpload([mapping])
      })

      act(() => {
        result.current.cancelUpload()
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.progress.state).toBe('idle')
    })
  })

  // ==================== 에지 케이스 ====================

  describe('에지 케이스', () => {
    it('빈 매핑 배열로 시작해도 에러가 발생하지 않음', async () => {
      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([])
      })

      expect(result.current.progress.state).toBe('completed')
      expect(result.current.progress.totalFiles).toBe(0)
    })

    it('파일이 없는 폴더는 건너뜀', async () => {
      const mapping = createMockMapping({
        files: [],
        fileCount: 0,
      })

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload([mapping])
      })

      expect(result.current.progress.state).toBe('completed')
      expect(result.current.progress.totalFiles).toBe(0)
    })

    it('동일한 고객에게 여러 폴더가 매핑되어도 정상 처리됨', async () => {
      const mappings: FolderMapping[] = [
        createMockMapping({
          folderName: '홍길동_문서1',
          customerId: 'customer-1',
          files: [createMockFile('doc1.pdf')],
        }),
        createMockMapping({
          folderName: '홍길동_문서2',
          customerId: 'customer-1',
          files: [createMockFile('doc2.pdf')],
        }),
      ]

      const { result } = renderHook(() => useBatchUpload())

      await act(async () => {
        await result.current.startUpload(mappings)
      })

      await waitFor(() => {
        expect(result.current.progress.state).toBe('completed')
      })

      // 같은 고객에 대한 해시 캐시는 한 번만 로드됨
      expect(mockGetCustomerFileHashes).toHaveBeenCalledTimes(1)
      expect(result.current.progress.completedFiles).toBe(2)
    })
  })
})

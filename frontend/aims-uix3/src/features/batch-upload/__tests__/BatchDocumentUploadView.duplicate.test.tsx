/**
 * BatchDocumentUploadView - Duplicate Dialog Integration Tests
 * @since 2025-12-07
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BatchDocumentUploadView from '../BatchDocumentUploadView'
import * as useBatchUploadModule from '../hooks/useBatchUpload'
import type { BatchUploadProgress, DuplicateState } from '../hooks/useBatchUpload'
import type { DuplicateFileInfo } from '../types'

// Mock useBatchUpload hook
vi.mock('../hooks/useBatchUpload', async () => {
  const actual = await vi.importActual('../hooks/useBatchUpload')
  return {
    ...actual,
    useBatchUpload: vi.fn(),
  }
})

// Mock BatchUploadApi
vi.mock('../api/batchUploadApi', () => ({
  BatchUploadApi: {
    getCustomersForMatching: vi.fn(() =>
      Promise.resolve({
        success: true,
        customers: [],
      })
    ),
    uploadFile: vi.fn(),
  },
}))

const mockUseBatchUpload = vi.mocked(useBatchUploadModule.useBatchUpload)

describe('BatchDocumentUploadView - Duplicate Dialog Integration', () => {
  const mockHandleDuplicateAction = vi.fn()
  const mockCancelUpload = vi.fn()
  const mockReset = vi.fn()

  const createMockDuplicateInfo = (
    overrides: Partial<DuplicateFileInfo> = {}
  ): DuplicateFileInfo => ({
    file: new File(['content'], 'test.pdf'),
    fileId: 'file-1',
    folderName: '홍길동',
    customerId: 'customer-1',
    customerName: '홍길동',
    newFileHash: 'new-hash',
    newFileSize: 1024,
    existingDocumentId: 'doc-1',
    existingFileName: 'test.pdf',
    existingFileSize: 2048,
    existingUploadedAt: '2025-12-01',
    ...overrides,
  })

  const createMockDuplicateState = (
    overrides: Partial<DuplicateState> = {}
  ): DuplicateState => ({
    isChecking: false,
    currentDuplicate: null,
    pendingDuplicates: [],
    resolvedCount: 0,
    totalDuplicates: 0,
    applyToAllAction: null,
    ...overrides,
  })

  const createMockProgress = (
    overrides: Partial<BatchUploadProgress> = {}
  ): BatchUploadProgress => ({
    state: 'idle',
    totalFolders: 0,
    completedFolders: 0,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    overallProgress: 0,
    folders: [],
    files: [],
    duplicateState: createMockDuplicateState(),
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementation
    mockUseBatchUpload.mockReturnValue({
      progress: createMockProgress(),
      startUpload: vi.fn(),
      pauseUpload: vi.fn(),
      resumeUpload: vi.fn(),
      cancelUpload: mockCancelUpload,
      retryFailed: vi.fn(),
      reset: mockReset,
      handleDuplicateAction: mockHandleDuplicateAction,
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('다이얼로그 표시', () => {
    it('currentDuplicate가 null이면 다이얼로그가 표시되지 않음', () => {
      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.queryByText('중복 파일 발견')).not.toBeInTheDocument()
    })

    it('currentDuplicate가 있으면 다이얼로그가 표시됨', () => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo(),
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })

      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('중복 파일 발견')).toBeInTheDocument()
      // 고객명이 여러 곳에 표시될 수 있으므로 getAllByText 사용
      expect(screen.getAllByText('홍길동').length).toBeGreaterThan(0)
      expect(screen.getByText(/고객에게 동일한 이름의 파일이 이미 존재합니다/)).toBeInTheDocument()
    })

    it('파일 정보가 올바르게 표시됨', () => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo({
              existingFileName: 'document.pdf',
              newFileSize: 1024 * 1024, // 1MB
              existingFileSize: 2 * 1024 * 1024, // 2MB
              existingUploadedAt: '2025-12-01',
            }),
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })

      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // 파일명 표시
      expect(screen.getAllByText('document.pdf').length).toBeGreaterThan(0)
      // 파일 크기 표시
      expect(screen.getByText('1.0 MB')).toBeInTheDocument()
      expect(screen.getByText(/2.0 MB.*2025-12-01/)).toBeInTheDocument()
    })
  })

  describe('버튼 동작', () => {
    beforeEach(() => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo(),
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })
    })

    it('건너뛰기 버튼 클릭 시 handleDuplicateAction 호출', () => {
      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText('건너뛰기'))

      expect(mockHandleDuplicateAction).toHaveBeenCalledWith('skip', false)
    })

    it('덮어쓰기 버튼 클릭 시 handleDuplicateAction 호출', () => {
      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText('덮어쓰기'))

      expect(mockHandleDuplicateAction).toHaveBeenCalledWith('overwrite', false)
    })

    it('둘 다 유지 버튼 클릭 시 handleDuplicateAction 호출', () => {
      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText('둘 다 유지'))

      expect(mockHandleDuplicateAction).toHaveBeenCalledWith('keep_both', false)
    })

    it('취소 버튼 클릭 시 cancelUpload 호출', () => {
      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      fireEvent.click(screen.getByText('취소'))

      expect(mockCancelUpload).toHaveBeenCalled()
    })
  })

  describe('일괄 적용 체크박스', () => {
    it('남은 중복 파일이 있으면 체크박스 표시', () => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo(),
            totalDuplicates: 5,
            resolvedCount: 1,
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })

      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // 남은 개수 = totalDuplicates(5) - resolvedCount(1) - 1(현재) = 3
      expect(screen.getByText(/나머지 3개 중복 파일에도 동일하게 적용/)).toBeInTheDocument()
    })

    it('체크박스 선택 후 액션 클릭 시 applyToAll=true로 호출', () => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo(),
            totalDuplicates: 3,
            resolvedCount: 0,
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })

      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // 체크박스 클릭
      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)

      // 건너뛰기 클릭
      fireEvent.click(screen.getByText('건너뛰기'))

      expect(mockHandleDuplicateAction).toHaveBeenCalledWith('skip', true)
    })

    it('남은 중복 파일이 0개면 체크박스 미표시', () => {
      mockUseBatchUpload.mockReturnValue({
        progress: createMockProgress({
          state: 'paused',
          duplicateState: createMockDuplicateState({
            currentDuplicate: createMockDuplicateInfo(),
            totalDuplicates: 1, // 마지막 중복 파일
            resolvedCount: 0,
          }),
        }),
        startUpload: vi.fn(),
        pauseUpload: vi.fn(),
        resumeUpload: vi.fn(),
        cancelUpload: mockCancelUpload,
        retryFailed: vi.fn(),
        reset: mockReset,
        handleDuplicateAction: mockHandleDuplicateAction,
      })

      render(
        <BatchDocumentUploadView
          visible={true}
          onClose={vi.fn()}
        />
      )

      // 체크박스가 없어야 함
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    })
  })
})

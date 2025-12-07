/**
 * BatchUploadComponents.test.tsx
 * @since 2025-12-07
 * @version 1.0.0
 *
 * 배치 업로드 UI 컴포넌트 테스트
 * - StorageQuotaBar: 스토리지 사용량 표시
 * - UploadProgress: 업로드 진행률 표시
 * - UploadSummary: 업로드 완료 요약
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StorageQuotaBar from '../StorageQuotaBar'
import UploadProgress from '../UploadProgress'
import UploadSummary from '../UploadSummary'
import type { BatchUploadProgress, FolderUploadState } from '../../hooks/useBatchUpload'

// SFSymbol 모킹
vi.mock('../../../../components/SFSymbol', () => ({
  SFSymbol: ({ name }: { name: string }) => <span data-testid={`sf-symbol-${name}`} />,
  SFSymbolSize: { FOOTNOTE: 'footnote', BODY: 'body', CAPTION2: 'caption2', TITLE1: 'title1' },
  SFSymbolWeight: { MEDIUM: 'medium' },
}))

// formatFileSize 모킹
vi.mock('../../utils/fileValidation', () => ({
  formatFileSize: (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  },
}))

// ==================== Mock Data ====================

const createMockFolder = (overrides: Partial<FolderUploadState> = {}): FolderUploadState => ({
  folderName: '홍길동',
  customerId: 'cust-001',
  customerName: '홍길동',
  totalFiles: 5,
  completedFiles: 3,
  failedFiles: 0,
  status: 'uploading',
  ...overrides,
})

const createMockProgress = (overrides: Partial<BatchUploadProgress> = {}): BatchUploadProgress => ({
  state: 'uploading',
  totalFolders: 2,
  completedFolders: 0,
  totalFiles: 10,
  completedFiles: 5,
  failedFiles: 0,
  skippedFiles: 0,
  overallProgress: 50,
  folders: [createMockFolder()],
  files: [],
  duplicateState: {
    isChecking: false,
    currentDuplicate: null,
    pendingDuplicates: [],
    resolvedCount: 0,
    totalDuplicates: 0,
    applyToAllAction: null,
  },
  ...overrides,
})

// ==================== StorageQuotaBar Tests ====================

describe('StorageQuotaBar', () => {
  describe('기본 렌더링', () => {
    it('사용량과 최대 용량이 표시됨', () => {
      render(
        <StorageQuotaBar
          usedBytes={500 * 1024 * 1024} // 500MB
          maxBytes={1024 * 1024 * 1024} // 1GB
        />
      )

      expect(screen.getByText('500.0 MB')).toBeInTheDocument()
      expect(screen.getByText('1.0 GB')).toBeInTheDocument()
    })

    it('스토리지 라벨이 표시됨', () => {
      render(<StorageQuotaBar usedBytes={0} maxBytes={1024 * 1024 * 1024} />)

      expect(screen.getByText('스토리지')).toBeInTheDocument()
    })

    it('tierName이 있으면 표시됨', () => {
      render(
        <StorageQuotaBar usedBytes={0} maxBytes={1024 * 1024 * 1024} tierName="프리미엄" />
      )

      expect(screen.getByText('프리미엄')).toBeInTheDocument()
    })
  })

  describe('경고 레벨', () => {
    it('80% 미만일 때 normal 상태', () => {
      const { container } = render(
        <StorageQuotaBar
          usedBytes={700 * 1024 * 1024} // 700MB (70%)
          maxBytes={1024 * 1024 * 1024}
        />
      )

      expect(container.querySelector('.storage-quota-bar.normal')).toBeInTheDocument()
    })

    it('80% 이상일 때 warning 상태 및 메시지 표시', () => {
      const { container } = render(
        <StorageQuotaBar
          usedBytes={850 * 1024 * 1024} // 850MB (83%)
          maxBytes={1024 * 1024 * 1024}
        />
      )

      expect(container.querySelector('.storage-quota-bar.warning')).toBeInTheDocument()
      expect(screen.getByText('용량 부족 주의')).toBeInTheDocument()
    })

    it('95% 이상일 때 danger 상태 및 메시지 표시', () => {
      const { container } = render(
        <StorageQuotaBar
          usedBytes={980 * 1024 * 1024} // 980MB (96%)
          maxBytes={1024 * 1024 * 1024}
        />
      )

      expect(container.querySelector('.storage-quota-bar.danger')).toBeInTheDocument()
      expect(screen.getByText('용량 초과 위험')).toBeInTheDocument()
    })
  })

  describe('pending 용량', () => {
    it('pendingBytes가 있을 때 업로드 예정 메시지 표시', () => {
      render(
        <StorageQuotaBar
          usedBytes={500 * 1024 * 1024}
          maxBytes={1024 * 1024 * 1024}
          pendingBytes={100 * 1024 * 1024} // 100MB
        />
      )

      expect(screen.getByText('+100.0 MB 업로드 예정')).toBeInTheDocument()
    })

    it('pendingBytes가 없을 때 남은 용량 표시', () => {
      render(
        <StorageQuotaBar
          usedBytes={500 * 1024 * 1024}
          maxBytes={1024 * 1024 * 1024}
        />
      )

      // 남은 용량: 1024 - 500 = 524 MB
      expect(screen.getByText(/524\.0 MB/)).toBeInTheDocument()
      expect(screen.getByText(/남음/)).toBeInTheDocument()
    })
  })
})

// ==================== UploadProgress Tests ====================

describe('UploadProgress', () => {
  describe('기본 렌더링', () => {
    it('업로드 중 상태가 표시됨', () => {
      render(<UploadProgress progress={createMockProgress()} />)

      expect(screen.getByText('업로드 중...')).toBeInTheDocument()
    })

    it('진행률이 표시됨', () => {
      render(<UploadProgress progress={createMockProgress({ overallProgress: 75 })} />)

      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('완료/전체 파일 수가 표시됨', () => {
      render(
        <UploadProgress
          progress={createMockProgress({ completedFiles: 7, totalFiles: 10 })}
        />
      )

      expect(screen.getByText('7/10')).toBeInTheDocument()
    })
  })

  describe('상태별 표시', () => {
    it('완료 상태 표시', () => {
      render(<UploadProgress progress={createMockProgress({ state: 'completed' })} />)

      expect(screen.getByText('업로드 완료')).toBeInTheDocument()
    })

    it('일시정지 상태 표시', () => {
      render(<UploadProgress progress={createMockProgress({ state: 'paused' })} />)

      expect(screen.getByText('일시 정지')).toBeInTheDocument()
    })

    it('취소 상태 표시', () => {
      render(<UploadProgress progress={createMockProgress({ state: 'cancelled' })} />)

      expect(screen.getByText('업로드 취소됨')).toBeInTheDocument()
    })

    it('대기 상태 표시', () => {
      render(<UploadProgress progress={createMockProgress({ state: 'idle' })} />)

      expect(screen.getByText('대기 중')).toBeInTheDocument()
    })
  })

  describe('실패 표시', () => {
    it('실패한 파일 수가 표시됨', () => {
      render(<UploadProgress progress={createMockProgress({ failedFiles: 3 })} />)

      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('실패')).toBeInTheDocument()
    })

    it('실패가 0이면 실패 통계가 표시되지 않음', () => {
      render(<UploadProgress progress={createMockProgress({ failedFiles: 0 })} />)

      expect(screen.queryByText('실패')).not.toBeInTheDocument()
    })
  })

  describe('현재 파일', () => {
    it('업로드 중일 때 현재 파일명이 표시됨', () => {
      render(
        <UploadProgress
          progress={createMockProgress({ currentFile: 'document.pdf', state: 'uploading' })}
        />
      )

      expect(screen.getByText('document.pdf')).toBeInTheDocument()
      expect(screen.getByText('현재 파일:')).toBeInTheDocument()
    })
  })

  describe('컨트롤 버튼', () => {
    it('업로드 중일 때 일시정지 버튼이 표시됨', () => {
      const onPause = vi.fn()
      render(
        <UploadProgress
          progress={createMockProgress({ state: 'uploading' })}
          onPause={onPause}
        />
      )

      const pauseBtn = screen.getByTitle('일시 정지')
      expect(pauseBtn).toBeInTheDocument()

      fireEvent.click(pauseBtn)
      expect(onPause).toHaveBeenCalled()
    })

    it('일시정지 중일 때 재개 버튼이 표시됨', () => {
      const onResume = vi.fn()
      render(
        <UploadProgress
          progress={createMockProgress({ state: 'paused' })}
          onResume={onResume}
        />
      )

      const resumeBtn = screen.getByTitle('재개')
      expect(resumeBtn).toBeInTheDocument()

      fireEvent.click(resumeBtn)
      expect(onResume).toHaveBeenCalled()
    })

    it('취소 버튼 클릭 시 onCancel 호출', () => {
      const onCancel = vi.fn()
      render(
        <UploadProgress
          progress={createMockProgress({ state: 'uploading' })}
          onCancel={onCancel}
        />
      )

      const cancelBtn = screen.getByTitle('취소')
      fireEvent.click(cancelBtn)
      expect(onCancel).toHaveBeenCalled()
    })
  })

  describe('폴더 목록', () => {
    it('폴더 정보가 표시됨', () => {
      render(
        <UploadProgress
          progress={createMockProgress({
            folders: [
              createMockFolder({ folderName: '홍길동', customerName: '홍길동' }),
              createMockFolder({ folderName: '김영희', customerName: '김영희' }),
            ],
          })}
        />
      )

      expect(screen.getByText('홍길동')).toBeInTheDocument()
      expect(screen.getByText('김영희')).toBeInTheDocument()
    })
  })
})

// ==================== UploadSummary Tests ====================

describe('UploadSummary', () => {
  const mockOnClose = vi.fn()
  const mockOnRetryFailed = vi.fn()
  const mockOnViewDocuments = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('성공 상태', () => {
    it('전체 성공 시 완료 메시지 표시', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            completedFiles: 10,
            totalFiles: 10,
            failedFiles: 0,
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('업로드 완료!')).toBeInTheDocument()
    })

    it('통계가 표시됨', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            completedFiles: 10,
            totalFiles: 10,
            failedFiles: 0,
            folders: [createMockFolder(), createMockFolder()],
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('2개')).toBeInTheDocument() // 폴더 수
      expect(screen.getByText('10개')).toBeInTheDocument() // 성공 수
    })
  })

  describe('부분 성공 상태', () => {
    it('일부 실패 시 경고 메시지 표시', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            completedFiles: 7,
            totalFiles: 10,
            failedFiles: 3,
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('일부 파일 업로드 실패')).toBeInTheDocument()
      expect(screen.getByText('7개 성공, 3개 실패')).toBeInTheDocument()
    })

    it('실패 통계가 표시됨', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            completedFiles: 7,
            failedFiles: 3,
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('3개')).toBeInTheDocument()
    })
  })

  describe('전체 실패 상태', () => {
    it('전체 실패 시 에러 메시지 표시', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            completedFiles: 0,
            totalFiles: 10,
            failedFiles: 10,
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('업로드 실패')).toBeInTheDocument()
      expect(screen.getByText('모든 파일 업로드에 실패했습니다.')).toBeInTheDocument()
    })
  })

  describe('취소 상태', () => {
    it('취소 시 취소 메시지 표시', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'cancelled',
            completedFiles: 5,
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('업로드가 취소되었습니다')).toBeInTheDocument()
    })
  })

  describe('버튼 동작', () => {
    it('확인 버튼 클릭 시 onClose 호출', () => {
      render(
        <UploadSummary
          progress={createMockProgress({ state: 'completed' })}
          onClose={mockOnClose}
        />
      )

      fireEvent.click(screen.getByText('확인'))
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('실패가 있을 때 재시도 버튼 표시', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            failedFiles: 3,
          })}
          onClose={mockOnClose}
          onRetryFailed={mockOnRetryFailed}
        />
      )

      expect(screen.getByText('실패 항목 재시도')).toBeInTheDocument()

      fireEvent.click(screen.getByText('실패 항목 재시도'))
      expect(mockOnRetryFailed).toHaveBeenCalled()
    })

    it('처리 상태 보기 버튼 클릭 시 onViewDocuments 호출', () => {
      render(
        <UploadSummary
          progress={createMockProgress({ state: 'completed' })}
          onClose={mockOnClose}
          onViewDocuments={mockOnViewDocuments}
        />
      )

      fireEvent.click(screen.getByText('처리 상태 보기'))
      expect(mockOnViewDocuments).toHaveBeenCalled()
    })
  })

  describe('실패 목록', () => {
    it('실패/부분 실패 폴더 목록이 표시됨', () => {
      render(
        <UploadSummary
          progress={createMockProgress({
            state: 'completed',
            failedFiles: 3,
            folders: [
              createMockFolder({ folderName: '성공폴더', status: 'completed', failedFiles: 0 }),
              createMockFolder({ folderName: '실패폴더', status: 'failed', failedFiles: 5 }),
              createMockFolder({ folderName: '부분실패', status: 'partial', failedFiles: 2 }),
            ],
          })}
          onClose={mockOnClose}
        />
      )

      expect(screen.getByText('실패한 항목')).toBeInTheDocument()
      expect(screen.getByText('실패폴더')).toBeInTheDocument()
      expect(screen.getByText('부분실패')).toBeInTheDocument()
      // 성공폴더는 표시되지 않음
      expect(screen.queryAllByText('성공폴더')).toHaveLength(0)
    })
  })
})

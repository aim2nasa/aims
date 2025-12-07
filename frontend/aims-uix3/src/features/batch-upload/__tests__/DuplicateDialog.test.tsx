/**
 * DuplicateDialog 컴포넌트 테스트
 * @since 2025-12-05
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DuplicateDialog, { type DuplicateFile } from '../components/DuplicateDialog'

/**
 * 테스트용 중복 파일 정보 생성
 */
function createMockDuplicateFile(overrides: Partial<DuplicateFile> = {}): DuplicateFile {
  return {
    fileName: 'document.pdf',
    folderName: '홍길동',
    customerName: '홍길동',
    newFileSize: 1024 * 1024, // 1MB
    existingFileSize: 512 * 1024, // 512KB
    existingFileDate: '2025.12.01',
    ...overrides,
  }
}

describe('DuplicateDialog', () => {
  const mockOnAction = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('렌더링', () => {
    test('제목이 표시된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('중복 파일 발견')).toBeInTheDocument()
    })

    test('고객명이 표시된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile({ customerName: '김철수' })}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('김철수')).toBeInTheDocument()
    })

    test('파일명이 표시된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile({ fileName: 'report.pdf' })}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      // 파일명이 두 번 표시됨 (업로드할 파일, 기존 파일)
      const fileNames = screen.getAllByText('report.pdf')
      expect(fileNames.length).toBeGreaterThanOrEqual(1)
    })

    test('파일 크기가 포맷되어 표시된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile({
            newFileSize: 1024 * 1024, // 1MB
          })}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('1.0 MB')).toBeInTheDocument()
    })
  })

  describe('버튼 동작', () => {
    test('취소 버튼 클릭 시 onCancel 호출', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      fireEvent.click(screen.getByText('취소'))
      expect(mockOnCancel).toHaveBeenCalledTimes(1)
    })

    test('건너뛰기 버튼 클릭 시 skip 액션 전달', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      fireEvent.click(screen.getByText('건너뛰기'))
      expect(mockOnAction).toHaveBeenCalledWith('skip', false)
    })

    test('둘 다 유지 버튼 클릭 시 keep_both 액션 전달', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      fireEvent.click(screen.getByText('둘 다 유지'))
      expect(mockOnAction).toHaveBeenCalledWith('keep_both', false)
    })

    test('덮어쓰기 버튼 클릭 시 overwrite 액션 전달', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
        />
      )

      fireEvent.click(screen.getByText('덮어쓰기'))
      expect(mockOnAction).toHaveBeenCalledWith('overwrite', false)
    })
  })

  describe('일괄 적용', () => {
    test('체크박스가 항상 표시된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
          remainingCount={0}
        />
      )

      expect(screen.getByRole('checkbox')).toBeInTheDocument()
      expect(screen.getByText(/다음 중복 파일도 같은 방식으로 처리/)).toBeInTheDocument()
    })

    test('체크박스 선택 후 버튼 클릭 시 applyToAll이 true로 전달된다', () => {
      render(
        <DuplicateDialog
          file={createMockDuplicateFile()}
          onAction={mockOnAction}
          onCancel={mockOnCancel}
          remainingCount={3}
        />
      )

      // 체크박스 클릭
      fireEvent.click(screen.getByRole('checkbox'))

      // 덮어쓰기 클릭
      fireEvent.click(screen.getByText('덮어쓰기'))
      expect(mockOnAction).toHaveBeenCalledWith('overwrite', true)
    })
  })
})

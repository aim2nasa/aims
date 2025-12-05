/**
 * FolderDropZone 컴포넌트 테스트
 * @since 2025-12-05
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FolderDropZone from '../components/FolderDropZone'

describe('FolderDropZone', () => {
  describe('렌더링', () => {
    test('드롭존 영역이 렌더링된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
      expect(screen.getByText(/폴더를 선택하거나 드래그하세요/)).toBeInTheDocument()
    })

    test('안내 문구가 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText(/폴더명이 고객명과 일치하면 자동으로 연결됩니다/)).toBeInTheDocument()
    })

    test('힌트 문구가 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText(/홍길동\/ 폴더 → 홍길동 고객에게 문서 등록/)).toBeInTheDocument()
    })
  })

  describe('disabled 상태', () => {
    test('disabled일 때 클릭이 무시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = screen.getByRole('button')
      expect(dropZone).toHaveAttribute('aria-disabled', 'true')
      expect(dropZone).toHaveClass('disabled')
    })
  })

  describe('드래그앤드롭', () => {
    test('드래그 오버 시 스타일이 변경된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = screen.getByRole('button')

      fireEvent.dragOver(dropZone)
      expect(dropZone).toHaveClass('drag-over')

      fireEvent.dragLeave(dropZone)
      expect(dropZone).not.toHaveClass('drag-over')
    })

    test('드래그 오버 시 텍스트가 변경된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = screen.getByRole('button')

      fireEvent.dragOver(dropZone)
      expect(screen.getByText('여기에 놓으세요')).toBeInTheDocument()
    })
  })

  describe('키보드 접근성', () => {
    test('탭으로 포커스 가능하다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = screen.getByRole('button')
      expect(dropZone).toHaveAttribute('tabindex', '0')
    })

    test('aria-label이 설정되어 있다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = screen.getByRole('button')
      expect(dropZone).toHaveAttribute('aria-label', '폴더를 선택하거나 드래그하세요')
    })

    test('disabled일 때 tabindex가 -1이다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = screen.getByRole('button')
      expect(dropZone).toHaveAttribute('tabindex', '-1')
    })
  })

  describe('파일 입력', () => {
    test('숨겨진 파일 입력이 존재한다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const fileInput = container.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveClass('folder-input')
    })

    test('파일 입력에 webkitdirectory 속성이 있다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const fileInput = container.querySelector('input[type="file"]')
      expect(fileInput).toHaveAttribute('webkitdirectory')
    })
  })
})

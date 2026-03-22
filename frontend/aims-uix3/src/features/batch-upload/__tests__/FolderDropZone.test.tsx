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
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toBeInTheDocument()
      expect(screen.getByText(/지금 바로 폴더를 끌어다 놓으세요/)).toBeInTheDocument()
    })

    test('안내 문구가 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText(/또는 클릭하여 폴더 선택/)).toBeInTheDocument()
    })

    test('가이드 문구가 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText('이렇게 폴더를 준비하세요')).toBeInTheDocument()
      expect(screen.getByText('폴더명 = 고객명이면 자동 매칭')).toBeInTheDocument()
    })
  })

  describe('disabled 상태', () => {
    test('disabled일 때 스타일이 변경된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toHaveAttribute('aria-disabled', 'true')
      expect(dropZone).toHaveClass('disabled')
    })
  })

  describe('드래그앤드롭', () => {
    test('드래그 오버 시 스타일이 변경된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = container.querySelector('.folder-drop-zone')

      fireEvent.dragOver(dropZone!)
      expect(dropZone).toHaveClass('drag-over')

      fireEvent.dragLeave(dropZone!)
      expect(dropZone).not.toHaveClass('drag-over')
    })

    test('드래그 오버 시 텍스트가 변경된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = container.querySelector('.folder-drop-zone')

      fireEvent.dragOver(dropZone!)
      expect(screen.getByText('여기에 놓으세요')).toBeInTheDocument()
    })
  })

  describe('접근성', () => {
    test('aria-label이 설정되어 있다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toHaveAttribute('aria-label', '폴더를 드래그하세요')
    })

    test('disabled 상태가 aria-disabled로 표시된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('가이드 콘텐츠', () => {
    test('폴더 구조 가이드가 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText('홍길동')).toBeInTheDocument()
      expect(screen.getByText('김영희')).toBeInTheDocument()
    })

    test('가이드 팁이 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText('상위 폴더 또는 고객 폴더 직접 선택 가능')).toBeInTheDocument()
      expect(screen.getByText('하위 폴더의 파일도 모두 등록')).toBeInTheDocument()
    })
  })
})

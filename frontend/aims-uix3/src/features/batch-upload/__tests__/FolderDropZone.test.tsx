/**
 * FolderDropZone 컴포넌트 테스트
 * @since 2025-12-05
 * @updated 2026-03-22 v2.0 개편에 맞춰 테스트 갱신
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

    test('접히는 가이드 토글이 표시된다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      expect(screen.getByText('폴더 준비 방법')).toBeInTheDocument()
    })
  })

  describe('disabled 상태', () => {
    test('disabled일 때 스타일이 변경된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toHaveAttribute('aria-label', '폴더 드롭존 (비활성)')
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

    test('disabled 상태가 aria-label에 반영된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} disabled />)

      const dropZone = container.querySelector('.folder-drop-zone')
      expect(dropZone).toHaveAttribute('aria-label', '폴더 드롭존 (비활성)')
    })
  })

  describe('처리 중 표시', () => {
    test('onFilesSelected 진행 중 스피너와 "폴더 분석 중..." 텍스트가 표시된다', async () => {
      let resolveCallback: () => void
      const onFilesSelected = vi.fn(() => new Promise<void>((resolve) => {
        resolveCallback = resolve
      }))

      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      // input으로 파일 선택 시뮬레이션
      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      Object.defineProperty(input, 'files', { value: [file], writable: false })

      await act(async () => {
        fireEvent.change(input)
        // microtask flush — setIsProcessing(true) 반영 대기
        await new Promise(r => setTimeout(r, 0))
      })

      // 처리 중 UI 확인
      expect(screen.getByText('폴더 분석 중...')).toBeInTheDocument()
      expect(container.querySelector('.folder-processing-spinner')).toBeInTheDocument()
      expect(screen.queryByText(/지금 바로 폴더를 끌어다 놓으세요/)).not.toBeInTheDocument()

      // 처리 완료
      await act(async () => {
        resolveCallback!()
      })

      // 원래 UI 복원
      expect(screen.getByText(/지금 바로 폴더를 끌어다 놓으세요/)).toBeInTheDocument()
      expect(screen.queryByText('폴더 분석 중...')).not.toBeInTheDocument()
    })

    test('처리 중 file input이 비활성화된다', async () => {
      let resolveCallback: () => void
      const onFilesSelected = vi.fn(() => new Promise<void>((resolve) => {
        resolveCallback = resolve
      }))

      const { container } = render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      expect(input.disabled).toBe(false)

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      Object.defineProperty(input, 'files', { value: [file], writable: false })

      await act(async () => {
        fireEvent.change(input)
        await new Promise(r => setTimeout(r, 0))
      })

      expect(input.disabled).toBe(true)

      await act(async () => {
        resolveCallback!()
      })

      expect(input.disabled).toBe(false)
    })
  })

  describe('가이드 토글', () => {
    test('기본 상태에서 가이드 내용이 숨겨져 있다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      // 가이드 토글 버튼은 보이지만, 상세 내용은 숨김
      expect(screen.getByText('폴더 준비 방법')).toBeInTheDocument()
      expect(screen.queryByText('홍길동')).not.toBeInTheDocument()
    })

    test('토글 클릭 시 가이드 내용이 펼쳐진다', () => {
      const onFilesSelected = vi.fn()
      render(<FolderDropZone onFilesSelected={onFilesSelected} />)

      const toggleButton = screen.getByRole('button', { name: '사용법 펼치기' })
      fireEvent.click(toggleButton)

      expect(screen.getByText('홍길동')).toBeInTheDocument()
      expect(screen.getByText(/이름이 같은 고객에게 알아서 연결돼요/)).toBeInTheDocument()
    })
  })
})

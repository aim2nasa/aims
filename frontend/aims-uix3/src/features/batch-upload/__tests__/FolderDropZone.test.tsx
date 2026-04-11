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

  describe('처리 중 표시 (controlled analyzeProgress)', () => {
    test('analyzeProgress가 reading이면 "파일 목록 읽는 중..." 텍스트와 카운트가 표시된다', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          analyzeProgress={{ stage: 'reading', current: 42, total: null }}
        />
      )

      expect(screen.getByText('파일 목록 읽는 중...')).toBeInTheDocument()
      expect(screen.getByText('42개')).toBeInTheDocument()
      expect(container.querySelector('.folder-processing-spinner')).toBeInTheDocument()
      expect(screen.queryByText(/지금 바로 폴더를 끌어다 놓으세요/)).not.toBeInTheDocument()
    })

    test('analyzeProgress가 validating이면 "파일 검증 중... current / total" 형식', () => {
      const onFilesSelected = vi.fn()
      render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          analyzeProgress={{ stage: 'validating', current: 100, total: 500 }}
        />
      )

      expect(screen.getByText('파일 검증 중...')).toBeInTheDocument()
      expect(screen.getByText('100 / 500')).toBeInTheDocument()
    })

    test('analyzeProgress가 matching이면 "고객 매칭 중... N / M 폴더"', () => {
      const onFilesSelected = vi.fn()
      render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          analyzeProgress={{ stage: 'matching', current: 3, total: 8 }}
        />
      )

      expect(screen.getByText('고객 매칭 중...')).toBeInTheDocument()
      expect(screen.getByText('3 / 8 폴더')).toBeInTheDocument()
    })

    test('analyzeProgress가 checking-storage이면 "용량 확인 중..."', () => {
      const onFilesSelected = vi.fn()
      render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          analyzeProgress={{ stage: 'checking-storage', current: 0, total: null }}
        />
      )

      expect(screen.getByText('용량 확인 중...')).toBeInTheDocument()
    })

    test('analyzeProgress가 null이면 기본 드롭존 UI 복귀', () => {
      const onFilesSelected = vi.fn()
      const { container } = render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          analyzeProgress={null}
        />
      )

      expect(screen.getByText(/지금 바로 폴더를 끌어다 놓으세요/)).toBeInTheDocument()
      expect(container.querySelector('.folder-processing-spinner')).not.toBeInTheDocument()
    })

    test('onAnalyzeProgress 콜백이 reading 단계에서 호출된다 (webkitdirectory 경로)', async () => {
      const onFilesSelected = vi.fn().mockResolvedValue(undefined)
      const onAnalyzeProgress = vi.fn()

      const { container } = render(
        <FolderDropZone
          onFilesSelected={onFilesSelected}
          onAnalyzeProgress={onAnalyzeProgress}
        />
      )

      const input = container.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      Object.defineProperty(input, 'files', { value: [file], writable: false })

      await act(async () => {
        fireEvent.change(input)
        await new Promise(r => setTimeout(r, 0))
      })

      // reading 단계 보고 확인
      expect(onAnalyzeProgress).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'reading', current: 1 })
      )
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

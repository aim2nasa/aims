/**
 * RenameModal 컴포넌트 테스트
 * InlineRenameInput → RenameModal 전환 regression 테스트
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RenameModal } from '../RenameModal'

describe('RenameModal', () => {
  const defaultProps = {
    visible: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    editField: 'displayName' as const,
    originalName: 'document.pdf',
    displayName: 'alias-name.pdf',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('기본 렌더링', () => {
    it('visible이 true일 때 모달이 렌더링됨', () => {
      render(<RenameModal {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('이름 변경')).toBeInTheDocument()
    })

    it('visible이 false일 때 모달이 렌더링되지 않음', () => {
      render(<RenameModal {...defaultProps} visible={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('input이 현재 편집 대상 파일명으로 초기화됨 (displayName 모드)', () => {
      render(<RenameModal {...defaultProps} />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('alias-name.pdf')
    })

    it('input이 현재 편집 대상 파일명으로 초기화됨 (originalName 모드)', () => {
      render(<RenameModal {...defaultProps} editField="originalName" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('document.pdf')
    })

    it('maxLength가 200으로 설정됨', () => {
      render(<RenameModal {...defaultProps} />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxLength', '200')
    })
  })

  describe('참고 정보 표시', () => {
    it('displayName 편집 시 원본 파일명이 참고 정보로 표시됨', () => {
      render(<RenameModal {...defaultProps} />)
      expect(screen.getByText('원본')).toBeInTheDocument()
      expect(screen.getByText('document.pdf')).toBeInTheDocument()
    })

    it('originalName 편집 시 별칭이 참고 정보로 표시됨', () => {
      render(<RenameModal {...defaultProps} editField="originalName" />)
      expect(screen.getByText('별칭')).toBeInTheDocument()
      expect(screen.getByText('alias-name.pdf')).toBeInTheDocument()
    })

    it('displayName이 없으면 참고 정보가 표시되지 않음', () => {
      render(<RenameModal {...defaultProps} displayName={undefined} />)
      expect(screen.queryByText('원본')).not.toBeInTheDocument()
    })
  })

  describe('Enter 키 동작', () => {
    it('Enter 키로 새 이름 확정', () => {
      const onConfirm = vi.fn()
      render(<RenameModal {...defaultProps} onConfirm={onConfirm} />)

      const input = screen.getByRole('textbox')
      // fireEvent로 직접 값 변경 + Enter 키 입력
      fireEvent.change(input, { target: { value: 'new-name.pdf' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onConfirm).toHaveBeenCalledWith('new-name.pdf')
    })

    it('이름이 변경되지 않으면 onClose 호출 (onConfirm 호출 안함)', () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()
      render(<RenameModal {...defaultProps} onClose={onClose} onConfirm={onConfirm} />)

      const input = screen.getByRole('textbox')
      // 값 변경 없이 Enter
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onClose).toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('공백만 입력하면 onClose 호출', () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()
      render(<RenameModal {...defaultProps} onClose={onClose} onConfirm={onConfirm} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onClose).toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('버튼 동작', () => {
    it('변경 버튼 클릭 시 onConfirm 호출', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RenameModal {...defaultProps} onConfirm={onConfirm} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'renamed-file.pdf' } })
      await user.click(screen.getByText('변경'))

      expect(onConfirm).toHaveBeenCalledWith('renamed-file.pdf')
    })

    it('취소 버튼 클릭 시 onClose 호출', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<RenameModal {...defaultProps} onClose={onClose} />)

      await user.click(screen.getByText('취소'))

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('이름 trim 처리', () => {
    it('앞뒤 공백이 제거된 이름으로 onConfirm 호출', () => {
      const onConfirm = vi.fn()
      render(<RenameModal {...defaultProps} onConfirm={onConfirm} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: '  trimmed.pdf  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onConfirm).toHaveBeenCalledWith('trimmed.pdf')
    })
  })

  describe('displayName 없이 originalName만 있는 경우', () => {
    it('displayName 편집 시 originalName으로 fallback', () => {
      render(
        <RenameModal
          {...defaultProps}
          displayName={undefined}
          editField="displayName"
        />
      )
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('document.pdf')
    })
  })

  describe('레이블 표시', () => {
    it('displayName 편집 시 "별칭" 레이블 표시', () => {
      render(<RenameModal {...defaultProps} editField="displayName" />)
      const labels = screen.getAllByText('별칭')
      expect(labels.length).toBeGreaterThanOrEqual(1)
    })

    it('originalName 편집 시 "원본 파일명" 레이블 표시', () => {
      render(<RenameModal {...defaultProps} editField="originalName" />)
      expect(screen.getByText('원본 파일명')).toBeInTheDocument()
    })
  })
})

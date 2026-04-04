/**
 * InlineRenameInput 컴포넌트 테스트
 * Finder 스타일 인라인 파일명 편집 검증
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineRenameInput } from '../InlineRenameInput'

describe('InlineRenameInput', () => {
  describe('기본 렌더링', () => {
    it('input이 현재 파일명으로 초기화됨', () => {
      render(
        <InlineRenameInput
          currentName="document.pdf"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('document.pdf')
    })

    it('input이 자동 포커스됨', () => {
      render(
        <InlineRenameInput
          currentName="document.pdf"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveFocus()
    })

    it('maxLength가 200으로 설정됨', () => {
      render(
        <InlineRenameInput
          currentName="test.pdf"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxLength', '200')
    })

    it('inline-rename-input 클래스가 적용됨', () => {
      render(
        <InlineRenameInput
          currentName="test.pdf"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('inline-rename-input')
    })
  })

  describe('Enter 키 동작', () => {
    it('Enter 키로 새 이름 확정', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()

      render(
        <InlineRenameInput
          currentName="old.pdf"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'new.pdf')
      await user.keyboard('{Enter}')

      expect(onConfirm).toHaveBeenCalledWith('new.pdf')
    })

    it('이름이 변경되지 않으면 onCancel 호출', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      const onConfirm = vi.fn()

      render(
        <InlineRenameInput
          currentName="same.pdf"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )

      await user.keyboard('{Enter}')

      expect(onCancel).toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('공백만 입력하면 onCancel 호출', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      const onConfirm = vi.fn()

      render(
        <InlineRenameInput
          currentName="test.pdf"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, '   ')
      await user.keyboard('{Enter}')

      expect(onCancel).toHaveBeenCalled()
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('Escape 키 동작', () => {
    it('Escape 키로 취소', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(
        <InlineRenameInput
          currentName="test.pdf"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      )

      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalled()
    })
  })

  describe('Blur 동작', () => {
    it('blur 시 변경된 이름으로 onConfirm 호출', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()

      render(
        <div>
          <InlineRenameInput
            currentName="old.pdf"
            onConfirm={onConfirm}
            onCancel={vi.fn()}
          />
          <button>외부</button>
        </div>
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'new.pdf')
      await user.click(screen.getByText('외부'))

      expect(onConfirm).toHaveBeenCalledWith('new.pdf')
    })
  })

  describe('이벤트 전파 차단', () => {
    it('click 이벤트 전파 차단', async () => {
      const user = userEvent.setup()
      const parentClick = vi.fn()

      render(
        <div onClick={parentClick}>
          <InlineRenameInput
            currentName="test.pdf"
            onConfirm={vi.fn()}
            onCancel={vi.fn()}
          />
        </div>
      )

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(parentClick).not.toHaveBeenCalled()
    })
  })

  describe('이름 trim 처리', () => {
    it('앞뒤 공백이 제거된 이름으로 onConfirm 호출', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()

      render(
        <InlineRenameInput
          currentName="old.pdf"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      )

      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, '  new.pdf  ')
      await user.keyboard('{Enter}')

      expect(onConfirm).toHaveBeenCalledWith('new.pdf')
    })
  })
})

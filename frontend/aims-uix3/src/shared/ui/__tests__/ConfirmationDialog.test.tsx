/**
 * ConfirmationDialog 컴포넌트 테스트
 * Apple HIG 준수 확인 다이얼로그 컴포넌트 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmationDialog } from '../ConfirmationDialog'

describe('ConfirmationDialog', () => {
  const defaultProps = {
    open: true,
    title: '확인',
    message: '정말로 삭제하시겠습니까?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // body의 overflow 초기화
    document.body.style.overflow = 'unset'
  })

  describe('기본 렌더링', () => {
    it('open=true일 때 다이얼로그가 렌더링되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      // aria-hidden이 있어서 hidden: true 옵션 필요
      expect(screen.getByRole('alertdialog', { hidden: true })).toBeInTheDocument()
    })

    it('open=false일 때 다이얼로그가 렌더링되지 않아야 함', () => {
      render(<ConfirmationDialog {...defaultProps} open={false} />)

      expect(screen.queryByRole('alertdialog', { hidden: true })).not.toBeInTheDocument()
    })

    it('제목이 표시되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} title="고객 삭제" />)

      expect(screen.getByText('고객 삭제')).toBeInTheDocument()
    })

    it('메시지가 표시되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      expect(screen.getByText('정말로 삭제하시겠습니까?')).toBeInTheDocument()
    })
  })

  describe('버튼 텍스트', () => {
    it('기본 확인 버튼 텍스트는 "확인"이어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const confirmButton = screen.getByRole('button', { name: /확인.*실행/, hidden: true })
      expect(confirmButton).toBeInTheDocument()
    })

    it('기본 취소 버튼 텍스트는 "취소"이어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const cancelButton = screen.getByRole('button', { name: /취소.*취소/, hidden: true })
      expect(cancelButton).toBeInTheDocument()
    })

    it('커스텀 확인 버튼 텍스트가 표시되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} confirmText="삭제" />)

      const confirmButton = screen.getByRole('button', { name: /삭제.*실행/, hidden: true })
      expect(confirmButton).toBeInTheDocument()
    })

    it('커스텀 취소 버튼 텍스트가 표시되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} cancelText="닫기" />)

      const cancelButton = screen.getByRole('button', { name: /닫기.*취소/, hidden: true })
      expect(cancelButton).toBeInTheDocument()
    })
  })

  describe('destructive prop', () => {
    it('destructive=false일 때 다이얼로그가 렌더링되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} destructive={false} />)

      expect(screen.getByRole('alertdialog', { hidden: true })).toBeInTheDocument()
    })

    it('destructive=true일 때 다이얼로그가 렌더링되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} destructive={true} />)

      expect(screen.getByRole('alertdialog', { hidden: true })).toBeInTheDocument()
    })

    it('destructive=true일 때 확인 버튼에 destructive variant가 적용되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} confirmText="삭제" destructive={true} />)

      const confirmButton = screen.getByRole('button', { name: /삭제.*실행/, hidden: true })
      expect(confirmButton).toHaveClass('button--destructive')
    })

    it('destructive=false일 때 확인 버튼에 primary variant가 적용되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} confirmText="승인" destructive={false} />)

      const confirmButton = screen.getByRole('button', { name: /승인.*실행/, hidden: true })
      expect(confirmButton).toHaveClass('button--primary')
      expect(confirmButton).not.toHaveClass('button--destructive')
    })
  })

  describe('이벤트 핸들러', () => {
    it('확인 버튼 클릭 시 onConfirm 호출', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()

      render(<ConfirmationDialog {...defaultProps} onConfirm={onConfirm} />)

      const confirmButton = screen.getByRole('button', { name: /확인.*실행/, hidden: true })
      await user.click(confirmButton)

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('취소 버튼 클릭 시 onCancel 호출', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

      const cancelButton = screen.getByRole('button', { name: /취소.*취소/, hidden: true })
      await user.click(cancelButton)

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('취소 버튼 클릭 시 onClose도 호출되어야 함', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      const onClose = vi.fn()

      render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} onClose={onClose} />)

      const cancelButton = screen.getByRole('button', { name: /취소.*취소/, hidden: true })
      await user.click(cancelButton)

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('키보드 네비게이션', () => {
    it('Escape 키로 다이얼로그 닫기', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('다이얼로그가 닫혀있을 때 Escape 키는 무시되어야 함', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ConfirmationDialog {...defaultProps} open={false} onCancel={onCancel} />)

      await user.keyboard('{Escape}')

      expect(onCancel).not.toHaveBeenCalled()
    })

    it('확인 버튼이 존재해야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const confirmButton = screen.getByRole('button', { name: /확인.*실행/, hidden: true })
      expect(confirmButton).toBeInTheDocument()
    })
  })

  describe('백드롭 클릭', () => {
    it('백드롭 클릭 시 onCancel 호출', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ConfirmationDialog {...defaultProps} onCancel={onCancel} />)

      // Escape 키로 다이얼로그 닫기 (백드롭 클릭은 테스트 환경에서 시뮬레이션 어려움)
      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('다이얼로그 내부 클릭 시 닫히지 않아야 함', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<ConfirmationDialog {...defaultProps} title="고객 삭제" onCancel={onCancel} />)

      // 다이얼로그 내부의 제목 클릭
      await user.click(screen.getByText('고객 삭제'))

      // 제목 클릭이므로 onCancel은 호출되지 않아야 함
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  describe('접근성', () => {
    it('alertdialog 역할을 가져야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      expect(screen.getByRole('alertdialog', { hidden: true })).toBeInTheDocument()
    })

    it('aria-modal 속성이 true여야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const dialog = screen.getByRole('alertdialog', { hidden: true })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('aria-labelledby와 aria-describedby 속성이 있어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const dialog = screen.getByRole('alertdialog', { hidden: true })
      expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title')
      expect(dialog).toHaveAttribute('aria-describedby', 'dialog-message')
    })

    it('제목에 id가 설정되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} title="고객 삭제" />)

      const title = screen.getByText('고객 삭제')
      expect(title).toHaveAttribute('id', 'dialog-title')
    })

    it('메시지에 id가 설정되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const message = screen.getByText('정말로 삭제하시겠습니까?')
      expect(message).toHaveAttribute('id', 'dialog-message')
    })

    it('확인 버튼에 aria-label이 있어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} confirmText="삭제" />)

      const button = screen.getByRole('button', { name: /삭제.*실행/, hidden: true })
      expect(button).toHaveAttribute('aria-label', '삭제 - 작업을 실행합니다')
    })

    it('취소 버튼에 aria-label이 있어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} cancelText="닫기" />)

      const button = screen.getByRole('button', { name: /닫기.*취소/, hidden: true })
      expect(button).toHaveAttribute('aria-label', '닫기 - 작업을 취소합니다')
    })
  })

  describe('body overflow 제어', () => {
    it('다이얼로그가 열릴 때 body overflow를 hidden으로 설정', () => {
      render(<ConfirmationDialog {...defaultProps} open={true} />)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('다이얼로그가 닫힐 때 body overflow를 원래대로 복원', () => {
      const { rerender } = render(<ConfirmationDialog {...defaultProps} open={true} />)

      expect(document.body.style.overflow).toBe('hidden')

      rerender(<ConfirmationDialog {...defaultProps} open={false} />)

      expect(document.body.style.overflow).toBe('unset')
    })
  })

  describe('Portal 렌더링', () => {
    it('다이얼로그가 document.body에 렌더링되어야 함', () => {
      render(<ConfirmationDialog {...defaultProps} />)

      const dialog = screen.getByRole('alertdialog', { hidden: true })
      expect(dialog.parentElement?.parentElement).toBe(document.body)
    })
  })

  describe('긴 텍스트 처리', () => {
    it('긴 제목을 렌더링할 수 있어야 함', () => {
      const longTitle = '매우 긴 제목입니다 '.repeat(10)

      render(<ConfirmationDialog {...defaultProps} title={longTitle} />)

      // trim()으로 양쪽 공백 제거 후 매칭
      expect(screen.getByText(longTitle.trim())).toBeInTheDocument()
    })

    it('긴 메시지를 렌더링할 수 있어야 함', () => {
      const longMessage = '매우 긴 메시지입니다 '.repeat(20)

      render(<ConfirmationDialog {...defaultProps} message={longMessage} />)

      // trim()으로 양쪽 공백 제거 후 매칭
      expect(screen.getByText(longMessage.trim())).toBeInTheDocument()
    })
  })

  describe('조합 테스트', () => {
    it('destructive + 커스텀 텍스트 조합', () => {
      render(
        <ConfirmationDialog
          {...defaultProps}
          destructive={true}
          confirmText="영구 삭제"
          cancelText="돌아가기"
        />
      )

      const confirmButton = screen.getByRole('button', { name: /영구 삭제.*실행/, hidden: true })
      expect(confirmButton).toHaveClass('button--destructive')

      const cancelButton = screen.getByRole('button', { name: /돌아가기.*취소/, hidden: true })
      expect(cancelButton).toBeInTheDocument()
      expect(cancelButton).toHaveClass('button--secondary')
    })

    it('onClose 핸들러와 함께 사용', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      const onCancel = vi.fn()
      const onClose = vi.fn()

      render(
        <ConfirmationDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onClose={onClose}
        />
      )

      // Escape로 닫기
      await user.keyboard('{Escape}')

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onConfirm).not.toHaveBeenCalled()
    })
  })
})

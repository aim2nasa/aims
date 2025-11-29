/**
 * Modal Component Tests
 * @since 2025-11-29
 * @version 1.0.0
 *
 * Modal 컴포넌트의 핵심 기능 테스트
 * - 렌더링/비렌더링
 * - ESC 키 닫기
 * - backdrop 클릭 닫기
 * - 접근성 (ARIA)
 * - 닫기 버튼
 */

import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Modal } from '../Modal'

describe('Modal', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    mockOnClose.mockClear()
  })

  describe('기본 렌더링', () => {
    it('visible=true일 때 모달이 렌더링되어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('테스트 모달')).toBeInTheDocument()
      expect(screen.getByText('모달 내용')).toBeInTheDocument()
    })

    it('visible=false일 때 모달이 렌더링되지 않아야 함', () => {
      render(
        <Modal visible={false} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('테스트 모달')).not.toBeInTheDocument()
    })

    it('title이 없고 showHeader=false일 때 헤더가 표시되지 않아야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} showHeader={false}>
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('footer가 제공되면 표시되어야 함', () => {
      render(
        <Modal
          visible={true}
          onClose={mockOnClose}
          title="테스트 모달"
          footer={<button>확인</button>}
        >
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByText('확인')).toBeInTheDocument()
    })
  })

  describe('크기 변형', () => {
    it.each(['sm', 'md', 'lg', 'xl'] as const)('size=%s일 때 올바른 클래스가 적용되어야 함', (size) => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" size={size}>
          <p>모달 내용</p>
        </Modal>
      )

      const modal = screen.getByRole('dialog')
      expect(modal).toHaveClass(`modal--${size}`)
    })
  })

  describe('ESC 키 닫기', () => {
    it('ESC 키를 누르면 onClose가 호출되어야 함 (escapeToClose=true)', async () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" escapeToClose={true}>
          <p>모달 내용</p>
        </Modal>
      )

      await userEvent.keyboard('{Escape}')
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('ESC 키를 눌러도 onClose가 호출되지 않아야 함 (escapeToClose=false)', async () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" escapeToClose={false}>
          <p>모달 내용</p>
        </Modal>
      )

      await userEvent.keyboard('{Escape}')
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('backdrop 클릭 닫기', () => {
    it('backdrop 클릭 시 onClose가 호출되어야 함 (backdropClosable=true)', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" backdropClosable={true}>
          <p>모달 내용</p>
        </Modal>
      )

      const backdrop = document.querySelector('.modal-backdrop')
      expect(backdrop).toBeInTheDocument()

      fireEvent.click(backdrop!)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('backdrop 클릭 시 onClose가 호출되지 않아야 함 (backdropClosable=false)', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" backdropClosable={false}>
          <p>모달 내용</p>
        </Modal>
      )

      const backdrop = document.querySelector('.modal-backdrop')
      expect(backdrop).toBeInTheDocument()

      fireEvent.click(backdrop!)
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('모달 내부 클릭 시 onClose가 호출되지 않아야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" backdropClosable={true}>
          <p>모달 내용</p>
        </Modal>
      )

      const modal = screen.getByRole('dialog')
      fireEvent.click(modal)
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('닫기 버튼', () => {
    it('닫기 버튼 클릭 시 onClose가 호출되어야 함', async () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      const closeButton = screen.getByLabelText('모달 닫기')
      await userEvent.click(closeButton)
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('접근성', () => {
    it('role="dialog"가 설정되어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('aria-modal="true"가 설정되어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('ariaLabel이 제공되면 적용되어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" ariaLabel="커스텀 라벨">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '커스텀 라벨')
    })

    it('ariaLabel이 없으면 title을 사용해야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '테스트 모달')
    })

    it('닫기 버튼에 aria-label이 있어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByLabelText('모달 닫기')).toBeInTheDocument()
    })
  })

  describe('추가 CSS 클래스', () => {
    it('className이 적용되어야 함', () => {
      render(
        <Modal visible={true} onClose={mockOnClose} title="테스트 모달" className="custom-modal">
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByRole('dialog')).toHaveClass('custom-modal')
    })
  })

  describe('React Node title', () => {
    it('title에 React 요소를 사용할 수 있어야 함', () => {
      render(
        <Modal
          visible={true}
          onClose={mockOnClose}
          title={<span data-testid="custom-title">커스텀 타이틀</span>}
        >
          <p>모달 내용</p>
        </Modal>
      )

      expect(screen.getByTestId('custom-title')).toBeInTheDocument()
      expect(screen.getByText('커스텀 타이틀')).toBeInTheDocument()
    })
  })
})

/**
 * useFocusTrap Hook Tests
 * @since 2025-11-29
 * @version 1.0.0
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { useFocusTrap } from '../useFocusTrap'

// 테스트용 모달 컴포넌트
function TestModal({ isOpen, autoFocus = true }: { isOpen: boolean; autoFocus?: boolean }) {
  const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen, autoFocus })

  if (!isOpen) return null

  return (
    <div ref={containerRef} role="dialog" aria-modal="true" data-testid="modal">
      <button data-testid="first-btn">첫 번째</button>
      <input data-testid="input" type="text" placeholder="입력" />
      <button data-testid="last-btn">마지막</button>
    </div>
  )
}

// 빈 모달 테스트용
function EmptyModal({ isOpen }: { isOpen: boolean }) {
  const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen })

  if (!isOpen) return null

  return (
    <div ref={containerRef} role="dialog" aria-modal="true" tabIndex={-1} data-testid="empty-modal">
      <p>포커스 가능한 요소 없음</p>
    </div>
  )
}

// 포커스 복원 테스트용
function FocusRestoreTest() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button data-testid="trigger" onClick={() => setIsOpen(true)}>
        모달 열기
      </button>
      {isOpen && (
        <TestModalWithClose onClose={() => setIsOpen(false)} />
      )}
    </div>
  )
}

function TestModalWithClose({ onClose }: { onClose: () => void }) {
  const containerRef = useFocusTrap<HTMLDivElement>({ enabled: true, restoreFocus: true })

  return (
    <div ref={containerRef} role="dialog" aria-modal="true" data-testid="modal">
      <button data-testid="close-btn" onClick={onClose}>닫기</button>
      <button data-testid="action-btn">액션</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('기본 동작', () => {
    it('활성화 시 첫 번째 포커스 가능 요소에 자동 포커스', async () => {
      render(<TestModal isOpen={true} />)

      // setTimeout(0) 실행
      await vi.runAllTimersAsync()

      expect(screen.getByTestId('first-btn')).toHaveFocus()
    })

    it('autoFocus=false일 때 자동 포커스하지 않음', async () => {
      render(<TestModal isOpen={true} autoFocus={false} />)

      await vi.runAllTimersAsync()

      expect(screen.getByTestId('first-btn')).not.toHaveFocus()
    })

    it('isOpen=false일 때 모달이 렌더링되지 않음', () => {
      render(<TestModal isOpen={false} />)

      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    })
  })

  describe('Tab 키 순환', () => {
    it('마지막 요소에서 Tab 시 첫 번째 요소로 이동', async () => {
      render(<TestModal isOpen={true} />)

      // 자동 포커스 완료 대기
      await vi.runAllTimersAsync()
      expect(screen.getByTestId('first-btn')).toHaveFocus()

      // 마지막 버튼에 포커스
      screen.getByTestId('last-btn').focus()
      expect(screen.getByTestId('last-btn')).toHaveFocus()

      // Tab 키 입력 (keydown 이벤트 발생)
      fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })

      // 첫 번째 버튼으로 순환
      expect(screen.getByTestId('first-btn')).toHaveFocus()
    })

    it('첫 번째 요소에서 Shift+Tab 시 마지막 요소로 이동', async () => {
      render(<TestModal isOpen={true} />)

      // 자동 포커스 완료 대기
      await vi.runAllTimersAsync()
      expect(screen.getByTestId('first-btn')).toHaveFocus()

      // Shift+Tab 키 입력
      fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab', shiftKey: true })

      // 마지막 버튼으로 순환
      expect(screen.getByTestId('last-btn')).toHaveFocus()
    })
  })

  describe('빈 컨테이너 처리', () => {
    it('포커스 가능한 요소가 없으면 에러 없이 동작', async () => {
      // 에러 없이 렌더링되어야 함
      expect(() => render(<EmptyModal isOpen={true} />)).not.toThrow()

      const modal = screen.getByTestId('empty-modal')
      expect(modal).toBeInTheDocument()
    })
  })

  describe('포커스 복원', () => {
    it('모달 닫힐 때 이전 포커스 요소로 복원', async () => {
      render(<FocusRestoreTest />)

      const triggerBtn = screen.getByTestId('trigger')

      // 트리거 버튼에 먼저 포커스
      triggerBtn.focus()
      expect(triggerBtn).toHaveFocus()

      // 트리거 버튼 클릭하여 모달 열기
      fireEvent.click(triggerBtn)
      await vi.runAllTimersAsync()

      // 모달이 열림
      expect(screen.getByTestId('modal')).toBeInTheDocument()

      // 닫기 버튼 클릭
      fireEvent.click(screen.getByTestId('close-btn'))
      await vi.runAllTimersAsync()

      // 모달이 닫힘
      expect(screen.queryByTestId('modal')).not.toBeInTheDocument()

      // 트리거 버튼으로 포커스 복원
      expect(triggerBtn).toHaveFocus()
    })
  })
})

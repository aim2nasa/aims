/**
 * PinInput 컴포넌트 단독 테스트
 * @description PIN dot 렌더링, 입력 처리, 에러 흔들림, disabled 상태 검증
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PinInput from '../PinInput'

describe('PinInput', () => {
  const mockOnComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('렌더링', () => {
    it('기본 4개 dot이 렌더링됨', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots).toHaveLength(4)
    })

    it('length=6 설정 시 6개 dot 렌더링', () => {
      render(<PinInput onComplete={mockOnComplete} length={6} />)
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots).toHaveLength(6)
    })

    it('초기 상태에서 모든 dot이 비어있음', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const dots = screen.getAllByTestId('pin-dot')
      dots.forEach(dot => {
        expect(dot).not.toHaveClass('pin-dot--filled')
      })
    })

    it('숨겨진 input이 numeric inputMode를 가짐', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const input = document.querySelector('input[inputmode="numeric"]')
      expect(input).not.toBeNull()
    })
  })

  describe('입력 처리', () => {
    it('숫자 입력 시 해당 dot이 filled됨', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '12' } })
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots[0]).toHaveClass('pin-dot--filled')
      expect(dots[1]).toHaveClass('pin-dot--filled')
      expect(dots[2]).not.toHaveClass('pin-dot--filled')
      expect(dots[3]).not.toHaveClass('pin-dot--filled')
    })

    it('4자리 입력 완료 시 onComplete 호출', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '1234' } })
      expect(mockOnComplete).toHaveBeenCalledWith('1234')
    })

    it('숫자가 아닌 문자는 무시됨', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '12ab' } })
      const dots = screen.getAllByTestId('pin-dot')
      expect(dots[0]).toHaveClass('pin-dot--filled')
      expect(dots[1]).toHaveClass('pin-dot--filled')
      expect(dots[2]).not.toHaveClass('pin-dot--filled')
    })

    it('5자리 이상 입력 시 4자리로 truncate', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '12345' } })
      expect(mockOnComplete).toHaveBeenCalledWith('1234')
    })
  })

  describe('에러 처리', () => {
    it('에러 발생 시 shake 클래스 추가', () => {
      const { rerender } = render(<PinInput onComplete={mockOnComplete} />)
      rerender(<PinInput onComplete={mockOnComplete} error="틀렸습니다" />)
      const dotsContainer = document.querySelector('.pin-dots')
      expect(dotsContainer).toHaveClass('pin-dots--shake')
    })

    it('에러 발생 후 400ms 뒤 shake 해제 + 값 초기화', () => {
      const { rerender } = render(<PinInput onComplete={mockOnComplete} />)
      // 먼저 값 입력
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      fireEvent.change(input, { target: { value: '12' } })

      // 에러 트리거
      rerender(<PinInput onComplete={mockOnComplete} error="틀렸습니다" />)

      // 400ms 후
      act(() => { vi.advanceTimersByTime(400) })

      const dotsContainer = document.querySelector('.pin-dots')
      expect(dotsContainer).not.toHaveClass('pin-dots--shake')
      // 값 초기화 확인
      const dots = screen.getAllByTestId('pin-dot')
      dots.forEach(dot => {
        expect(dot).not.toHaveClass('pin-dot--filled')
      })
    })
  })

  describe('disabled 상태', () => {
    it('disabled=true 시 input이 비활성화됨', () => {
      render(<PinInput onComplete={mockOnComplete} disabled />)
      const input = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })
  })

  describe('접근성', () => {
    it('aria-label에 입력 상태가 표시됨', () => {
      render(<PinInput onComplete={mockOnComplete} />)
      const group = screen.getByRole('group')
      expect(group).toHaveAttribute('aria-label', '간편 비밀번호 입력, 4자리 중 0자리 입력됨')
    })
  })
})

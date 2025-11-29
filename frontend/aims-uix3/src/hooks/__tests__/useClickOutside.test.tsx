/**
 * useClickOutside Hook Tests
 * @since 2025-11-29
 * @version 1.0.0
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { useClickOutside, useClickOutsideToggle } from '../useClickOutside'

// 테스트용 컴포넌트 - useClickOutside
function TestComponent({ onClickOutside, enabled = true }: { onClickOutside: () => void; enabled?: boolean }) {
  const ref = useClickOutside<HTMLDivElement>(onClickOutside, { enabled })

  return (
    <div>
      <div ref={ref} data-testid="inside">Inside Element</div>
      <div data-testid="outside">Outside Element</div>
    </div>
  )
}

// 테스트용 컴포넌트 - useClickOutsideToggle
function TestToggleComponent() {
  const [isOpen, setIsOpen] = useState(true)
  const ref = useClickOutsideToggle<HTMLDivElement>(isOpen, setIsOpen)

  return (
    <div>
      <div ref={ref} data-testid="dropdown">
        {isOpen ? 'Open' : 'Closed'}
      </div>
      <div data-testid="outside">Outside</div>
      <button data-testid="open-btn" onClick={() => setIsOpen(true)}>Open</button>
    </div>
  )
}

// 테스트용 컴포넌트 - delay 옵션
function TestDelayComponent({ onClickOutside }: { onClickOutside: () => void }) {
  const ref = useClickOutside<HTMLDivElement>(onClickOutside, { enabled: true, delay: 100 })

  return (
    <div>
      <div ref={ref} data-testid="inside">Inside</div>
      <div data-testid="outside">Outside</div>
    </div>
  )
}

describe('useClickOutside', () => {
  const mockCallback = vi.fn()

  beforeEach(() => {
    mockCallback.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('기본 동작', () => {
    it('외부 클릭 시 콜백이 호출되어야 함', () => {
      render(<TestComponent onClickOutside={mockCallback} />)

      fireEvent.mouseDown(screen.getByTestId('outside'))

      expect(mockCallback).toHaveBeenCalledTimes(1)
    })

    it('내부 클릭 시 콜백이 호출되지 않아야 함', () => {
      render(<TestComponent onClickOutside={mockCallback} />)

      fireEvent.mouseDown(screen.getByTestId('inside'))

      expect(mockCallback).not.toHaveBeenCalled()
    })

    it('enabled=false일 때 콜백이 호출되지 않아야 함', () => {
      render(<TestComponent onClickOutside={mockCallback} enabled={false} />)

      fireEvent.mouseDown(screen.getByTestId('outside'))

      expect(mockCallback).not.toHaveBeenCalled()
    })
  })

  describe('delay 옵션', () => {
    it('delay 시간 전에는 외부 클릭이 감지되지 않아야 함', () => {
      render(<TestDelayComponent onClickOutside={mockCallback} />)

      // delay 전에 클릭
      fireEvent.mouseDown(screen.getByTestId('outside'))

      expect(mockCallback).not.toHaveBeenCalled()
    })

    it('delay 시간 후에는 외부 클릭이 감지되어야 함', () => {
      render(<TestDelayComponent onClickOutside={mockCallback} />)

      // delay 시간 경과
      act(() => {
        vi.advanceTimersByTime(150)
      })

      fireEvent.mouseDown(screen.getByTestId('outside'))

      expect(mockCallback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('useClickOutsideToggle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('외부 클릭 시 isOpen이 false가 되어야 함', () => {
    render(<TestToggleComponent />)

    expect(screen.getByTestId('dropdown')).toHaveTextContent('Open')

    fireEvent.mouseDown(screen.getByTestId('outside'))

    expect(screen.getByTestId('dropdown')).toHaveTextContent('Closed')
  })

  it('내부 클릭 시 isOpen이 유지되어야 함', () => {
    render(<TestToggleComponent />)

    expect(screen.getByTestId('dropdown')).toHaveTextContent('Open')

    fireEvent.mouseDown(screen.getByTestId('dropdown'))

    expect(screen.getByTestId('dropdown')).toHaveTextContent('Open')
  })

  it('isOpen이 false일 때 외부 클릭이 감지되지 않아야 함', () => {
    render(<TestToggleComponent />)

    // 닫기
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.getByTestId('dropdown')).toHaveTextContent('Closed')

    // 다시 외부 클릭해도 에러 없이 동작해야 함
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.getByTestId('dropdown')).toHaveTextContent('Closed')
  })
})

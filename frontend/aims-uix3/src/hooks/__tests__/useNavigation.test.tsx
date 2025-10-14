/**
 * useNavigation.test.tsx
 * @since 2025-10-14
 * @version 1.0.0
 *
 * useNavigation Hook의 종합 테스트
 * 총 22개 테스트 케이스 포함
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNavigation } from '../useNavigation'

describe('useNavigation', () => {
  const mockItems = ['item1', 'item2', 'item3']
  const mockOnSelectionChange = vi.fn()
  const mockOnEnter = vi.fn()
  const mockOnEscape = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // window.matchMedia 모킹
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // ===== 1. 초기 상태 테스트 =====

  describe('초기 상태', () => {
    it('기본값이 올바르게 설정되어야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      expect(result.current.currentIndex).toBe(0)
      expect(result.current.canNavigateUp).toBe(true) // circular 기본값 true
      expect(result.current.canNavigateDown).toBe(true)
      expect(result.current.tabIndex).toBe(0)
    })

    it('disabled 옵션이 설정된 경우 tabIndex가 -1이어야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          disabled: true,
        })
      )

      expect(result.current.tabIndex).toBe(-1)
    })

    it('enableKeyboard: false인 경우 tabIndex가 -1이어야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          enableKeyboard: false,
        })
      )

      expect(result.current.tabIndex).toBe(-1)
    })
  })

  // ===== 2. canNavigate 계산 테스트 =====

  describe('canNavigate 계산', () => {
    it('circular: false일 때 첫 항목에서 위로 이동 불가능', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          circular: false,
        })
      )

      expect(result.current.canNavigateUp).toBe(false)
      expect(result.current.canNavigateDown).toBe(true)
    })

    it('circular: false일 때 마지막 항목에서 아래로 이동 불가능', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item3',
          onSelectionChange: mockOnSelectionChange,
          circular: false,
        })
      )

      expect(result.current.canNavigateUp).toBe(true)
      expect(result.current.canNavigateDown).toBe(false)
    })

    it('circular: true일 때 어디서든 이동 가능', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          circular: true,
        })
      )

      expect(result.current.canNavigateUp).toBe(true)
      expect(result.current.canNavigateDown).toBe(true)
    })
  })

  // ===== 3. 키보드 네비게이션 테스트 =====

  describe('키보드 네비게이션', () => {
    it('ArrowDown 키로 아래로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item2')
    })

    it('ArrowUp 키로 위로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item2',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item1')
    })

    it('Home 키로 첫 항목으로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item3',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        key: 'Home',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item1')
    })

    it('End 키로 마지막 항목으로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        key: 'End',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item3')
    })

    it('Enter 키로 onEnter 콜백을 호출해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item2',
          onSelectionChange: mockOnSelectionChange,
          onEnter: mockOnEnter,
        })
      )

      const event = {
        key: 'Enter',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnEnter).toHaveBeenCalledWith('item2')
    })

    it('Escape 키로 onEscape 콜백을 호출해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          onEscape: mockOnEscape,
        })
      )

      const event = {
        key: 'Escape',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnEscape).toHaveBeenCalled()
    })

    it('스페이스바로 onEnter 콜백을 호출해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item2',
          onSelectionChange: mockOnSelectionChange,
          onEnter: mockOnEnter,
        })
      )

      const event = {
        key: ' ',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnEnter).toHaveBeenCalledWith('item2')
    })

    it('enableKeyboard: false일 때 키보드 입력을 무시해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          enableKeyboard: false,
        })
      )

      const event = {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })
  })

  // ===== 4. 휠 네비게이션 테스트 =====

  describe('휠 네비게이션', () => {
    it('아래로 스크롤 시 다음 항목으로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 0, // 즉시 반응
        })
      )

      const event = {
        deltaY: 100,
        deltaX: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.WheelEvent

      act(() => {
        result.current.onWheel(event)
      })

      // 타이머 진행
      act(() => {
        vi.runAllTimers()
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item2')
    })

    it('위로 스크롤 시 이전 항목으로 이동해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item2',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 0,
        })
      )

      const event = {
        deltaY: -100,
        deltaX: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.WheelEvent

      act(() => {
        result.current.onWheel(event)
      })

      act(() => {
        vi.runAllTimers()
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item1')
    })

    it('disabled: true일 때 휠 입력을 무시해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          disabled: true,
        })
      )

      const event = {
        deltaY: 100,
        deltaX: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.WheelEvent

      act(() => {
        result.current.onWheel(event)
      })

      act(() => {
        vi.runAllTimers()
      })

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })

    it('가로 스크롤은 무시해야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        deltaY: 10,
        deltaX: 100, // 가로 스크롤이 더 큼
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.WheelEvent

      act(() => {
        result.current.onWheel(event)
      })

      act(() => {
        vi.runAllTimers()
      })

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })
  })

  // ===== 5. 순환 네비게이션 테스트 =====

  describe('순환 네비게이션', () => {
    it('circular: true일 때 첫 항목에서 위로 가면 마지막 항목으로 순환', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          circular: true,
        })
      )

      const event = {
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(mockOnSelectionChange).toHaveBeenCalledWith('item3')
    })

    it('circular: true일 때 마지막 항목에서 아래로 가면 첫 항목으로 순환', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item3',
          onSelectionChange: mockOnSelectionChange,
          circular: true,
        })
      )

      const event = {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(mockOnSelectionChange).toHaveBeenCalledWith('item1')
    })

    it('circular: false일 때 첫 항목에서 위로 가면 이동하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          circular: false,
        })
      )

      const event = {
        key: 'ArrowUp',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      // item1에 그대로 있으므로 onSelectionChange 호출되지 않음
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })

    it('circular: false일 때 마지막 항목에서 아래로 가면 이동하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item3',
          onSelectionChange: mockOnSelectionChange,
          circular: false,
        })
      )

      const event = {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      // item3에 그대로 있으므로 onSelectionChange 호출되지 않음
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })
  })

  // ===== 6. 엣지 케이스 테스트 =====

  describe('엣지 케이스', () => {
    it('빈 items 배열일 때 네비게이션 동작하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: [],
          selectedKey: '',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      const event = {
        key: 'ArrowDown',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent

      act(() => {
        result.current.onKeyDown(event)
      })

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })

    it('선택된 키가 items에 없을 때 currentIndex가 -1', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'nonexistent',
          onSelectionChange: mockOnSelectionChange,
        })
      )

      expect(result.current.currentIndex).toBe(-1)
    })
  })
})

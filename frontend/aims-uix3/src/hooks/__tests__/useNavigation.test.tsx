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

    it('빈 items 배열일 때 휠 네비게이션도 동작하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: [],
          selectedKey: '',
          onSelectionChange: mockOnSelectionChange,
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

    it('빈 items 배열일 때 canNavigateUp/Down이 false', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: [],
          selectedKey: '',
          onSelectionChange: mockOnSelectionChange,
          circular: true,
        })
      )

      expect(result.current.canNavigateUp).toBe(false)
      expect(result.current.canNavigateDown).toBe(false)
    })

    it('단일 항목일 때 circular: false면 이동 불가', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: ['single'],
          selectedKey: 'single',
          onSelectionChange: mockOnSelectionChange,
          circular: false,
        })
      )

      expect(result.current.canNavigateUp).toBe(false)
      expect(result.current.canNavigateDown).toBe(false)
    })
  })

  // ===== 7. 접근성 (prefers-reduced-motion) 테스트 =====

  describe('접근성: prefers-reduced-motion', () => {
    it('prefers-reduced-motion: reduce일 때 휠 네비게이션을 무시해야 함', () => {
      // matchMedia를 모킹하여 prefers-reduced-motion: reduce 반환
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
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

      // prefers-reduced-motion이 활성화되어 있으면 휠 네비게이션 무시
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })

    it('prefers-reduced-motion이 활성화되어도 키보드 네비게이션은 정상 동작', () => {
      // matchMedia를 모킹하여 prefers-reduced-motion: reduce 반환
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

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

      // 키보드 네비게이션은 정상 동작
      expect(event.preventDefault).toHaveBeenCalled()
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item2')
    })
  })

  // ===== 8. Debounce & 타이머 관리 테스트 =====

  describe('Debounce & 타이머', () => {
    it('scrollSensitivity에 따라 debounce가 적용되어야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 100,
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

      // 타이머가 실행되기 전에는 호출되지 않음
      expect(mockOnSelectionChange).not.toHaveBeenCalled()

      // 100ms 후에 호출됨
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(mockOnSelectionChange).toHaveBeenCalledWith('item2')
    })

    it('빠른 연속 스크롤 시 마지막 스크롤만 처리되어야 함', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 100,
        })
      )

      // 첫 번째 스크롤 (down)
      act(() => {
        result.current.onWheel({
          deltaY: 100,
          deltaX: 0,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as React.WheelEvent)
      })

      // 50ms 후 두 번째 스크롤 (down)
      act(() => {
        vi.advanceTimersByTime(50)
      })

      act(() => {
        result.current.onWheel({
          deltaY: 100,
          deltaX: 0,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as React.WheelEvent)
      })

      // 첫 번째 타이머는 클리어되고 두 번째만 실행됨
      act(() => {
        vi.advanceTimersByTime(100)
      })

      // 마지막 스크롤만 처리되어 item2로 이동 (1번만 호출)
      expect(mockOnSelectionChange).toHaveBeenCalledTimes(1)
      expect(mockOnSelectionChange).toHaveBeenCalledWith('item2')
    })

    it('언마운트 시 타이머가 정리되어야 함', () => {
      const { result, unmount } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 100,
        })
      )

      act(() => {
        result.current.onWheel({
          deltaY: 100,
          deltaX: 0,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as React.WheelEvent)
      })

      // unmount 전에 타이머가 실행되지 않음
      unmount()

      // unmount 후 타이머를 진행해도 호출되지 않음
      act(() => {
        vi.runAllTimers()
      })

      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })
  })

  // ===== 9. 동일 키 선택 방지 테스트 =====

  describe('동일 키 선택 방지', () => {
    it('키보드로 동일한 항목 선택 시 onSelectionChange가 호출되지 않음', () => {
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

      // 첫 항목에서 위로 가면 그대로 item1 (circular: false)
      // 동일 키이므로 onSelectionChange 호출 안 됨
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })

    it('휠로 동일한 항목 선택 시 onSelectionChange가 호출되지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          scrollSensitivity: 0,
          circular: false,
        })
      )

      const event = {
        deltaY: -100, // 위로 스크롤
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

      // 첫 항목에서 위로 가면 그대로 item1 (circular: false)
      // 동일 키이므로 onSelectionChange 호출 안 됨
      expect(mockOnSelectionChange).not.toHaveBeenCalled()
    })
  })

  // ===== 10. 콜백 미제공 시 동작 테스트 =====

  describe('콜백 미제공 시 동작', () => {
    it('onEnter가 없을 때 Enter 키가 preventDefault만 호출하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          // onEnter 미제공
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

      // onEnter가 없으면 처리되지 않음
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('onEscape가 없을 때 Escape 키가 preventDefault만 호출하지 않음', () => {
      const { result } = renderHook(() =>
        useNavigation({
          items: mockItems,
          selectedKey: 'item1',
          onSelectionChange: mockOnSelectionChange,
          // onEscape 미제공
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

      // onEscape가 없으면 처리되지 않음
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})

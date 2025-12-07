/**
 * useModalDragResize Hook 테스트
 * @since 2025-12-07
 *
 * 모달 드래그/리사이즈 기능 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModalDragResize } from '../useModalDragResize'

// window 크기 모킹
const mockWindowSize = { innerWidth: 1920, innerHeight: 1080 }

beforeEach(() => {
  vi.stubGlobal('innerWidth', mockWindowSize.innerWidth)
  vi.stubGlobal('innerHeight', mockWindowSize.innerHeight)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useModalDragResize', () => {
  describe('초기 상태', () => {
    it('기본 초기값으로 시작함', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.size.width).toBe(1400)
      expect(result.current.size.height).toBe(800)
      expect(result.current.isDragging).toBe(false)
      expect(result.current.isResizing).toBe(false)
      expect(result.current.isMaximized).toBe(false)
      expect(result.current.isImmersive).toBe(false)
      expect(result.current.isResizedFromDefault).toBe(false)
    })

    it('커스텀 초기값으로 시작할 수 있음', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          initialWidth: 800,
          initialHeight: 600,
        })
      )

      expect(result.current.size.width).toBe(800)
      expect(result.current.size.height).toBe(600)
    })

    it('중앙에 위치함', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          initialWidth: 800,
          initialHeight: 600,
        })
      )

      // 중앙 위치: (1920 - 800) / 2 = 560, (1080 - 600) / 2 = 240
      expect(result.current.position.x).toBe(560)
      expect(result.current.position.y).toBe(240)
    })
  })

  describe('modalStyle', () => {
    it('올바른 스타일 객체를 반환함', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          initialWidth: 800,
          initialHeight: 600,
        })
      )

      expect(result.current.modalStyle.position).toBe('fixed')
      expect(result.current.modalStyle.width).toBe('800px')
      expect(result.current.modalStyle.height).toBe('600px')
      expect(result.current.modalStyle.left).toBe('560px')
      expect(result.current.modalStyle.top).toBe('240px')
    })
  })

  describe('headerProps', () => {
    it('기본 커서 스타일이 grab임', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.headerProps.style.cursor).toBe('grab')
    })

    it('onMouseDown과 onDoubleClick 핸들러가 있음', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.headerProps.onMouseDown).toBeDefined()
      expect(result.current.headerProps.onDoubleClick).toBeDefined()
    })
  })

  describe('resizeHandles', () => {
    it('8개의 리사이즈 핸들을 반환함', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.resizeHandles).toHaveLength(8)
    })

    it('모든 방향의 핸들이 있음', () => {
      const { result } = renderHook(() => useModalDragResize())

      const positions = result.current.resizeHandles.map((h) => h.position)
      expect(positions).toContain('n')
      expect(positions).toContain('s')
      expect(positions).toContain('e')
      expect(positions).toContain('w')
      expect(positions).toContain('ne')
      expect(positions).toContain('nw')
      expect(positions).toContain('se')
      expect(positions).toContain('sw')
    })

    it('각 핸들에 올바른 커서 스타일이 있음', () => {
      const { result } = renderHook(() => useModalDragResize())

      const seHandle = result.current.resizeHandles.find((h) => h.position === 'se')
      const nHandle = result.current.resizeHandles.find((h) => h.position === 'n')
      const eHandle = result.current.resizeHandles.find((h) => h.position === 'e')

      expect(seHandle?.style.cursor).toBe('nwse-resize')
      expect(nHandle?.style.cursor).toBe('ns-resize')
      expect(eHandle?.style.cursor).toBe('ew-resize')
    })
  })

  describe('reset', () => {
    it('크기를 초기값으로 리셋함', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          initialWidth: 800,
          initialHeight: 600,
        })
      )

      // 최대화로 크기 변경
      act(() => {
        result.current.toggleMaximize()
      })

      expect(result.current.size.width).toBe(mockWindowSize.innerWidth)

      // 리셋
      act(() => {
        result.current.reset()
      })

      expect(result.current.size.width).toBe(800)
      expect(result.current.size.height).toBe(600)
      expect(result.current.isMaximized).toBe(false)
      expect(result.current.isImmersive).toBe(false)
    })
  })

  describe('toggleMaximize', () => {
    it('최대화 토글이 작동함', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.isMaximized).toBe(false)

      act(() => {
        result.current.toggleMaximize()
      })

      expect(result.current.isMaximized).toBe(true)
      expect(result.current.position.x).toBe(0)
      expect(result.current.position.y).toBe(0)
      expect(result.current.size.width).toBe(mockWindowSize.innerWidth)
      expect(result.current.size.height).toBe(mockWindowSize.innerHeight)
    })

    it('복원 시 이전 상태로 돌아감', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          initialWidth: 800,
          initialHeight: 600,
        })
      )

      const originalPosition = { ...result.current.position }
      const originalSize = { ...result.current.size }

      // 최대화
      act(() => {
        result.current.toggleMaximize()
      })

      // 복원
      act(() => {
        result.current.toggleMaximize()
      })

      expect(result.current.isMaximized).toBe(false)
      expect(result.current.position).toEqual(originalPosition)
      expect(result.current.size).toEqual(originalSize)
    })

    it('최대화 상태에서 헤더 커서가 default임', () => {
      const { result } = renderHook(() => useModalDragResize())

      act(() => {
        result.current.toggleMaximize()
      })

      expect(result.current.headerProps.style.cursor).toBe('default')
    })
  })

  describe('toggleImmersive', () => {
    it('몰입 모드 토글이 작동함', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.isImmersive).toBe(false)

      act(() => {
        result.current.toggleImmersive()
      })

      expect(result.current.isImmersive).toBe(true)

      act(() => {
        result.current.toggleImmersive()
      })

      expect(result.current.isImmersive).toBe(false)
    })
  })

  describe('isResizedFromDefault', () => {
    it('초기 상태에서는 false', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.isResizedFromDefault).toBe(false)
    })

    it('최대화 후에는 true', () => {
      const { result } = renderHook(() => useModalDragResize())

      act(() => {
        result.current.toggleMaximize()
      })

      expect(result.current.isResizedFromDefault).toBe(true)
    })

    it('리셋 후에는 false', () => {
      const { result } = renderHook(() => useModalDragResize())

      act(() => {
        result.current.toggleMaximize()
      })

      act(() => {
        result.current.reset()
      })

      expect(result.current.isResizedFromDefault).toBe(false)
    })
  })

  describe('드래그 동작', () => {
    it('버튼 요소에서는 드래그가 시작되지 않음', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'BUTTON' },
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onMouseDown(mockEvent)
      })

      expect(result.current.isDragging).toBe(false)
      expect(mockEvent.preventDefault).not.toHaveBeenCalled()
    })

    it('최대화 상태에서는 드래그가 시작되지 않음', () => {
      const { result } = renderHook(() => useModalDragResize())

      act(() => {
        result.current.toggleMaximize()
      })

      const mockEvent = {
        target: { tagName: 'DIV' },
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onMouseDown(mockEvent)
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('일반 상태에서 드래그 시작됨', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'DIV' },
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onMouseDown(mockEvent)
      })

      expect(result.current.isDragging).toBe(true)
      expect(mockEvent.preventDefault).toHaveBeenCalled()
    })
  })

  describe('더블클릭 동작', () => {
    it('버튼에서는 더블클릭이 무시됨', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'BUTTON' },
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onDoubleClick(mockEvent)
      })

      expect(result.current.isMaximized).toBe(false)
    })

    it('일반 요소에서 더블클릭하면 최대화됨', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'DIV' },
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onDoubleClick(mockEvent)
      })

      expect(result.current.isMaximized).toBe(true)
    })
  })

  describe('리사이즈 동작', () => {
    it('최대화 상태에서는 리사이즈가 시작되지 않음', () => {
      const { result } = renderHook(() => useModalDragResize())

      act(() => {
        result.current.toggleMaximize()
      })

      const seHandle = result.current.resizeHandles.find((h) => h.position === 'se')

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        seHandle?.onMouseDown(mockEvent)
      })

      expect(result.current.isResizing).toBe(false)
    })

    it('일반 상태에서 리사이즈 시작됨', () => {
      const { result } = renderHook(() => useModalDragResize())

      const seHandle = result.current.resizeHandles.find((h) => h.position === 'se')

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        seHandle?.onMouseDown(mockEvent)
      })

      expect(result.current.isResizing).toBe(true)
      expect(mockEvent.preventDefault).toHaveBeenCalled()
      expect(mockEvent.stopPropagation).toHaveBeenCalled()
    })
  })

  describe('최소/최대 크기 제약', () => {
    it('기본 최소 크기가 적용됨', () => {
      const { result } = renderHook(() =>
        useModalDragResize({
          minWidth: 600,
          minHeight: 400,
        })
      )

      // 최소 크기보다 작은 초기값을 줘도 훅은 동작해야 함
      expect(result.current.size.width).toBeGreaterThanOrEqual(600)
      expect(result.current.size.height).toBeGreaterThanOrEqual(400)
    })
  })

  describe('스타일 변경', () => {
    it('드래그 중에는 userSelect가 none임', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'DIV' },
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onMouseDown(mockEvent)
      })

      expect(result.current.modalStyle.userSelect).toBe('none')
    })

    it('드래그 중에는 transition이 none임', () => {
      const { result } = renderHook(() => useModalDragResize())

      const mockEvent = {
        target: { tagName: 'DIV' },
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent

      act(() => {
        result.current.headerProps.onMouseDown(mockEvent)
      })

      expect(result.current.modalStyle.transition).toBe('none')
    })

    it('일반 상태에서는 transition이 활성화됨', () => {
      const { result } = renderHook(() => useModalDragResize())

      expect(result.current.modalStyle.transition).toBe('all 0.3s ease')
    })
  })
})

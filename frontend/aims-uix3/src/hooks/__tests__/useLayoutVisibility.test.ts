/**
 * Phase 3.1 테스트: useLayoutVisibility.ts
 *
 * 테스트 대상:
 * - 초기 상태 (기본값)
 * - 각 토글 함수 동작
 * - 직접 설정 함수
 * - 함수 안정성 (메모이제이션)
 *
 * 참고: leftPaneCollapsed는 App.tsx에서 애니메이션과 함께 관리됨
 */

import { renderHook, act } from '@testing-library/react'
import { useLayoutVisibility } from '../useLayoutVisibility'

describe('useLayoutVisibility', () => {
  describe('초기 상태', () => {
    test('기본 가시성 상태가 올바르게 설정됨', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.headerVisible).toBe(true)
      expect(result.current.leftPaneVisible).toBe(true)
      expect(result.current.centerPaneVisible).toBe(true)
      expect(result.current.rightPaneVisible).toBe(false)
      expect(result.current.mainPaneVisible).toBe(true)
      expect(result.current.brbVisible).toBe(true)
      expect(result.current.paginationVisible).toBe(true)
    })

    test('모든 토글 함수가 제공됨', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(typeof result.current.toggleHeader).toBe('function')
      expect(typeof result.current.toggleLeftPane).toBe('function')
      expect(typeof result.current.toggleCenterPane).toBe('function')
      expect(typeof result.current.toggleRightPane).toBe('function')
      expect(typeof result.current.toggleMainPane).toBe('function')
      expect(typeof result.current.toggleBrb).toBe('function')
      expect(typeof result.current.togglePagination).toBe('function')
      expect(typeof result.current.setRightPaneVisible).toBe('function')
    })
  })

  describe('토글 함수', () => {
    test('toggleHeader가 headerVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.headerVisible).toBe(true)

      act(() => {
        result.current.toggleHeader()
      })

      expect(result.current.headerVisible).toBe(false)

      act(() => {
        result.current.toggleHeader()
      })

      expect(result.current.headerVisible).toBe(true)
    })

    test('toggleLeftPane가 leftPaneVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.leftPaneVisible).toBe(true)

      act(() => {
        result.current.toggleLeftPane()
      })

      expect(result.current.leftPaneVisible).toBe(false)
    })

    test('toggleCenterPane가 centerPaneVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.centerPaneVisible).toBe(true)

      act(() => {
        result.current.toggleCenterPane()
      })

      expect(result.current.centerPaneVisible).toBe(false)
    })

    test('toggleRightPane가 rightPaneVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.rightPaneVisible).toBe(false)

      act(() => {
        result.current.toggleRightPane()
      })

      expect(result.current.rightPaneVisible).toBe(true)
    })

    test('toggleMainPane가 mainPaneVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.mainPaneVisible).toBe(true)

      act(() => {
        result.current.toggleMainPane()
      })

      expect(result.current.mainPaneVisible).toBe(false)
    })

    test('toggleBrb가 brbVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.brbVisible).toBe(true)

      act(() => {
        result.current.toggleBrb()
      })

      expect(result.current.brbVisible).toBe(false)
    })

    test('togglePagination이 paginationVisible을 토글함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.paginationVisible).toBe(true)

      act(() => {
        result.current.togglePagination()
      })

      expect(result.current.paginationVisible).toBe(false)
    })
  })

  describe('직접 설정 함수', () => {
    test('setRightPaneVisible이 rightPaneVisible을 직접 설정함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      expect(result.current.rightPaneVisible).toBe(false)

      act(() => {
        result.current.setRightPaneVisible(true)
      })

      expect(result.current.rightPaneVisible).toBe(true)

      act(() => {
        result.current.setRightPaneVisible(false)
      })

      expect(result.current.rightPaneVisible).toBe(false)
    })

    test('setRightPaneVisible이 동일한 값으로 설정해도 정상 동작함', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      act(() => {
        result.current.setRightPaneVisible(true)
      })

      expect(result.current.rightPaneVisible).toBe(true)

      act(() => {
        result.current.setRightPaneVisible(true)
      })

      expect(result.current.rightPaneVisible).toBe(true)
    })
  })

  describe('함수 안정성 (메모이제이션)', () => {
    test('토글 함수들이 리렌더링 사이에 동일한 참조를 유지함', () => {
      const { result, rerender } = renderHook(() => useLayoutVisibility())

      const firstToggleHeader = result.current.toggleHeader
      const firstToggleLeftPane = result.current.toggleLeftPane
      const firstToggleCenterPane = result.current.toggleCenterPane
      const firstToggleRightPane = result.current.toggleRightPane
      const firstToggleMainPane = result.current.toggleMainPane
      const firstToggleBrb = result.current.toggleBrb
      const firstTogglePagination = result.current.togglePagination

      rerender()

      expect(result.current.toggleHeader).toBe(firstToggleHeader)
      expect(result.current.toggleLeftPane).toBe(firstToggleLeftPane)
      expect(result.current.toggleCenterPane).toBe(firstToggleCenterPane)
      expect(result.current.toggleRightPane).toBe(firstToggleRightPane)
      expect(result.current.toggleMainPane).toBe(firstToggleMainPane)
      expect(result.current.toggleBrb).toBe(firstToggleBrb)
      expect(result.current.togglePagination).toBe(firstTogglePagination)
    })
  })

  describe('복합 시나리오', () => {
    test('여러 상태를 순차적으로 토글할 수 있음', () => {
      const { result } = renderHook(() => useLayoutVisibility())

      // 초기 상태
      expect(result.current.headerVisible).toBe(true)
      expect(result.current.leftPaneVisible).toBe(true)
      expect(result.current.rightPaneVisible).toBe(false)

      // 여러 토글 실행
      act(() => {
        result.current.toggleHeader()
        result.current.toggleLeftPane()
        result.current.setRightPaneVisible(true)
      })

      expect(result.current.headerVisible).toBe(false)
      expect(result.current.leftPaneVisible).toBe(false)
      expect(result.current.rightPaneVisible).toBe(true)

      // 다시 토글
      act(() => {
        result.current.toggleHeader()
        result.current.toggleLeftPane()
        result.current.toggleRightPane()
      })

      expect(result.current.headerVisible).toBe(true)
      expect(result.current.leftPaneVisible).toBe(true)
      expect(result.current.rightPaneVisible).toBe(false)
    })
  })
})

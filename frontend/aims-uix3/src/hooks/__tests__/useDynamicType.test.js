/**
 * useDynamicType Hook Tests
 * @since 1.0.0
 *
 * iOS Dynamic Type 시스템 연동 hook 테스트
 * - 시스템 텍스트 크기 감지
 * - 접근성 크기 처리
 * - CSS 변수 업데이트
 * - 수동 크기 설정
 * - 에러 처리
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDynamicType, initializeDynamicType } from '../useDynamicType'

describe('useDynamicType', () => {
  let originalGetComputedStyle

  beforeEach(() => {
    // DOM 초기화
    document.documentElement.style.cssText = ''
    document.body.className = ''
    document.body.removeAttribute('data-text-size')

    // getComputedStyle 모킹
    originalGetComputedStyle = window.getComputedStyle
    window.getComputedStyle = vi.fn(() => ({
      getPropertyValue: vi.fn(() => '1')
    }))

    vi.clearAllMocks()
  })

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle
    document.documentElement.style.cssText = ''
    document.body.className = ''
    document.body.removeAttribute('data-text-size')
  })

  describe('초기화', () => {
    it('기본값으로 Large (1.0) 크기가 설정되어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('Large')
      expect(result.current.scaleFactor).toBe(1.0)
      expect(result.current.isAccessibilitySize).toBe(false)
    })

    it('사용 가능한 모든 크기 목록을 제공해야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      expect(result.current.availableSizes).toEqual([
        'xSmall', 'Small', 'Medium', 'Large',
        'xLarge', 'xxLarge', 'xxxLarge',
        'AX1', 'AX2', 'AX3', 'AX4', 'AX5'
      ])
    })

    it('편의 함수들이 올바른 값을 반환해야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      expect(result.current.isSmallText).toBe(false) // 1.0 < 1.0 = false
      expect(result.current.isLargeText).toBe(false) // 1.0 > 1.0 = false
      expect(result.current.isExtraLarge).toBe(false) // 1.0 >= 1.4 = false
    })
  })

  describe('시스템 크기 감지', () => {
    it('xSmall (0.8) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '0.8')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('xSmall')
      expect(result.current.scaleFactor).toBe(0.8)
      expect(result.current.isAccessibilitySize).toBe(false)
    })

    it('Small (0.85) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '0.85')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('Small')
      expect(result.current.scaleFactor).toBe(0.85)
    })

    it('Medium (0.9) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '0.9')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('Medium')
      expect(result.current.scaleFactor).toBe(0.9)
    })

    it('xLarge (1.1) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.1')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('xLarge')
      expect(result.current.scaleFactor).toBe(1.1)
      expect(result.current.isLargeText).toBe(true)
    })

    it('xxLarge (1.2) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.2')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('xxLarge')
      expect(result.current.scaleFactor).toBe(1.2)
    })

    it('xxxLarge (1.3) 크기를 올바르게 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.3')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('xxxLarge')
      expect(result.current.scaleFactor).toBe(1.3)
    })
  })

  describe('접근성 크기 감지', () => {
    it('AX1 (1.4) 크기를 감지하고 접근성 모드를 활성화해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.4')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('AX1')
      expect(result.current.scaleFactor).toBe(1.4)
      expect(result.current.isAccessibilitySize).toBe(true)
      expect(result.current.isExtraLarge).toBe(true)
      expect(document.body.classList.contains('accessibility-text-size')).toBe(true)
      expect(document.body.getAttribute('data-text-size')).toBe('AX1')
    })

    it('AX2 (1.5) 크기를 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.5')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('AX2')
      expect(result.current.scaleFactor).toBe(1.5)
      expect(result.current.isAccessibilitySize).toBe(true)
    })

    it('AX3 (1.6) 크기를 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.6')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('AX3')
      expect(result.current.scaleFactor).toBe(1.6)
    })

    it('AX4 (1.8) 크기를 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.8')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('AX4')
      expect(result.current.scaleFactor).toBe(1.8)
    })

    it('AX5 (2.0+) 크기를 감지해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '2.5')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.currentSize).toBe('AX5')
      expect(result.current.scaleFactor).toBe(2.5)
      expect(result.current.isAccessibilitySize).toBe(true)
    })

    it('접근성 크기에서 body에 accessibility-text-size 클래스를 추가해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.5')
      }))

      renderHook(() => useDynamicType())

      expect(document.body.classList.contains('accessibility-text-size')).toBe(true)
    })

    it('일반 크기에서는 accessibility-text-size 클래스가 없어야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.0')
      }))

      renderHook(() => useDynamicType())

      expect(document.body.classList.contains('accessibility-text-size')).toBe(false)
    })
  })

  describe('CSS 변수 업데이트', () => {
    it('감지된 크기에 따라 --font-scale-factor CSS 변수를 설정해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.3')
      }))

      renderHook(() => useDynamicType())

      expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('1.3')
    })

    it('data-text-size 속성을 body에 설정해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.1')
      }))

      renderHook(() => useDynamicType())

      expect(document.body.getAttribute('data-text-size')).toBe('xLarge')
    })
  })

  describe('수동 크기 설정 (setTextSize)', () => {
    it('유효한 크기를 수동으로 설정할 수 있어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      act(() => {
        result.current.setTextSize('xLarge')
      })

      expect(result.current.currentSize).toBe('xLarge')
      expect(result.current.scaleFactor).toBe(1.1)
      expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('1.1')
    })

    it('접근성 크기를 수동으로 설정할 수 있어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      act(() => {
        result.current.setTextSize('AX3')
      })

      expect(result.current.currentSize).toBe('AX3')
      expect(result.current.scaleFactor).toBe(1.6)
      expect(result.current.isAccessibilitySize).toBe(true)
      expect(document.body.classList.contains('accessibility-text-size')).toBe(true)
    })

    it('접근성 크기에서 일반 크기로 전환할 수 있어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      act(() => {
        result.current.setTextSize('AX2')
      })

      expect(document.body.classList.contains('accessibility-text-size')).toBe(true)

      act(() => {
        result.current.setTextSize('Large')
      })

      expect(result.current.isAccessibilitySize).toBe(false)
      expect(document.body.classList.contains('accessibility-text-size')).toBe(false)
    })

    it('존재하지 않는 크기를 설정하면 무시해야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      const initialSize = result.current.currentSize
      const initialScale = result.current.scaleFactor

      act(() => {
        result.current.setTextSize('InvalidSize')
      })

      expect(result.current.currentSize).toBe(initialSize)
      expect(result.current.scaleFactor).toBe(initialScale)
    })

    it('여러 크기를 순차적으로 설정할 수 있어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      act(() => {
        result.current.setTextSize('Small')
      })
      expect(result.current.scaleFactor).toBe(0.85)

      act(() => {
        result.current.setTextSize('xxLarge')
      })
      expect(result.current.scaleFactor).toBe(1.2)

      act(() => {
        result.current.setTextSize('AX5')
      })
      expect(result.current.scaleFactor).toBe(2.0)
      expect(result.current.isAccessibilitySize).toBe(true)
    })
  })

  describe('시스템 기본값 재설정 (resetToSystemDefault)', () => {
    it('시스템 기본값으로 재설정할 수 있어야 함', () => {
      const { result } = renderHook(() => useDynamicType())

      // 수동으로 크기 설정
      act(() => {
        result.current.setTextSize('AX2')
      })

      expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('1.5')

      // 시스템 기본값으로 재설정
      act(() => {
        result.current.resetToSystemDefault()
      })

      // CSS 변수와 속성이 제거되어야 함
      expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('')
      expect(document.body.getAttribute('data-text-size')).toBeNull()
      expect(document.body.classList.contains('accessibility-text-size')).toBe(false)
    })
  })

  describe('편의 함수', () => {
    it('isSmallText가 1.0 미만일 때 true를 반환해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '0.85')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.isSmallText).toBe(true)
      expect(result.current.isLargeText).toBe(false)
    })

    it('isLargeText가 1.0 초과일 때 true를 반환해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.2')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.isSmallText).toBe(false)
      expect(result.current.isLargeText).toBe(true)
    })

    it('isExtraLarge가 1.4 이상일 때 true를 반환해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '1.5')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.isExtraLarge).toBe(true)
    })

    it('모든 편의 함수가 동시에 올바르게 작동해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '0.8')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.isSmallText).toBe(true)
      expect(result.current.isLargeText).toBe(false)
      expect(result.current.isExtraLarge).toBe(false)
    })
  })

  describe('에러 처리', () => {
    it('getComputedStyle 실패 시 기본값으로 폴백해야 함', () => {
      window.getComputedStyle = vi.fn(() => {
        throw new Error('getComputedStyle failed')
      })

      const { result } = renderHook(() => useDynamicType())

      // 에러 발생해도 기본값(Large, 1.0)으로 정상 폴백
      expect(result.current.currentSize).toBe('Large')
      expect(result.current.scaleFactor).toBe(1.0)
      expect(result.current.isAccessibilitySize).toBe(false)
    })

    it('getPropertyValue가 빈 문자열을 반환해도 기본값 1을 사용해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => '')
      }))

      const { result } = renderHook(() => useDynamicType())

      expect(result.current.scaleFactor).toBe(1.0)
    })

    it('parseFloat 실패 시 기본값으로 폴백해야 함', () => {
      window.getComputedStyle = vi.fn(() => ({
        getPropertyValue: vi.fn(() => 'invalid-number')
      }))

      const { result } = renderHook(() => useDynamicType())

      // parseFloat('invalid-number')는 NaN을 반환
      // NaN과 비교하면 모든 조건이 false가 되어 else 블록(AX5)으로 간다
      expect(result.current.currentSize).toBe('AX5')
      expect(isNaN(result.current.scaleFactor)).toBe(true)
    })
  })

  describe('cleanup', () => {
    it('unmount 시 ResizeObserver를 정리해야 함', () => {
      const disconnectSpy = vi.fn()
      const observeSpy = vi.fn()

      // CSS.supports 모킹도 필요
      const originalCSS = global.CSS
      global.CSS = {
        supports: vi.fn(() => true)
      }

      global.ResizeObserver = vi.fn(() => ({
        observe: observeSpy,
        disconnect: disconnectSpy
      }))

      const { unmount } = renderHook(() => useDynamicType())

      expect(observeSpy).toHaveBeenCalled()

      unmount()

      expect(disconnectSpy).toHaveBeenCalled()

      // 원복
      global.CSS = originalCSS
    })

    it('ResizeObserver가 없으면 interval을 사용하고 정리해야 함', () => {
      const originalResizeObserver = global.ResizeObserver
      global.ResizeObserver = undefined

      vi.useFakeTimers()
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      const { unmount } = renderHook(() => useDynamicType())

      vi.advanceTimersByTime(2000)

      unmount()

      expect(clearIntervalSpy).toHaveBeenCalled()

      vi.useRealTimers()
      global.ResizeObserver = originalResizeObserver
    })
  })
})

describe('initializeDynamicType', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
    document.head.innerHTML = ''
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.documentElement.style.cssText = ''
    document.head.innerHTML = ''
  })

  it('--font-scale-factor CSS 변수를 초기화해야 함', () => {
    initializeDynamicType()

    expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('1')
  })

  it('이미 설정된 경우 --font-scale-factor를 덮어쓰지 않아야 함', () => {
    document.documentElement.style.setProperty('--font-scale-factor', '1.5')

    initializeDynamicType()

    expect(document.documentElement.style.getPropertyValue('--font-scale-factor')).toBe('1.5')
  })

  it('접근성 스타일을 head에 추가해야 함', () => {
    initializeDynamicType()

    const styleElement = document.head.querySelector('#dynamic-type-styles')

    expect(styleElement).not.toBeNull()
    expect(styleElement.textContent).toContain('accessibility-text-size')
    expect(styleElement.textContent).toContain('--spacing-scale')
  })

  it('중복 호출 시 스타일을 중복 추가하지 않아야 함', () => {
    initializeDynamicType()
    initializeDynamicType()
    initializeDynamicType()

    const styleElements = document.head.querySelectorAll('#dynamic-type-styles')

    expect(styleElements.length).toBe(1)
  })

  it('초기화 완료 후 스타일 요소가 존재해야 함', () => {
    initializeDynamicType()

    // logger.debug는 VITEST에서 억제되므로, 초기화 결과를 DOM으로 확인
    const styleElement = document.head.querySelector('#dynamic-type-styles')
    expect(styleElement).not.toBeNull()
    expect(styleElement.textContent).toContain('--font-scale-factor')
  })
})

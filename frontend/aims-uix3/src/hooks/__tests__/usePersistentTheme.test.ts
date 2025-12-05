/**
 * usePersistentTheme 훅 테스트
 *
 * @since 2025-12-05
 * @description
 * 테마 영속화 훅의 동작을 검증합니다.
 * - 초기 테마 로드
 * - 테마 변경 및 저장
 * - 테마 토글
 * - document.documentElement 속성 적용
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistentTheme } from '../usePersistentTheme'

describe('usePersistentTheme', () => {
  // localStorage mock
  let store: Record<string, string> = {}

  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }

  // document.documentElement mock
  const mockSetAttribute = vi.fn()

  beforeEach(() => {
    store = {}
    vi.clearAllMocks()

    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })

    Object.defineProperty(document, 'documentElement', {
      value: {
        setAttribute: mockSetAttribute,
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('초기 상태', () => {
    it('localStorage에 저장된 테마가 없으면 light를 기본값으로 사용해야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('light')
      expect(result.current.isDarkMode).toBe(false)
    })

    it('localStorage에 light가 저장되어 있으면 light를 사용해야 한다', () => {
      store['aims-theme'] = 'light'

      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('light')
      expect(result.current.isDarkMode).toBe(false)
    })

    it('localStorage에 dark가 저장되어 있으면 dark를 사용해야 한다', () => {
      store['aims-theme'] = 'dark'

      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })

    it('localStorage에 잘못된 값이 있으면 light를 기본값으로 사용해야 한다', () => {
      store['aims-theme'] = 'invalid-theme'

      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('light')
    })
  })

  describe('테마 변경', () => {
    it('setTheme으로 테마를 변경할 수 있어야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      act(() => {
        result.current.setTheme('dark')
      })

      expect(result.current.theme).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })

    it('테마 변경 시 localStorage에 저장해야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      act(() => {
        result.current.setTheme('dark')
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('aims-theme', 'dark')
    })

    it('테마 변경 시 document.documentElement에 data-theme 속성을 설정해야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      act(() => {
        result.current.setTheme('dark')
      })

      expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark')
    })
  })

  describe('테마 토글', () => {
    it('light에서 dark로 토글해야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('light')

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.theme).toBe('dark')
      expect(result.current.isDarkMode).toBe(true)
    })

    it('dark에서 light로 토글해야 한다', () => {
      store['aims-theme'] = 'dark'

      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('dark')

      act(() => {
        result.current.toggleTheme()
      })

      expect(result.current.theme).toBe('light')
      expect(result.current.isDarkMode).toBe(false)
    })

    it('토글 시 localStorage에 저장해야 한다', () => {
      const { result } = renderHook(() => usePersistentTheme())

      act(() => {
        result.current.toggleTheme()
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('aims-theme', 'dark')
    })
  })

  describe('마운트 시 동작', () => {
    it('마운트 시 document에 테마를 적용해야 한다', () => {
      store['aims-theme'] = 'dark'

      renderHook(() => usePersistentTheme())

      expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'dark')
    })

    it('마운트 시 localStorage에 테마를 저장해야 한다', () => {
      renderHook(() => usePersistentTheme())

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('aims-theme', 'light')
    })
  })

  describe('localStorage 에러 처리', () => {
    it('localStorage.getItem 실패 시 light를 기본값으로 사용해야 한다', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })

      const { result } = renderHook(() => usePersistentTheme())

      expect(result.current.theme).toBe('light')
    })

    it('localStorage.setItem 실패 시 에러 없이 동작해야 한다', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })

      const { result } = renderHook(() => usePersistentTheme())

      expect(() => {
        act(() => {
          result.current.toggleTheme()
        })
      }).not.toThrow()

      expect(result.current.theme).toBe('dark')
    })
  })
})

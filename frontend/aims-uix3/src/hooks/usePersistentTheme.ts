/**
 * 테마 영속화 훅
 *
 * @since 2025-12-05
 * @description
 * App.tsx에서 추출된 테마 관련 상태 및 효과를 관리합니다.
 * - 테마 상태 (light/dark)
 * - localStorage 영속화
 * - document.documentElement에 data-theme 속성 적용
 */

import { useState, useEffect, useCallback } from 'react'
import { errorReporter } from '@/shared/lib/errorReporter'

/**
 * 테마 타입
 */
export type Theme = 'light' | 'dark'

/**
 * localStorage 키
 */
const THEME_STORAGE_KEY = 'aims-theme'

/**
 * usePersistentTheme 훅 반환 타입
 */
export interface UsePersistentThemeReturn {
  /** 현재 테마 */
  theme: Theme
  /** 테마 설정 함수 */
  setTheme: (theme: Theme) => void
  /** 테마 토글 함수 (light ↔ dark) */
  toggleTheme: () => void
  /** 다크 모드 여부 */
  isDarkMode: boolean
}

/**
 * localStorage에서 테마 불러오기
 */
const loadTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light'

  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme
    }
  } catch {
    // localStorage 접근 실패 시 무시
  }
  return 'light'
}

/**
 * localStorage에 테마 저장
 */
const saveTheme = (theme: Theme): void => {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    if (import.meta.env.DEV) {
      console.log(`[Theme] 테마 설정 저장: ${theme}`)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Theme] localStorage 저장 실패:', error)
    }
    errorReporter.reportApiError(error as Error, { component: 'usePersistentTheme.saveTheme' })
  }
}

/**
 * document에 테마 적용
 */
const applyTheme = (theme: Theme): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/**
 * 테마 영속화 훅
 *
 * @returns 테마 상태 및 제어 함수
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme, isDarkMode } = usePersistentTheme()
 *
 * return (
 *   <button onClick={toggleTheme}>
 *     {isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
 *   </button>
 * )
 * ```
 */
export function usePersistentTheme(): UsePersistentThemeReturn {
  const [theme, setThemeState] = useState<Theme>(loadTheme)

  // 테마 변경 시 저장 및 적용
  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  // 테마 설정 함수
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
  }, [])

  // 테마 토글 함수
  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light')
  }, [])

  return {
    theme,
    setTheme,
    toggleTheme,
    isDarkMode: theme === 'dark',
  }
}

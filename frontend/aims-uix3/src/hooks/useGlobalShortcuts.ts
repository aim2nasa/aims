/**
 * useGlobalShortcuts - 전역 단축키 관리 훅
 * App.tsx에서 분리됨 - 키보드 단축키 이벤트 핸들링
 */
import { useEffect, useCallback } from 'react'
import { useDevModeStore } from '@/shared/store/useDevModeStore'

export interface GlobalShortcutActions {
  /** 메뉴 클릭 핸들러 (예: 'documents-search', 'customers-register') */
  onMenuClick: (menuKey: string) => void
}

/**
 * 전역 단축키 관리 훅
 *
 * 지원 단축키:
 * - Ctrl+Shift+E: Developer Mode 토글
 * - Ctrl+K: 검색창 포커스
 * - Ctrl+Shift+F: 문서 검색
 * - Ctrl+Shift+U: 문서 등록
 * - Ctrl+Shift+C: 고객 등록
 */
export function useGlobalShortcuts({ onMenuClick }: GlobalShortcutActions): void {
  const isDevMode = useDevModeStore((state) => state.isDevMode)
  const setDevMode = useDevModeStore((state) => state.setDevMode)
  const openPasswordModal = useDevModeStore((state) => state.openPasswordModal)

  // Developer Mode 토글 핸들러
  const handleDevModeShortcut = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyE') {
      e.preventDefault()
      if (isDevMode) {
        // 이미 켜져 있으면 바로 끔
        setDevMode(false)
      } else {
        // 꺼져 있으면 비밀번호 모달 표시
        openPasswordModal()
      }
    }
  }, [isDevMode, setDevMode, openPasswordModal])

  // 전역 단축키 핸들러
  const handleGlobalShortcuts = useCallback((e: KeyboardEvent) => {
    // 입력 필드에서는 단축키 비활성화
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    // Ctrl+K: 고객 검색 (검색창 포커스)
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'k') {
      e.preventDefault()
      const searchInput = document.querySelector<HTMLInputElement>('.quick-search__input')
      searchInput?.focus()
      return
    }

    // Ctrl+Shift+F: 문서 검색
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'F') {
      e.preventDefault()
      onMenuClick('documents-search')
      return
    }

    // Ctrl+Shift+U: 문서 등록
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'U') {
      e.preventDefault()
      onMenuClick('documents-register')
      return
    }

    // Ctrl+Shift+C: 고객 등록
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key === 'C') {
      e.preventDefault()
      onMenuClick('customers-register')
      return
    }
  }, [onMenuClick])

  // Developer Mode 단축키 이벤트 리스너
  useEffect(() => {
    window.addEventListener('keydown', handleDevModeShortcut)
    return () => window.removeEventListener('keydown', handleDevModeShortcut)
  }, [handleDevModeShortcut])

  // 전역 단축키 이벤트 리스너
  useEffect(() => {
    window.addEventListener('keydown', handleGlobalShortcuts)
    return () => window.removeEventListener('keydown', handleGlobalShortcuts)
  }, [handleGlobalShortcuts])
}

export default useGlobalShortcuts

/**
 * Navigation Store
 * @since 2026-03-26
 * @version 1.0.0
 *
 * 페이지 네비게이션 히스토리 추적
 * - 이전 뷰 기록 (조건부 BackButton 표시용)
 * - 네비게이션 소스 추적 (사이드바 vs 페이지 내 링크)
 */

import { create } from 'zustand'

/** 네비게이션 소스: 사이드바 직접 클릭 vs 앱 내부 링크 vs 직접 URL 접근 */
type NavigationSource = 'sidebar' | 'internal' | 'direct'

interface NavigationStore {
  /** 이전 뷰 키 (null이면 이전 페이지 없음) */
  previousView: string | null
  /** 현재 뷰 키 */
  currentView: string | null
  /** 현재 페이지에 도달한 경로 */
  navigationSource: NavigationSource

  /** 뷰 전환 기록 */
  recordNavigation: (newView: string, source: NavigationSource) => void
  /** 히스토리 초기화 (앱 시작 시) */
  resetHistory: () => void
}

export const useNavigationStore = create<NavigationStore>((set, get) => ({
  previousView: null,
  currentView: null,
  navigationSource: 'direct',

  recordNavigation: (newView: string, source: NavigationSource) => {
    // 빈 값 방어
    if (!newView) return

    const { currentView } = get()

    // 같은 뷰로 이동 시 히스토리 변경 없음
    if (newView === currentView) return

    set({
      // 사이드바 직접 진입 시 이전 뷰 초기화 (BackButton 미표시)
      previousView: source === 'sidebar' ? null : currentView,
      currentView: newView,
      navigationSource: source,
    })
  },

  resetHistory: () => {
    set({
      previousView: null,
      currentView: null,
      navigationSource: 'direct',
    })
  },
}))

/**
 * Navigation Store Tests
 * @since 2026-03-26
 * @version 1.0.0
 *
 * 조건부 BackButton을 위한 네비게이션 히스토리 추적 테스트
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import { useNavigationStore } from '../useNavigationStore'

describe('useNavigationStore', () => {
  beforeEach(() => {
    // 각 테스트 전 store 초기화
    act(() => {
      useNavigationStore.getState().resetHistory()
    })
  })

  describe('초기 상태', () => {
    it('previousView가 null이어야 한다', () => {
      expect(useNavigationStore.getState().previousView).toBeNull()
    })

    it('currentView가 null이어야 한다', () => {
      expect(useNavigationStore.getState().currentView).toBeNull()
    })

    it('navigationSource가 direct이어야 한다', () => {
      expect(useNavigationStore.getState().navigationSource).toBe('direct')
    })
  })

  describe('recordNavigation — 사이드바 직접 클릭', () => {
    it('사이드바 클릭 시 previousView가 null이어야 한다 (BackButton 미표시)', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('customers-all')
      expect(state.previousView).toBeNull()
      expect(state.navigationSource).toBe('sidebar')
    })

    it('사이드바로 연속 이동 시에도 previousView가 항상 null이어야 한다', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('documents-library', 'sidebar')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('documents-library')
      expect(state.previousView).toBeNull()
    })
  })

  describe('recordNavigation — 앱 내부 링크', () => {
    it('내부 링크로 이동 시 previousView에 이전 뷰가 기록되어야 한다', () => {
      // 먼저 사이드바로 customers-all에 진입
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      // 내부 링크로 customers-full-detail로 이동
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('customers-full-detail')
      expect(state.previousView).toBe('customers-all')
      expect(state.navigationSource).toBe('internal')
    })

    it('내부 링크 연속 이동 시 직전 뷰만 기록되어야 한다', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customer-document-explorer', 'internal')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('customer-document-explorer')
      expect(state.previousView).toBe('customers-full-detail')
    })
  })

  describe('recordNavigation — 사이드바 클릭으로 히스토리 초기화', () => {
    it('내부 링크 이동 후 사이드바 클릭 시 previousView가 초기화되어야 한다', () => {
      // 내부 링크로 이동하여 previousView가 있는 상태 만들기
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })
      expect(useNavigationStore.getState().previousView).toBe('customers-all')

      // 사이드바 클릭으로 히스토리 초기화
      act(() => {
        useNavigationStore.getState().recordNavigation('documents-library', 'sidebar')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('documents-library')
      expect(state.previousView).toBeNull()
      expect(state.navigationSource).toBe('sidebar')
    })
  })

  describe('recordNavigation — 엣지 케이스', () => {
    it('같은 뷰로 이동 시 상태가 변경되지 않아야 한다', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })

      const stateBefore = useNavigationStore.getState()

      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'internal')
      })

      const stateAfter = useNavigationStore.getState()
      expect(stateAfter.previousView).toBe(stateBefore.previousView)
      expect(stateAfter.currentView).toBe(stateBefore.currentView)
      expect(stateAfter.navigationSource).toBe(stateBefore.navigationSource)
    })

    it('빈 문자열로 이동 시 상태가 변경되지 않아야 한다', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })

      act(() => {
        useNavigationStore.getState().recordNavigation('', 'internal')
      })

      expect(useNavigationStore.getState().currentView).toBe('customers-all')
    })
  })

  describe('recordNavigation — popstate 시뮬레이션 (sidebar로 처리)', () => {
    it('내부 링크 이동 후 popstate(sidebar) 시 previousView가 초기화되어야 한다', () => {
      // 사이드바로 진입 → 내부 링크로 이동 → previousView 있음
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })
      expect(useNavigationStore.getState().previousView).toBe('customers-all')

      // popstate 발생 → sidebar로 기록하여 previousView 초기화 (BackButton 숨김)
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('customers-all')
      expect(state.previousView).toBeNull()
      expect(state.navigationSource).toBe('sidebar')
    })

    it('탐색기 → popstate로 이전 뷰 복원 시 previousView가 초기화되어야 한다', () => {
      // customers-all → customers-full-detail → customer-document-explorer
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customer-document-explorer', 'internal')
      })
      expect(useNavigationStore.getState().previousView).toBe('customers-full-detail')

      // popstate로 customers-full-detail 복원 (sidebar로 처리)
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'sidebar')
      })

      const state = useNavigationStore.getState()
      expect(state.currentView).toBe('customers-full-detail')
      expect(state.previousView).toBeNull()
    })
  })

  describe('resetHistory', () => {
    it('모든 상태가 초기값으로 복원되어야 한다', () => {
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-all', 'sidebar')
      })
      act(() => {
        useNavigationStore.getState().recordNavigation('customers-full-detail', 'internal')
      })

      act(() => {
        useNavigationStore.getState().resetHistory()
      })

      const state = useNavigationStore.getState()
      expect(state.previousView).toBeNull()
      expect(state.currentView).toBeNull()
      expect(state.navigationSource).toBe('direct')
    })
  })
})

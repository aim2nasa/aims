/**
 * Layout Store
 * @since 2025-11-29
 * @version 1.0.0
 *
 * 앱 레이아웃 상태 전역 관리
 * - Pane visibility 상태
 * - Pane 크기/비율
 * - 애니메이션 상태
 * - 리사이즈 상태
 */

import { create } from 'zustand'
import { errorReporter } from '@/shared/lib/errorReporter'

// CenterPane과 RightPane의 기본 비율 (0~1 범위)
const DEFAULT_CENTER_PANE_RATIO = 0.5
const DEFAULT_CENTER_WIDTH_PERCENT = DEFAULT_CENTER_PANE_RATIO * 100

// LocalStorage 키
const STORAGE_KEYS = {
  LEFT_PANE_COLLAPSED: 'aims-leftPaneCollapsed',
  LAYOUT_MODAL: 'aims_layout_modal_open',
} as const

type AnimationState = 'idle' | 'expanding' | 'collapsing'

interface LayoutStore {
  // Pane visibility 상태
  headerVisible: boolean
  leftPaneVisible: boolean
  centerPaneVisible: boolean
  rightPaneVisible: boolean
  mainPaneVisible: boolean
  brbVisible: boolean
  paginationVisible: boolean

  // Pane 크기/비율
  centerWidth: number
  leftPaneCollapsed: boolean

  // 애니메이션/드래그 상태
  leftPaneAnimationState: AnimationState
  isDraggingBRB: boolean
  isResizing: boolean
  resizeTimer: NodeJS.Timeout | null

  // 모달 상태
  layoutControlModalOpen: boolean
  modalClickProtection: boolean

  // Actions - Visibility 토글
  toggleHeader: () => void
  toggleLeftPane: () => void
  toggleCenterPane: () => void
  toggleRightPane: () => void
  toggleMainPane: () => void
  toggleBrb: () => void
  togglePagination: () => void

  // Actions - Setters
  setHeaderVisible: (visible: boolean) => void
  setLeftPaneVisible: (visible: boolean) => void
  setCenterPaneVisible: (visible: boolean) => void
  setRightPaneVisible: (visible: boolean) => void
  setMainPaneVisible: (visible: boolean) => void
  setBrbVisible: (visible: boolean) => void
  setPaginationVisible: (visible: boolean) => void
  setCenterWidth: (width: number) => void
  resetCenterWidth: () => void

  // Actions - LeftPane collapsed
  toggleLeftPaneCollapsed: () => void
  setLeftPaneCollapsed: (collapsed: boolean) => void

  // Actions - Animation state
  setLeftPaneAnimationState: (state: AnimationState) => void

  // Actions - Drag/Resize
  setIsDraggingBRB: (dragging: boolean) => void
  setIsResizing: (resizing: boolean) => void
  setResizeTimer: (timer: NodeJS.Timeout | null) => void

  // Actions - Modal
  openLayoutControlModal: () => void
  closeLayoutControlModal: () => void
  setModalClickProtection: (protected_: boolean) => void

  // Constants
  DEFAULT_CENTER_WIDTH_PERCENT: number
}

// 초기값 로드 헬퍼
const loadLeftPaneCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEYS.LEFT_PANE_COLLAPSED) === 'true'
  } catch {
    return false
  }
}

/**
 * Layout Store
 *
 * App.tsx의 레이아웃 관련 상태를 전역으로 관리
 *
 * @example
 * ```tsx
 * const { rightPaneVisible, setRightPaneVisible } = useLayoutStore()
 *
 * // 토글
 * const { toggleLeftPane } = useLayoutStore()
 * onClick={toggleLeftPane}
 * ```
 */
export const useLayoutStore = create<LayoutStore>((set, get) => ({
  // Initial state - Visibility
  headerVisible: true,
  leftPaneVisible: true,
  centerPaneVisible: true,
  rightPaneVisible: false,
  mainPaneVisible: true,
  brbVisible: true,
  paginationVisible: true,

  // Initial state - Size/Ratio
  centerWidth: DEFAULT_CENTER_WIDTH_PERCENT,
  leftPaneCollapsed: loadLeftPaneCollapsed(),

  // Initial state - Animation/Drag
  leftPaneAnimationState: 'idle',
  isDraggingBRB: false,
  isResizing: false,
  resizeTimer: null,

  // Initial state - Modal
  layoutControlModalOpen: false,
  modalClickProtection: false,

  // Constants
  DEFAULT_CENTER_WIDTH_PERCENT,

  // Actions - Visibility toggles
  toggleHeader: () => set((state) => ({ headerVisible: !state.headerVisible })),
  toggleLeftPane: () => set((state) => ({ leftPaneVisible: !state.leftPaneVisible })),
  toggleCenterPane: () => set((state) => ({ centerPaneVisible: !state.centerPaneVisible })),
  toggleRightPane: () => set((state) => ({ rightPaneVisible: !state.rightPaneVisible })),
  toggleMainPane: () => set((state) => ({ mainPaneVisible: !state.mainPaneVisible })),
  toggleBrb: () => set((state) => ({ brbVisible: !state.brbVisible })),
  togglePagination: () => set((state) => ({ paginationVisible: !state.paginationVisible })),

  // Actions - Visibility setters
  setHeaderVisible: (visible) => set({ headerVisible: visible }),
  setLeftPaneVisible: (visible) => set({ leftPaneVisible: visible }),
  setCenterPaneVisible: (visible) => set({ centerPaneVisible: visible }),
  setRightPaneVisible: (visible) => set({ rightPaneVisible: visible }),
  setMainPaneVisible: (visible) => set({ mainPaneVisible: visible }),
  setBrbVisible: (visible) => set({ brbVisible: visible }),
  setPaginationVisible: (visible) => set({ paginationVisible: visible }),

  // Actions - Size/Ratio
  setCenterWidth: (width) => set({ centerWidth: width }),
  resetCenterWidth: () => set({ centerWidth: DEFAULT_CENTER_WIDTH_PERCENT }),

  // Actions - LeftPane collapsed with persistence
  toggleLeftPaneCollapsed: () => {
    const newCollapsed = !get().leftPaneCollapsed

    // localStorage에 저장
    try {
      localStorage.setItem(STORAGE_KEYS.LEFT_PANE_COLLAPSED, String(newCollapsed))
      if (import.meta.env.DEV) {
        console.log('[LayoutStore] LeftPane 상태 저장:', newCollapsed)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[LayoutStore] LeftPane 상태 저장 실패:', error)
      }
      errorReporter.reportApiError(error as Error, { component: 'useLayoutStore.toggleLeftPaneCollapsed' })
    }

    // 애니메이션 상태 설정
    set({
      leftPaneCollapsed: newCollapsed,
      leftPaneAnimationState: newCollapsed ? 'collapsing' : 'expanding',
    })

    // 애니메이션 완료 후 idle 상태로 복귀
    setTimeout(() => {
      set({ leftPaneAnimationState: 'idle' })
    }, 1000)
  },

  setLeftPaneCollapsed: (collapsed) => {
    try {
      localStorage.setItem(STORAGE_KEYS.LEFT_PANE_COLLAPSED, String(collapsed))
    } catch {
      // ignore
    }
    set({ leftPaneCollapsed: collapsed })
  },

  // Actions - Animation state
  setLeftPaneAnimationState: (state) => set({ leftPaneAnimationState: state }),

  // Actions - Drag/Resize
  setIsDraggingBRB: (dragging) => set({ isDraggingBRB: dragging }),
  setIsResizing: (resizing) => set({ isResizing: resizing }),
  setResizeTimer: (timer) => {
    // 기존 타이머 정리
    const currentTimer = get().resizeTimer
    if (currentTimer) {
      clearTimeout(currentTimer)
    }
    set({ resizeTimer: timer })
  },

  // Actions - Modal
  openLayoutControlModal: () => {
    if (get().layoutControlModalOpen || get().modalClickProtection) return

    set({
      layoutControlModalOpen: true,
      modalClickProtection: true,
    })

    // 클릭 보호 해제
    setTimeout(() => {
      set({ modalClickProtection: false })
    }, 100)
  },

  closeLayoutControlModal: () => set({ layoutControlModalOpen: false }),

  setModalClickProtection: (protected_) => set({ modalClickProtection: protected_ }),
}))

// 상수 export
export { DEFAULT_CENTER_WIDTH_PERCENT }

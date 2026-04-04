/**
 * useLayoutVisibility Hook
 *
 * App.tsx에서 추출된 레이아웃 가시성 상태 관리 훅
 * - 각 패널(Header, LeftPane, CenterPane, RightPane, MainPane, BRB)의 가시성 상태
 * - Pagination 표시 상태
 * - 각 상태에 대한 토글 함수
 *
 * 참고: leftPaneCollapsed는 애니메이션 상태와 연결되어 있어 App.tsx에서 관리
 */

import { useState, useCallback } from 'react'

export interface LayoutVisibilityState {
  /** Header 표시 여부 */
  headerVisible: boolean
  /** LeftPane 표시 여부 */
  leftPaneVisible: boolean
  /** CenterPane 표시 여부 */
  centerPaneVisible: boolean
  /** RightPane 표시 여부 */
  rightPaneVisible: boolean
  /** MainPane 표시 여부 */
  mainPaneVisible: boolean
  /** BRB(Bottom Right Button) 표시 여부 */
  brbVisible: boolean
  /** Pagination 표시 여부 */
  paginationVisible: boolean
}

export interface LayoutVisibilityActions {
  /** Header 토글 */
  toggleHeader: () => void
  /** LeftPane 토글 */
  toggleLeftPane: () => void
  /** CenterPane 토글 */
  toggleCenterPane: () => void
  /** RightPane 토글 */
  toggleRightPane: () => void
  /** MainPane 토글 */
  toggleMainPane: () => void
  /** BRB 토글 */
  toggleBrb: () => void
  /** Pagination 토글 */
  togglePagination: () => void
  /** RightPane 가시성 직접 설정 */
  setRightPaneVisible: (visible: boolean) => void
}

export type UseLayoutVisibilityReturn = LayoutVisibilityState & LayoutVisibilityActions

/**
 * 레이아웃 가시성 상태 관리 훅
 *
 * @example
 * ```tsx
 * const {
 *   headerVisible,
 *   leftPaneVisible,
 *   toggleHeader,
 *   toggleLeftPane,
 *   setRightPaneVisible,
 *   ...
 * } = useLayoutVisibility()
 * ```
 */
export function useLayoutVisibility(): UseLayoutVisibilityReturn {
  // 각 패널의 가시성 상태
  const [headerVisible, setHeaderVisible] = useState(true)
  const [leftPaneVisible, setLeftPaneVisible] = useState(true)
  const [centerPaneVisible, setCenterPaneVisible] = useState(true)
  const [rightPaneVisible, setRightPaneVisible] = useState(false)
  const [mainPaneVisible, setMainPaneVisible] = useState(true)
  const [brbVisible, setBrbVisible] = useState(true)
  const [paginationVisible, setPaginationVisible] = useState(true)

  // 토글 함수들 (메모이제이션)
  const toggleHeader = useCallback(() => setHeaderVisible(prev => !prev), [])
  const toggleLeftPane = useCallback(() => setLeftPaneVisible(prev => !prev), [])
  const toggleCenterPane = useCallback(() => setCenterPaneVisible(prev => !prev), [])
  const toggleRightPane = useCallback(() => setRightPaneVisible(prev => !prev), [])
  const toggleMainPane = useCallback(() => setMainPaneVisible(prev => !prev), [])
  const toggleBrb = useCallback(() => setBrbVisible(prev => !prev), [])
  const togglePagination = useCallback(() => setPaginationVisible(prev => !prev), [])

  return {
    // 상태
    headerVisible,
    leftPaneVisible,
    centerPaneVisible,
    rightPaneVisible,
    mainPaneVisible,
    brbVisible,
    paginationVisible,

    // 토글 함수
    toggleHeader,
    toggleLeftPane,
    toggleCenterPane,
    toggleRightPane,
    toggleMainPane,
    toggleBrb,
    togglePagination,

    // 직접 설정 함수
    setRightPaneVisible
  }
}


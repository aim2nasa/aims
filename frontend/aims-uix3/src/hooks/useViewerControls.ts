/**
 * useViewerControls Hook
 * @since 2025-11-03
 *
 * PDFViewer, ImageViewer 등 모든 뷰어의 공통 확대/축소/드래그 기능 제공
 * DRY 원칙 적용 - 중복 코드 제거
 */

import { useState, useCallback, useEffect } from 'react'

export interface ViewerControlsState {
  scale: number
  position: { x: number; y: number }
  isDragging: boolean
  isModified: boolean
}

export interface ViewerControlsActions {
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseUp: () => void
}

export interface UseViewerControlsReturn extends ViewerControlsState, ViewerControlsActions {}

/**
 * 뷰어 컨트롤 Hook
 *
 * 확대/축소, 드래그, 위치 관리 등 모든 뷰어의 공통 기능 제공
 *
 * @param initialScale - 초기 scale 값 (기본값: 1.0)
 * @example
 * ```tsx
 * const controls = useViewerControls(0.8)
 *
 * return (
 *   <div onMouseDown={controls.handleMouseDown}>
 *     <img style={{ transform: `scale(${controls.scale})` }} />
 *   </div>
 * )
 * ```
 */
export const useViewerControls = (initialScale: number = 1.0): UseViewerControlsReturn => {
  const [scale, setScale] = useState(initialScale)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 확대
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(prev + 0.25, 3.0))
  }, [])

  // 축소
  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(prev - 0.25, 0.25))
  }, [])

  // 뷰 리셋 (원래 크기 및 위치로)
  const resetView = useCallback(() => {
    setScale(initialScale)
    setPosition({ x: 0, y: 0 })
  }, [initialScale])

  // 마우스 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1.0) return // 확대되지 않았으면 드래그 불가
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }, [scale, position])

  // 마우스 드래그 중
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  // 마우스 드래그 종료
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 스케일 변경 시 위치 초기화
  useEffect(() => {
    setPosition({ x: 0, y: 0 })
  }, [scale])

  // 뷰가 기본 상태에서 벗어났는지 확인
  const isModified = scale !== initialScale || position.x !== 0 || position.y !== 0

  return {
    // State
    scale,
    position,
    isDragging,
    isModified,
    // Actions
    zoomIn,
    zoomOut,
    resetView,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  }
}

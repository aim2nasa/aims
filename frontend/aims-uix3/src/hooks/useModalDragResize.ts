/**
 * useModalDragResize Hook
 * @since 2025-11-03
 *
 * 모달 드래그 및 리사이즈 기능 제공
 * - 헤더 드래그로 모달 이동
 * - 모서리/변 드래그로 크기 조절
 */

import { useState, useCallback, useEffect, useRef } from 'react'

interface ModalDragResizeState {
  position: { x: number; y: number }
  size: { width: number; height: number }
  isDragging: boolean
  isResizing: boolean
  resizeHandle: ResizeHandle | null
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface UseModalDragResizeOptions {
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

interface UseModalDragResizeReturn {
  position: { x: number; y: number }
  size: { width: number; height: number }
  isDragging: boolean
  isResizing: boolean
  modalStyle: React.CSSProperties
  headerProps: {
    onMouseDown: (e: React.MouseEvent) => void
    style: { cursor: string }
  }
  resizeHandles: Array<{
    position: ResizeHandle
    onMouseDown: (e: React.MouseEvent) => void
    style: React.CSSProperties
  }>
}

/**
 * 모달 드래그 및 리사이즈 Hook
 *
 * @example
 * ```tsx
 * const modal = useModalDragResize({
 *   initialWidth: 1400,
 *   initialHeight: 800,
 *   minWidth: 600,
 *   minHeight: 400
 * })
 *
 * return (
 *   <div style={modal.modalStyle}>
 *     <header {...modal.headerProps}>제목</header>
 *     {modal.resizeHandles.map(handle => (
 *       <div key={handle.position} {...handle} />
 *     ))}
 *   </div>
 * )
 * ```
 */
export const useModalDragResize = (
  options: UseModalDragResizeOptions = {}
): UseModalDragResizeReturn => {
  const {
    initialWidth = 1400,
    initialHeight = 800,
    minWidth = 600,
    minHeight = 400,
    maxWidth = window.innerWidth * 0.95,
    maxHeight = window.innerHeight * 0.95
  } = options

  // 초기 위치 계산 (중앙)
  const initialPosition = {
    x: (window.innerWidth - initialWidth) / 2,
    y: (window.innerHeight - initialHeight) / 2
  }

  const [state, setState] = useState<ModalDragResizeState>({
    position: initialPosition,
    size: { width: initialWidth, height: initialHeight },
    isDragging: false,
    isResizing: false,
    resizeHandle: null
  })

  const dragStartRef = useRef({ x: 0, y: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })

  // 드래그 시작
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 버튼 클릭 등은 무시
    if ((e.target as HTMLElement).tagName === 'BUTTON') return

    e.preventDefault()
    setState(prev => ({ ...prev, isDragging: true }))
    dragStartRef.current = {
      x: e.clientX - state.position.x,
      y: e.clientY - state.position.y
    }
  }, [state.position])

  // 리사이즈 시작
  const handleResizeStart = useCallback(
    (handle: ResizeHandle) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setState(prev => ({ ...prev, isResizing: true, resizeHandle: handle }))
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: state.size.width,
        height: state.size.height,
        posX: state.position.x,
        posY: state.position.y
      }
    },
    [state.size, state.position]
  )

  // 마우스 이동
  useEffect(() => {
    if (!state.isDragging && !state.isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (state.isDragging) {
        // 드래그 이동
        const newX = e.clientX - dragStartRef.current.x
        const newY = e.clientY - dragStartRef.current.y

        // 화면 밖으로 나가지 않도록 제한
        const maxX = window.innerWidth - state.size.width
        const maxY = window.innerHeight - state.size.height

        setState(prev => ({
          ...prev,
          position: {
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
          }
        }))
      } else if (state.isResizing && state.resizeHandle) {
        // 리사이즈
        const deltaX = e.clientX - resizeStartRef.current.x
        const deltaY = e.clientY - resizeStartRef.current.y

        let newWidth = resizeStartRef.current.width
        let newHeight = resizeStartRef.current.height
        let newX = resizeStartRef.current.posX
        let newY = resizeStartRef.current.posY

        const handle = state.resizeHandle

        // 가로 리사이즈
        if (handle.includes('e')) {
          newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartRef.current.width + deltaX))
        } else if (handle.includes('w')) {
          const potentialWidth = resizeStartRef.current.width - deltaX
          if (potentialWidth >= minWidth && potentialWidth <= maxWidth) {
            newWidth = potentialWidth
            newX = resizeStartRef.current.posX + deltaX
          }
        }

        // 세로 리사이즈
        if (handle.includes('s')) {
          newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStartRef.current.height + deltaY))
        } else if (handle.includes('n')) {
          const potentialHeight = resizeStartRef.current.height - deltaY
          if (potentialHeight >= minHeight && potentialHeight <= maxHeight) {
            newHeight = potentialHeight
            newY = resizeStartRef.current.posY + deltaY
          }
        }

        setState(prev => ({
          ...prev,
          size: { width: newWidth, height: newHeight },
          position: { x: newX, y: newY }
        }))
      }
    }

    const handleMouseUp = () => {
      setState(prev => ({
        ...prev,
        isDragging: false,
        isResizing: false,
        resizeHandle: null
      }))
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [state.isDragging, state.isResizing, state.resizeHandle, state.size, minWidth, minHeight, maxWidth, maxHeight])

  // 모달 스타일
  const modalStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${state.position.x}px`,
    top: `${state.position.y}px`,
    width: `${state.size.width}px`,
    height: `${state.size.height}px`,
    maxWidth: 'none',
    maxHeight: 'none',
    userSelect: state.isDragging || state.isResizing ? 'none' : 'auto'
  }

  // 헤더 props (드래그 핸들)
  const headerProps = {
    onMouseDown: handleDragStart,
    style: { cursor: state.isDragging ? 'grabbing' : 'grab' }
  }

  // 리사이즈 핸들 정의
  const resizeHandles: Array<{
    position: ResizeHandle
    onMouseDown: (e: React.MouseEvent) => void
    style: React.CSSProperties
  }> = [
    // 모서리
    { position: 'nw', onMouseDown: handleResizeStart('nw'), style: getCursorStyle('nw') },
    { position: 'ne', onMouseDown: handleResizeStart('ne'), style: getCursorStyle('ne') },
    { position: 'sw', onMouseDown: handleResizeStart('sw'), style: getCursorStyle('sw') },
    { position: 'se', onMouseDown: handleResizeStart('se'), style: getCursorStyle('se') },
    // 변
    { position: 'n', onMouseDown: handleResizeStart('n'), style: getCursorStyle('n') },
    { position: 's', onMouseDown: handleResizeStart('s'), style: getCursorStyle('s') },
    { position: 'w', onMouseDown: handleResizeStart('w'), style: getCursorStyle('w') },
    { position: 'e', onMouseDown: handleResizeStart('e'), style: getCursorStyle('e') }
  ]

  return {
    position: state.position,
    size: state.size,
    isDragging: state.isDragging,
    isResizing: state.isResizing,
    modalStyle,
    headerProps,
    resizeHandles
  }
}

// 커서 스타일 헬퍼
function getCursorStyle(handle: ResizeHandle): React.CSSProperties {
  const cursors: Record<ResizeHandle, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
    sw: 'nesw-resize'
  }
  return { cursor: cursors[handle] }
}

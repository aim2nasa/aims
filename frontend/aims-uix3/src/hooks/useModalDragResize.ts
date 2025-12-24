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
  isMaximized: boolean
  isImmersive: boolean
  preMaximizeState: {
    position: { x: number; y: number }
    size: { width: number; height: number }
  } | null
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface UseModalDragResizeOptions {
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  /** localStorage 저장 키 (위치/크기 자동 영속화) */
  storageKey?: string
}

interface UseModalDragResizeReturn {
  position: { x: number; y: number }
  size: { width: number; height: number }
  isDragging: boolean
  isResizing: boolean
  isResizedFromDefault: boolean
  isMaximized: boolean
  isImmersive: boolean
  modalStyle: React.CSSProperties
  headerProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onDoubleClick: (e: React.MouseEvent) => void
    style: { cursor: string }
  }
  resizeHandles: Array<{
    position: ResizeHandle
    onMouseDown: (e: React.MouseEvent) => void
    style: React.CSSProperties
  }>
  reset: () => void
  toggleMaximize: () => void
  toggleImmersive: () => void
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
    maxHeight = window.innerHeight * 0.95,
    storageKey
  } = options

  // localStorage에서 저장된 위치/크기 로드
  const loadSavedState = () => {
    if (!storageKey) return null
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.position && parsed.size) {
          const { x, y } = parsed.position
          // 화면 범위 내인지 확인
          if (x >= 0 && y >= 0 && x < window.innerWidth - 100 && y < window.innerHeight - 100) {
            return parsed
          }
        }
      }
    } catch {
      // 무시
    }
    return null
  }

  const savedState = loadSavedState()

  // 초기 위치 (저장된 값 또는 중앙)
  const initialPosition = savedState?.position ?? {
    x: (window.innerWidth - initialWidth) / 2,
    y: (window.innerHeight - initialHeight) / 2
  }

  // 초기 크기 (저장된 값 또는 기본값)
  const initialSize = savedState?.size ?? { width: initialWidth, height: initialHeight }

  // 초기값 저장 (리셋용) - 항상 기본값 사용
  const initialValuesRef = useRef({
    position: {
      x: (window.innerWidth - initialWidth) / 2,
      y: (window.innerHeight - initialHeight) / 2
    },
    size: { width: initialWidth, height: initialHeight }
  })

  const [state, setState] = useState<ModalDragResizeState>({
    position: initialPosition,
    size: initialSize,
    isDragging: false,
    isResizing: false,
    resizeHandle: null,
    isMaximized: false,
    isImmersive: false,
    preMaximizeState: null
  })

  const dragStartRef = useRef({ x: 0, y: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })

  // 위치/크기 변경 시 localStorage에 저장
  useEffect(() => {
    if (!storageKey) return
    // 드래그/리사이즈 중에는 저장하지 않음 (완료 후 저장)
    if (state.isDragging || state.isResizing) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        position: state.position,
        size: state.size
      }))
    } catch {
      // 무시
    }
  }, [storageKey, state.position, state.size, state.isDragging, state.isResizing])

  // 초기값과 다른지 확인 (크기만 비교)
  const isResizedFromDefault =
    state.size.width !== initialValuesRef.current.size.width ||
    state.size.height !== initialValuesRef.current.size.height

  // 초기 크기로 리셋 (위치는 유지)
  const reset = useCallback(() => {
    setState(prev => ({
      ...prev,
      size: initialValuesRef.current.size,
      isMaximized: false,
      isImmersive: false,
      preMaximizeState: null
    }))
  }, [])

  // 최대화/복원 토글
  const toggleMaximize = useCallback(() => {
    setState(prev => {
      if (prev.isMaximized) {
        // 복원: 이전 상태로 돌아가기
        if (prev.preMaximizeState) {
          return {
            ...prev,
            position: prev.preMaximizeState.position,
            size: prev.preMaximizeState.size,
            isMaximized: false,
            isImmersive: false,
            preMaximizeState: null
          }
        }
        // preMaximizeState가 없으면 초기값으로 복원
        return {
          ...prev,
          position: initialValuesRef.current.position,
          size: initialValuesRef.current.size,
          isMaximized: false,
          isImmersive: false,
          preMaximizeState: null
        }
      } else {
        // 최대화: 현재 상태 저장 후 화면 가득 채우기 (전체 화면)
        return {
          ...prev,
          preMaximizeState: {
            position: prev.position,
            size: prev.size
          },
          position: { x: 0, y: 0 },
          size: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          isMaximized: true,
          isImmersive: false
        }
      }
    })
  }, [])

  // 몰입 모드 토글 (헤더/푸터 숨김)
  const toggleImmersive = useCallback(() => {
    setState(prev => ({
      ...prev,
      isImmersive: !prev.isImmersive
    }))
  }, [])

  // 드래그 시작
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 버튼 클릭 등은 무시
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    // 최대화 상태에서는 드래그 불가
    if (state.isMaximized) return

    e.preventDefault()
    setState(prev => ({ ...prev, isDragging: true }))
    dragStartRef.current = {
      x: e.clientX - state.position.x,
      y: e.clientY - state.position.y
    }
  }, [state.position, state.isMaximized])

  // 리사이즈 시작
  const handleResizeStart = useCallback(
    (handle: ResizeHandle) => (e: React.MouseEvent) => {
      // 최대화 상태에서는 리사이즈 불가
      if (state.isMaximized) return

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
    [state.size, state.position, state.isMaximized]
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
    userSelect: state.isDragging || state.isResizing ? 'none' : 'auto',
    // 최대화/복원 애니메이션 (드래그/리사이즈 중에는 비활성화)
    transition: state.isDragging || state.isResizing ? 'none' : 'all 0.3s ease'
  }

  // 헤더 더블클릭 핸들러
  const handleHeaderDoubleClick = useCallback((e: React.MouseEvent) => {
    // 버튼 클릭은 무시
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    toggleMaximize()
  }, [toggleMaximize])

  // 헤더 props (드래그 핸들)
  const headerProps = {
    onMouseDown: handleDragStart,
    onDoubleClick: handleHeaderDoubleClick,
    style: { cursor: state.isMaximized ? 'default' : (state.isDragging ? 'grabbing' : 'grab') }
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
    isResizedFromDefault,
    isMaximized: state.isMaximized,
    isImmersive: state.isImmersive,
    modalStyle,
    headerProps,
    resizeHandles,
    reset,
    toggleMaximize,
    toggleImmersive
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

/**
 * useColumnResize - 칼럼 폭 드래그 리사이즈 훅
 *
 * 그리드 테이블의 칼럼 폭을 드래그로 조절하고,
 * localStorage에 저장하여 새로고침 후에도 유지합니다.
 * 더블클릭 시 해당 칼럼을 기본 폭으로 리셋합니다.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

/** 칼럼 정의 */
export interface ColumnDef {
  /** 칼럼 기본 폭 (CSS 값, 예: '45px', 'minmax(120px, 1fr)') */
  defaultWidth: string
  /** 리사이즈 후 사용할 px 기본값 (1fr 등 가변 폭 칼럼용) */
  defaultPx: number
  /** 최소 폭 (px) */
  minWidth: number
  /** 최대 폭 (px) */
  maxWidth?: number
  /** 리사이즈 가능 여부 */
  resizable?: boolean
}

interface UseColumnResizeOptions {
  /** localStorage 키 */
  storageKey: string
  /** 칼럼 정의 배열 */
  columns: ColumnDef[]
  /** 갭 (grid gap, px) */
  gap?: number
}

interface UseColumnResizeReturn {
  /** 현재 칼럼 폭 배열 (px, null이면 기본값 사용) */
  columnWidths: (number | null)[]
  /** gridTemplateColumns CSS 문자열 (리사이즈된 칼럼이 있을 때만 반환, 없으면 null) */
  gridTemplateColumns: string | null
  /** 리사이즈 핸들 mousedown 핸들러 */
  handleResizeStart: (columnIndex: number, e: React.MouseEvent) => void
  /** 리사이즈 핸들 더블클릭 핸들러 (기본 폭으로 리셋) */
  handleResizeReset: (columnIndex: number) => void
  /** 리사이즈 중 여부 */
  isResizing: boolean
}

/**
 * localStorage에서 칼럼 폭 로드
 */
function loadColumnWidths(storageKey: string, columnCount: number): (number | null)[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored) as (number | null)[]
      if (Array.isArray(parsed) && parsed.length === columnCount) {
        return parsed
      }
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return new Array(columnCount).fill(null)
}

/**
 * localStorage에 칼럼 폭 저장
 */
function saveColumnWidths(storageKey: string, widths: (number | null)[]): void {
  try {
    // 모든 값이 null이면 삭제
    if (widths.every(w => w === null)) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify(widths))
    }
  } catch {
    // 저장 실패 시 무시
  }
}

export function useColumnResize({
  storageKey,
  columns,
  gap: _gap = 10,
}: UseColumnResizeOptions): UseColumnResizeReturn {
  const [columnWidths, setColumnWidths] = useState<(number | null)[]>(() =>
    loadColumnWidths(storageKey, columns.length)
  )
  const [isResizing, setIsResizing] = useState(false)

  // refs for drag state (이벤트 핸들러에서 최신 값 참조)
  const dragState = useRef<{
    columnIndex: number
    startX: number
    startWidth: number
  } | null>(null)

  const columnsRef = useRef(columns)
  columnsRef.current = columns

  const columnWidthsRef = useRef(columnWidths)
  columnWidthsRef.current = columnWidths

  /**
   * gridTemplateColumns 문자열 생성
   */
  const buildGridTemplate = useCallback((widths: (number | null)[]): string | null => {
    const cols = columnsRef.current
    // 리사이즈된 칼럼이 하나도 없으면 null (CSS 기본값 사용)
    if (widths.every(w => w === null)) return null

    return widths.map((w, i) => {
      if (w === null) return cols[i].defaultWidth
      return `${w}px`
    }).join(' ')
  }, [])

  const gridTemplateColumns = buildGridTemplate(columnWidths)

  /**
   * 리사이즈 시작
   * 핸들의 부모 요소(헤더 셀)에서 실제 렌더링된 폭을 측정하여 사용
   */
  const handleResizeStart = useCallback((columnIndex: number, e: React.MouseEvent) => {
    const col = columnsRef.current[columnIndex]
    if (!col || col.resizable === false) return

    e.preventDefault()
    e.stopPropagation()

    // 실제 DOM에서 부모 셀의 렌더링된 폭 측정 (1fr 등 가변폭 칼럼에 정확)
    const handleEl = e.currentTarget as HTMLElement
    const cellEl = handleEl.parentElement
    const currentWidth = cellEl
      ? cellEl.getBoundingClientRect().width
      : (columnWidthsRef.current[columnIndex] ?? col.defaultPx)

    dragState.current = {
      columnIndex,
      startX: e.clientX,
      startWidth: currentWidth,
    }
    setIsResizing(true)

    // body에 커서 스타일 추가 (드래그 중 전체 화면에 커서 적용)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  /**
   * mousemove 핸들러 (document 레벨)
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return

      const { columnIndex, startX, startWidth } = dragState.current
      const col = columnsRef.current[columnIndex]
      if (!col) return

      const diff = e.clientX - startX
      const maxW = col.maxWidth ?? 800
      const newWidth = Math.min(maxW, Math.max(col.minWidth, startWidth + diff))

      setColumnWidths(prev => {
        const next = [...prev]
        next[columnIndex] = newWidth
        return next
      })
    }

    const handleMouseUp = () => {
      if (!dragState.current) return

      dragState.current = null
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      // 저장
      setColumnWidths(prev => {
        saveColumnWidths(storageKey, prev)
        return prev
      })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [storageKey])

  /**
   * 더블클릭: 해당 칼럼 기본 폭으로 리셋
   */
  const handleResizeReset = useCallback((columnIndex: number) => {
    setColumnWidths(prev => {
      const next = [...prev]
      next[columnIndex] = null
      saveColumnWidths(storageKey, next)
      return next
    })
  }, [storageKey])

  return {
    columnWidths,
    gridTemplateColumns,
    handleResizeStart,
    handleResizeReset,
    isResizing,
  }
}

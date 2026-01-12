/**
 * useColumnResize - 테이블 컬럼 리사이즈 훅
 * @since 2026-01-12
 *
 * 기능:
 * - 드래그로 컬럼 폭 조절
 * - 더블클릭으로 기본값 복원
 * - localStorage 저장/복원
 * - 최소/최대 폭 제한
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

export interface ColumnConfig {
  id: string;
  minWidth: number;
  maxWidth: number;
}

export interface UseColumnResizeOptions {
  /** localStorage 키 (예: 'contracts-tab') */
  storageKey: string;
  /** 컬럼 설정 배열 */
  columns: ColumnConfig[];
  /** 기본 폭 (동적 계산값) */
  defaultWidths: Record<string, number>;
}

export interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  style: React.CSSProperties;
  className: string;
}

export interface UseColumnResizeReturn {
  /** 현재 컬럼 폭들 */
  columnWidths: Record<string, number>;
  /** 리사이즈 중 여부 */
  isResizing: boolean;
  /** 리사이즈 중인 컬럼 ID */
  resizingColumn: string | null;
  /** 리사이즈 핸들 props 생성 */
  getResizeHandleProps: (columnId: string) => ResizeHandleProps;
  /** 모든 컬럼 폭 기본값으로 리셋 */
  resetWidths: () => void;
  /** 특정 컬럼 폭 기본값으로 리셋 */
  resetColumnWidth: (columnId: string) => void;
  /** 방금 리사이즈가 완료되었는지 확인 (클릭 이벤트 무시용) */
  wasJustResizing: () => boolean;
}

const STORAGE_PREFIX = 'aims_column_widths_';

/**
 * 값을 최소/최대 범위로 제한
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * localStorage에서 저장된 폭 로드
 */
function loadStoredWidths(storageKey: string): Record<string, number> | null {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[useColumnResize] localStorage 로드 실패:', e);
  }
  return null;
}

/**
 * localStorage에 폭 저장
 */
function saveWidths(storageKey: string, widths: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widths));
  } catch (e) {
    console.warn('[useColumnResize] localStorage 저장 실패:', e);
  }
}

export function useColumnResize(options: UseColumnResizeOptions): UseColumnResizeReturn {
  const { storageKey, columns, defaultWidths } = options;

  // 컬럼 설정 맵 생성
  const columnsMap = useMemo(() => {
    const map: Record<string, ColumnConfig> = {};
    columns.forEach(col => {
      map[col.id] = col;
    });
    return map;
  }, [columns]);

  // 초기 폭 계산 (저장된 값 또는 기본값)
  const getInitialWidths = useCallback(() => {
    const stored = loadStoredWidths(storageKey);
    const initial: Record<string, number> = {};

    columns.forEach(col => {
      if (stored && typeof stored[col.id] === 'number') {
        // 저장된 값이 있으면 사용 (범위 제한 적용)
        initial[col.id] = clamp(stored[col.id], col.minWidth, col.maxWidth);
      } else if (typeof defaultWidths[col.id] === 'number') {
        // 기본값 사용
        initial[col.id] = clamp(defaultWidths[col.id], col.minWidth, col.maxWidth);
      } else {
        // fallback: 최소값
        initial[col.id] = col.minWidth;
      }
    });

    return initial;
  }, [storageKey, columns, defaultWidths]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(getInitialWidths);
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);

  // 드래그 시작 시점 정보
  const dragStartRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // 리사이즈 완료 직후 플래그 (클릭 이벤트 무시용)
  const justFinishedResizingRef = useRef(false);
  const justFinishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // defaultWidths가 변경되면 저장된 값이 없는 컬럼만 업데이트
  useEffect(() => {
    const stored = loadStoredWidths(storageKey);

    setColumnWidths(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      columns.forEach(col => {
        // 저장된 값이 없고, 현재 값이 이전 기본값인 경우에만 업데이트
        if (!stored || typeof stored[col.id] !== 'number') {
          const newDefault = defaultWidths[col.id];
          if (typeof newDefault === 'number') {
            const clamped = clamp(newDefault, col.minWidth, col.maxWidth);
            if (updated[col.id] !== clamped) {
              updated[col.id] = clamped;
              hasChanges = true;
            }
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [defaultWidths, columns, storageKey]);

  // 마우스 이동 핸들러
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current) return;

    const { columnId, startX, startWidth } = dragStartRef.current;
    const config = columnsMap[columnId];
    if (!config) return;

    const deltaX = e.clientX - startX;
    const newWidth = clamp(startWidth + deltaX, config.minWidth, config.maxWidth);

    setColumnWidths(prev => ({
      ...prev,
      [columnId]: newWidth
    }));
  }, [columnsMap]);

  // 마우스 업 핸들러
  const handleMouseUp = useCallback(() => {
    if (dragStartRef.current) {
      // localStorage에 저장
      setColumnWidths(current => {
        saveWidths(storageKey, current);
        return current;
      });

      // 리사이즈 완료 직후 플래그 설정 (클릭 이벤트 무시용)
      justFinishedResizingRef.current = true;

      // 이전 타이머 정리
      if (justFinishedTimerRef.current) {
        clearTimeout(justFinishedTimerRef.current);
      }

      // 200ms 후 플래그 해제
      justFinishedTimerRef.current = setTimeout(() => {
        justFinishedResizingRef.current = false;
        justFinishedTimerRef.current = null;
      }, 200);
    }

    dragStartRef.current = null;
    setIsResizing(false);
    setResizingColumn(null);

    // 텍스트 선택 복원
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [storageKey]);

  // 전역 이벤트 리스너 등록/해제
  useEffect(() => {
    if (!isResizing) return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // 드래그 시작 핸들러
  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const currentWidth = columnWidths[columnId];
    if (typeof currentWidth !== 'number') return;

    dragStartRef.current = {
      columnId,
      startX: e.clientX,
      startWidth: currentWidth
    };

    setIsResizing(true);
    setResizingColumn(columnId);

    // 드래그 중 텍스트 선택 방지
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [columnWidths]);

  // 더블클릭 핸들러 (기본값으로 리셋)
  const handleDoubleClick = useCallback((columnId: string) => {
    const config = columnsMap[columnId];
    if (!config) return;

    const defaultWidth = defaultWidths[columnId];
    if (typeof defaultWidth !== 'number') return;

    const newWidth = clamp(defaultWidth, config.minWidth, config.maxWidth);

    setColumnWidths(prev => {
      const updated = { ...prev, [columnId]: newWidth };
      saveWidths(storageKey, updated);
      return updated;
    });
  }, [columnsMap, defaultWidths, storageKey]);

  // 리사이즈 핸들 props 생성
  const getResizeHandleProps = useCallback((columnId: string): ResizeHandleProps => {
    return {
      onMouseDown: (e: React.MouseEvent) => handleResizeStart(columnId, e),
      onDoubleClick: () => handleDoubleClick(columnId),
      style: {
        position: 'absolute',
        right: -3,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
        zIndex: 10
      },
      className: `column-resize-handle${resizingColumn === columnId ? ' column-resize-handle--active' : ''}`
    };
  }, [handleResizeStart, handleDoubleClick, resizingColumn]);

  // 모든 폭 기본값으로 리셋
  const resetWidths = useCallback(() => {
    const reset: Record<string, number> = {};

    columns.forEach(col => {
      const defaultWidth = defaultWidths[col.id];
      if (typeof defaultWidth === 'number') {
        reset[col.id] = clamp(defaultWidth, col.minWidth, col.maxWidth);
      } else {
        reset[col.id] = col.minWidth;
      }
    });

    setColumnWidths(reset);
    saveWidths(storageKey, reset);
  }, [columns, defaultWidths, storageKey]);

  // 특정 컬럼 폭 기본값으로 리셋
  const resetColumnWidth = useCallback((columnId: string) => {
    handleDoubleClick(columnId);
  }, [handleDoubleClick]);

  // 방금 리사이즈가 완료되었는지 확인 (클릭 이벤트 무시용)
  const wasJustResizing = useCallback(() => {
    return justFinishedResizingRef.current;
  }, []);

  return {
    columnWidths,
    isResizing,
    resizingColumn,
    getResizeHandleProps,
    resetWidths,
    resetColumnWidth,
    wasJustResizing
  };
}

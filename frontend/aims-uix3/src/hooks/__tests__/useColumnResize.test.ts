/**
 * useColumnResize Hook Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. 초기화 - localStorage 저장/복원
 * 2. clamp 함수 - 최소/최대 폭 제한
 * 3. 리사이즈 동작 - 드래그 이벤트 처리
 * 4. 더블클릭 리셋 - 기본값 복원
 * 5. resetWidths - 모든 컬럼 리셋
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useColumnResize, type ColumnConfig } from '../useColumnResize';

describe('useColumnResize', () => {
  const STORAGE_PREFIX = 'aims_column_widths_';
  const TEST_STORAGE_KEY = 'test-table';

  const mockColumns: ColumnConfig[] = [
    { id: 'name', minWidth: 100, maxWidth: 400 },
    { id: 'date', minWidth: 80, maxWidth: 200 },
    { id: 'status', minWidth: 60, maxWidth: 150 },
  ];

  const mockDefaultWidths = {
    name: 200,
    date: 120,
    status: 100,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // =============================================================================
  // 1. 초기화 테스트
  // =============================================================================

  describe('초기화', () => {
    it('localStorage에 저장된 값이 없으면 기본값을 사용해야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(200);
      expect(result.current.columnWidths.date).toBe(120);
      expect(result.current.columnWidths.status).toBe(100);
    });

    it('localStorage에 저장된 값이 있으면 복원해야 함', () => {
      const savedWidths = { name: 250, date: 150, status: 80 };
      localStorage.setItem(
        STORAGE_PREFIX + TEST_STORAGE_KEY,
        JSON.stringify(savedWidths)
      );

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(250);
      expect(result.current.columnWidths.date).toBe(150);
      expect(result.current.columnWidths.status).toBe(80);
    });

    it('저장된 값이 범위를 벗어나면 제한해야 함', () => {
      const savedWidths = { name: 500, date: 50, status: 100 }; // 500 > maxWidth, 50 < minWidth
      localStorage.setItem(
        STORAGE_PREFIX + TEST_STORAGE_KEY,
        JSON.stringify(savedWidths)
      );

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(400); // maxWidth로 제한
      expect(result.current.columnWidths.date).toBe(80); // minWidth로 제한
    });

    it('일부 컬럼만 저장되어 있으면 나머지는 기본값 사용', () => {
      const savedWidths = { name: 300 }; // date, status 없음
      localStorage.setItem(
        STORAGE_PREFIX + TEST_STORAGE_KEY,
        JSON.stringify(savedWidths)
      );

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(300); // 저장된 값
      expect(result.current.columnWidths.date).toBe(120); // 기본값
      expect(result.current.columnWidths.status).toBe(100); // 기본값
    });

    it('localStorage JSON 파싱 실패 시 기본값 사용', () => {
      localStorage.setItem(STORAGE_PREFIX + TEST_STORAGE_KEY, 'invalid-json');

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(200);
    });
  });

  // =============================================================================
  // 2. clamp 함수 테스트 (폭 제한)
  // =============================================================================

  describe('폭 제한 (clamp)', () => {
    it('기본값이 최소값보다 작으면 최소값으로 제한', () => {
      const columns: ColumnConfig[] = [
        { id: 'col', minWidth: 100, maxWidth: 300 },
      ];
      const defaultWidths = { col: 50 }; // 50 < 100

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: 'clamp-test',
          columns,
          defaultWidths,
        })
      );

      expect(result.current.columnWidths.col).toBe(100);
    });

    it('기본값이 최대값보다 크면 최대값으로 제한', () => {
      const columns: ColumnConfig[] = [
        { id: 'col', minWidth: 100, maxWidth: 300 },
      ];
      const defaultWidths = { col: 400 }; // 400 > 300

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: 'clamp-test',
          columns,
          defaultWidths,
        })
      );

      expect(result.current.columnWidths.col).toBe(300);
    });

    it('기본값이 없으면 최소값 사용', () => {
      const columns: ColumnConfig[] = [
        { id: 'col', minWidth: 150, maxWidth: 300 },
      ];
      const defaultWidths = {}; // col 없음

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: 'clamp-test',
          columns,
          defaultWidths,
        })
      );

      expect(result.current.columnWidths.col).toBe(150);
    });
  });

  // =============================================================================
  // 3. 리사이즈 핸들 props 테스트
  // =============================================================================

  describe('getResizeHandleProps', () => {
    it('리사이즈 핸들 props를 반환해야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      const props = result.current.getResizeHandleProps('name');

      expect(props).toHaveProperty('onMouseDown');
      expect(props).toHaveProperty('onClick');
      expect(props).toHaveProperty('onDoubleClick');
      expect(props).toHaveProperty('style');
      expect(props).toHaveProperty('className');
    });

    it('className에 column-resize-handle이 포함되어야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      const props = result.current.getResizeHandleProps('name');

      expect(props.className).toContain('column-resize-handle');
    });
  });

  // =============================================================================
  // 4. 리셋 기능 테스트
  // =============================================================================

  describe('resetWidths', () => {
    it('모든 컬럼을 기본값으로 리셋해야 함', () => {
      // 저장된 값으로 시작
      const savedWidths = { name: 350, date: 180, status: 120 };
      localStorage.setItem(
        STORAGE_PREFIX + TEST_STORAGE_KEY,
        JSON.stringify(savedWidths)
      );

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.columnWidths.name).toBe(350);

      act(() => {
        result.current.resetWidths();
      });

      expect(result.current.columnWidths.name).toBe(200);
      expect(result.current.columnWidths.date).toBe(120);
      expect(result.current.columnWidths.status).toBe(100);
    });

    it('리셋 후 localStorage에도 저장되어야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      act(() => {
        result.current.resetWidths();
      });

      const stored = JSON.parse(
        localStorage.getItem(STORAGE_PREFIX + TEST_STORAGE_KEY) || '{}'
      );
      expect(stored.name).toBe(200);
    });
  });

  describe('resetColumnWidth', () => {
    it('특정 컬럼만 기본값으로 리셋해야 함', () => {
      const savedWidths = { name: 350, date: 180, status: 120 };
      localStorage.setItem(
        STORAGE_PREFIX + TEST_STORAGE_KEY,
        JSON.stringify(savedWidths)
      );

      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      act(() => {
        result.current.resetColumnWidth('name');
      });

      expect(result.current.columnWidths.name).toBe(200); // 리셋됨
      expect(result.current.columnWidths.date).toBe(180); // 유지
      expect(result.current.columnWidths.status).toBe(120); // 유지
    });
  });

  // =============================================================================
  // 5. 상태 테스트
  // =============================================================================

  describe('상태', () => {
    it('초기 isResizing은 false여야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.isResizing).toBe(false);
    });

    it('초기 resizingColumn은 null이어야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.resizingColumn).toBeNull();
    });

    it('wasJustResizing은 초기에 false를 반환해야 함', () => {
      const { result } = renderHook(() =>
        useColumnResize({
          storageKey: TEST_STORAGE_KEY,
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result.current.wasJustResizing()).toBe(false);
    });
  });

  // =============================================================================
  // 6. 다른 storageKey 간 독립성 테스트
  // =============================================================================

  describe('storageKey 독립성', () => {
    it('다른 storageKey는 서로 영향을 주지 않아야 함', () => {
      const savedWidths1 = { name: 300 };
      const savedWidths2 = { name: 350 };

      localStorage.setItem(STORAGE_PREFIX + 'table-1', JSON.stringify(savedWidths1));
      localStorage.setItem(STORAGE_PREFIX + 'table-2', JSON.stringify(savedWidths2));

      const { result: result1 } = renderHook(() =>
        useColumnResize({
          storageKey: 'table-1',
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      const { result: result2 } = renderHook(() =>
        useColumnResize({
          storageKey: 'table-2',
          columns: mockColumns,
          defaultWidths: mockDefaultWidths,
        })
      );

      expect(result1.current.columnWidths.name).toBe(300);
      expect(result2.current.columnWidths.name).toBe(350);
    });
  });
});

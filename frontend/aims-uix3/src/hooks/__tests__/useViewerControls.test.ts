/**
 * useViewerControls Hook Tests
 * @since 2026-02-05
 *
 * 테스트 범위:
 * 1. 초기 상태
 * 2. zoomIn / zoomOut - 확대/축소 범위 제한
 * 3. 회전 - rotateRight / rotateLeft 정규화
 * 4. 드래그 조건 - scale > 1.0일 때만 가능
 * 5. resetView / resetPosition
 * 6. isModified 계산
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewerControls } from '../useViewerControls';

describe('useViewerControls', () => {
  // =============================================================================
  // 1. 초기 상태 테스트
  // =============================================================================

  describe('초기 상태', () => {
    it('기본 초기 scale은 1.0이어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      expect(result.current.scale).toBe(1.0);
    });

    it('커스텀 초기 scale을 사용할 수 있어야 함', () => {
      const { result } = renderHook(() => useViewerControls(0.8));

      expect(result.current.scale).toBe(0.8);
    });

    it('초기 position은 { x: 0, y: 0 }이어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      expect(result.current.position).toEqual({ x: 0, y: 0 });
    });

    it('초기 isDragging은 false여야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      expect(result.current.isDragging).toBe(false);
    });

    it('초기 rotation은 0이어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      expect(result.current.rotation).toBe(0);
    });

    it('초기 isModified는 false여야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      expect(result.current.isModified).toBe(false);
    });
  });

  // =============================================================================
  // 2. zoomIn / zoomOut 테스트
  // =============================================================================

  describe('zoomIn', () => {
    it('scale을 0.25씩 증가시켜야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.scale).toBe(1.25);
    });

    it('최대 3.0까지만 확대해야 함', () => {
      const { result } = renderHook(() => useViewerControls(2.9));

      act(() => {
        result.current.zoomIn(); // 2.9 + 0.25 = 3.15 → 3.0
      });

      expect(result.current.scale).toBe(3.0);
    });

    it('이미 3.0이면 더 이상 확대하지 않아야 함', () => {
      const { result } = renderHook(() => useViewerControls(3.0));

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.scale).toBe(3.0);
    });

    it('여러 번 확대해도 최대값을 넘지 않아야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        for (let i = 0; i < 20; i++) {
          result.current.zoomIn();
        }
      });

      expect(result.current.scale).toBe(3.0);
    });
  });

  describe('zoomOut', () => {
    it('scale을 0.25씩 감소시켜야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.scale).toBe(0.75);
    });

    it('최소 0.25까지만 축소해야 함', () => {
      const { result } = renderHook(() => useViewerControls(0.4));

      act(() => {
        result.current.zoomOut(); // 0.4 - 0.25 = 0.15 → 0.25
      });

      expect(result.current.scale).toBe(0.25);
    });

    it('이미 0.25이면 더 이상 축소하지 않아야 함', () => {
      const { result } = renderHook(() => useViewerControls(0.25));

      act(() => {
        result.current.zoomOut();
      });

      expect(result.current.scale).toBe(0.25);
    });
  });

  // =============================================================================
  // 3. 회전 테스트
  // =============================================================================

  describe('rotateRight', () => {
    it('시계방향 90도 회전해야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.rotateRight();
      });

      expect(result.current.rotation).toBe(90);
    });

    it('360도에서 0으로 정규화되어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.rotateRight(); // 90
        result.current.rotateRight(); // 180
        result.current.rotateRight(); // 270
        result.current.rotateRight(); // 360 → 0
      });

      expect(result.current.rotation).toBe(0);
    });
  });

  describe('rotateLeft', () => {
    it('반시계방향 90도 회전해야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.rotateLeft();
      });

      expect(result.current.rotation).toBe(270); // -90 + 360 = 270
    });

    it('0에서 270으로 정규화되어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.rotateLeft();
      });

      expect(result.current.rotation).toBe(270);
    });

    it('여러 번 회전해도 0-359 범위 유지', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        for (let i = 0; i < 8; i++) {
          result.current.rotateLeft();
        }
      });

      expect(result.current.rotation).toBe(0);
    });
  });

  // =============================================================================
  // 4. 드래그 조건 테스트
  // =============================================================================

  describe('드래그 조건', () => {
    it('scale <= 1.0이면 드래그가 시작되지 않아야 함', () => {
      const { result } = renderHook(() => useViewerControls(1.0));

      const mockEvent = {
        clientX: 100,
        clientY: 100,
      } as React.MouseEvent;

      act(() => {
        result.current.handleMouseDown(mockEvent);
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('scale > 1.0이면 드래그가 시작되어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      // 먼저 확대
      act(() => {
        result.current.zoomIn(); // 1.25
      });

      const mockEvent = {
        clientX: 100,
        clientY: 100,
      } as React.MouseEvent;

      act(() => {
        result.current.handleMouseDown(mockEvent);
      });

      expect(result.current.isDragging).toBe(true);
    });

    it('handleMouseUp으로 드래그를 종료해야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.zoomIn();
      });

      const mockEvent = {
        clientX: 100,
        clientY: 100,
      } as React.MouseEvent;

      act(() => {
        result.current.handleMouseDown(mockEvent);
      });

      expect(result.current.isDragging).toBe(true);

      act(() => {
        result.current.handleMouseUp();
      });

      expect(result.current.isDragging).toBe(false);
    });
  });

  // =============================================================================
  // 5. 리셋 기능 테스트
  // =============================================================================

  describe('resetView', () => {
    it('scale, position, rotation을 초기값으로 리셋해야 함', () => {
      const { result } = renderHook(() => useViewerControls(0.8));

      // 상태 변경
      act(() => {
        result.current.zoomIn(); // scale 변경
        result.current.rotateRight(); // rotation 변경
      });

      expect(result.current.scale).not.toBe(0.8);
      expect(result.current.rotation).not.toBe(0);

      // 리셋
      act(() => {
        result.current.resetView();
      });

      expect(result.current.scale).toBe(0.8);
      expect(result.current.position).toEqual({ x: 0, y: 0 });
      expect(result.current.rotation).toBe(0);
    });
  });

  describe('resetPosition', () => {
    it('position만 리셋하고 scale은 유지해야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      // scale 변경
      act(() => {
        result.current.zoomIn(); // 1.25
      });

      const currentScale = result.current.scale;

      // 포지션 리셋
      act(() => {
        result.current.resetPosition();
      });

      expect(result.current.scale).toBe(currentScale);
      expect(result.current.position).toEqual({ x: 0, y: 0 });
    });
  });

  // =============================================================================
  // 6. isModified 계산 테스트
  // =============================================================================

  describe('isModified', () => {
    it('scale이 변경되면 true여야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.zoomIn();
      });

      expect(result.current.isModified).toBe(true);
    });

    it('rotation이 변경되면 true여야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.rotateRight();
      });

      expect(result.current.isModified).toBe(true);
    });

    it('resetView 후 false여야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      act(() => {
        result.current.zoomIn();
        result.current.rotateRight();
      });

      expect(result.current.isModified).toBe(true);

      act(() => {
        result.current.resetView();
      });

      expect(result.current.isModified).toBe(false);
    });

    it('initialScale이 다르면 기준이 달라져야 함', () => {
      const { result } = renderHook(() => useViewerControls(0.5));

      // 초기 상태에서 isModified는 false
      expect(result.current.isModified).toBe(false);

      // scale을 0.75로 변경
      act(() => {
        result.current.zoomIn(); // 0.75
      });

      expect(result.current.isModified).toBe(true);
    });
  });

  // =============================================================================
  // 7. scale 변경 시 position 초기화 테스트
  // =============================================================================

  describe('scale 변경 시 position 초기화', () => {
    it('zoomIn 시 position이 초기화되어야 함', () => {
      const { result } = renderHook(() => useViewerControls());

      // 드래그로 position 변경을 시뮬레이션
      // (실제로는 scale > 1.0일 때만 드래그 가능)
      act(() => {
        result.current.zoomIn(); // 1.25
      });

      // scale이 변경되면 position은 초기화됨
      expect(result.current.position).toEqual({ x: 0, y: 0 });
    });

    it('zoomOut 시 position이 초기화되어야 함', () => {
      const { result } = renderHook(() => useViewerControls(1.5));

      act(() => {
        result.current.zoomOut(); // 1.25
      });

      expect(result.current.position).toEqual({ x: 0, y: 0 });
    });
  });
});

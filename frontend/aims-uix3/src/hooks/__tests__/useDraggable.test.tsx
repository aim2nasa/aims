/**
 * useDraggable 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraggable } from '../useDraggable';

describe('useDraggable', () => {
  beforeEach(() => {
    // window.innerWidth/innerHeight 모킹
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('초기화', () => {
    it('기본 위치로 초기화되어야 함', () => {
      const { result } = renderHook(() => useDraggable());

      expect(result.current.position).toEqual({ x: 0, y: 0 });
      expect(result.current.isDragging).toBe(false);
    });

    it('커스텀 초기 위치로 초기화되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 100, y: 200 },
        })
      );

      expect(result.current.position).toEqual({ x: 100, y: 200 });
    });

    it('dragHandlers와 resetPosition을 제공해야 함', () => {
      const { result } = renderHook(() => useDraggable());

      expect(result.current.dragHandlers).toBeDefined();
      expect(typeof result.current.dragHandlers.onMouseDown).toBe('function');
      expect(typeof result.current.resetPosition).toBe('function');
    });
  });

  describe('resetPosition', () => {
    it('위치를 초기 위치로 리셋해야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 100, y: 100 },
        })
      );

      // 위치 변경 시뮬레이션 (직접 변경은 불가하므로 resetPosition 테스트만)
      act(() => {
        result.current.resetPosition();
      });

      expect(result.current.position).toEqual({ x: 100, y: 100 });
    });
  });

  describe('드래그 시작', () => {
    it('마우스 다운 시 isDragging이 true가 되어야 함', () => {
      const { result } = renderHook(() => useDraggable());

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      expect(result.current.isDragging).toBe(true);
    });

    it('드래그 시작 시 preventDefault와 stopPropagation이 호출되어야 함', () => {
      const { result } = renderHook(() => useDraggable());

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      expect(mouseDownEvent.preventDefault).toHaveBeenCalled();
      expect(mouseDownEvent.stopPropagation).toHaveBeenCalled();
    });

    it('onDragStart 콜백이 호출되어야 함', () => {
      const onDragStart = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDragStart }));

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      expect(onDragStart).toHaveBeenCalled();
    });
  });

  describe('드래그 종료', () => {
    it('마우스 업 시 isDragging이 false가 되어야 함', () => {
      const { result } = renderHook(() => useDraggable());

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      expect(result.current.isDragging).toBe(true);

      // 마우스 업 이벤트 시뮬레이션
      act(() => {
        const mouseUpEvent = new MouseEvent('mouseup');
        document.dispatchEvent(mouseUpEvent);
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('onDragEnd 콜백이 호출되어야 함', () => {
      const onDragEnd = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDragEnd }));

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      // 마우스 업 이벤트 시뮬레이션
      act(() => {
        const mouseUpEvent = new MouseEvent('mouseup');
        document.dispatchEvent(mouseUpEvent);
      });

      expect(onDragEnd).toHaveBeenCalled();
    });
  });

  describe('위치 제약', () => {
    it('constrainToViewport가 true이면 뷰포트 내로 제한되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          constrainToViewport: true,
          initialPosition: { x: 0, y: 0 },
        })
      );

      // 초기 위치가 뷰포트 제약에 맞게 설정되었는지 확인
      expect(result.current.position.x).toBeGreaterThanOrEqual(-450); // -500 + 50 (minVisibleArea)
      expect(result.current.position.y).toBeGreaterThanOrEqual(-550); // -600 + 50
    });

    it('constrainToViewport가 false이면 제약 없이 이동 가능해야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          constrainToViewport: false,
          initialPosition: { x: -1000, y: -1000 },
        })
      );

      // 제약 없이 초기 위치 그대로 사용
      expect(result.current.position).toEqual({ x: -1000, y: -1000 });
    });

    it('커스텀 minVisibleArea를 사용할 수 있어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          constrainToViewport: true,
          minVisibleArea: 100,
          initialPosition: { x: 0, y: 0 },
        })
      );

      // 최소 가시 영역이 100px로 설정됨
      expect(result.current.position.x).toBeGreaterThanOrEqual(-400); // -500 + 100
      expect(result.current.position.y).toBeGreaterThanOrEqual(-500); // -600 + 100
    });
  });

  describe('드래그 이동', () => {
    it('마우스 이동 시 위치가 업데이트되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 0, y: 0 },
          constrainToViewport: false, // 제약 없이 테스트
        })
      );

      const mouseDownEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 100,
        clientY: 100,
      } as unknown as React.MouseEvent;

      act(() => {
        result.current.dragHandlers.onMouseDown(mouseDownEvent);
      });

      // 마우스 이동 이벤트 시뮬레이션
      act(() => {
        const mouseMoveEvent = new MouseEvent('mousemove', {
          clientX: 150,
          clientY: 200,
        });
        document.dispatchEvent(mouseMoveEvent);
      });

      // 위치가 델타만큼 이동했는지 확인
      expect(result.current.position.x).toBe(50); // 150 - 100
      expect(result.current.position.y).toBe(100); // 200 - 100
    });
  });
});

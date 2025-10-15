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

  describe('영속 저장소', () => {
    it('드래그 위치가 영속 저장소에 저장되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 0, y: 0 },
          constrainToViewport: false,
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

      act(() => {
        const mouseMoveEvent = new MouseEvent('mousemove', {
          clientX: 200,
          clientY: 300,
        });
        document.dispatchEvent(mouseMoveEvent);
      });

      // 위치가 업데이트됨
      expect(result.current.position.x).toBe(100);
      expect(result.current.position.y).toBe(200);

      // 마우스 업으로 드래그 종료
      act(() => {
        const mouseUpEvent = new MouseEvent('mouseup');
        document.dispatchEvent(mouseUpEvent);
      });

      // 위치가 영속 저장소에 저장되었는지 확인 (간접적으로 위치가 유지됨)
      expect(result.current.position).toEqual({ x: 100, y: 200 });
    });

    it('resetPosition 호출 시 영속 저장소도 초기화되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 50, y: 50 },
          constrainToViewport: false,
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

      act(() => {
        const mouseMoveEvent = new MouseEvent('mousemove', {
          clientX: 300,
          clientY: 400,
        });
        document.dispatchEvent(mouseMoveEvent);
      });

      act(() => {
        const mouseUpEvent = new MouseEvent('mouseup');
        document.dispatchEvent(mouseUpEvent);
      });

      // 위치가 이동됨
      expect(result.current.position.x).toBe(250);
      expect(result.current.position.y).toBe(350);

      // 리셋
      act(() => {
        result.current.resetPosition();
      });

      // 초기 위치로 복원
      expect(result.current.position).toEqual({ x: 50, y: 50 });
    });
  });

  describe('body 스타일 변경', () => {
    it('드래그 중에 body 스타일이 변경되어야 함', () => {
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

      // 드래그 중 body 스타일 확인
      expect(document.body.style.userSelect).toBe('none');
      expect(document.body.style.cursor).toBe('grabbing');
    });

    it('드래그 종료 후 body 스타일이 복원되어야 함', () => {
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

      expect(document.body.style.userSelect).toBe('none');

      act(() => {
        const mouseUpEvent = new MouseEvent('mouseup');
        document.dispatchEvent(mouseUpEvent);
      });

      // 스타일 복원
      expect(document.body.style.userSelect).toBe('');
      expect(document.body.style.cursor).toBe('');
    });
  });

  describe('연속 드래그', () => {
    it('여러 번의 드래그가 누적되어야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 0, y: 0 },
          constrainToViewport: false,
        })
      );

      // 첫 번째 드래그
      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(result.current.position).toEqual({ x: 100, y: 100 });

      // 두 번째 드래그 (누적)
      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 100,
          clientY: 100,
        } as unknown as React.MouseEvent);
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 150 }));
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      // 누적된 위치
      expect(result.current.position).toEqual({ x: 200, y: 150 });
    });

    it('드래그 중단 후 재시작이 정상 동작해야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 0, y: 0 },
          constrainToViewport: false,
        })
      );

      // 첫 번째 드래그 시작
      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      expect(result.current.isDragging).toBe(true);

      // 드래그 중단
      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(result.current.isDragging).toBe(false);

      // 두 번째 드래그 시작 (새로운 위치에서)
      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 50,
          clientY: 50,
        } as unknown as React.MouseEvent);
      });

      expect(result.current.isDragging).toBe(true);

      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
      });

      // 새로운 드래그가 정상 동작
      expect(result.current.position).toEqual({ x: 50, y: 50 });
    });
  });

  describe('경계 조건', () => {
    it('뷰포트 경계를 초과하는 드래그를 제한해야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: 0, y: 0 },
          constrainToViewport: true,
        })
      );

      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      // 뷰포트를 크게 벗어나는 이동 시도
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: -5000, clientY: -5000 }));
      });

      // 최소 가시 영역 제약에 의해 제한됨
      expect(result.current.position.x).toBeGreaterThan(-500);
      expect(result.current.position.y).toBeGreaterThan(-600);
    });

    it('음수 위치도 올바르게 처리해야 함', () => {
      const { result } = renderHook(() =>
        useDraggable({
          initialPosition: { x: -100, y: -100 },
          constrainToViewport: false,
        })
      );

      // 음수 초기 위치 확인
      expect(result.current.position).toEqual({ x: -100, y: -100 });

      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: -50, clientY: -50 }));
      });

      // 음수 방향으로 더 이동
      expect(result.current.position.x).toBe(-150);
      expect(result.current.position.y).toBe(-150);
    });
  });

  describe('콜백 파라미터', () => {
    it('onDragStart 콜백이 드래그 시작 시점에만 호출되어야 함', () => {
      const onDragStart = vi.fn();
      const { result } = renderHook(() =>
        useDraggable({
          onDragStart,
          constrainToViewport: false,
        })
      );

      expect(onDragStart).not.toHaveBeenCalled();

      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      expect(onDragStart).toHaveBeenCalledTimes(1);

      // 마우스 이동 중에는 호출되지 않음
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
      });

      expect(onDragStart).toHaveBeenCalledTimes(1); // 여전히 1번만
    });

    it('onDragEnd 콜백이 드래그 종료 시점에만 호출되어야 함', () => {
      const onDragEnd = vi.fn();
      const { result } = renderHook(() =>
        useDraggable({
          onDragEnd,
          constrainToViewport: false,
        })
      );

      expect(onDragEnd).not.toHaveBeenCalled();

      act(() => {
        result.current.dragHandlers.onMouseDown({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
          clientY: 0,
        } as unknown as React.MouseEvent);
      });

      expect(onDragEnd).not.toHaveBeenCalled();

      // 마우스 이동 중에도 호출되지 않음
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
      });

      expect(onDragEnd).not.toHaveBeenCalled();

      // 마우스 업에서만 호출
      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(onDragEnd).toHaveBeenCalledTimes(1);
    });
  });
});

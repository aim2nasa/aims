import { useState, useCallback, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

interface DraggableOptions {
  initialPosition?: Position;
  constrainToViewport?: boolean;
  minVisibleArea?: number; // 최소 가시 영역 픽셀
}

interface DraggableReturn {
  position: Position;
  isDragging: boolean;
  dragHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
  resetPosition: () => void;
}

export const useDraggable = (options: DraggableOptions = {}): DraggableReturn => {
  const {
    initialPosition = { x: 0, y: 0 },
    constrainToViewport = true,
    minVisibleArea = 50 // 기본 최소 가시 영역 50px
  } = options;

  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPos: Position } | null>(null);

  const constrainPosition = useCallback((pos: Position): Position => {
    if (!constrainToViewport) return pos;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 모달 크기를 고려한 제약 (최대 500px 너비, 600px 높이 가정)
    const modalWidth = 500;
    const modalHeight = 600;

    // 최소 가시 영역을 확보하면서 더 자유로운 이동 허용
    return {
      x: Math.max(
        -modalWidth + minVisibleArea,
        Math.min(viewportWidth - minVisibleArea, pos.x)
      ),
      y: Math.max(
        -modalHeight + minVisibleArea,
        Math.min(viewportHeight - minVisibleArea, pos.y)
      )
    };
  }, [constrainToViewport, minVisibleArea]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: position
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      const newPosition = {
        x: dragRef.current.startPos.x + deltaX,
        y: dragRef.current.startPos.y + deltaY
      };

      setPosition(constrainPosition(newPosition));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, constrainPosition]);

  const resetPosition = useCallback(() => {
    setPosition(initialPosition);
  }, [initialPosition]);

  return {
    position,
    isDragging,
    dragHandlers: {
      onMouseDown: handleMouseDown
    },
    resetPosition
  };
};
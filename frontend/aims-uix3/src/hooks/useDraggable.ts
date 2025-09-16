import { useState, useCallback, useRef, useEffect } from 'react';

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

// 모달 위치 영속화를 위한 정적 저장소 (컴포넌트 리마운트와 독립)
const persistentPositionStorage = new Map<string, Position>();

export const useDraggable = (options: DraggableOptions = {}): DraggableReturn => {
  const {
    initialPosition = { x: 0, y: 0 },
    constrainToViewport = true,
    minVisibleArea = 50 // 기본 최소 가시 영역 50px
  } = options;

  // 고유 키를 생성하여 여러 드래그 가능한 요소 구분
  const storageKey = useRef(`draggable-${Date.now()}-${Math.random()}`);

  // 영속 위치 저장소에서 이전 위치 복원 또는 초기 위치 사용
  const getInitialPosition = useCallback(() => {
    const storedPosition = persistentPositionStorage.get(storageKey.current);
    return storedPosition || initialPosition;
  }, [initialPosition]);

  const [position, setPosition] = useState<Position>(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPos: Position } | null>(null);

  // 컴포넌트 마운트 시 이전 위치 복원
  useEffect(() => {
    const storedPosition = persistentPositionStorage.get(storageKey.current);
    if (storedPosition) {
      setPosition(storedPosition);
    }
  }, []);

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

      const constrainedPosition = constrainPosition(newPosition);
      setPosition(constrainedPosition);
      // 위치 변경 시 영속 저장소에도 저장
      persistentPositionStorage.set(storageKey.current, constrainedPosition);
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
    // 영속 저장소도 초기 위치로 리셋
    persistentPositionStorage.set(storageKey.current, initialPosition);
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
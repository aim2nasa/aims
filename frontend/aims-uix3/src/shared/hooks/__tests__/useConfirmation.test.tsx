/**
 * useConfirmation Hook 테스트
 * @since 2025-10-15
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmation } from '../useConfirmation';

describe('useConfirmation', () => {
  describe('초기 상태', () => {
    it('초기 상태가 올바르게 설정되어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      expect(result.current.confirmationState).toEqual({
        open: false,
        options: null,
        resolver: null
      });
      expect(result.current.showConfirmation).toBeInstanceOf(Function);
      expect(result.current.handleConfirm).toBeInstanceOf(Function);
      expect(result.current.handleCancel).toBeInstanceOf(Function);
      expect(result.current.handleClose).toBeInstanceOf(Function);
    });
  });

  describe('showConfirmation', () => {
    it('다이얼로그를 열고 옵션을 설정해야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      const options = {
        title: '삭제 확인',
        message: '정말 삭제하시겠습니까?',
        destructive: true
      };

      act(() => {
        result.current.showConfirmation(options);
      });

      expect(result.current.confirmationState.open).toBe(true);
      expect(result.current.confirmationState.options).toEqual(options);
      expect(result.current.confirmationState.resolver).toBeInstanceOf(Function);
    });

    it('Promise를 반환해야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      let promise: Promise<boolean> | undefined;

      act(() => {
        promise = result.current.showConfirmation({
          title: '테스트',
          message: '테스트 메시지'
        });
      });

      expect(promise).toBeInstanceOf(Promise);
    });

    it('커스텀 버튼 텍스트를 설정할 수 있어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      const options = {
        title: '확인',
        message: '메시지',
        confirmText: '예',
        cancelText: '아니오'
      };

      act(() => {
        result.current.showConfirmation(options);
      });

      expect(result.current.confirmationState.options).toEqual(options);
    });
  });

  describe('handleConfirm', () => {
    it('확인 시 Promise를 true로 resolve하고 상태를 초기화해야 함', async () => {
      const { result } = renderHook(() => useConfirmation());

      let resolvedValue: boolean | undefined;

      act(() => {
        result.current.showConfirmation({
          title: '확인',
          message: '메시지'
        }).then(value => {
          resolvedValue = value;
        });
      });

      // 다이얼로그가 열렸는지 확인
      expect(result.current.confirmationState.open).toBe(true);

      // 확인 버튼 클릭
      act(() => {
        result.current.handleConfirm();
      });

      // Promise가 true로 resolve되었는지 확인
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(resolvedValue).toBe(true);

      // 상태가 초기화되었는지 확인
      expect(result.current.confirmationState).toEqual({
        open: false,
        options: null,
        resolver: null
      });
    });
  });

  describe('handleCancel', () => {
    it('취소 시 Promise를 false로 resolve하고 상태를 초기화해야 함', async () => {
      const { result } = renderHook(() => useConfirmation());

      let resolvedValue: boolean | undefined;

      act(() => {
        result.current.showConfirmation({
          title: '확인',
          message: '메시지'
        }).then(value => {
          resolvedValue = value;
        });
      });

      expect(result.current.confirmationState.open).toBe(true);

      // 취소 버튼 클릭
      act(() => {
        result.current.handleCancel();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(resolvedValue).toBe(false);

      expect(result.current.confirmationState).toEqual({
        open: false,
        options: null,
        resolver: null
      });
    });
  });

  describe('handleClose', () => {
    it('닫기 시 Promise를 false로 resolve하고 상태를 초기화해야 함', async () => {
      const { result } = renderHook(() => useConfirmation());

      let resolvedValue: boolean | undefined;

      act(() => {
        result.current.showConfirmation({
          title: '확인',
          message: '메시지'
        }).then(value => {
          resolvedValue = value;
        });
      });

      expect(result.current.confirmationState.open).toBe(true);

      // 닫기 (X 버튼 또는 배경 클릭)
      act(() => {
        result.current.handleClose();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(resolvedValue).toBe(false);

      expect(result.current.confirmationState).toEqual({
        open: false,
        options: null,
        resolver: null
      });
    });
  });

  describe('통합 시나리오', () => {
    it('여러 번 연속으로 다이얼로그를 열 수 있어야 함', async () => {
      const { result } = renderHook(() => useConfirmation());

      // 첫 번째 다이얼로그
      let firstResult: boolean | undefined;
      act(() => {
        result.current.showConfirmation({
          title: '첫 번째',
          message: '첫 번째 메시지'
        }).then(value => {
          firstResult = value;
        });
      });

      act(() => {
        result.current.handleConfirm();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(firstResult).toBe(true);

      // 두 번째 다이얼로그
      let secondResult: boolean | undefined;
      act(() => {
        result.current.showConfirmation({
          title: '두 번째',
          message: '두 번째 메시지'
        }).then(value => {
          secondResult = value;
        });
      });

      expect(result.current.confirmationState.options?.title).toBe('두 번째');

      act(() => {
        result.current.handleCancel();
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
      expect(secondResult).toBe(false);
    });

    it('destructive 옵션을 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      act(() => {
        result.current.showConfirmation({
          title: '삭제',
          message: '정말 삭제하시겠습니까?',
          destructive: true
        });
      });

      expect(result.current.confirmationState.options?.destructive).toBe(true);
    });

    it('destructive 옵션이 없으면 undefined여야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      act(() => {
        result.current.showConfirmation({
          title: '확인',
          message: '계속하시겠습니까?'
        });
      });

      expect(result.current.confirmationState.options?.destructive).toBeUndefined();
    });
  });

  describe('엣지 케이스', () => {
    it('다이얼로그가 닫힌 상태에서 handleConfirm을 호출해도 에러가 없어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      expect(() => {
        act(() => {
          result.current.handleConfirm();
        });
      }).not.toThrow();

      expect(result.current.confirmationState.open).toBe(false);
    });

    it('다이얼로그가 닫힌 상태에서 handleCancel을 호출해도 에러가 없어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      expect(() => {
        act(() => {
          result.current.handleCancel();
        });
      }).not.toThrow();

      expect(result.current.confirmationState.open).toBe(false);
    });

    it('다이얼로그가 닫힌 상태에서 handleClose를 호출해도 에러가 없어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      expect(() => {
        act(() => {
          result.current.handleClose();
        });
      }).not.toThrow();

      expect(result.current.confirmationState.open).toBe(false);
    });

    it('빈 문자열 옵션도 정상 처리해야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      act(() => {
        result.current.showConfirmation({
          title: '',
          message: '',
          confirmText: '',
          cancelText: ''
        });
      });

      expect(result.current.confirmationState.options).toEqual({
        title: '',
        message: '',
        confirmText: '',
        cancelText: ''
      });
    });

    it('한글 메시지를 올바르게 처리해야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      const koreanOptions = {
        title: '고객 삭제',
        message: '홍길동 고객을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
        confirmText: '삭제',
        cancelText: '취소',
        destructive: true
      };

      act(() => {
        result.current.showConfirmation(koreanOptions);
      });

      expect(result.current.confirmationState.options).toEqual(koreanOptions);
    });
  });

  describe('메모이제이션', () => {
    it('핸들러 함수들이 안정적인 참조를 유지해야 함', () => {
      const { result, rerender } = renderHook(() => useConfirmation());

      const initialHandlers = {
        showConfirmation: result.current.showConfirmation,
        handleConfirm: result.current.handleConfirm,
        handleCancel: result.current.handleCancel,
        handleClose: result.current.handleClose
      };

      // 리렌더링
      rerender();

      expect(result.current.showConfirmation).toBe(initialHandlers.showConfirmation);
      expect(result.current.handleConfirm).toBe(initialHandlers.handleConfirm);
      expect(result.current.handleCancel).toBe(initialHandlers.handleCancel);
      expect(result.current.handleClose).toBe(initialHandlers.handleClose);
    });

    it('다이얼로그를 열어도 핸들러 참조가 유지되어야 함', () => {
      const { result } = renderHook(() => useConfirmation());

      const initialHandlers = {
        showConfirmation: result.current.showConfirmation,
        handleConfirm: result.current.handleConfirm,
        handleCancel: result.current.handleCancel,
        handleClose: result.current.handleClose
      };

      act(() => {
        result.current.showConfirmation({
          title: '테스트',
          message: '테스트 메시지'
        });
      });

      expect(result.current.showConfirmation).toBe(initialHandlers.showConfirmation);
      expect(result.current.handleConfirm).toBe(initialHandlers.handleConfirm);
      expect(result.current.handleCancel).toBe(initialHandlers.handleCancel);
      expect(result.current.handleClose).toBe(initialHandlers.handleClose);
    });
  });
});

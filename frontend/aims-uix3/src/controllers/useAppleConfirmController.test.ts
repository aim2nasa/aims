/**
 * useAppleConfirmController Tests
 * @since 2025-10-14
 *
 * Apple 스타일 확인 모달 Controller Hook 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppleConfirmController } from './useAppleConfirmController';
import { ModalService } from '../services/modalService';

// ============================================
// Mock 설정
// ============================================

vi.mock('../services/modalService', () => ({
  ModalService: {
    validateParams: vi.fn((params) => ({
      title: params.title || '확인',
      message: params.message,
      confirmText: params.confirmText || '확인',
      cancelText: params.cancelText || '취소',
      confirmStyle: params.confirmStyle || 'primary',
      showCancel: params.showCancel !== undefined ? params.showCancel : true,
      iconType: params.iconType || 'warning',
    })),
  },
}));

const mockValidateParams = vi.mocked(ModalService.validateParams);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.requestAnimationFrame = vi.fn((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

// ============================================
// 초기 상태 테스트
// ============================================
describe('useAppleConfirmController - 초기 상태', () => {
  it('초기 상태가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.shouldRender).toBe(false);
    expect(result.current.state.message).toBe('');
    expect(result.current.state.title).toBe('확인');
  });

  it('모든 액션이 제공된다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    expect(typeof result.current.actions.openModal).toBe('function');
    expect(typeof result.current.actions.closeModal).toBe('function');
    expect(typeof result.current.actions.handleConfirm).toBe('function');
    expect(typeof result.current.actions.handleCancel).toBe('function');
  });
});

// ============================================
// openModal 테스트
// ============================================
describe('useAppleConfirmController - openModal', () => {
  it('모달을 열고 상태를 업데이트한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트 메시지',
        title: '테스트 타이틀',
      });
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.shouldRender).toBe(true);
    expect(result.current.state.message).toBe('테스트 메시지');
    expect(result.current.state.title).toBe('테스트 타이틀');
  });

  it('애니메이션이 시작된다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    expect(result.current.state.isAnimating).toBe(true);
  });

  it('ModalService를 통해 파라미터를 검증한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    const params = {
      message: '삭제하시겠습니까?',
      title: '경고',
      confirmStyle: 'destructive' as const,
    };

    act(() => {
      result.current.actions.openModal(params);
    });

    expect(mockValidateParams).toHaveBeenCalledWith(params);
  });
});

// ============================================
// closeModal 테스트
// ============================================
describe('useAppleConfirmController - closeModal', () => {
  it('모달을 닫고 애니메이션을 처리한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.closeModal();
    });

    expect(result.current.state.isAnimating).toBe(false);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.shouldRender).toBe(false);
  });
});

// ============================================
// handleConfirm 테스트
// ============================================
describe('useAppleConfirmController - handleConfirm', () => {
  it('확인 버튼 클릭 시 Promise가 true로 resolve된다', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트' }).then((value) => {
        resolvedValue = value;
      });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.handleConfirm();
    });

    // Promise 처리를 위해 microtask queue 플러시
    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(true);
  });

  it('모달을 닫는다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.handleConfirm();
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current.state.isOpen).toBe(false);
  });
});

// ============================================
// handleCancel 테스트
// ============================================
describe('useAppleConfirmController - handleCancel', () => {
  it('취소 버튼 클릭 시 Promise가 false로 resolve된다', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트' }).then((value) => {
        resolvedValue = value;
      });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.handleCancel();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(false);
  });
});

// ============================================
// handleKeyDown 테스트
// ============================================
describe('useAppleConfirmController - handleKeyDown', () => {
  it('ESC 키 입력 시 취소 처리한다 (showCancel: true)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트', showCancel: true }).then((value) => {
        resolvedValue = value;
      });
    });

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      result.current.actions.handleKeyDown(escapeEvent);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(false);
  });

  it('ESC 키 입력을 무시한다 (showCancel: false)', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트', showCancel: false });
    });

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    act(() => {
      result.current.actions.handleKeyDown(escapeEvent);
    });

    expect(result.current.state.isOpen).toBe(true);
  });
});

// ============================================
// handleOverlayClick 테스트
// ============================================
describe('useAppleConfirmController - handleOverlayClick', () => {
  it('오버레이 클릭 시 취소 처리한다 (showCancel: true)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트', showCancel: true }).then((value) => {
        resolvedValue = value;
      });
    });

    const mockEvent = {
      target: document.createElement('div'),
      currentTarget: document.createElement('div'),
    } as unknown as React.MouseEvent;
    (mockEvent as any).currentTarget = mockEvent.target;

    act(() => {
      result.current.actions.handleOverlayClick(mockEvent);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(false);
  });

  it('오버레이 클릭을 무시한다 (showCancel: false)', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트', showCancel: false });
    });

    const mockEvent = {
      target: document.createElement('div'),
      currentTarget: document.createElement('div'),
    } as unknown as React.MouseEvent;
    (mockEvent as any).currentTarget = mockEvent.target;

    act(() => {
      result.current.actions.handleOverlayClick(mockEvent);
    });

    expect(result.current.state.isOpen).toBe(true);
  });

  it('내부 요소 클릭은 무시한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트', showCancel: true });
    });

    const mockEvent = {
      target: document.createElement('button'),
      currentTarget: document.createElement('div'),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.actions.handleOverlayClick(mockEvent);
    });

    expect(result.current.state.isOpen).toBe(true);
  });
});

// ============================================
// Side Effects 테스트
// ============================================
describe('useAppleConfirmController - Side Effects', () => {
  it('모달 열릴 때 body overflow를 hidden으로 설정한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    // setInterval이 실행되도록 timer 진행
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('모달 닫힐 때 body overflow를 복원한다', () => {
    const { result, unmount } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });
});

// ============================================
// 통합 시나리오 테스트
// ============================================
describe('useAppleConfirmController - 통합 시나리오', () => {
  it('전체 플로우가 정상 작동한다 (확인)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({
        title: '삭제 확인',
        message: '정말 삭제하시겠습니까?',
        confirmText: '삭제',
        cancelText: '취소',
        confirmStyle: 'destructive',
      }).then((value) => {
        resolvedValue = value;
      });
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.isAnimating).toBe(true);
    expect(result.current.state.shouldRender).toBe(true);

    act(() => {
      result.current.actions.handleConfirm();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(true);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.shouldRender).toBe(false);
  });

  it('전체 플로우가 정상 작동한다 (취소)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({
        message: '작업을 취소하시겠습니까?',
      }).then((value) => {
        resolvedValue = value;
      });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.handleCancel();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resolvedValue).toBe(false);
  });
});

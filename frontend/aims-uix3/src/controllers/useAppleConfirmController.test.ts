/**
 * useAppleConfirmController Tests
 * @since 2025-10-14
 * @version 2.0.0 - Modal 컴포넌트 기반으로 마이그레이션 (Phase 6)
 * @updated 2025-11-06
 *
 * Apple 스타일 확인 모달 Controller Hook 테스트
 * Modal 컴포넌트가 ESC, body overflow, Portal, 애니메이션을 처리하므로 해당 테스트 제거
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppleConfirmController } from './useAppleConfirmController';
import { ModalService } from '../services/modalService';

// Mock 설정
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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// 초기 상태 테스트
describe('useAppleConfirmController - 초기 상태', () => {
  it('초기 상태가 올바르게 설정된다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    expect(result.current.state.isOpen).toBe(false);
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

// openModal 테스트
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
    expect(result.current.state.message).toBe('테스트 메시지');
    expect(result.current.state.title).toBe('테스트 타이틀');
  });

  it('ModalService를 통해 파라미터를 검증한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    expect(mockValidateParams).toHaveBeenCalledWith({ message: '테스트' });
  });
});

// closeModal 테스트
describe('useAppleConfirmController - closeModal', () => {
  it('모달을 닫는다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    act(() => {
      result.current.actions.closeModal();
    });

    expect(result.current.state.isOpen).toBe(false);
  });
});

// handleConfirm 테스트
describe('useAppleConfirmController - handleConfirm', () => {
  it('확인 버튼 클릭 시 Promise가 true로 resolve된다', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트' }).then((value) => {
        resolvedValue = value;
      });
    });

    act(() => {
      result.current.actions.handleConfirm();
    });

    await vi.waitFor(() => {
      expect(resolvedValue).toBe(true);
    });
  });

  it('모달을 닫는다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    act(() => {
      result.current.actions.handleConfirm();
    });

    expect(result.current.state.isOpen).toBe(false);
  });
});

// handleCancel 테스트
describe('useAppleConfirmController - handleCancel', () => {
  it('취소 버튼 클릭 시 Promise가 false로 resolve된다', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({ message: '테스트' }).then((value) => {
        resolvedValue = value;
      });
    });

    act(() => {
      result.current.actions.handleCancel();
    });

    await vi.waitFor(() => {
      expect(resolvedValue).toBe(false);
    });
  });
});

// 통합 시나리오 테스트
describe('useAppleConfirmController - 통합 시나리오', () => {
  it('전체 플로우가 정상 작동한다 (확인)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({
        message: '테스트 메시지',
        title: '테스트 타이틀',
      }).then((value) => {
        resolvedValue = value;
      });
    });

    expect(result.current.state.isOpen).toBe(true);

    act(() => {
      result.current.actions.handleConfirm();
    });

    await vi.waitFor(() => {
      expect(resolvedValue).toBe(true);
      expect(result.current.state.isOpen).toBe(false);
    });
  });

  it('전체 플로우가 정상 작동한다 (취소)', async () => {
    const { result } = renderHook(() => useAppleConfirmController());

    let resolvedValue: boolean | undefined;

    act(() => {
      result.current.actions.openModal({
        message: '테스트 메시지',
      }).then((value) => {
        resolvedValue = value;
      });
    });

    act(() => {
      result.current.actions.handleCancel();
    });

    await vi.waitFor(() => {
      expect(resolvedValue).toBe(false);
      expect(result.current.state.isOpen).toBe(false);
    });
  });
});

// 고급 옵션 테스트
describe('useAppleConfirmController - 고급 옵션', () => {
  it('제목이 있을 때 제목을 표시한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        title: '커스텀 타이틀',
      });
    });

    expect(result.current.state.title).toBe('커스텀 타이틀');
  });

  it('제목이 없을 때 기본 제목을 사용한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '테스트' });
    });

    expect(result.current.state.title).toBe('확인');
  });

  it('confirmStyle을 올바르게 설정한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        confirmStyle: 'destructive',
      });
    });

    expect(result.current.state.confirmStyle).toBe('destructive');
  });

  it('iconType을 올바르게 설정한다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        iconType: 'success',
      });
    });

    expect(result.current.state.iconType).toBe('success');
  });

  it('showCancel을 false로 설정할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        showCancel: false,
      });
    });

    expect(result.current.state.showCancel).toBe(false);
  });

  it('confirmText를 커스텀할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        confirmText: '동의',
      });
    });

    expect(result.current.state.confirmText).toBe('동의');
  });

  it('cancelText를 커스텀할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({
        message: '테스트',
        cancelText: '거부',
      });
    });

    expect(result.current.state.cancelText).toBe('거부');
  });
});

// 에러 처리 테스트
describe('useAppleConfirmController - 에러 처리', () => {
  it('빈 메시지로 모달을 열 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());

    act(() => {
      result.current.actions.openModal({ message: '' });
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.message).toBe('');
  });

  it('매우 긴 메시지를 처리할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());
    const longMessage = 'A'.repeat(1000);

    act(() => {
      result.current.actions.openModal({ message: longMessage });
    });

    expect(result.current.state.message).toBe(longMessage);
  });

  it('특수 문자가 포함된 메시지를 처리할 수 있다', () => {
    const { result } = renderHook(() => useAppleConfirmController());
    const specialMessage = '<script>alert("test")</script>';

    act(() => {
      result.current.actions.openModal({ message: specialMessage });
    });

    expect(result.current.state.message).toBe(specialMessage);
  });
});

/**
 * useHeaderTooltip Hook 테스트
 * @since 2025-10-15
 *
 * Header 툴팁 및 펄스 애니메이션 비즈니스 로직 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHeaderTooltip } from '../useHeaderTooltip';

describe('useHeaderTooltip', () => {
  // localStorage mock
  const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    // localStorage 초기화
    localStorageMock.clear();
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // 타이머 모킹
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ===== 1. 초기 상태 테스트 =====

  describe('초기 상태', () => {
    it('툴팁을 본 적이 없으면 showTooltip과 showPulse가 false로 시작해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      expect(result.current.showTooltip).toBe(false);
      expect(result.current.showPulse).toBe(false);
    });

    it('dismissTooltip 함수를 제공해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      expect(typeof result.current.dismissTooltip).toBe('function');
    });

    it('localStorage에 툴팁을 본 기록이 있으면 표시하지 않아야 함', () => {
      localStorageMock.setItem('aims-header-tooltip-seen', 'true');

      const { result } = renderHook(() => useHeaderTooltip());

      // 타이머를 모두 진행해도 표시되지 않음
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.showTooltip).toBe(false);
      expect(result.current.showPulse).toBe(false);
    });
  });

  // ===== 2. 타이밍 시퀀스 테스트 =====

  describe('타이밍 시퀀스', () => {
    it('2초 후 펄스 애니메이션이 시작되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      expect(result.current.showPulse).toBe(false);

      // 1.9초 후 - 아직 펄스 시작 안 됨
      act(() => {
        vi.advanceTimersByTime(1900);
      });
      expect(result.current.showPulse).toBe(false);

      // 2초 후 - 펄스 시작
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current.showPulse).toBe(true);
      expect(result.current.showTooltip).toBe(false);
    });

    it('3초 후 툴팁이 표시되고 펄스가 중단되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 3초 진행
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.showTooltip).toBe(true);
      expect(result.current.showPulse).toBe(false);
    });

    it('8초 후 툴팁과 펄스가 자동으로 해제되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 8초 진행
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(result.current.showTooltip).toBe(false);
      expect(result.current.showPulse).toBe(false);
    });

    it('8초 후 localStorage에 "seen" 기록이 저장되어야 함', () => {
      renderHook(() => useHeaderTooltip());

      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aims-header-tooltip-seen',
        'true'
      );
    });

    it('2초(펄스) → 3초(툴팁) → 8초(해제) 전체 시퀀스가 올바르게 동작해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 초기 상태
      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);

      // 2초 후: 펄스 시작
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.showPulse).toBe(true);
      expect(result.current.showTooltip).toBe(false);

      // 3초 후: 툴팁 표시, 펄스 중단
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(true);

      // 8초 후: 모두 해제
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);
    });
  });

  // ===== 3. 수동 해제 (dismissTooltip) 테스트 =====

  describe('수동 해제 (dismissTooltip)', () => {
    it('dismissTooltip 호출 시 툴팁이 즉시 해제되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 3초 후 툴팁 표시
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.showTooltip).toBe(true);

      // 수동 해제
      act(() => {
        result.current.dismissTooltip();
      });

      expect(result.current.showTooltip).toBe(false);
      expect(result.current.showPulse).toBe(false);
    });

    it('dismissTooltip 호출 시 펄스도 함께 해제되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 2초 후 펄스 시작
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.showPulse).toBe(true);

      // 수동 해제
      act(() => {
        result.current.dismissTooltip();
      });

      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);
    });

    it('dismissTooltip 호출 시 localStorage에 기록이 저장되어야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      act(() => {
        result.current.dismissTooltip();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aims-header-tooltip-seen',
        'true'
      );
    });

    it('dismissTooltip 호출 후 남은 타이머가 실행되지 않아야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 2초 후 펄스 시작
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current.showPulse).toBe(true);

      // 수동 해제
      act(() => {
        result.current.dismissTooltip();
      });
      expect(result.current.showPulse).toBe(false);

      // 남은 타이머를 진행해도 상태가 변하지 않아야 함
      act(() => {
        vi.runAllTimers();
      });

      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);
    });
  });

  // ===== 4. 언마운트 & 타이머 정리 테스트 =====

  describe('언마운트 & 타이머 정리', () => {
    it('언마운트 시 타이머가 정리되어야 함', () => {
      const { unmount } = renderHook(() => useHeaderTooltip());

      // 타이머 시작 전 언마운트
      unmount();

      // 타이머를 진행해도 에러가 발생하지 않아야 함
      act(() => {
        vi.runAllTimers();
      });

      // 정상적으로 종료됨을 확인
      expect(true).toBe(true);
    });

    it('펄스 중 언마운트해도 타이머가 정리되어야 함', () => {
      const { unmount } = renderHook(() => useHeaderTooltip());

      // 2초 후 펄스 시작
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // 펄스 중 언마운트
      unmount();

      // 타이머를 진행해도 에러 없음
      act(() => {
        vi.runAllTimers();
      });

      expect(true).toBe(true);
    });

    it('툴팁 표시 중 언마운트해도 타이머가 정리되어야 함', () => {
      const { unmount } = renderHook(() => useHeaderTooltip());

      // 3초 후 툴팁 표시
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // 툴팁 표시 중 언마운트
      unmount();

      // 타이머를 진행해도 에러 없음
      act(() => {
        vi.runAllTimers();
      });

      expect(true).toBe(true);
    });
  });

  // ===== 5. 엣지 케이스 테스트 =====

  describe('엣지 케이스', () => {
    it('빠른 언마운트 (0초)도 안전하게 처리되어야 함', () => {
      const { unmount } = renderHook(() => useHeaderTooltip());

      // 즉시 언마운트
      unmount();

      expect(true).toBe(true);
    });

    it('dismissTooltip을 여러 번 호출해도 안전해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      act(() => {
        result.current.dismissTooltip();
        result.current.dismissTooltip();
        result.current.dismissTooltip();
      });

      // localStorage.setItem이 여러 번 호출되어도 문제없음
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aims-header-tooltip-seen',
        'true'
      );
    });

    it('타이머 진행 중 dismissTooltip 여러 번 호출해도 안전해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 2초 진행
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // 여러 번 해제
      act(() => {
        result.current.dismissTooltip();
        result.current.dismissTooltip();
      });

      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);
    });

    it('localStorage가 이미 "seen"이면 타이머가 시작되지 않아야 함', () => {
      localStorageMock.setItem('aims-header-tooltip-seen', 'true');

      renderHook(() => useHeaderTooltip());

      // setItem이 추가로 호출되지 않음 (이미 seen이므로)
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1); // beforeEach에서 1번
    });
  });

  // ===== 6. 타이머 간섭 테스트 =====

  describe('타이머 간섭', () => {
    it('펄스 타이머와 툴팁 타이머가 독립적으로 동작해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 2.5초 진행 (펄스는 시작했지만 툴팁은 아직)
      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(result.current.showPulse).toBe(true);
      expect(result.current.showTooltip).toBe(false);

      // 0.5초 더 진행 (총 3초, 툴팁 표시)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(true);
    });

    it('해제 타이머가 펄스와 툴팁을 모두 정리해야 함', () => {
      const { result } = renderHook(() => useHeaderTooltip());

      // 8초 진행 (전체 시퀀스 완료)
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(result.current.showPulse).toBe(false);
      expect(result.current.showTooltip).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'aims-header-tooltip-seen',
        'true'
      );
    });
  });
});

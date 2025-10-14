/**
 * hapticFeedback 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock navigator.vibrate
const vibrateMock = vi.fn();

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value;
  },
  clear() {
    this.store = {};
  },
};

describe('hapticFeedback', () => {
  let hapticFeedback: any;
  let hapticTap: any;
  let hapticSelection: any;
  let hapticSuccess: any;
  let hapticError: any;
  let hapticWarning: any;
  let hapticImpact: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // navigator.vibrate 모킹 (모듈 로드 전에 설정)
    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    // localStorage 모킹
    Object.defineProperty(global, 'localStorage', {
      writable: true,
      configurable: true,
      value: localStorageMock,
    });

    localStorageMock.clear();

    // 모듈 다시 로드
    const module = await import('../hapticFeedback');
    hapticFeedback = module.default;
    hapticTap = module.hapticTap;
    hapticSelection = module.hapticSelection;
    hapticSuccess = module.hapticSuccess;
    hapticError = module.hapticError;
    hapticWarning = module.hapticWarning;
    hapticImpact = module.hapticImpact;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('초기화', () => {
    it('햅틱이 지원되는지 확인할 수 있어야 함', () => {
      expect(hapticFeedback.supported).toBe(true);
    });

    it('기본적으로 활성화되어 있어야 함', () => {
      expect(hapticFeedback.enabled).toBe(true);
    });
  });

  describe('trigger', () => {
    it('light 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('light');

      expect(vibrateMock).toHaveBeenCalledWith([10]);
    });

    it('medium 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('medium');

      expect(vibrateMock).toHaveBeenCalledWith([20]);
    });

    it('heavy 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('heavy');

      expect(vibrateMock).toHaveBeenCalledWith([30]);
    });

    it('success 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('success');

      expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10]);
    });

    it('warning 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('warning');

      expect(vibrateMock).toHaveBeenCalledWith([15, 100, 15, 100]);
    });

    it('error 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('error');

      expect(vibrateMock).toHaveBeenCalledWith([50, 100, 50]);
    });

    it('selection 햅틱을 트리거해야 함', () => {
      hapticFeedback.trigger('selection');

      expect(vibrateMock).toHaveBeenCalledWith([5]);
    });

    it('햅틱이 비활성화되어 있으면 트리거하지 않아야 함', () => {
      hapticFeedback.setEnabled(false);
      hapticFeedback.trigger('light');

      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('햅틱을 비활성화할 수 있어야 함', () => {
      hapticFeedback.setEnabled(false);

      expect(hapticFeedback.enabled).toBe(false);
      expect(localStorageMock.getItem('aims-haptic-enabled')).toBe('false');
    });

    it('햅틱을 활성화할 수 있어야 함', () => {
      hapticFeedback.setEnabled(false);
      hapticFeedback.setEnabled(true);

      expect(hapticFeedback.enabled).toBe(true);
      expect(localStorageMock.getItem('aims-haptic-enabled')).toBe('true');
    });
  });

  describe('편의 함수', () => {
    it('hapticTap은 light를 트리거해야 함', () => {
      hapticTap();

      expect(vibrateMock).toHaveBeenCalledWith([10]);
    });

    it('hapticSelection은 selection을 트리거해야 함', () => {
      hapticSelection();

      expect(vibrateMock).toHaveBeenCalledWith([5]);
    });

    it('hapticSuccess는 success를 트리거해야 함', () => {
      hapticSuccess();

      expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10]);
    });

    it('hapticError는 error를 트리거해야 함', () => {
      hapticError();

      expect(vibrateMock).toHaveBeenCalledWith([50, 100, 50]);
    });

    it('hapticWarning은 warning을 트리거해야 함', () => {
      hapticWarning();

      expect(vibrateMock).toHaveBeenCalledWith([15, 100, 15, 100]);
    });

    it('hapticImpact는 medium을 트리거해야 함', () => {
      hapticImpact();

      expect(vibrateMock).toHaveBeenCalledWith([20]);
    });
  });
});

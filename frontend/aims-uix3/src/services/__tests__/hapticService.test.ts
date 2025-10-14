/**
 * HapticService 테스트
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HapticService, HapticType, withHaptic } from '../hapticService';

// Mock navigator.vibrate
const vibrateMock = vi.fn();

// 테스트 간 고유 시간을 위한 카운터
let testTimeCounter = 0;

describe('HapticService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Fake timers를 먼저 설정
    vi.useFakeTimers();

    // 각 테스트마다 고유한 시간으로 시작 (디바운스 회피)
    testTimeCounter += 100000; // 각 테스트는 100초씩 떨어진 시간에서 시작
    vi.setSystemTime(new Date(testTimeCounter));

    // navigator.vibrate 모킹
    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    // 기본 설정으로 리셋
    HapticService.configure({
      enabled: true,
      intensity: 1.0,
      debug: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('isSupported', () => {
    it('navigator.vibrate가 있으면 true를 반환해야 함', () => {
      expect(HapticService.isSupported()).toBe(true);
    });

    it('navigator.vibrate가 없으면 false를 반환해야 함', () => {
      Object.defineProperty(navigator, 'vibrate', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      expect(HapticService.isSupported()).toBe(false);
    });
  });

  describe('trigger', () => {
    it('LIGHT 햅틱을 트리거해야 함', () => {
      HapticService.trigger(HapticType.LIGHT);

      expect(vibrateMock).toHaveBeenCalledWith([10]);
    });

    it('MEDIUM 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.MEDIUM);

      expect(vibrateMock).toHaveBeenCalledWith([20]);
    });

    it('HEAVY 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.HEAVY);

      expect(vibrateMock).toHaveBeenCalledWith([50]);
    });

    it('SUCCESS 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.SUCCESS);

      expect(vibrateMock).toHaveBeenCalledWith([10, 50, 10, 50]);
    });

    it('WARNING 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.WARNING);

      expect(vibrateMock).toHaveBeenCalledWith([30, 100, 30]);
    });

    it('ERROR 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.ERROR);

      expect(vibrateMock).toHaveBeenCalledWith([50, 50, 50, 50, 50]);
    });

    it('SELECTION 햅틱을 트리거해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.trigger(HapticType.SELECTION);

      expect(vibrateMock).toHaveBeenCalledWith([5]);
    });

    it('햅틱이 비활성화되어 있으면 트리거하지 않아야 함', () => {
      HapticService.setEnabled(false);
      HapticService.trigger(HapticType.LIGHT);

      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('브라우저가 지원하지 않으면 트리거하지 않아야 함', () => {
      Object.defineProperty(navigator, 'vibrate', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      HapticService.trigger(HapticType.LIGHT);

      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('디바운스 간격 내에서는 중복 실행을 방지해야 함', () => {
      HapticService.trigger(HapticType.LIGHT);
      HapticService.trigger(HapticType.MEDIUM); // 디바운스로 인해 무시됨

      expect(vibrateMock).toHaveBeenCalledTimes(1);
      expect(vibrateMock).toHaveBeenCalledWith([10]);
    });

    it('force=true이면 디바운스를 무시해야 함', () => {
      HapticService.trigger(HapticType.LIGHT);
      HapticService.trigger(HapticType.MEDIUM, true); // force=true

      expect(vibrateMock).toHaveBeenCalledTimes(2);
      expect(vibrateMock).toHaveBeenNthCalledWith(1, [10]);
      expect(vibrateMock).toHaveBeenNthCalledWith(2, [20]);
    });

    it('디바운스 간격 이후에는 다시 트리거할 수 있어야 함', () => {
      HapticService.trigger(HapticType.LIGHT);

      vi.advanceTimersByTime(51); // DEBOUNCE_INTERVAL(50ms) 초과

      HapticService.trigger(HapticType.MEDIUM);

      expect(vibrateMock).toHaveBeenCalledTimes(2);
    });

    it('intensity 설정에 따라 패턴을 조정해야 함', () => {
      vi.advanceTimersByTime(100); // 디바운스 회피
      HapticService.setIntensity(0.5);
      HapticService.trigger(HapticType.HEAVY);

      expect(vibrateMock).toHaveBeenCalledWith([25]); // 50 * 0.5 = 25
    });
  });

  describe('configure', () => {
    it('부분 설정을 업데이트해야 함', () => {
      HapticService.configure({ intensity: 0.7 });

      const config = HapticService.getConfig();
      expect(config.intensity).toBe(0.7);
      expect(config.enabled).toBe(true); // 기존 값 유지
    });

    it('전체 설정을 업데이트해야 함', () => {
      HapticService.configure({
        enabled: false,
        intensity: 0.3,
        debug: true,
      });

      const config = HapticService.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.intensity).toBe(0.3);
      expect(config.debug).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('현재 설정을 반환해야 함', () => {
      const config = HapticService.getConfig();

      expect(config).toEqual({
        enabled: true,
        intensity: 1.0,
        debug: false,
      });
    });

    it('설정 객체의 복사본을 반환해야 함 (불변성)', () => {
      const config1 = HapticService.getConfig();
      const config2 = HapticService.getConfig();

      expect(config1).not.toBe(config2); // 다른 객체
      expect(config1).toEqual(config2); // 같은 내용
    });
  });

  describe('setEnabled', () => {
    it('햅틱을 활성화해야 함', () => {
      HapticService.setEnabled(false);
      HapticService.setEnabled(true);

      const config = HapticService.getConfig();
      expect(config.enabled).toBe(true);
    });

    it('햅틱을 비활성화해야 함', () => {
      HapticService.setEnabled(false);

      const config = HapticService.getConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('setIntensity', () => {
    it('강도를 설정해야 함', () => {
      HapticService.setIntensity(0.8);

      const config = HapticService.getConfig();
      expect(config.intensity).toBe(0.8);
    });

    it('강도가 0 미만이면 0으로 제한해야 함', () => {
      HapticService.setIntensity(-0.5);

      const config = HapticService.getConfig();
      expect(config.intensity).toBe(0);
    });

    it('강도가 1 초과이면 1로 제한해야 함', () => {
      HapticService.setIntensity(1.5);

      const config = HapticService.getConfig();
      expect(config.intensity).toBe(1);
    });
  });

  describe('stop', () => {
    it('모든 햅틱을 중지해야 함', () => {
      HapticService.stop();

      expect(vibrateMock).toHaveBeenCalledWith(0);
    });

    it('브라우저가 지원하지 않으면 중지하지 않아야 함', () => {
      Object.defineProperty(navigator, 'vibrate', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      HapticService.stop();

      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });

  describe('testSequence', () => {
    it('지원되는 경우 테스트 시퀀스를 실행해야 함', async () => {
      const promise = HapticService.testSequence();

      // 각 타입마다 1초씩 대기하므로 타이머를 모두 진행
      await vi.runAllTimersAsync();

      await promise;

      // 7개 타입 모두 트리거되어야 함
      expect(vibrateMock).toHaveBeenCalledTimes(7);
    });

    it('지원되지 않는 경우 테스트 시퀀스를 실행하지 않아야 함', async () => {
      Object.defineProperty(navigator, 'vibrate', {
        writable: true,
        configurable: true,
        value: undefined,
      });

      await HapticService.testSequence();

      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });
});

describe('withHaptic', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Fake timers 설정
    vi.useFakeTimers();

    // 각 테스트마다 고유한 시간으로 시작 (디바운스 회피)
    testTimeCounter += 100000; // 각 테스트는 100초씩 떨어진 시간에서 시작
    vi.setSystemTime(new Date(testTimeCounter));

    Object.defineProperty(navigator, 'vibrate', {
      writable: true,
      configurable: true,
      value: vibrateMock,
    });

    HapticService.configure({
      enabled: true,
      intensity: 1.0,
      debug: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('원본 핸들러 없이 햅틱만 트리거해야 함', () => {
    vi.advanceTimersByTime(100); // 디바운스 회피
    const handler = withHaptic(HapticType.LIGHT);

    handler();

    expect(vibrateMock).toHaveBeenCalledWith([10]);
  });

  it('원본 핸들러와 함께 햅틱을 트리거해야 함', () => {
    vi.advanceTimersByTime(100); // 디바운스 회피
    const originalHandler = vi.fn((x: number) => x * 2);
    const handler = withHaptic(HapticType.MEDIUM, originalHandler);

    const result = handler(5);

    expect(vibrateMock).toHaveBeenCalledWith([20]);
    expect(originalHandler).toHaveBeenCalledWith(5);
    expect(result).toBe(10);
  });

  it('원본 핸들러의 반환값을 전달해야 함', () => {
    const originalHandler = () => 'test result';
    const handler = withHaptic(HapticType.SUCCESS, originalHandler);

    const result = handler();

    expect(result).toBe('test result');
  });

  it('원본 핸들러의 파라미터를 전달해야 함', () => {
    const originalHandler = vi.fn((a: number, b: string, c: boolean) => {
      return `${a}-${b}-${c}`;
    });
    const handler = withHaptic(HapticType.WARNING, originalHandler);

    const result = handler(42, 'test', true);

    expect(originalHandler).toHaveBeenCalledWith(42, 'test', true);
    expect(result).toBe('42-test-true');
  });
});

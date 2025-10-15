/**
 * useGaps 훅 테스트
 *
 * 갭 설정을 관리하고 CSS 변수로 변환하는 커스텀 훅 검증
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGaps } from '../useGaps';
import { DEFAULT_GAPS } from '../../types/layout';

describe('useGaps', () => {
  describe('기본 동작', () => {
    it('gaps 파라미터 없이 호출하면 DEFAULT_GAPS를 사용해야 함', () => {
      const { result } = renderHook(() => useGaps());

      expect(result.current.mergedGaps).toEqual(DEFAULT_GAPS);
      expect(result.current.gapValues).toEqual({
        gapLeft: DEFAULT_GAPS.gapLeft,
        gapCenter: DEFAULT_GAPS.gapCenter,
        gapRight: DEFAULT_GAPS.gapRight,
        gapTop: DEFAULT_GAPS.gapTop,
        gapBottom: DEFAULT_GAPS.gapBottom
      });
    });

    it('기본 갭으로 올바른 CSS 변수를 생성해야 함', () => {
      const { result } = renderHook(() => useGaps());

      expect(result.current.cssVariables).toEqual({
        '--gap-left': '2px',
        '--gap-center': '2px',
        '--gap-right': '2px',
        '--gap-top': '2px',
        '--gap-bottom': '2px'
      });
    });
  });

  describe('커스텀 갭 설정', () => {
    it('일부 갭만 커스터마이징하면 나머지는 기본값을 사용해야 함', () => {
      const customGaps = {
        gapLeft: 10,
        gapCenter: 15
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.mergedGaps).toEqual({
        gapLeft: 10,
        gapCenter: 15,
        gapRight: DEFAULT_GAPS.gapRight,
        gapTop: DEFAULT_GAPS.gapTop,
        gapBottom: DEFAULT_GAPS.gapBottom
      });
    });

    it('모든 갭을 커스터마이징할 수 있어야 함', () => {
      const customGaps = {
        gapLeft: 8,
        gapCenter: 12,
        gapRight: 16,
        gapTop: 20,
        gapBottom: 24
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.mergedGaps).toEqual(customGaps);
      expect(result.current.gapValues).toEqual(customGaps);
    });

    it('커스텀 갭으로 올바른 CSS 변수를 생성해야 함', () => {
      const customGaps = {
        gapLeft: 5,
        gapCenter: 10,
        gapRight: 15,
        gapTop: 20,
        gapBottom: 25
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables).toEqual({
        '--gap-left': '5px',
        '--gap-center': '10px',
        '--gap-right': '15px',
        '--gap-top': '20px',
        '--gap-bottom': '25px'
      });
    });
  });

  describe('엣지 케이스', () => {
    it('갭 값이 0이어도 올바르게 처리해야 함', () => {
      const customGaps = {
        gapLeft: 0,
        gapCenter: 0,
        gapRight: 0,
        gapTop: 0,
        gapBottom: 0
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables).toEqual({
        '--gap-left': '0px',
        '--gap-center': '0px',
        '--gap-right': '0px',
        '--gap-top': '0px',
        '--gap-bottom': '0px'
      });
    });

    it('큰 갭 값도 올바르게 처리해야 함', () => {
      const customGaps = {
        gapLeft: 100,
        gapCenter: 200,
        gapRight: 300
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables['--gap-left']).toBe('100px');
      expect(result.current.cssVariables['--gap-center']).toBe('200px');
      expect(result.current.cssVariables['--gap-right']).toBe('300px');
    });

    it('빈 객체를 전달하면 모든 기본값을 사용해야 함', () => {
      const { result } = renderHook(() => useGaps({}));

      expect(result.current.mergedGaps).toEqual(DEFAULT_GAPS);
    });
  });

  describe('메모이제이션', () => {
    it('동일한 gaps 파라미터로 리렌더링해도 객체 참조가 유지되어야 함', () => {
      const customGaps = { gapLeft: 10 };
      const { result, rerender } = renderHook(
        ({ gaps }) => useGaps(gaps),
        { initialProps: { gaps: customGaps } }
      );

      const firstMergedGaps = result.current.mergedGaps;
      const firstCssVariables = result.current.cssVariables;
      const firstGapValues = result.current.gapValues;

      rerender({ gaps: customGaps });

      // 동일한 gaps 객체를 전달하면 메모이제이션으로 인해 참조 유지
      expect(result.current.mergedGaps).toBe(firstMergedGaps);
      expect(result.current.cssVariables).toBe(firstCssVariables);
      expect(result.current.gapValues).toBe(firstGapValues);
    });

    it('gaps 파라미터가 변경되면 새로운 객체를 반환해야 함', () => {
      const { result, rerender } = renderHook(
        ({ gaps }) => useGaps(gaps),
        { initialProps: { gaps: { gapLeft: 10 } } }
      );

      const firstMergedGaps = result.current.mergedGaps;
      const firstCssVariables = result.current.cssVariables;

      rerender({ gaps: { gapLeft: 20 } });

      // gaps가 변경되면 새로운 객체 생성
      expect(result.current.mergedGaps).not.toBe(firstMergedGaps);
      expect(result.current.cssVariables).not.toBe(firstCssVariables);
      expect(result.current.mergedGaps.gapLeft).toBe(20);
    });
  });

  describe('반환값 검증', () => {
    it('cssVariables, gapValues, mergedGaps를 모두 반환해야 함', () => {
      const { result } = renderHook(() => useGaps());

      expect(result.current).toHaveProperty('cssVariables');
      expect(result.current).toHaveProperty('gapValues');
      expect(result.current).toHaveProperty('mergedGaps');
    });

    it('gapValues와 mergedGaps는 동일한 값을 가져야 함', () => {
      const customGaps = {
        gapLeft: 5,
        gapCenter: 10
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.gapValues.gapLeft).toBe(result.current.mergedGaps.gapLeft);
      expect(result.current.gapValues.gapCenter).toBe(result.current.mergedGaps.gapCenter);
      expect(result.current.gapValues.gapRight).toBe(result.current.mergedGaps.gapRight);
      expect(result.current.gapValues.gapTop).toBe(result.current.mergedGaps.gapTop);
      expect(result.current.gapValues.gapBottom).toBe(result.current.mergedGaps.gapBottom);
    });
  });

  describe('CSS 변수 형식', () => {
    it('모든 CSS 변수는 px 단위를 포함해야 함', () => {
      const { result } = renderHook(() => useGaps({ gapLeft: 42 }));

      Object.values(result.current.cssVariables).forEach(value => {
        expect(value).toMatch(/^\d+px$/);
      });
    });

    it('CSS 변수 키는 올바른 명명 규칙을 따라야 함', () => {
      const { result } = renderHook(() => useGaps());

      const expectedKeys = [
        '--gap-left',
        '--gap-center',
        '--gap-right',
        '--gap-top',
        '--gap-bottom'
      ];

      expectedKeys.forEach(key => {
        expect(result.current.cssVariables).toHaveProperty(key);
      });
    });
  });

  describe('음수 값 처리', () => {
    it('음수 갭 값도 처리해야 함 (CSS에서는 음수 마진 가능)', () => {
      const customGaps = {
        gapLeft: -5,
        gapCenter: -10
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables['--gap-left']).toBe('-5px');
      expect(result.current.cssVariables['--gap-center']).toBe('-10px');
      expect(result.current.gapValues.gapLeft).toBe(-5);
      expect(result.current.gapValues.gapCenter).toBe(-10);
    });

    it('모든 갭이 음수여도 올바르게 처리해야 함', () => {
      const customGaps = {
        gapLeft: -1,
        gapCenter: -2,
        gapRight: -3,
        gapTop: -4,
        gapBottom: -5
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables).toEqual({
        '--gap-left': '-1px',
        '--gap-center': '-2px',
        '--gap-right': '-3px',
        '--gap-top': '-4px',
        '--gap-bottom': '-5px'
      });
    });
  });

  describe('소수점 값 처리', () => {
    it('소수점 갭 값을 처리해야 함', () => {
      const customGaps = {
        gapLeft: 1.5,
        gapCenter: 2.75,
        gapRight: 3.25
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables['--gap-left']).toBe('1.5px');
      expect(result.current.cssVariables['--gap-center']).toBe('2.75px');
      expect(result.current.cssVariables['--gap-right']).toBe('3.25px');
    });

    it('매우 작은 소수점 값도 처리해야 함', () => {
      const customGaps = {
        gapLeft: 0.1,
        gapCenter: 0.01
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables['--gap-left']).toBe('0.1px');
      expect(result.current.cssVariables['--gap-center']).toBe('0.01px');
    });
  });

  describe('undefined/null 엣지 케이스', () => {
    it('undefined를 전달해도 기본값을 사용해야 함', () => {
      const { result } = renderHook(() => useGaps(undefined));

      expect(result.current.mergedGaps).toEqual(DEFAULT_GAPS);
      expect(result.current.cssVariables).toEqual({
        '--gap-left': `${DEFAULT_GAPS.gapLeft}px`,
        '--gap-center': `${DEFAULT_GAPS.gapCenter}px`,
        '--gap-right': `${DEFAULT_GAPS.gapRight}px`,
        '--gap-top': `${DEFAULT_GAPS.gapTop}px`,
        '--gap-bottom': `${DEFAULT_GAPS.gapBottom}px`
      });
    });

    it('일부 값만 제공하면 나머지는 기본값으로 대체되어야 함', () => {
      const customGaps = {
        gapLeft: 10
        // gapCenter는 제공하지 않음
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.mergedGaps.gapLeft).toBe(10);
      // 제공하지 않은 값은 기본값 사용
      expect(result.current.mergedGaps.gapCenter).toBe(DEFAULT_GAPS.gapCenter);
      expect(result.current.mergedGaps.gapRight).toBe(DEFAULT_GAPS.gapRight);
      expect(result.current.mergedGaps.gapTop).toBe(DEFAULT_GAPS.gapTop);
      expect(result.current.mergedGaps.gapBottom).toBe(DEFAULT_GAPS.gapBottom);
    });
  });

  describe('타입 안정성', () => {
    it('반환되는 모든 숫자 값이 number 타입이어야 함', () => {
      const { result } = renderHook(() => useGaps({ gapLeft: 10 }));

      expect(typeof result.current.gapValues.gapLeft).toBe('number');
      expect(typeof result.current.gapValues.gapCenter).toBe('number');
      expect(typeof result.current.gapValues.gapRight).toBe('number');
      expect(typeof result.current.gapValues.gapTop).toBe('number');
      expect(typeof result.current.gapValues.gapBottom).toBe('number');
    });
  });

  describe('극단적 값 처리', () => {
    it('매우 큰 값도 올바르게 처리해야 함', () => {
      const customGaps = {
        gapLeft: 999999,
        gapCenter: 1000000
      };

      const { result } = renderHook(() => useGaps(customGaps));

      expect(result.current.cssVariables['--gap-left']).toBe('999999px');
      expect(result.current.cssVariables['--gap-center']).toBe('1000000px');
    });
  });
});

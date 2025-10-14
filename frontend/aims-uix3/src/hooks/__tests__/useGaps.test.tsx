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
});

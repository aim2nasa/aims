import { useMemo } from 'react';
import { GapConfig, DEFAULT_GAPS } from '../types/layout';

/**
 * 갭 파라미터를 CSS 변수로 관리하는 훅
 */
export const useGaps = (gaps?: Partial<GapConfig>) => {
  const mergedGaps = useMemo(() => ({
    ...DEFAULT_GAPS,
    ...gaps
  }), [gaps]);

  // CSS 변수 설정 (gapDef.png 기준)
  const cssVariables = useMemo(() => ({
    '--gap-left': `${mergedGaps.gapLeft}px`,        // G1
    '--gap-center': `${mergedGaps.gapCenter}px`,    // G2
    '--gap-right': `${mergedGaps.gapRight}px`,      // G3
    '--gap-top': `${mergedGaps.gapTop}px`,          // 상단
    '--gap-bottom': `${mergedGaps.gapBottom}px`     // G4
  }), [mergedGaps]);

  // 개별 갭 값 반환 (계산에 필요한 경우)
  const gapValues = useMemo(() => ({
    gapLeft: mergedGaps.gapLeft,
    gapCenter: mergedGaps.gapCenter,
    gapRight: mergedGaps.gapRight,
    gapTop: mergedGaps.gapTop,
    gapBottom: mergedGaps.gapBottom
  }), [mergedGaps]);

  return {
    cssVariables,
    gapValues,
    mergedGaps
  };
};
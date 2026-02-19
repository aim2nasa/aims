/**
 * iOS Dynamic Type 시스템 연동 Hook
 * @description iOS 설정 > 화면 표시 및 밝기 > 텍스트 크기와 연동
 * @since 2025-09-20
 * @version 1.0.0
 */

import { useEffect, useState, useRef } from 'react';
import { logger } from '@/shared/lib/logger';

/**
 * iOS Dynamic Type 크기 단계
 * Apple HIG 표준 크기 단계 (xSmall ~ AX5)
 */
const DYNAMIC_TYPE_SIZES = {
  'xSmall': 0.8,      // 접근성 > 더 작은 텍스트
  'Small': 0.85,      // 작게
  'Medium': 0.9,      // 기본보다 작게
  'Large': 1.0,       // 기본 크기 (iOS 표준)
  'xLarge': 1.1,      // 크게
  'xxLarge': 1.2,     // 더 크게
  'xxxLarge': 1.3,    // 가장 크게

  // 접근성 크기 (iOS 접근성 > 더 큰 텍스트)
  'AX1': 1.4,         // 접근성 1단계
  'AX2': 1.5,         // 접근성 2단계
  'AX3': 1.6,         // 접근성 3단계
  'AX4': 1.8,         // 접근성 4단계
  'AX5': 2.0          // 접근성 5단계 (최대)
};

/**
 * 현재 시스템의 Dynamic Type 설정을 감지하고 추적하는 Hook
 * @returns {Object} - 현재 크기 설정과 스케일 팩터
 */
export function useDynamicType() {
  const [currentSize, setCurrentSize] = useState('Large'); // iOS 기본값
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [isAccessibilitySize, setIsAccessibilitySize] = useState(false);
  // 🍎 resetToSystemDefault 타이머 ref (cleanup용)
  const resetTimer = useRef(null);

  useEffect(() => {
    /**
     * CSS Environment Variables를 통한 시스템 설정 감지
     * iOS Safari에서 제공하는 env() 함수 활용
     */
    const detectSystemTextSize = () => {
      try {
        // CSS에서 계산된 font-scale-factor 읽기
        const computedStyle = getComputedStyle(document.documentElement);
        const systemScaleFactor = parseFloat(
          computedStyle.getPropertyValue('--font-scale-factor') || '1'
        );

        // 시스템 스케일 팩터에 따른 크기 단계 결정
        let detectedSize = 'Large';
        let isAX = false;

        if (systemScaleFactor <= 0.8) {
          detectedSize = 'xSmall';
        } else if (systemScaleFactor <= 0.85) {
          detectedSize = 'Small';
        } else if (systemScaleFactor <= 0.9) {
          detectedSize = 'Medium';
        } else if (systemScaleFactor <= 1.0) {
          detectedSize = 'Large';
        } else if (systemScaleFactor <= 1.1) {
          detectedSize = 'xLarge';
        } else if (systemScaleFactor <= 1.2) {
          detectedSize = 'xxLarge';
        } else if (systemScaleFactor <= 1.3) {
          detectedSize = 'xxxLarge';
        } else if (systemScaleFactor <= 1.4) {
          detectedSize = 'AX1';
          isAX = true;
        } else if (systemScaleFactor <= 1.5) {
          detectedSize = 'AX2';
          isAX = true;
        } else if (systemScaleFactor <= 1.6) {
          detectedSize = 'AX3';
          isAX = true;
        } else if (systemScaleFactor <= 1.8) {
          detectedSize = 'AX4';
          isAX = true;
        } else {
          detectedSize = 'AX5';
          isAX = true;
        }

        setCurrentSize(detectedSize);
        setScaleFactor(systemScaleFactor);
        setIsAccessibilitySize(isAX);

        // CSS 변수 업데이트
        document.documentElement.style.setProperty(
          '--font-scale-factor',
          systemScaleFactor.toString()
        );

        // 접근성 크기 사용 시 body 클래스 추가
        if (isAX) {
          document.body.classList.add('accessibility-text-size');
          document.body.setAttribute('data-text-size', detectedSize);
        } else {
          document.body.classList.remove('accessibility-text-size');
          document.body.setAttribute('data-text-size', detectedSize);
        }

        logger.debug('DynamicType', `감지된 크기: ${detectedSize} (스케일: ${systemScaleFactor})`);

      } catch (error) {
        logger.warn('DynamicType', '시스템 텍스트 크기 감지 실패', error);
        // 기본값으로 폴백
        setCurrentSize('Large');
        setScaleFactor(1.0);
        setIsAccessibilitySize(false);
      }
    };

    /**
     * MediaQuery를 통한 시스템 설정 변경 감지
     * iOS에서 텍스트 크기 변경 시 실시간 반영
     */
    const setupDynamicTypeListener = () => {
      // CSS Container Query 지원 확인
      if (typeof window !== 'undefined' && 'CSS' in window && 'supports' in CSS) {
        // 시스템 설정 변경 감지를 위한 ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
          detectSystemTextSize();
        });

        // document.documentElement 감지
        resizeObserver.observe(document.documentElement);

        return () => {
          resizeObserver.disconnect();
        };
      }

      // 폴백: 주기적 확인 (iOS에서 설정 변경 시 즉시 반영되지 않을 경우)
      const intervalId = setInterval(detectSystemTextSize, 2000);

      return () => {
        clearInterval(intervalId);
      };
    };

    // 초기 감지
    detectSystemTextSize();

    // 실시간 감지 설정
    const cleanup = setupDynamicTypeListener();

    // 컴포넌트 언마운트 시 정리
    return () => {
      cleanup();
      // resetToSystemDefault 타이머도 정리
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  /**
   * 특정 텍스트 크기로 강제 설정
   * @param {string} size - DYNAMIC_TYPE_SIZES의 키
   */
  const setTextSize = (size) => {
    if (size in DYNAMIC_TYPE_SIZES) {
      setCurrentSize(size);
      setScaleFactor(DYNAMIC_TYPE_SIZES[size]);
      setIsAccessibilitySize(size.startsWith('AX'));

      document.documentElement.style.setProperty(
        '--font-scale-factor',
        DYNAMIC_TYPE_SIZES[size].toString()
      );

      document.body.setAttribute('data-text-size', size);

      if (size.startsWith('AX')) {
        document.body.classList.add('accessibility-text-size');
      } else {
        document.body.classList.remove('accessibility-text-size');
      }
    }
  };

  /**
   * 시스템 기본값으로 재설정
   */
  const resetToSystemDefault = () => {
    document.documentElement.style.removeProperty('--font-scale-factor');
    document.body.removeAttribute('data-text-size');
    document.body.classList.remove('accessibility-text-size');

    // 이전 타이머 정리
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }

    // 시스템 설정 재감지 (cleanup 가능하도록 ref 사용)
    resetTimer.current = setTimeout(() => {
      const computedStyle = getComputedStyle(document.documentElement);
      const systemScaleFactor = parseFloat(
        computedStyle.getPropertyValue('--font-scale-factor') || '1'
      );
      setScaleFactor(systemScaleFactor);
    }, 100);
  };

  return {
    currentSize,           // 현재 크기 단계 ('Large', 'AX1', etc.)
    scaleFactor,          // 현재 스케일 팩터 (1.0 = 기본)
    isAccessibilitySize,  // 접근성 크기 사용 여부
    availableSizes: Object.keys(DYNAMIC_TYPE_SIZES), // 사용 가능한 모든 크기
    setTextSize,          // 수동 크기 설정 함수
    resetToSystemDefault, // 시스템 기본값 재설정 함수

    // 편의 함수들
    isSmallText: scaleFactor < 1.0,
    isLargeText: scaleFactor > 1.0,
    isExtraLarge: scaleFactor >= 1.4,
  };
}

/**
 * 글로벌 Dynamic Type 설정을 위한 초기화 함수
 * App.js에서 한 번만 호출
 */
export function initializeDynamicType() {
  // iOS 기본 크기 설정
  if (!document.documentElement.style.getPropertyValue('--font-scale-factor')) {
    document.documentElement.style.setProperty('--font-scale-factor', '1');
  }

  // 접근성 크기 감지 시 추가 스타일 적용
  const style = document.createElement('style');
  style.textContent = `
    /* 접근성 텍스트 크기 사용 시 추가 여백 */
    .accessibility-text-size {
      --spacing-scale: calc(var(--font-scale-factor) * 0.8);
    }

    .accessibility-text-size .button {
      padding: calc(var(--spacing-2) * var(--spacing-scale)) calc(var(--spacing-4) * var(--spacing-scale));
    }

    .accessibility-text-size .text-skeleton {
      min-height: calc(1.2em * var(--font-scale-factor));
    }
  `;

  if (!document.head.querySelector('#dynamic-type-styles')) {
    style.id = 'dynamic-type-styles';
    document.head.appendChild(style);
  }

  logger.debug('DynamicType', 'iOS Dynamic Type 시스템 초기화 완료');
}

export default useDynamicType;
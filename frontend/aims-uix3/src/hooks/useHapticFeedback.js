/**
 * iOS 16+ 햅틱 피드백 시스템 Hook
 * @description iOS 네이티브 햅틱 패턴을 웹에서 구현
 * @since 2025-09-20
 * @version 1.0.0
 */

import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/shared/lib/logger';

/**
 * iOS 햅틱 피드백 타입 정의
 * Apple HIG 표준 햅틱 패턴
 */
export const HAPTIC_TYPES = {
  // UIImpactFeedback 패턴
  LIGHT: 'light',         // 가벼운 터치 (selection, hover)
  MEDIUM: 'medium',       // 중간 터치 (button press, toggle)
  HEAVY: 'heavy',         // 강한 터치 (destructive action, error)

  // UINotificationFeedback 패턴
  SUCCESS: 'success',     // 성공 액션 (submit, save)
  WARNING: 'warning',     // 경고 액션 (validation error)
  ERROR: 'error',         // 오류 액션 (critical error, delete)

  // UISelectionFeedback 패턴
  SELECTION: 'selection', // 선택 변경 (scroll, picker, slider)

  // iOS 16+ 추가 패턴
  SOFT: 'soft',          // 매우 부드러운 피드백 (background interaction)
  RIGID: 'rigid',        // 딱딱한 피드백 (mechanical button feel)
};

/**
 * 햅틱 피드백 강도와 지속시간 매핑
 * iOS 네이티브 스펙 기반
 */
const HAPTIC_CONFIG = {
  [HAPTIC_TYPES.SOFT]: { intensity: 0.3, duration: 30 },
  [HAPTIC_TYPES.LIGHT]: { intensity: 0.5, duration: 50 },
  [HAPTIC_TYPES.SELECTION]: { intensity: 0.6, duration: 60 },
  [HAPTIC_TYPES.MEDIUM]: { intensity: 0.7, duration: 100 },
  [HAPTIC_TYPES.SUCCESS]: { intensity: 0.8, duration: 120 },
  [HAPTIC_TYPES.WARNING]: { intensity: 0.85, duration: 130 },
  [HAPTIC_TYPES.HEAVY]: { intensity: 0.9, duration: 150 },
  [HAPTIC_TYPES.RIGID]: { intensity: 0.95, duration: 160 },
  [HAPTIC_TYPES.ERROR]: { intensity: 1.0, duration: 200 },
};

/**
 * iOS 햅틱 피드백 Hook
 * @returns {Object} 햅틱 피드백 함수들과 설정
 */
export function useHapticFeedback() {
  const [isHapticEnabled, setIsHapticEnabled] = useState(true);
  const [hapticIntensity, setHapticIntensity] = useState(1.0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  // 시스템 설정 감지
  useEffect(() => {
    // 브라우저 환경 체크
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    // 모션 감소 설정 감지
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(motionQuery.matches);

    const handleMotionChange = (e) => {
      setIsReducedMotion(e.matches);
      if (e.matches) {
        logger.debug('Haptic', '모션 감소 모드 활성화 - 햅틱 강도 감소');
        setHapticIntensity(0.5); // 모션 감소 시 햅틱도 감소
      } else {
        setHapticIntensity(1.0);
      }
    };

    motionQuery.addEventListener('change', handleMotionChange);

    // 사용자 햅틱 설정 확인 (localStorage)
    const savedHapticSetting = localStorage.getItem('aims-haptic-enabled');
    if (savedHapticSetting !== null) {
      setIsHapticEnabled(JSON.parse(savedHapticSetting));
    }

    const savedIntensitySetting = localStorage.getItem('aims-haptic-intensity');
    if (savedIntensitySetting !== null) {
      setHapticIntensity(parseFloat(savedIntensitySetting));
    }

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  /**
   * 브라우저별 햅틱 피드백 구현
   * @param {string} type - HAPTIC_TYPES의 값
   * @param {number} customIntensity - 커스텀 강도 (0-1)
   */
  const triggerHaptic = useCallback((type, customIntensity = null) => {
    if (!isHapticEnabled) return;

    const config = HAPTIC_CONFIG[type];
    if (!config) {
      logger.warn('Haptic', `알 수 없는 햅틱 타입: ${type}`);
      return;
    }

    const intensity = customIntensity !== null ? customIntensity :
                     config.intensity * hapticIntensity;

    try {
      // 웹 브라우저에서는 Vibration API 사용 시 사용자 제스처 필요
      // 브라우저 Intervention 경고를 피하기 위해 시각적 햅틱만 사용
      // TODO: 실제 모바일 앱으로 패키징할 때 Vibration API 활성화
      triggerVisualHaptic(type, intensity);

      logger.debug('Haptic', `${type} 피드백 실행 (강도: ${intensity.toFixed(2)})`);

    } catch (error) {
      logger.warn('Haptic', '햅틱 피드백 실행 실패', error);
    }
  }, [isHapticEnabled, hapticIntensity]);

  /**
   * iOS 네이티브 스타일 진동 패턴 생성
   * @param {string} type - 햅틱 타입
   * @param {number} intensity - 강도
   * @returns {number[]} - 진동 패턴 배열
   */
  const generateiOSVibrationPattern = (type, intensity) => {
    const basePattern = {
      [HAPTIC_TYPES.SOFT]: [10],
      [HAPTIC_TYPES.LIGHT]: [30],
      [HAPTIC_TYPES.SELECTION]: [40],
      [HAPTIC_TYPES.MEDIUM]: [60],
      [HAPTIC_TYPES.SUCCESS]: [40, 20, 60], // 성공: 짧-쉼-길
      [HAPTIC_TYPES.WARNING]: [50, 30, 50], // 경고: 중-쉼-중
      [HAPTIC_TYPES.HEAVY]: [100],
      [HAPTIC_TYPES.RIGID]: [80, 10, 20], // 딱딱함: 길-짧쉬-짧
      [HAPTIC_TYPES.ERROR]: [60, 40, 60, 40, 100], // 오류: 중-쉼-중-쉼-길
    };

    const pattern = basePattern[type] || [50];
    return pattern.map(duration => Math.round(duration * intensity));
  };

  /**
   * 웹 기반 시각적 햅틱 피드백
   * @param {string} type - 햅틱 타입
   * @param {number} intensity - 강도
   */
  const triggerVisualHaptic = (type, intensity) => {
    // 브라우저 환경 체크
    if (typeof document === 'undefined') {
      return;
    }

    // CSS 애니메이션을 통한 시각적 피드백
    document.documentElement.style.setProperty(
      '--haptic-intensity',
      intensity.toString()
    );

    document.body.classList.add(`haptic-${type}`);

    // 햅틱 지속시간 후 클래스 제거
    const timerId = setTimeout(() => {
      if (typeof document !== 'undefined') {
        document.body.classList.remove(`haptic-${type}`);
      }
    }, HAPTIC_CONFIG[type].duration);

    // 타이머 ID 반환 (필요시 정리용)
    return timerId;
  };

  /**
   * 특정 요소에 햅틱 피드백 바인딩
   * @param {HTMLElement} element - 대상 요소
   * @param {string} hapticType - 햅틱 타입
   * @param {string} eventType - 이벤트 타입 ('click', 'hover', etc.)
   */
  const bindHapticToElement = useCallback((element, hapticType, eventType = 'click') => {
    if (!element) return;

    const hapticHandler = (e) => {
      // 비활성화된 요소는 햅틱 없음
      if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
        return;
      }

      triggerHaptic(hapticType);
    };

    element.addEventListener(eventType, hapticHandler);

    // 정리 함수 반환
    return () => {
      element.removeEventListener(eventType, hapticHandler);
    };
  }, [triggerHaptic]);

  /**
   * React 컴포넌트용 햅틱 이벤트 핸들러 생성
   * @param {string} hapticType - 햅틱 타입
   * @param {Function} originalHandler - 원본 이벤트 핸들러
   * @returns {Function} - 햅틱이 포함된 이벤트 핸들러
   */
  const withHaptic = useCallback((hapticType, originalHandler = null) => {
    return (event) => {
      triggerHaptic(hapticType);
      if (originalHandler) {
        originalHandler(event);
      }
    };
  }, [triggerHaptic]);

  /**
   * 햅틱 설정 업데이트
   */
  const updateHapticSettings = useCallback((enabled, intensity = hapticIntensity) => {
    setIsHapticEnabled(enabled);
    setHapticIntensity(intensity);

    // 설정 저장 (브라우저 환경에서만)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('aims-haptic-enabled', JSON.stringify(enabled));
      localStorage.setItem('aims-haptic-intensity', intensity.toString());
    }

    logger.debug('Haptic', `설정 업데이트 - 활성화: ${enabled}, 강도: ${intensity}`);
  }, [hapticIntensity]);

  /**
   * 햅틱 테스트 함수
   */
  const testHaptic = useCallback(() => {
    Object.values(HAPTIC_TYPES).forEach((type, index) => {
      setTimeout(() => {
        triggerHaptic(type);
      }, index * 300);
    });
  }, [triggerHaptic]);

  return {
    // 핵심 함수들
    triggerHaptic,              // 햅틱 피드백 실행
    withHaptic,                 // React 핸들러에 햅틱 추가
    bindHapticToElement,        // DOM 요소에 햅틱 바인딩

    // 설정 및 상태
    isHapticEnabled,            // 햅틱 활성화 상태
    hapticIntensity,            // 햅틱 강도 (0-1)
    isReducedMotion,            // 모션 감소 모드 여부
    updateHapticSettings,       // 설정 업데이트 함수

    // 유틸리티
    testHaptic,                 // 햅틱 테스트
    hapticTypes: HAPTIC_TYPES,  // 사용 가능한 햅틱 타입들

    // 편의 함수들 - 자주 사용되는 패턴
    success: () => triggerHaptic(HAPTIC_TYPES.SUCCESS),
    error: () => triggerHaptic(HAPTIC_TYPES.ERROR),
    warning: () => triggerHaptic(HAPTIC_TYPES.WARNING),
    selection: () => triggerHaptic(HAPTIC_TYPES.SELECTION),
    buttonPress: () => triggerHaptic(HAPTIC_TYPES.MEDIUM),
    lightTouch: () => triggerHaptic(HAPTIC_TYPES.LIGHT),
  };
}

/**
 * 글로벌 햅틱 CSS 스타일 초기화
 * App.js에서 한 번만 호출
 */
export function initializeHapticStyles() {
  // 브라우저 환경 체크
  if (typeof document === 'undefined') {
    return;
  }

  const style = document.createElement('style');
  style.textContent = `
    /* 햅틱 피드백 시각적 표현 */
    :root {
      --haptic-intensity: 1;
    }

    /* 햅틱 피드백 애니메이션 */
    .haptic-light {
      animation: haptic-pulse-light calc(var(--duration-haptic-light) * 1ms) var(--easing-haptic-light);
    }

    .haptic-medium {
      animation: haptic-pulse-medium calc(var(--duration-haptic-medium) * 1ms) var(--easing-haptic-medium);
    }

    .haptic-heavy {
      animation: haptic-pulse-heavy calc(var(--duration-haptic-heavy) * 1ms) var(--easing-haptic-heavy);
    }

    .haptic-success {
      animation: haptic-success calc(120ms) var(--easing-haptic-medium);
    }

    .haptic-error {
      animation: haptic-error calc(200ms) var(--easing-haptic-heavy);
    }

    /* 햅틱 애니메이션 키프레임 */
    @keyframes haptic-pulse-light {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(calc(1 + 0.01 * var(--haptic-intensity))); }
    }

    @keyframes haptic-pulse-medium {
      0%, 100% { transform: scale(1); }
      30% { transform: scale(calc(1 + 0.02 * var(--haptic-intensity))); }
    }

    @keyframes haptic-pulse-heavy {
      0%, 100% { transform: scale(1); }
      25% { transform: scale(calc(1 + 0.03 * var(--haptic-intensity))); }
    }

    @keyframes haptic-success {
      0%, 100% { filter: brightness(1); }
      50% { filter: brightness(calc(1 + 0.1 * var(--haptic-intensity))); }
    }

    @keyframes haptic-error {
      0%, 100% { filter: hue-rotate(0deg); }
      25%, 75% { filter: hue-rotate(calc(5deg * var(--haptic-intensity))); }
    }

    /* 모션 감소 모드에서 햅틱 애니메이션 비활성화 */
    @media (prefers-reduced-motion: reduce) {
      .haptic-light,
      .haptic-medium,
      .haptic-heavy,
      .haptic-success,
      .haptic-error {
        animation: none;
      }
    }
  `;

  if (!document.head.querySelector('#haptic-styles')) {
    style.id = 'haptic-styles';
    document.head.appendChild(style);
  }

  logger.debug('Haptic', '햅틱 피드백 CSS 스타일 초기화 완료');
}

export default useHapticFeedback;

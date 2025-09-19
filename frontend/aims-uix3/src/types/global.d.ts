/**
 * Global Type Declarations for AIMS UIX3
 * @since 2025-09-20
 * @version 1.0.0
 */

declare global {
  interface Window {
    /** AIMS 햅틱 피드백 시스템 전역 인스턴스 */
    aimsHaptic?: {
      triggerHaptic: (type: string, customIntensity?: number | null) => void;
      withHaptic: (hapticType: string, originalHandler?: ((event: any) => void) | null) => (event: any) => void;
      bindHapticToElement: (element: HTMLElement, hapticType: string, eventType?: string) => (() => void) | undefined;
      isHapticEnabled: boolean;
      hapticIntensity: number;
      isReducedMotion: boolean;
      updateHapticSettings: (enabled: boolean, intensity?: number) => void;
      testHaptic: () => void;
      hapticTypes: any;
      success: () => void;
      error: () => void;
      warning: () => void;
      selection: () => void;
      buttonPress: () => void;
      lightTouch: () => void;
    };
  }
}

export {}
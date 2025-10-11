/**
 * Global Type Declarations for AIMS UIX3
 * @since 2025-09-20
 * @version 1.0.0
 */

type HapticEventHandler<TEvent extends Event = Event> = (event: TEvent) => void;

interface AimsHaptic {
  triggerHaptic: (type: string, customIntensity?: number | null) => void;
  withHaptic: <TEvent extends Event = Event>(
    hapticType: string,
    originalHandler?: HapticEventHandler<TEvent> | null
  ) => HapticEventHandler<TEvent>;
  bindHapticToElement: (
    element: HTMLElement,
    hapticType: string,
    eventType?: string
  ) => (() => void) | undefined;
  isHapticEnabled: boolean;
  hapticIntensity: number;
  isReducedMotion: boolean;
  updateHapticSettings: (enabled: boolean, intensity?: number) => void;
  testHaptic: () => void;
  hapticTypes: Record<string, string>;
  success: () => void;
  error: () => void;
  warning: () => void;
  selection: () => void;
  buttonPress: () => void;
  lightTouch: () => void;
}

declare global {
  interface Window {
    /** AIMS 햅틱 피드백 시스템 전역 인스턴스 */
    aimsHaptic?: AimsHaptic;
  }
}

export {}

/**
 * Type declarations for useHapticFeedback Hook
 * @since 2025-09-20
 * @version 1.0.0
 */

export const HAPTIC_TYPES: {
  readonly LIGHT: 'light';
  readonly MEDIUM: 'medium';
  readonly HEAVY: 'heavy';
  readonly SUCCESS: 'success';
  readonly WARNING: 'warning';
  readonly ERROR: 'error';
  readonly SELECTION: 'selection';
  readonly SOFT: 'soft';
  readonly RIGID: 'rigid';
};

export type HapticType = typeof HAPTIC_TYPES[keyof typeof HAPTIC_TYPES];

export interface HapticConfig {
  intensity: number;
  duration: number;
}

export interface UseHapticFeedbackReturn {
  triggerHaptic: (type: string, customIntensity?: number | null) => void;
  withHaptic: (hapticType: string, originalHandler?: ((event: any) => void) | null) => (event: any) => void;
  bindHapticToElement: (element: HTMLElement, hapticType: string, eventType?: string) => (() => void) | undefined;
  isHapticEnabled: boolean;
  hapticIntensity: number;
  isReducedMotion: boolean;
  updateHapticSettings: (enabled: boolean, intensity?: number) => void;
  testHaptic: () => void;
  hapticTypes: typeof HAPTIC_TYPES;
  success: () => void;
  error: () => void;
  warning: () => void;
  selection: () => void;
  buttonPress: () => void;
  lightTouch: () => void;
}

export function useHapticFeedback(): UseHapticFeedbackReturn;
export function initializeHapticStyles(): void;
export default useHapticFeedback;
/**
 * Type declarations for useDynamicType Hook
 * @since 2025-09-20
 * @version 1.0.0
 */

export type DynamicTypeSize =
  | 'xSmall'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'xLarge'
  | 'xxLarge'
  | 'xxxLarge'
  | 'AX1'
  | 'AX2'
  | 'AX3'
  | 'AX4'
  | 'AX5';

export interface UseDynamicTypeReturn {
  currentSize: DynamicTypeSize;
  scaleFactor: number;
  isAccessibilitySize: boolean;
  availableSizes: string[];
  setTextSize: (size: DynamicTypeSize) => void;
  resetToSystemDefault: () => void;
  isSmallText: boolean;
  isLargeText: boolean;
  isExtraLarge: boolean;
}

export function useDynamicType(): UseDynamicTypeReturn;
export function initializeDynamicType(): void;
export default useDynamicType;
// AIMS 모바일 앱 테마 설정

export const colors = {
  // 배경색
  background: '#1a1a2e',
  backgroundSecondary: '#16213e',
  backgroundTertiary: '#0f3460',

  // 강조색
  primary: '#6366f1',
  primaryLight: '#818cf8',
  primaryDark: '#4f46e5',

  // 텍스트
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  // 상태색
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // 채팅
  userBubble: '#6366f1',
  assistantBubble: '#16213e',

  // 기타
  border: '#334155',
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: '#ffffff',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
};

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

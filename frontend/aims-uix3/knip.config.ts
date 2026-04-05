import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/main.tsx', 'src/app/router.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'src/**/*.test.{ts,tsx}',
    'src/**/__tests__/**',
    'src/vite-env.d.ts',
    // 타입 선언 파일 (JS 파일의 타입 쌍)
    'src/hooks/useDynamicType.d.ts',
    'src/hooks/useHapticFeedback.d.ts',
    'src/types/global.d.ts',
    // barrel 파일 (테스트에서 경유 import)
    'src/components/DocumentViews/DocumentExplorerView/index.ts',
    'src/features/customer/components/RelationshipModal/index.ts',
    // 비활성 기능 (향후 재활성화 예정)
    'src/shared/components/OnboardingTour/**',
    'src/shared/components/RightClickGuide/**',
    'src/shared/ui/AIUsageChart/**',
  ],
  ignoreDependencies: [
    '@rollup/rollup-linux-x64-gnu',  // CI 전용
  ],
};

export default config;

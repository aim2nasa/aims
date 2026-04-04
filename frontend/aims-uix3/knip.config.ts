import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/main.tsx', 'src/app/router.tsx'],
  project: ['src/**/*.{ts,tsx}'],
  ignore: [
    'src/**/*.test.{ts,tsx}',
    'src/**/__tests__/**',
    'src/vite-env.d.ts',
  ],
  ignoreDependencies: [
    '@rollup/rollup-linux-x64-gnu',  // CI 전용
  ],
};

export default config;

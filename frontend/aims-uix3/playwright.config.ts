import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 테스트 설정
 * - E2E 테스트
 * - 접근성 테스트 (axe-core)
 * - 시각적 회귀 테스트
 *
 * 속도 최적화: setup 프로젝트에서 1회 로그인 → storageState 재사용
 */
export default defineConfig({
  // 테스트 파일 위치
  testDir: './tests',

  // 각 테스트의 최대 실행 시간 (5분)
  timeout: 300000,

  // 각 expect() 호출의 최대 대기 시간 (10초)
  expect: {
    timeout: 10000,
    // 시각적 회귀 테스트 설정
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01, // 1% 픽셀 차이 허용
      threshold: 0.2, // 픽셀 색상 차이 임계값
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.01,
    },
  },

  // 스냅샷 경로 설정 (시각적 회귀 테스트)
  snapshotDir: './tests/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{ext}',

  // 병렬 실행 비활성화 (순차 실행 - 스크린샷 안정성)
  fullyParallel: false,
  workers: 1,

  // 실패한 테스트 재시도 횟수
  retries: process.env.CI ? 2 : 0,

  // 리포터 설정
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  // 모든 프로젝트에 공통으로 적용되는 설정
  use: {
    // 기본 URL
    baseURL: 'https://localhost:5177',
    ignoreHTTPSErrors: true,

    // 각 액션 실행 전 대기 시간 (밀리초)
    actionTimeout: 15000,

    // 네비게이션 타임아웃 (15초)
    navigationTimeout: 15000,

    // 실패 시 스크린샷 촬영
    screenshot: 'only-on-failure',

    // 실패 시 비디오 녹화
    video: 'retain-on-failure',

    // 실패 시 트레이스 저장
    trace: 'retain-on-failure',

    // 브라우저 컨텍스트 설정
    viewport: { width: 1920, height: 1080 },

    // 느린 모션 없음 (빠른 실행)
    launchOptions: {
      slowMo: 0,
    },
  },

  // 테스트 프로젝트 설정
  projects: [
    // 1. Setup: 로그인 + storageState 저장 (1회만 실행)
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // 2. 테스트: storageState 재사용 (로그인 불필요)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/storageState.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});

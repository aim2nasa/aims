import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 테스트 설정
 * 고객 CRUD 100회 반복 자동화 테스트용
 */
export default defineConfig({
  // 테스트 파일 위치
  testDir: './tests',

  // 각 테스트의 최대 실행 시간 (1시간)
  timeout: 3600000,

  // 각 expect() 호출의 최대 대기 시간 (10초)
  expect: {
    timeout: 10000,
  },

  // 병렬 실행 비활성화 (순차 실행)
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
    baseURL: 'http://localhost:5173',

    // 각 액션 실행 전 대기 시간 (밀리초)
    actionTimeout: 30000,

    // 네비게이션 타임아웃 (30초)
    navigationTimeout: 30000,

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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // 필요시 다른 브라우저도 추가 가능
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    //
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 웹 서버 자동 실행 설정 (선택사항)
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120000,
  // },
});

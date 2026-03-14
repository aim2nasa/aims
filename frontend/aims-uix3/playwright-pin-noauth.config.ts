import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/login-pin-phase2.spec.ts'],
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '/d/tmp/pin_test_results.json' }],
  ],
  use: {
    baseURL: 'https://localhost:5177',
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    navigationTimeout: 15000,
    screenshot: 'on',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium-noauth',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

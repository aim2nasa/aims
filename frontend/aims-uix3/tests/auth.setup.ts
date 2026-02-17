import { test as setup } from '@playwright/test';
import { loginAndSetup } from './fixtures';

const AUTH_FILE = 'tests/.auth/storageState.json';

/**
 * 인증 setup - 한 번만 실행되어 storageState를 저장.
 * 이후 모든 테스트는 이 storageState를 재사용하여 로그인 없이 시작.
 */
setup('authenticate', async ({ page }) => {
  await loginAndSetup(page);

  // 인증 상태를 파일로 저장 (localStorage + cookies 포함)
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`[Setup] storageState 저장 완료: ${AUTH_FILE}`);
});

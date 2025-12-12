import { Page } from '@playwright/test';

/**
 * 테스트용 인증 헬퍼
 */

/**
 * 개발용 로그인 건너뛰기
 */
export async function skipDevLogin(page: Page): Promise<void> {
  const skipLoginButton = page.locator('button:has-text("개발용 로그인 건너뛰기")');
  if (await skipLoginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipLoginButton.click();
    await page.waitForTimeout(2000);
  }
}

/**
 * 온보딩 가이드 닫기
 */
export async function closeOnboarding(page: Page): Promise<void> {
  const onboardingTour = page.locator('.onboarding-tour');
  if (await onboardingTour.isVisible({ timeout: 2000 }).catch(() => false)) {
    const closeButton = page.locator(
      '.onboarding-tour button:has-text("건너뛰기"), ' +
      '.onboarding-tour button:has-text("닫기"), ' +
      '.onboarding-tour [aria-label="닫기"]'
    );
    if (await closeButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.first().click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  }
}

/**
 * 전체 로그인 프로세스 (건너뛰기 + 온보딩 닫기)
 */
export async function loginAndSetup(page: Page): Promise<void> {
  await page.goto('/');
  await skipDevLogin(page);
  await closeOnboarding(page);
}

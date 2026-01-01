import { Page } from '@playwright/test';

/**
 * 테스트용 인증 헬퍼
 */

/**
 * 개발용 로그인 건너뛰기
 * - Ctrl+Alt+Shift+D로 개발자 모드 활성화
 * - 개발용 로그인 건너뛰기 버튼 클릭
 */
export async function skipDevLogin(page: Page): Promise<void> {
  // 이미 로그인 되어 있으면 스킵
  const isLoggedIn = await page.locator('.header-chat-button, .layout-leftpane').first().isVisible({ timeout: 2000 }).catch(() => false);
  if (isLoggedIn) {
    console.log('[Auth] 이미 로그인됨');
    return;
  }

  // 로그인 페이지인지 확인
  const loginPage = page.locator('.login-container, button:has-text("카카오 로그인")').first();
  if (!await loginPage.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('[Auth] 로그인 페이지 아님');
    return;
  }

  // 개발자 모드 활성화 (Ctrl+Alt+Shift+D)
  await page.keyboard.press('Control+Alt+Shift+D');
  await page.waitForTimeout(500);
  console.log('[Auth] 개발자 모드 활성화 시도');

  // 개발용 로그인 건너뛰기 버튼 대기 및 클릭
  const skipLoginButton = page.locator('button:has-text("개발용 로그인 건너뛰기")');
  if (await skipLoginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipLoginButton.click();
    console.log('[Auth] 개발용 로그인 버튼 클릭');
    // 로그인 완료 대기
    await page.waitForSelector('.header-chat-button, .layout-leftpane', { timeout: 10000 });
    console.log('[Auth] 로그인 완료');
  } else {
    console.log('[Auth] 개발용 로그인 버튼 없음 - 이미 활성화되었거나 다른 상태');
  }
}

/**
 * 온보딩 가이드 닫기
 */
export async function closeOnboarding(page: Page): Promise<void> {
  // 온보딩이 보이는지 확인하고, 보이면 닫기
  for (let i = 0; i < 5; i++) {
    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    console.log(`[Auth] 온보딩 닫기 시도 ${i + 1}`);

    // 방법 1: ESC 키
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    if (!await onboardingTour.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('[Auth] 온보딩 ESC로 닫힘');
      break;
    }

    // 방법 2: 건너뛰기 버튼 클릭
    const skipButton = page.locator('.onboarding-tour button:has-text("건너뛰기")');
    if (await skipButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipButton.click({ force: true });
      await page.waitForTimeout(500);
      console.log('[Auth] 온보딩 건너뛰기 버튼 클릭');
    }

    // 방법 3: 닫기 버튼 클릭
    const closeButton = page.locator('.onboarding-tour__close, .onboarding-tour button:has-text("닫기")');
    if (await closeButton.first().isVisible({ timeout: 500 }).catch(() => false)) {
      await closeButton.first().click({ force: true });
      await page.waitForTimeout(500);
      console.log('[Auth] 온보딩 닫기 버튼 클릭');
    }

    // 방법 4: 오버레이 클릭
    const overlay = page.locator('.onboarding-tour__overlay');
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await overlay.click({ position: { x: 10, y: 10 }, force: true });
      await page.waitForTimeout(500);
    }
  }

  // 최종 확인
  const finalCheck = page.locator('.onboarding-tour');
  if (await finalCheck.isVisible({ timeout: 500 }).catch(() => false)) {
    console.log('[Auth] 경고: 온보딩이 여전히 표시됨');
  } else {
    console.log('[Auth] 온보딩 닫힘 확인');
  }
}

/**
 * 전체 로그인 프로세스 (건너뛰기 + 온보딩 닫기)
 */
export async function loginAndSetup(page: Page): Promise<void> {
  await page.goto('/');

  // localStorage에 온보딩 완료 상태 미리 설정 (실제 키: aims_onboarding_completed)
  await page.evaluate(() => {
    localStorage.setItem('aims_onboarding_completed', 'true');
  });

  await skipDevLogin(page);
  await closeOnboarding(page);
}

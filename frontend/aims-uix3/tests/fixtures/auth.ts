import { Page } from '@playwright/test';

/**
 * 테스트용 인증 헬퍼
 *
 * /api/dev/ensure-user API를 직접 호출하여 JWT 토큰을 발급받고
 * localStorage에 주입하는 방식. 키보드 단축키에 의존하지 않아 안정적.
 */

// 테스트에 사용할 계정 (곽승철)
const TEST_USER_EMAIL = 'aim2nasa@gmail.com';

/**
 * 개발 계정으로 로그인 (API 직접 호출 + localStorage 토큰 주입)
 */
export async function loginAndSetup(page: Page): Promise<void> {
  // 1. 먼저 페이지에 접근하여 도메인 컨텍스트 생성
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // 2. /api/dev/ensure-user API 호출하여 JWT 토큰 발급 (곽승철 계정)
  const response = await page.request.post('/api/dev/ensure-user', {
    headers: { 'Content-Type': 'application/json' },
    data: { email: TEST_USER_EMAIL },
  });

  if (!response.ok()) {
    throw new Error(`[Auth] 개발 계정 API 실패: ${response.status()} ${response.statusText()}`);
  }

  const data = await response.json();
  const token = data.token;
  const userId = data.user?._id;

  if (!token) {
    throw new Error('[Auth] API 응답에 토큰 없음');
  }

  console.log(`[Auth] 토큰 발급 완료 (userId: ${userId})`);

  // 3. localStorage에 인증 데이터 주입 (Zustand persist 형식)
  await page.evaluate(({ token, userId }) => {
    // Zustand auth store (auth-storage-v2) - partialize로 token만 저장
    localStorage.setItem('auth-storage-v2', JSON.stringify({
      state: { token },
      version: 0,
    }));

    // 현재 사용자 ID
    if (userId) {
      localStorage.setItem('aims-current-user-id', userId);
    }

    // 온보딩 완료 상태 (가이드 팝업 방지)
    localStorage.setItem('aims_onboarding_completed', 'true');
  }, { token, userId });

  // 4. 페이지 새로고침 → 앱이 토큰을 읽고 /api/auth/me로 사용자 정보 조회
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // 5. 로그인 완료 대기 (메인 UI 표시 확인)
  await page.waitForSelector('.layout-leftpane, .header-chat-button', { timeout: 15000 });
  console.log('[Auth] 로그인 + 메인 UI 로드 완료');

  // 6. 온보딩 팝업이 혹시 뜨면 닫기
  await closeOnboarding(page);
}

/**
 * 온보딩 가이드 닫기
 */
async function closeOnboarding(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 1000 }).catch(() => false)) {
      return;
    }

    console.log(`[Auth] 온보딩 닫기 시도 ${i + 1}`);

    // ESC 키로 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    if (!await onboardingTour.isVisible({ timeout: 500 }).catch(() => false)) {
      return;
    }

    // 건너뛰기/닫기 버튼 클릭
    const closeBtn = page.locator('.onboarding-tour button:has-text("건너뛰기"), .onboarding-tour__close').first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(300);
    }
  }
}

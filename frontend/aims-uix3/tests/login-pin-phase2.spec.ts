/**
 * LoginPage Phase 2 — PIN 입력 모드 E2E 테스트
 * PC(1280x720) + 모바일(iPhone 12: 390x844) + 일반 모드 regression
 */

import { test, expect, Page } from '@playwright/test';

// localStorage에 기억된 사용자 정보 주입 후 PIN 모드 페이지로 이동
async function goToPinMode(page: Page) {
  // 1. /login 먼저 로드 (domcontentloaded로 빠르게)
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // 2. localStorage 주입
  await page.evaluate(() => {
    localStorage.setItem('aims-remembered-user', JSON.stringify({
      userId: 'test123',
      name: '김소라',
      authProvider: 'kakao',
    }));
  });

  // 3. PIN 모드로 이동 (load 이벤트까지만 대기)
  await page.goto('/login?mode=pin', { waitUntil: 'load' });

  // 4. React 렌더링 완료 대기: login-pin-container가 나타날 때까지
  await page.waitForSelector('.login-pin-container', { timeout: 10000 });
}

// 소셜 로그인 일반 페이지로 이동
async function goToSocialLogin(page: Page) {
  await page.goto('/login', { waitUntil: 'load' });
  await page.waitForSelector('.social-login-buttons', { timeout: 10000 });
}

// ─────────────────────────────────────────────
// PC 뷰포트 (1280x720) 테스트
// ─────────────────────────────────────────────
test.describe('PC 뷰포트 (1280x720) — PIN 모드', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await goToPinMode(page);
  });

  test('TC-01: "간편 비밀번호를 입력하세요" 텍스트 표시', async ({ page }) => {
    await expect(page.getByText('간편 비밀번호를 입력하세요')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc01_pin_message.png' });
  });

  test('TC-02: "김소라 님" 텍스트 표시', async ({ page }) => {
    await expect(page.getByText('김소라 님')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc02_pin_name.png' });
  });

  test('TC-03: PIN dot 4개 표시 (.pin-dot 요소 4개)', async ({ page }) => {
    const dots = page.locator('.pin-dot');
    await expect(dots).toHaveCount(4);
    await page.screenshot({ path: 'D:/tmp/e2e_tc03_pin_dots.png' });
  });

  test('TC-04: 아바타 이니셜 "김" 표시', async ({ page }) => {
    const avatar = page.locator('.login-pin-avatar');
    await expect(avatar).toBeVisible();
    await expect(avatar).toContainText('김');
    await page.screenshot({ path: 'D:/tmp/e2e_tc04_avatar.png' });
  });

  test('TC-05: "다른 계정으로 로그인" 링크 표시', async ({ page }) => {
    await expect(page.getByText('다른 계정으로 로그인')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc05_switch_link.png' });
  });

  test('TC-06: "비밀번호를 잊으셨나요?" 링크 표시', async ({ page }) => {
    await expect(page.getByText('비밀번호를 잊으셨나요?')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc06_forgot_link.png' });
  });

  test('TC-07: "다른 계정으로 로그인" 클릭 → 소셜 로그인 버튼 3개 표시', async ({ page }) => {
    await page.getByText('다른 계정으로 로그인').click();

    // URL이 PIN 모드를 벗어나야 함
    await expect(page).not.toHaveURL(/mode=pin/);

    // 소셜 로그인 버튼 3개 확인
    await expect(page.locator('[aria-label="카카오 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="네이버 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="구글 로그인"]')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc07_social_buttons.png' });
  });
});

// ─────────────────────────────────────────────
// 모바일 뷰포트 (iPhone 12: 390x844) 테스트
// ─────────────────────────────────────────────
test.describe('모바일 뷰포트 (390x844) — PIN 모드', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await goToPinMode(page);
  });

  test('TC-08: 모바일 — "간편 비밀번호를 입력하세요" 텍스트 표시', async ({ page }) => {
    await expect(page.getByText('간편 비밀번호를 입력하세요')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc08_mobile_pin_message.png' });
  });

  test('TC-09: 모바일 — PIN dot 4개 표시', async ({ page }) => {
    const dots = page.locator('.pin-dot');
    await expect(dots).toHaveCount(4);
    await page.screenshot({ path: 'D:/tmp/e2e_tc09_mobile_dots.png' });
  });

  test('TC-10: 모바일 — login-pin-container padding-top 80px (상단 정렬)', async ({ page }) => {
    const container = page.locator('.login-pin-container');
    await expect(container).toBeVisible();

    const paddingTop = await container.evaluate((el) => {
      return window.getComputedStyle(el).paddingTop;
    });
    // 80px이어야 함 (모바일 미디어 쿼리: max-width: 480px)
    expect(paddingTop).toBe('80px');
    await page.screenshot({ path: 'D:/tmp/e2e_tc10_mobile_padding.png' });
  });

  test('TC-11: 모바일 — "다른 계정으로 로그인" 터치 영역 >= 44px', async ({ page }) => {
    const switchBtn = page.getByText('다른 계정으로 로그인');
    await expect(switchBtn).toBeVisible();

    const boundingBox = await switchBtn.boundingBox();
    expect(boundingBox).not.toBeNull();
    // height >= 44px (Apple HIG 최소 터치 영역)
    expect(boundingBox!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: 'D:/tmp/e2e_tc11_mobile_touch_area.png' });
  });
});

// ─────────────────────────────────────────────
// 일반 모드 Regression 테스트
// ─────────────────────────────────────────────
test.describe('일반 모드 Regression', () => {

  test('TC-12: PC — /login 접속 → 소셜 로그인 버튼 3개 + disabled 체크박스 표시', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await goToSocialLogin(page);

    await expect(page.locator('[aria-label="카카오 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="네이버 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="구글 로그인"]')).toBeVisible();

    const checkbox = page.locator('#remember-device');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeDisabled();
    await page.screenshot({ path: 'D:/tmp/e2e_tc12_pc_social_login.png' });
  });

  test('TC-13: 모바일 — /login 접속 → 소셜 로그인 버튼 3개 표시', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goToSocialLogin(page);

    await expect(page.locator('[aria-label="카카오 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="네이버 로그인"]')).toBeVisible();
    await expect(page.locator('[aria-label="구글 로그인"]')).toBeVisible();
    await page.screenshot({ path: 'D:/tmp/e2e_tc13_mobile_social_login.png' });
  });
});

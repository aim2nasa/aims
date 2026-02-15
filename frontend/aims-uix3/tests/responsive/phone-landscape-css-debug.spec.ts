/**
 * 📱 Phone Landscape CSS 디버그 테스트
 *
 * 인증 없이 CSS 레이아웃 동작을 직접 검증
 * 실제 DOM 렌더링을 통해 문제를 진단
 */

import { test, expect, BrowserContext } from '@playwright/test';

const BASE_URL = 'https://localhost:5177';

async function createMobileContext(
  browser: any,
  viewport: { width: number; height: number }
): Promise<BrowserContext> {
  return browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-N960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
}

test.describe('Phone Landscape CSS 디버그', () => {

  test('Galaxy Note 9: 세로 모드 페이지 스크린샷', async ({ browser }) => {
    const ctx = await createMobileContext(browser, { width: 360, height: 740 });
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);

    // 페이지 상태 확인
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyClasses: document.body.className,
      layoutMain: document.querySelector('.layout-main')?.className || 'NOT_FOUND',
      viewport: { w: window.innerWidth, h: window.innerHeight },
      allElements: Array.from(document.querySelectorAll('*')).length,
      visibleText: document.body.innerText.substring(0, 500),
    }));

    console.log('\n=== Galaxy Note 9 PORTRAIT ===');
    console.log(JSON.stringify(pageInfo, null, 2));

    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_portrait.png',
      fullPage: false,
    });

    await ctx.close();
  });

  test('Galaxy Note 9: 가로 모드 페이지 스크린샷', async ({ browser }) => {
    const ctx = await createMobileContext(browser, { width: 740, height: 360 });
    const page = await ctx.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);

    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyClasses: document.body.className,
      layoutMain: document.querySelector('.layout-main')?.className || 'NOT_FOUND',
      viewport: { w: window.innerWidth, h: window.innerHeight },
      allElements: Array.from(document.querySelectorAll('*')).length,
      visibleText: document.body.innerText.substring(0, 500),
    }));

    console.log('\n=== Galaxy Note 9 LANDSCAPE ===');
    console.log(JSON.stringify(pageInfo, null, 2));

    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_landscape.png',
      fullPage: false,
    });

    await ctx.close();
  });

  test('Galaxy Note 9: 세로→가로 회전 시뮬레이션 + 스크린샷', async ({ browser }) => {
    const ctx = await createMobileContext(browser, { width: 360, height: 740 });
    const page = await ctx.newPage();

    // 1. 세로 모드로 페이지 로드
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_rotation_step1_portrait.png',
      fullPage: false,
    });

    // 로그인 시도 (개발자 모드)
    const loginBtn = page.locator('button:has-text("카카오 로그인")');
    if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[Step 1] 로그인 페이지 감지됨 - 개발자 모드 활성화 시도');
      await page.keyboard.press('Control+Alt+Shift+D');
      await page.waitForTimeout(500);

      const skipBtn = page.locator('button:has-text("개발용 로그인 건너뛰기")');
      if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(3000);
        console.log('[Step 1] 로그인 건너뛰기 완료');
      } else {
        console.log('[Step 1] 건너뛰기 버튼 없음');

        // 다른 방법: 페이지의 텍스트 확인
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log('[Step 1] 페이지 텍스트:', bodyText);
      }
    } else {
      console.log('[Step 1] 로그인 페이지 아님 - 이미 로그인됨');
    }

    // 온보딩 닫기
    await page.evaluate(() => localStorage.setItem('aims_onboarding_completed', 'true'));
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 2. 현재 상태 스크린샷
    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_rotation_step2_after_login.png',
      fullPage: false,
    });

    // 전체 고객 메뉴 탐색
    const hamburger = page.locator('.header-mobile-menu-btn').first();
    if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'tests/responsive/screenshots/note9_rotation_step3_menu_open.png',
        fullPage: false,
      });

      const allCustomers = page.locator('text=전체 고객').first();
      if (await allCustomers.isVisible({ timeout: 2000 }).catch(() => false)) {
        await allCustomers.click();
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_rotation_step4_customers_portrait.png',
      fullPage: false,
    });

    // 세로 모드 DOM 상태
    const portraitState = await page.evaluate(() => {
      const selectors = [
        '.layout-main', '.header-progressive', '.layout-centerpane',
        '.center-pane-view', '.center-pane-view__content',
        '.customer-library-container', '.customer-list', '.customer-item',
      ];
      const result: Record<string, any> = {};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) { result[sel] = 'NOT_FOUND'; continue; }
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        result[sel] = {
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          display: s.display,
          overflow: `${s.overflowX}/${s.overflowY}`,
          height: s.height,
          visibility: s.visibility,
          opacity: s.opacity,
        };
      }
      return { viewport: `${window.innerWidth}x${window.innerHeight}`, elements: result };
    });
    console.log('\n=== PORTRAIT DOM STATE ===');
    console.log(JSON.stringify(portraitState, null, 2));

    // 3. 가로 모드로 회전!
    console.log('\n>>> ROTATING TO LANDSCAPE <<<');
    await page.setViewportSize({ width: 740, height: 360 });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/responsive/screenshots/note9_rotation_step5_after_rotate_landscape.png',
      fullPage: false,
    });

    // 가로 모드 DOM 상태
    const landscapeState = await page.evaluate(() => {
      const selectors = [
        '.layout-main', '.header-progressive', '.layout-centerpane',
        '.center-pane-view', '.center-pane-view__content',
        '.customer-library-container', '.customer-list', '.customer-item',
        '.customer-list-header',
      ];
      const result: Record<string, any> = {};
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) { result[sel] = 'NOT_FOUND'; continue; }
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        result[sel] = {
          rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
          display: s.display,
          overflow: `${s.overflowX}/${s.overflowY}`,
          height: s.height,
          maxHeight: s.maxHeight,
          visibility: s.visibility,
          opacity: s.opacity,
          position: s.position,
        };
      }
      const layoutMain = document.querySelector('.layout-main');
      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        layoutMainClass: layoutMain?.className || 'N/A',
        elements: result,
      };
    });
    console.log('\n=== LANDSCAPE DOM STATE ===');
    console.log(JSON.stringify(landscapeState, null, 2));

    // 핵심 검증
    const customerItems = await page.locator('.customer-item').count();
    console.log(`\n고객 아이템 수: ${customerItems}`);

    if (customerItems > 0) {
      const firstItemBox = await page.locator('.customer-item').first().boundingBox();
      console.log('첫 번째 고객 아이템 위치:', firstItemBox);
    }

    await ctx.close();
  });
});

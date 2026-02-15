/**
 * 📱 Phone Landscape 화면 회전 테스트 (headed 모드용)
 *
 * 실행: npx playwright test tests/responsive/phone-landscape-headed.spec.ts --headed
 */

import { test, expect, BrowserContext } from '@playwright/test';

const BASE_URL = 'https://localhost:5177';
const SCREENSHOT_DIR = 'tests/responsive/screenshots';

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

test('Galaxy Note 9: 세로→가로 회전 통합 테스트', async ({ browser }) => {
  // 1. 세로 모드로 시작
  const ctx = await createMobileContext(browser, { width: 360, height: 740 });
  const page = await ctx.newPage();

  // localStorage에 개발자 모드 + 온보딩 완료 미리 설정
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem('aims_dev_mode', 'true');
    localStorage.setItem('aims_onboarding_completed', 'true');
  });

  // 페이지 리로드 (localStorage 적용)
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000);

  // 개발용 로그인 건너뛰기
  const skipBtn = page.locator('button:has-text("개발용 로그인 건너뛰기")');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('✅ 개발용 로그인 버튼 발견');
    await skipBtn.click();
    await page.waitForTimeout(5000); // 로그인 완료 대기
  } else {
    console.log('❌ 개발용 로그인 버튼 없음');
    // 이미 로그인되어 있을 수 있음
    const layoutMain = page.locator('.layout-main');
    if (!await layoutMain.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️ layout-main도 없음 - 페이지 상태 확인');
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
      console.log('페이지 텍스트:', bodyText);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/auth_failed.png` });
      await ctx.close();
      return;
    }
  }

  // 온보딩 닫기
  const onboarding = page.locator('.onboarding-tour');
  if (await onboarding.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const closeBtn = page.locator('.onboarding-tour button:has-text("건너뛰기")');
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click({ force: true });
    }
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/step1_portrait_home.png` });
  console.log('\n📸 Step 1: 세로 모드 홈 스크린샷 저장');

  // 전체 고객 보기로 이동
  const hamburger = page.locator('.header-mobile-menu-btn').first();
  if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
    await hamburger.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/step2_menu_open.png` });
    console.log('📸 Step 2: 메뉴 열기 스크린샷');

    // 전체 고객 메뉴 클릭
    const allCustomers = page.locator('text=전체 고객').first();
    if (await allCustomers.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allCustomers.click();
      await page.waitForTimeout(2000);
    }
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/step3_portrait_customers.png` });
  console.log('📸 Step 3: 세로 모드 고객 목록 스크린샷');

  // 세로 모드 고객 목록 상태
  const portraitItems = await page.locator('.customer-item').count();
  console.log(`\n📊 세로 모드 고객 수: ${portraitItems}`);

  const portraitDebug = await page.evaluate(() => {
    const els: Record<string, string> = {};
    ['.layout-main', '.layout-centerpane', '.center-pane-view', '.center-pane-view__content', '.customer-library-container', '.customer-list'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) { els[sel] = 'NOT_FOUND'; return; }
      const r = el.getBoundingClientRect();
      els[sel] = `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    });
    return { viewport: `${window.innerWidth}x${window.innerHeight}`, ...els };
  });
  console.log('세로 DOM:', JSON.stringify(portraitDebug, null, 2));

  // ====== 가로 모드로 회전! ======
  console.log('\n🔄 ====== 가로 모드로 회전 (740x360) ======');
  await page.setViewportSize({ width: 740, height: 360 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/step4_landscape_after_rotate.png` });
  console.log('📸 Step 4: 가로 모드 회전 후 스크린샷');

  // 가로 모드 고객 목록 상태
  const landscapeItems = await page.locator('.customer-item').count();
  console.log(`\n📊 가로 모드 고객 수: ${landscapeItems}`);

  const landscapeDebug = await page.evaluate(() => {
    const els: Record<string, string> = {};
    ['.layout-main', '.header-progressive', '.layout-centerpane', '.center-pane-view', '.center-pane-view__header', '.center-pane-view__content', '.customer-library-container', '.customer-list', '.customer-list-header', '.customer-item'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) { els[sel] = 'NOT_FOUND'; return; }
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      els[sel] = `pos:${Math.round(r.x)},${Math.round(r.y)} size:${Math.round(r.width)}x${Math.round(r.height)} display:${s.display} overflow:${s.overflowX}/${s.overflowY} visibility:${s.visibility}`;
    });

    const layoutMain = document.querySelector('.layout-main');
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      layoutMainClass: layoutMain?.className || 'N/A',
      isPhoneLandscape: layoutMain?.classList.contains('layout-main--phone-landscape') || false,
      ...els,
    };
  });
  console.log('가로 DOM:', JSON.stringify(landscapeDebug, null, 2));

  // 핵심 검증
  console.log('\n✅ === 검증 결과 ===');

  if (portraitItems > 0 && landscapeItems === 0) {
    console.log('❌ 치명적 실패: 세로에서 보이던 고객이 가로에서 사라짐!');
  } else if (landscapeItems > 0) {
    console.log('✅ 고객 목록 가시성 확인됨');
  } else {
    console.log('⚠️ 세로에서도 고객 없음 (데이터 로딩 실패일 수 있음)');
  }

  // 추가 회전: 가로→세로
  console.log('\n🔄 ====== 세로 모드로 복귀 (360x740) ======');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/step5_portrait_restored.png` });
  console.log('📸 Step 5: 세로 복귀 스크린샷');

  const restoredItems = await page.locator('.customer-item').count();
  console.log(`📊 복귀 후 고객 수: ${restoredItems}`);

  await ctx.close();
});

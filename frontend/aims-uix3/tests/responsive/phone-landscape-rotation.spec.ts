/**
 * 📱 폰 가로 모드(Phone Landscape) 화면 회전 자동화 테스트
 * @since 2026-02-16
 *
 * Galaxy Note 9, iPhone 15 등 실제 디바이스의 세로→가로 회전 시
 * 콘텐츠가 정상 표시되는지 검증
 *
 * 핵심 검증:
 * 1. 세로 모드에서 보이던 콘텐츠가 가로 회전 후에도 보여야 함
 * 2. 가로 모드에서 레이아웃이 깨지지 않아야 함
 * 3. 터치 디바이스 + 낮은 높이 → 모바일 레이아웃 유지
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

const BASE_URL = 'https://localhost:5177';

// 테스트 디바이스 정의
const DEVICES = {
  'Galaxy Note 9': {
    portrait: { width: 360, height: 740 },
    landscape: { width: 740, height: 360 },
  },
  'iPhone 15': {
    portrait: { width: 393, height: 852 },
    landscape: { width: 852, height: 393 },
  },
  'iPhone 15 Pro Max': {
    portrait: { width: 430, height: 932 },
    landscape: { width: 932, height: 430 },
  },
  'Galaxy S24': {
    portrait: { width: 360, height: 780 },
    landscape: { width: 780, height: 360 },
  },
} as const;

const SCREENSHOT_DIR = 'tests/responsive/screenshots';

/**
 * 모바일 터치 디바이스로 컨텍스트 생성
 */
async function createMobileContext(
  browser: any,
  viewport: { width: number; height: number }
): Promise<BrowserContext> {
  return browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    ignoreHTTPSErrors: true,
    // pointer: coarse 시뮬레이션
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-N960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
}

/**
 * 개발용 로그인 건너뛰기 + 온보딩 닫기
 */
async function loginAndNavigate(page: Page): Promise<boolean> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // localStorage에 온보딩 완료 상태 설정
  await page.evaluate(() => {
    localStorage.setItem('aims_onboarding_completed', 'true');
  });

  // 로그인 페이지인지 확인
  const loginButton = page.locator('button:has-text("카카오 로그인")');
  const isLoginPage = await loginButton.isVisible({ timeout: 3000 }).catch(() => false);

  if (isLoginPage) {
    // 개발자 모드 활성화 (Ctrl+Alt+Shift+D)
    await page.keyboard.press('Control+Alt+Shift+D');
    await page.waitForTimeout(500);

    const skipLoginButton = page.locator('button:has-text("개발용 로그인 건너뛰기")');
    if (await skipLoginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipLoginButton.click();
      // 로그인 완료 대기
      await page.waitForSelector('.layout-main, .header-progressive', { timeout: 15000 }).catch(() => null);
      await page.waitForTimeout(1000);
    } else {
      console.log('[Auth] 개발용 로그인 버튼 없음');
      return false;
    }
  }

  // 온보딩 닫기
  const onboarding = page.locator('.onboarding-tour');
  if (await onboarding.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const skipBtn = page.locator('.onboarding-tour button:has-text("건너뛰기")');
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  }

  return true;
}

/**
 * 전체 고객 보기 메뉴로 이동
 */
async function navigateToAllCustomers(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) {
    // 모바일: 햄버거 메뉴 → 전체 고객 보기
    const hamburger = page.locator('.header-mobile-menu-btn, [aria-label*="메뉴"]').first();
    if (await hamburger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(500);

      // "전체 고객 보기" 또는 "전체 고객" 메뉴 클릭
      const allCustomersMenu = page.locator('text=전체 고객').first();
      if (await allCustomersMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
        await allCustomersMenu.click();
        await page.waitForTimeout(1000);
      }

      // 드로어 닫기 (백드롭 클릭)
      const backdrop = page.locator('.mobile-drawer-backdrop');
      if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
        await backdrop.click();
        await page.waitForTimeout(300);
      }
    }
  }
}

/**
 * 페이지의 주요 영역 가시성 체크
 */
async function checkLayoutVisibility(page: Page): Promise<{
  headerVisible: boolean;
  mainContentVisible: boolean;
  layoutMainClass: string;
  headerHeight: number;
  mainContentHeight: number;
  viewportSize: { width: number; height: number };
  bodyOverflow: string;
  centerPaneBox: { x: number; y: number; width: number; height: number } | null;
}> {
  return page.evaluate(() => {
    const header = document.querySelector('.header-progressive');
    const mainContent = document.querySelector('.layout-centerpane, .layout-main-content--grid');
    const layoutMain = document.querySelector('.layout-main');
    const centerPaneView = document.querySelector('.center-pane-view');

    const headerRect = header?.getBoundingClientRect();
    const mainRect = mainContent?.getBoundingClientRect();
    const centerPaneRect = centerPaneView?.getBoundingClientRect();

    return {
      headerVisible: !!header && headerRect!.height > 0 && headerRect!.width > 0,
      mainContentVisible: !!mainContent && mainRect!.height > 0 && mainRect!.width > 0,
      layoutMainClass: layoutMain?.className || '',
      headerHeight: headerRect?.height || 0,
      mainContentHeight: mainRect?.height || 0,
      viewportSize: { width: window.innerWidth, height: window.innerHeight },
      bodyOverflow: window.getComputedStyle(document.body).overflow,
      centerPaneBox: centerPaneRect ? {
        x: centerPaneRect.x,
        y: centerPaneRect.y,
        width: centerPaneRect.width,
        height: centerPaneRect.height,
      } : null,
    };
  });
}

/**
 * 고객 목록 콘텐츠 가시성 체크 (AllCustomersView)
 */
async function checkCustomerListVisibility(page: Page): Promise<{
  containerVisible: boolean;
  customerListVisible: boolean;
  customerItemCount: number;
  customerListHeight: number;
  customerListScrollHeight: number;
  filterBarVisible: boolean;
  listHeaderVisible: boolean;
  firstItemBox: { x: number; y: number; width: number; height: number } | null;
  containerBox: { x: number; y: number; width: number; height: number } | null;
  contentBox: { x: number; y: number; width: number; height: number } | null;
}> {
  return page.evaluate(() => {
    const container = document.querySelector('.customer-library-container');
    const customerList = document.querySelector('.customer-list');
    const customerItems = document.querySelectorAll('.customer-item');
    const filterBar = document.querySelector('.result-count, .type-filter-button');
    const listHeader = document.querySelector('.customer-list-header');
    const firstItem = customerItems[0];
    const content = document.querySelector('.center-pane-view__content');

    const containerRect = container?.getBoundingClientRect();
    const listRect = customerList?.getBoundingClientRect();
    const firstItemRect = firstItem?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();

    return {
      containerVisible: !!container && containerRect!.height > 0,
      customerListVisible: !!customerList && listRect!.height > 0,
      customerItemCount: customerItems.length,
      customerListHeight: listRect?.height || 0,
      customerListScrollHeight: (customerList as HTMLElement)?.scrollHeight || 0,
      filterBarVisible: !!filterBar,
      listHeaderVisible: !!listHeader && (listHeader as HTMLElement).offsetHeight > 0,
      firstItemBox: firstItemRect ? {
        x: firstItemRect.x,
        y: firstItemRect.y,
        width: firstItemRect.width,
        height: firstItemRect.height,
      } : null,
      containerBox: containerRect ? {
        x: containerRect.x,
        y: containerRect.y,
        width: containerRect.width,
        height: containerRect.height,
      } : null,
      contentBox: contentRect ? {
        x: contentRect.x,
        y: contentRect.y,
        width: contentRect.width,
        height: contentRect.height,
      } : null,
    };
  });
}

// ============================
// 테스트 스위트
// ============================

test.describe('📱 폰 화면 회전 테스트', () => {

  for (const [deviceName, dimensions] of Object.entries(DEVICES)) {
    test.describe(`${deviceName}`, () => {

      test(`세로→가로 회전 시 레이아웃 무결성`, async ({ browser }) => {
        // 1. 세로 모드로 시작
        const portraitCtx = await createMobileContext(browser, dimensions.portrait);
        const page = await portraitCtx.newPage();

        const loggedIn = await loginAndNavigate(page);
        if (!loggedIn) {
          console.log(`[SKIP] ${deviceName}: 로그인 실패`);
          await portraitCtx.close();
          return;
        }

        // 전체 고객 보기로 이동
        await navigateToAllCustomers(page, true);
        await page.waitForTimeout(2000);

        // 세로 모드 스크린샷
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${deviceName.replace(/ /g, '_')}_portrait.png`,
          fullPage: false,
        });

        // 세로 모드 레이아웃 체크
        const portraitLayout = await checkLayoutVisibility(page);
        console.log(`\n[${deviceName} PORTRAIT]`, JSON.stringify(portraitLayout, null, 2));

        const portraitCustomerList = await checkCustomerListVisibility(page);
        console.log(`[${deviceName} PORTRAIT Customer List]`, JSON.stringify(portraitCustomerList, null, 2));

        // 2. 가로 모드로 회전 (viewport 변경)
        await page.setViewportSize(dimensions.landscape);
        await page.waitForTimeout(1500); // 리사이즈 이벤트 처리 대기

        // 가로 모드 스크린샷
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${deviceName.replace(/ /g, '_')}_landscape.png`,
          fullPage: false,
        });

        // 가로 모드 레이아웃 체크
        const landscapeLayout = await checkLayoutVisibility(page);
        console.log(`\n[${deviceName} LANDSCAPE]`, JSON.stringify(landscapeLayout, null, 2));

        const landscapeCustomerList = await checkCustomerListVisibility(page);
        console.log(`[${deviceName} LANDSCAPE Customer List]`, JSON.stringify(landscapeCustomerList, null, 2));

        // ========== 핵심 검증 ==========

        // 검증 1: 헤더가 가로 모드에서도 보여야 함
        expect(landscapeLayout.headerVisible, `${deviceName}: 가로 모드에서 헤더 미표시`).toBe(true);
        expect(landscapeLayout.headerHeight, `${deviceName}: 헤더 높이가 0`).toBeGreaterThan(0);

        // 검증 2: 메인 콘텐츠 영역이 가로 모드에서 보여야 함
        expect(landscapeLayout.mainContentVisible, `${deviceName}: 가로 모드에서 메인 콘텐츠 영역 미표시`).toBe(true);
        expect(landscapeLayout.mainContentHeight, `${deviceName}: 메인 콘텐츠 높이가 0`).toBeGreaterThan(0);

        // 검증 3: 가로 모드에서 콘텐츠 높이가 뷰포트의 30% 이상이어야 함 (너무 좁으면 실패)
        const contentHeightRatio = landscapeLayout.mainContentHeight / dimensions.landscape.height;
        expect(contentHeightRatio, `${deviceName}: 메인 콘텐츠가 뷰포트 높이의 30% 미만`)
          .toBeGreaterThan(0.3);

        // 검증 4: 세로에서 보이던 고객 목록이 가로에서도 보여야 함
        if (portraitCustomerList.customerItemCount > 0) {
          expect(
            landscapeCustomerList.customerItemCount,
            `${deviceName}: 세로에서 ${portraitCustomerList.customerItemCount}개 고객 표시 → 가로에서 0개`
          ).toBeGreaterThan(0);

          expect(
            landscapeCustomerList.customerListVisible,
            `${deviceName}: 가로 모드에서 고객 목록 미표시`
          ).toBe(true);

          expect(
            landscapeCustomerList.customerListHeight,
            `${deviceName}: 고객 목록 높이가 0`
          ).toBeGreaterThan(0);
        }

        // 검증 5: phone-landscape 클래스 적용 여부
        if (dimensions.landscape.height <= 500 && dimensions.landscape.width > dimensions.landscape.height) {
          expect(
            landscapeLayout.layoutMainClass,
            `${deviceName}: phone-landscape 클래스 미적용`
          ).toContain('layout-main--phone-landscape');
        }

        await portraitCtx.close();
      });

      test(`가로→세로 복귀 시 레이아웃 복구`, async ({ browser }) => {
        // 가로 모드로 시작
        const landscapeCtx = await createMobileContext(browser, dimensions.landscape);
        const page = await landscapeCtx.newPage();

        const loggedIn = await loginAndNavigate(page);
        if (!loggedIn) {
          await landscapeCtx.close();
          return;
        }

        await navigateToAllCustomers(page, true);
        await page.waitForTimeout(2000);

        // 가로 → 세로 회전
        await page.setViewportSize(dimensions.portrait);
        await page.waitForTimeout(1500);

        // 세로 모드 복귀 스크린샷
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/${deviceName.replace(/ /g, '_')}_landscape_to_portrait.png`,
          fullPage: false,
        });

        const layout = await checkLayoutVisibility(page);
        console.log(`\n[${deviceName} L→P]`, JSON.stringify(layout, null, 2));

        // phone-landscape 클래스가 제거되었는지 확인
        expect(layout.layoutMainClass).not.toContain('layout-main--phone-landscape');

        // 콘텐츠가 여전히 보이는지
        expect(layout.headerVisible).toBe(true);
        expect(layout.mainContentVisible).toBe(true);

        await landscapeCtx.close();
      });
    });
  }

  test('CSS 변수 검증: phone-landscape에서 헤더 높이', async ({ browser }) => {
    const ctx = await createMobileContext(browser, DEVICES['Galaxy Note 9'].landscape);
    const page = await ctx.newPage();

    await loginAndNavigate(page);
    await page.waitForTimeout(2000);

    const cssVars = await page.evaluate(() => {
      const layoutMain = document.querySelector('.layout-main');
      if (!layoutMain) return null;

      const style = window.getComputedStyle(layoutMain);
      return {
        headerHeightBase: style.getPropertyValue('--header-height-base').trim(),
        mainpaneHeight: style.getPropertyValue('--mainpane-height').trim(),
        gapTop: style.getPropertyValue('--gap-top').trim(),
        gapBottom: style.getPropertyValue('--gap-bottom').trim(),
        layoutMainClass: layoutMain.className,
        isPhoneLandscapeClass: layoutMain.classList.contains('layout-main--phone-landscape'),
      };
    });

    console.log('\n[CSS Variables]', JSON.stringify(cssVars, null, 2));

    if (cssVars) {
      expect(cssVars.isPhoneLandscapeClass).toBe(true);
    }

    await ctx.close();
  });

  test('디버그: DOM 구조 덤프 (Galaxy Note 9 landscape)', async ({ browser }) => {
    const ctx = await createMobileContext(browser, DEVICES['Galaxy Note 9'].landscape);
    const page = await ctx.newPage();

    const loggedIn = await loginAndNavigate(page);
    if (!loggedIn) {
      await ctx.close();
      return;
    }

    await navigateToAllCustomers(page, true);
    await page.waitForTimeout(2000);

    // DOM 구조 + 계산된 스타일 덤프
    const domDebug = await page.evaluate(() => {
      const elements: Record<string, any> = {};
      const selectors = [
        '.layout-main',
        '.header-progressive',
        '.layout-centerpane',
        '.center-pane-view',
        '.center-pane-view__header',
        '.center-pane-view__content',
        '.customer-library-container',
        '.customer-list',
        '.customer-list-header',
        '.customer-item:first-child',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) {
          elements[sel] = { exists: false };
          continue;
        }

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        elements[sel] = {
          exists: true,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          computed: {
            display: style.display,
            position: style.position,
            overflow: style.overflow,
            overflowY: style.overflowY,
            height: style.height,
            maxHeight: style.maxHeight,
            minHeight: style.minHeight,
            visibility: style.visibility,
            opacity: style.opacity,
          },
          className: el.className,
        };
      }

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elements,
      };
    });

    console.log('\n[DOM DEBUG - Galaxy Note 9 Landscape]');
    console.log(JSON.stringify(domDebug, null, 2));

    // 스크린샷 저장
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/debug_galaxy_note9_landscape.png`,
      fullPage: false,
    });

    await ctx.close();
  });
});

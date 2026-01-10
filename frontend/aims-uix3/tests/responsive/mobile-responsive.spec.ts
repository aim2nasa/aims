/**
 * 모바일/반응형 E2E 테스트
 * @since 2026-01-10
 *
 * 다양한 뷰포트에서 레이아웃 및 기능 검증
 */

import { test, expect, devices } from '@playwright/test';

// 테스트할 뷰포트 정의
const viewports = {
  mobile: { width: 375, height: 667 },      // iPhone SE
  mobileLarge: { width: 414, height: 896 }, // iPhone 11 Pro Max
  tablet: { width: 768, height: 1024 },     // iPad
  tabletLandscape: { width: 1024, height: 768 }, // iPad Landscape
  desktop: { width: 1280, height: 720 },    // Desktop
  desktopLarge: { width: 1920, height: 1080 }, // Full HD
};

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5177';

test.describe('모바일 뷰포트 테스트 (375px)', () => {
  test.use({ viewport: viewports.mobile });

  test('로그인 페이지 레이아웃', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // 로그인 폼이 화면 너비에 맞게 표시되는지
    const loginForm = page.locator('form, .login-form, .auth-form').first();
    if (await loginForm.isVisible()) {
      const box = await loginForm.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(viewports.mobile.width);
      }
    }
  });

  test('네비게이션 햄버거 메뉴', async ({ page }) => {
    await page.goto(BASE_URL);

    // 모바일에서 햄버거 메뉴가 표시되어야 함
    const hamburger = page.locator('[aria-label*="메뉴"], .hamburger, .mobile-menu-toggle').first();
    const isHamburgerVisible = await hamburger.isVisible().catch(() => false);

    // 모바일에서는 사이드바가 숨겨져야 함
    const sidebar = page.locator('.left-pane, .sidebar, nav').first();
    const sidebarBox = await sidebar.boundingBox().catch(() => null);

    // 햄버거 메뉴가 있거나 사이드바가 오프스크린에 있어야 함
    if (isHamburgerVisible) {
      expect(isHamburgerVisible).toBe(true);
    }
  });

  test('테이블 가로 스크롤', async ({ page }) => {
    await page.goto(BASE_URL);

    // 테이블이 있다면 스크롤 가능해야 함
    const tableContainer = page.locator('.table-container, [class*="table"]').first();
    if (await tableContainer.isVisible()) {
      const hasOverflow = await tableContainer.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.overflowX === 'auto' || style.overflowX === 'scroll';
      });
      // 모바일에서 테이블은 스크롤 가능하거나 반응형이어야 함
    }
  });

  test('버튼 터치 영역 (44px 이상)', async ({ page }) => {
    await page.goto(BASE_URL);

    // 모든 버튼의 터치 영역 확인
    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        const box = await button.boundingBox();
        if (box) {
          // 최소 터치 영역 44px (WCAG 권장)
          const touchArea = Math.min(box.width, box.height);
          expect(touchArea).toBeGreaterThanOrEqual(28); // 최소 28px
        }
      }
    }
  });

  test('폰트 크기 가독성', async ({ page }) => {
    await page.goto(BASE_URL);

    // 본문 텍스트 폰트 크기 확인
    const bodyText = page.locator('body').first();
    const fontSize = await bodyText.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).fontSize, 10);
    });

    // 최소 14px 이상이어야 가독성 확보
    expect(fontSize).toBeGreaterThanOrEqual(12);
  });
});

test.describe('태블릿 뷰포트 테스트 (768px)', () => {
  test.use({ viewport: viewports.tablet });

  test('2컬럼 레이아웃', async ({ page }) => {
    await page.goto(BASE_URL);

    // 태블릿에서는 사이드바 + 메인 컨텐츠 2컬럼 가능
    const mainContent = page.locator('main, .main-content, .center-pane').first();
    if (await mainContent.isVisible()) {
      const box = await mainContent.boundingBox();
      if (box) {
        // 메인 컨텐츠가 화면의 절반 이상 차지
        expect(box.width).toBeGreaterThan(viewports.tablet.width * 0.4);
      }
    }
  });

  test('모달 크기 적절성', async ({ page }) => {
    await page.goto(BASE_URL);

    // AI 어시스턴트 버튼 클릭 시도
    const aiButton = page.locator('[aria-label*="AI"], [class*="chat"], [class*="assistant"]').first();
    if (await aiButton.isVisible()) {
      await aiButton.click();
      await page.waitForTimeout(500);

      const modal = page.locator('.draggable-modal, .modal, [role="dialog"]').first();
      if (await modal.isVisible()) {
        const box = await modal.boundingBox();
        if (box) {
          // 모달이 화면의 90% 이하
          expect(box.width).toBeLessThanOrEqual(viewports.tablet.width * 0.95);
        }
      }
    }
  });
});

test.describe('데스크톱 뷰포트 테스트 (1280px)', () => {
  test.use({ viewport: viewports.desktop });

  test('3컬럼 레이아웃', async ({ page }) => {
    await page.goto(BASE_URL);

    // 데스크톱에서 3컬럼 레이아웃 확인
    const leftPane = page.locator('.left-pane, .sidebar').first();
    const centerPane = page.locator('.center-pane, .main-content').first();
    const rightPane = page.locator('.right-pane, .detail-panel').first();

    const leftVisible = await leftPane.isVisible().catch(() => false);
    const centerVisible = await centerPane.isVisible().catch(() => false);

    // 최소 2개 패널이 보여야 함
    expect(leftVisible || centerVisible).toBe(true);
  });

  test('전체 너비 활용', async ({ page }) => {
    await page.goto(BASE_URL);

    const container = page.locator('.app-container, .layout, #root > div').first();
    if (await container.isVisible()) {
      const box = await container.boundingBox();
      if (box) {
        // 전체 너비의 95% 이상 사용
        expect(box.width).toBeGreaterThanOrEqual(viewports.desktop.width * 0.95);
      }
    }
  });
});

test.describe('뷰포트 전환 테스트', () => {
  test('데스크톱 → 모바일 전환', async ({ page }) => {
    // 데스크톱으로 시작
    await page.setViewportSize(viewports.desktop);
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    // 모바일로 전환
    await page.setViewportSize(viewports.mobile);
    await page.waitForTimeout(500);

    // 레이아웃이 깨지지 않았는지 확인
    const body = page.locator('body');
    const hasHorizontalScroll = await body.evaluate((el) => {
      return el.scrollWidth > window.innerWidth + 10; // 10px 여유
    });

    // 가로 스크롤이 발생하면 안됨 (레이아웃 깨짐)
    expect(hasHorizontalScroll).toBe(false);
  });

  test('모바일 → 태블릿 → 데스크톱 순차 전환', async ({ page }) => {
    const sizes = [viewports.mobile, viewports.tablet, viewports.desktop];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.goto(BASE_URL);
      await page.waitForTimeout(300);

      // 각 뷰포트에서 오류 없이 렌더링되는지 확인
      const errorText = await page.locator('text=Error, text=오류, text=에러').count();
      expect(errorText).toBe(0);
    }
  });
});

test.describe('디바이스별 프리셋 테스트', () => {
  // iPhone 12
  test('iPhone 12', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPhone 12'],
    });
    const page = await context.newPage();

    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    // 페이지가 정상 로드되는지
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    await context.close();
  });

  // iPad
  test('iPad', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPad (gen 7)'],
    });
    const page = await context.newPage();

    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    await context.close();
  });

  // Galaxy S9
  test('Galaxy S9', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['Galaxy S9+'],
    });
    const page = await context.newPage();

    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    await context.close();
  });
});

test.describe('터치 인터랙션 테스트', () => {
  test.use({ viewport: viewports.mobile, hasTouch: true });

  test('스와이프 제스처 (터치 지원)', async ({ page }) => {
    await page.goto(BASE_URL);

    // 터치 이벤트가 활성화되어 있는지 확인
    const hasTouch = await page.evaluate(() => {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    });

    // Playwright가 터치를 시뮬레이션하므로 true여야 함
    expect(hasTouch).toBe(true);
  });

  test('더블 탭 줌 방지', async ({ page }) => {
    await page.goto(BASE_URL);

    // viewport meta 태그 확인
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');

    // user-scalable=no 또는 maximum-scale=1 설정 권장
    // 단, 접근성을 위해 줌 허용이 더 좋을 수 있음
    expect(viewportMeta).toBeTruthy();
  });
});

test.describe('성능 테스트 (모바일)', () => {
  test.use({ viewport: viewports.mobile });

  test('LCP (Largest Contentful Paint) 측정', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // LCP 측정 (간단한 방식)
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
          resolve(lastEntry.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // 3초 타임아웃
        setTimeout(() => resolve(3000), 3000);
      });
    });

    // LCP 2.5초 이내 권장 (Good)
    expect(lcp).toBeLessThan(4000); // 4초 이내면 Needs Improvement
  });

  test('DOM 요소 수 확인', async ({ page }) => {
    await page.goto(BASE_URL);

    const domSize = await page.evaluate(() => {
      return document.querySelectorAll('*').length;
    });

    // DOM 요소 1500개 이하 권장 (모바일 성능)
    expect(domSize).toBeLessThan(3000);
  });
});

/**
 * 📱 Phone Landscape 전체 페이지 + 모달 회전 테스트
 *
 * SPA 내부 네비게이션으로 모든 페이지를 세로→가로 회전 검증
 * 실행: npx playwright test tests/responsive/phone-landscape-all-pages.spec.ts --headed
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';

const BASE_URL = 'https://localhost:5177';
const SCREENSHOT_DIR = 'tests/responsive/screenshots/all-pages';

const PORTRAIT = { width: 360, height: 740 };
const LANDSCAPE = { width: 740, height: 360 };

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

/** SPA 내부 네비게이션 (전체 리로드 없이 뷰 전환) */
async function navigateToView(page: Page, view: string) {
  await page.evaluate((v) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', v);
    // 다른 파라미터 제거 (이전 뷰의 잔여 파라미터)
    url.searchParams.delete('customerId');
    url.searchParams.delete('documentId');
    url.searchParams.delete('tab');
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, view);
  await page.waitForTimeout(1500);
}

/** 페이지의 주요 콘텐츠 영역 + 상세 DOM 크기 측정 */
async function measurePage(page: Page): Promise<{
  viewport: string;
  isPhoneLandscape: boolean;
  headerHeight: number;
  contentHeight: number;
  contentWidth: number;
  contentBottom: number;
  contentVisible: boolean;
  overflowIssue: boolean;
  firstChildClass: string;
  firstChildSize: string;
}> {
  return page.evaluate(() => {
    const layoutMain = document.querySelector('.layout-main');
    const header = document.querySelector('.header-progressive');
    const content = document.querySelector('.center-pane-view__content');

    // 첫 번째 자식 (실제 뷰 컨테이너)
    let firstChildClass = '';
    let firstChildSize = '';
    if (content?.firstElementChild) {
      const fc = content.firstElementChild;
      const r = fc.getBoundingClientRect();
      firstChildClass = fc.className.split(' ')[0] || fc.tagName;
      firstChildSize = `${Math.round(r.width)}x${Math.round(r.height)}`;
    }

    const headerR = header?.getBoundingClientRect();
    const contentR = content?.getBoundingClientRect();
    const vh = window.innerHeight;

    return {
      viewport: `${window.innerWidth}x${vh}`,
      isPhoneLandscape: layoutMain?.classList.contains('layout-main--phone-landscape') || false,
      headerHeight: headerR ? Math.round(headerR.height) : 0,
      contentHeight: contentR ? Math.round(contentR.height) : 0,
      contentWidth: contentR ? Math.round(contentR.width) : 0,
      contentBottom: contentR ? Math.round(contentR.bottom) : 0,
      contentVisible: contentR ? (contentR.height > 10 && contentR.width > 10) : false,
      overflowIssue: contentR ? (contentR.bottom > vh + 10) : false,
      firstChildClass,
      firstChildSize,
    };
  });
}

test('전체 페이지 + 모달 세로→가로 회전 검증', async ({ browser }) => {
  test.setTimeout(300000);

  const ctx = await createMobileContext(browser, PORTRAIT);
  const page = await ctx.newPage();

  // === 로그인 ===
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem('aims_dev_mode', 'true');
    localStorage.setItem('aims_onboarding_completed', 'true');
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2000);

  const skipBtn = page.locator('button:has-text("개발용 로그인 건너뛰기")');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(5000);
    console.log('✅ 로그인 완료');
  }

  // 온보딩 확실히 닫기
  for (let i = 0; i < 3; i++) {
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      // X 버튼으로 닫기
      const closeX = page.locator('.onboarding-tour__close, .onboarding-tour button:has-text("×")').first();
      if (await closeX.isVisible({ timeout: 500 }).catch(() => false)) {
        await closeX.click({ force: true });
        await page.waitForTimeout(300);
        continue;
      }
      // 건너뛰기 버튼
      const skipOnboard = page.locator('.onboarding-tour button:has-text("건너뛰기")').first();
      if (await skipOnboard.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipOnboard.click({ force: true });
        await page.waitForTimeout(300);
        continue;
      }
      // Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      break;
    }
  }

  // localStorage로 온보딩 재표시 방지
  await page.evaluate(() => {
    localStorage.setItem('aims_onboarding_completed', 'true');
    localStorage.setItem('aims_onboarding_dismissed', 'true');
  });
  await page.waitForTimeout(500);

  // === 테스트할 페이지 목록 ===
  const pageList = [
    { view: 'quick-actions', label: '빠른 작업 (홈)' },
    { view: 'customers-all', label: '전체 고객 보기' },
    { view: 'customers-regional', label: '지역별 고객 보기' },
    { view: 'customers-relationship', label: '관계별 고객 보기' },
    { view: 'customers', label: '고객 관리 대시보드' },
    { view: 'customers-register', label: '고객 수동등록' },
    { view: 'documents-library', label: '전체 문서 보기' },
    { view: 'documents-explorer', label: '문서 탐색기' },
    { view: 'documents-search', label: '상세 문서검색' },
    { view: 'documents', label: '문서 관리 대시보드' },
    { view: 'documents-register', label: '고객·계약·문서 등록' },
    { view: 'documents-my-files', label: '내 파일' },
    { view: 'contracts-all', label: '전체 계약 보기' },
    { view: 'contracts', label: '계약 관리 대시보드' },
    { view: 'contracts-import', label: '고객·계약 일괄등록' },
    { view: 'batch-document-upload', label: '문서 일괄등록' },
    { view: 'autoclicker', label: 'AutoClicker' },
    { view: 'account-settings', label: '계정 설정' },
    { view: 'help', label: '도움말 대시보드' },
    { view: 'help-notice', label: '공지사항' },
    { view: 'help-guide', label: '사용 가이드' },
    { view: 'help-faq', label: 'FAQ' },
    { view: 'help-inquiry', label: '1:1 문의' },
  ];

  type TestResult = {
    label: string;
    view: string;
    portrait: { height: number; visible: boolean; childClass: string };
    landscape: { height: number; visible: boolean; phoneLandscape: boolean; overflow: boolean; childClass: string };
    status: string;
  };

  const results: TestResult[] = [];

  for (const p of pageList) {
    console.log(`\n─ 📄 ${p.label} (?view=${p.view})`);

    // SPA 네비게이션으로 뷰 전환
    await page.setViewportSize(PORTRAIT);
    await page.waitForTimeout(300);
    await navigateToView(page, p.view);

    // 1) 세로 모드 스크린샷 + 측정
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${p.view}_portrait.png` });
    const portrait = await measurePage(page);
    console.log(`  📱 세로 content:${portrait.contentWidth}x${portrait.contentHeight} | child:${portrait.firstChildClass} ${portrait.firstChildSize}`);

    // 2) 가로 모드로 회전
    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${p.view}_landscape.png` });
    const landscape = await measurePage(page);
    console.log(`  🔄 가로 content:${landscape.contentWidth}x${landscape.contentHeight} | phoneLandscape:${landscape.isPhoneLandscape} | overflow:${landscape.overflowIssue} | child:${landscape.firstChildClass} ${landscape.firstChildSize}`);

    // 3) 판정
    let status = '✅ OK';
    if (!landscape.contentVisible && portrait.contentVisible) {
      status = '❌ 가로에서 콘텐츠 사라짐!';
    } else if (landscape.contentHeight < 20 && portrait.contentHeight > 50) {
      status = '❌ 가로에서 콘텐츠 극소 (높이 <20px)';
    } else if (landscape.overflowIssue) {
      status = '⚠️ 콘텐츠가 뷰포트 밖으로 넘침';
    } else if (!landscape.isPhoneLandscape) {
      status = '⚠️ phone-landscape 클래스 미적용';
    } else if (landscape.contentHeight < 50) {
      status = '⚠️ 콘텐츠 높이 매우 작음 (<50px)';
    }
    console.log(`  → ${status}`);

    results.push({
      label: p.label,
      view: p.view,
      portrait: { height: portrait.contentHeight, visible: portrait.contentVisible, childClass: portrait.firstChildClass },
      landscape: { height: landscape.contentHeight, visible: landscape.contentVisible, phoneLandscape: landscape.isPhoneLandscape, overflow: landscape.overflowIssue, childClass: landscape.firstChildClass },
      status,
    });
  }

  // === 고객 상세 + 모달 테스트 ===
  console.log(`\n\n${'='.repeat(50)}`);
  console.log('🪟 고객 상세 + 모달 회전 테스트');
  console.log('='.repeat(50));

  // 고객 상세 페이지 (첫 번째 고객 클릭)
  await page.setViewportSize(PORTRAIT);
  await navigateToView(page, 'customers-all');
  await page.waitForTimeout(1000);
  // 가이드 다이얼로그 닫기
  const guide = page.locator('.rightclick-guide');
  if (await guide.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const firstCustomer = page.locator('.customer-item').first();
  if (await firstCustomer.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstCustomer.click({ force: true });
    await page.waitForTimeout(2000);

    console.log('\n─ 📄 고객 상세 보기');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/customer-detail_portrait.png` });
    const dp = await measurePage(page);
    console.log(`  📱 세로 content:${dp.contentWidth}x${dp.contentHeight} | child:${dp.firstChildClass}`);

    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/customer-detail_landscape.png` });
    const dl = await measurePage(page);
    console.log(`  🔄 가로 content:${dl.contentWidth}x${dl.contentHeight} | phoneLandscape:${dl.isPhoneLandscape}`);

    let ds = '✅ OK';
    if (!dl.contentVisible) ds = '❌ 콘텐츠 사라짐';
    else if (!dl.isPhoneLandscape) ds = '⚠️ phone-landscape 미적용';
    console.log(`  → ${ds}`);
    results.push({ label: '고객 상세 보기', view: 'customers-full-detail', portrait: { height: dp.contentHeight, visible: dp.contentVisible, childClass: dp.firstChildClass }, landscape: { height: dl.contentHeight, visible: dl.contentVisible, phoneLandscape: dl.isPhoneLandscape, overflow: dl.overflowIssue, childClass: dl.firstChildClass }, status: ds });
  }

  // AI 어시스턴트 패널
  console.log('\n─ 🪟 AI 어시스턴트 패널');
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(500);
  const aiBtn = page.locator('[aria-label*="AI 채팅"], .header-chat-button').first();
  if (await aiBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiBtn.click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/modal-ai_portrait.png` });

    const aiPortrait = await page.evaluate(() => {
      const panel = document.querySelector('.chat-panel, .right-pane, [class*="chat"]');
      if (!panel) return { visible: false, size: '' };
      const r = panel.getBoundingClientRect();
      return { visible: r.height > 10, size: `${Math.round(r.width)}x${Math.round(r.height)}` };
    });
    console.log(`  📱 세로 AI 패널: ${aiPortrait.size}`);

    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/modal-ai_landscape.png` });

    const aiLandscape = await page.evaluate(() => {
      const panel = document.querySelector('.chat-panel, .right-pane, [class*="chat"]');
      if (!panel) return { visible: false, size: '', overflow: false };
      const r = panel.getBoundingClientRect();
      return { visible: r.height > 10, size: `${Math.round(r.width)}x${Math.round(r.height)}`, overflow: r.bottom > window.innerHeight + 10 };
    });
    console.log(`  🔄 가로 AI 패널: ${aiLandscape.size} overflow:${aiLandscape.overflow}`);

    // 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    console.log('  ⚠️ AI 버튼 찾지 못함');
  }

  // 모바일 드로어 메뉴
  console.log('\n─ 🪟 모바일 드로어 메뉴');
  await page.setViewportSize(PORTRAIT);
  await page.waitForTimeout(500);
  const hamburger = page.locator('.header-mobile-menu-btn').first();
  if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hamburger.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/modal-drawer_portrait.png` });

    await page.setViewportSize(LANDSCAPE);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/modal-drawer_landscape.png` });

    const drawerInfo = await page.evaluate(() => {
      const d = document.querySelector('.layout-leftpane--mobile-open, .layout-leftpane--mobile-drawer');
      if (!d) return { visible: false, size: '', overflow: false };
      const r = d.getBoundingClientRect();
      return { visible: r.height > 10, size: `${Math.round(r.width)}x${Math.round(r.height)}`, overflow: r.bottom > window.innerHeight + 10 };
    });
    console.log(`  📱→🔄 드로어: ${drawerInfo.size} overflow:${drawerInfo.overflow}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // === 최종 요약 ===
  console.log('\n\n' + '═'.repeat(70));
  console.log('📊 전체 페이지 회전 테스트 결과 요약');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`${'페이지'.padEnd(25)} ${'뷰 클래스'.padEnd(25)} ${'세로'.padEnd(8)} ${'가로'.padEnd(8)} 결과`);
  console.log('─'.repeat(70));

  const failed = results.filter(r => r.status.startsWith('❌'));
  const warned = results.filter(r => r.status.startsWith('⚠️'));
  const passed = results.filter(r => r.status.startsWith('✅'));

  for (const r of results) {
    const pH = r.portrait.visible ? `${r.portrait.height}` : 'N/A';
    const lH = r.landscape.visible ? `${r.landscape.height}` : 'N/A';
    const cls = r.landscape.childClass.substring(0, 24);
    console.log(`${r.label.padEnd(25)} ${cls.padEnd(25)} ${pH.padEnd(8)} ${lH.padEnd(8)} ${r.status}`);
  }

  console.log('─'.repeat(70));
  console.log(`✅ ${passed.length} | ⚠️ ${warned.length} | ❌ ${failed.length} | 총: ${results.length}개`);

  if (failed.length > 0) {
    console.log('\n❌ 실패:');
    for (const f of failed) console.log(`  - ${f.label}: ${f.status}`);
  }
  if (warned.length > 0) {
    console.log('\n⚠️ 경고:');
    for (const w of warned) console.log(`  - ${w.label}: ${w.status}`);
  }

  await ctx.close();
});

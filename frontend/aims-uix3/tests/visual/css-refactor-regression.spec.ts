import { test, expect, Page } from '@playwright/test';

/**
 * CSS Refactoring Visual Regression Test
 *
 * storageState를 통해 인증이 미리 완료된 상태로 시작.
 * URL ?view= 파라미터로 직접 네비게이션 (메뉴 접힘 문제 회피).
 *
 * - baseline 생성: npx playwright test tests/visual/css-refactor-regression.spec.ts --update-snapshots
 * - 비교 실행: npx playwright test tests/visual/css-refactor-regression.spec.ts
 */

// 동적 콘텐츠 마스킹
async function maskDynamicContent(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '.timestamp, .date-display, [data-testid="date"], .update-time, .last-update-text'
    ).forEach(el => (el as HTMLElement).style.visibility = 'hidden');
    document.querySelectorAll('.polling-indicator, .loading-spinner').forEach(el =>
      (el as HTMLElement).style.visibility = 'hidden');
    document.querySelectorAll('.version-display, .app-version').forEach(el =>
      (el as HTMLElement).style.visibility = 'hidden');
  });
}

// localStorage를 통한 뷰 이동 (React 초기 상태에 반영)
// 앱은 마운트 시 localStorage의 aims_active_document_view를 읽어 초기 뷰를 결정함.
// addInitScript로 React보다 먼저 localStorage를 설정하여 올바른 뷰를 보장.
async function goToView(page: Page, viewKey: string) {
  await page.addInitScript((key: string) => {
    window.localStorage.setItem('aims_active_document_view', key);
  }, viewKey);
  await page.goto('/');
  await page.waitForSelector('.layout-leftpane, .header-chat-button', { timeout: 15000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await maskDynamicContent(page);
}

// 도움말 모달 열기
async function openHelpModal(page: Page): Promise<void> {
  // 도움말 버튼이 렌더링될 때까지 대기
  await page.waitForSelector('.help-icon-button', { state: 'visible', timeout: 15000 });
  await page.locator('.help-icon-button').first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('.modal-backdrop').first().waitFor({ state: 'visible', timeout: 5000 });
  await maskDynamicContent(page);
}

// 고객 목록에서 첫 번째 고객 클릭 (데이터 로딩 대기 포함)
async function clickFirstCustomer(page: Page): Promise<void> {
  await page.waitForSelector('.customer-item', { state: 'visible', timeout: 15000 });
  await page.locator('.customer-item').first().click();
  await page.waitForTimeout(1000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await maskDynamicContent(page);
}

const SHOT = {
  fullPage: false,
  maxDiffPixelRatio: 0.02,
  threshold: 0.3,
};

const SHOT_PRECISE = {
  maxDiffPixelRatio: 0.01,
  threshold: 0.2,
};

// === 페이지 (01-16) ===
test.describe('Pages', () => {
  test('01. 전체 고객 보기', async ({ page }) => {
    await goToView(page, 'customers-all');
    await expect(page).toHaveScreenshot('01-customers-all.png', SHOT);
  });

  test('02. 지역별 고객 보기', async ({ page }) => {
    await goToView(page, 'customers-regional');
    await expect(page).toHaveScreenshot('02-customers-regional.png', SHOT);
  });

  test('03. 관계별 고객 보기', async ({ page }) => {
    await goToView(page, 'customers-relationship');
    await expect(page).toHaveScreenshot('03-customers-relationship.png', SHOT);
  });

  test('04. 고객 계약·문서 등록', async ({ page }) => {
    await goToView(page, 'documents-register');
    await expect(page).toHaveScreenshot('04-documents-register.png', SHOT);
  });

  test('05. 전체 문서 보기', async ({ page }) => {
    await goToView(page, 'documents-library');
    await expect(page).toHaveScreenshot('05-documents-library.png', SHOT);
  });

  test('06. 문서 탐색기', async ({ page }) => {
    await goToView(page, 'documents-explorer');
    await expect(page).toHaveScreenshot('06-documents-explorer.png', SHOT);
  });

  test('07. 상세 문서검색', async ({ page }) => {
    await goToView(page, 'documents-search');
    await expect(page).toHaveScreenshot('07-documents-search.png', SHOT);
  });

  test('08. 전체 계약 보기', async ({ page }) => {
    await goToView(page, 'contracts-all');
    await expect(page).toHaveScreenshot('08-contracts-all.png', SHOT);
  });

  test('09. 고객 일괄등록', async ({ page }) => {
    await goToView(page, 'contracts-import');
    await expect(page).toHaveScreenshot('09-customers-batch.png', SHOT);
  });

  test('10. 문서 일괄등록', async ({ page }) => {
    await goToView(page, 'batch-document-upload');
    await expect(page).toHaveScreenshot('10-documents-batch.png', SHOT);
  });

  test('11. 계정 설정', async ({ page }) => {
    await goToView(page, 'account-settings');
    await expect(page).toHaveScreenshot('11-account-settings.png', SHOT);
  });

  test('12. FAQ', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.layout-leftpane', { timeout: 10000 });
    const faqItem = page.locator('.custom-menu-item').filter({ hasText: 'FAQ' }).first();
    await faqItem.click();
    await page.waitForTimeout(800);
    await maskDynamicContent(page);
    await expect(page).toHaveScreenshot('12-faq.png', SHOT);
  });

  test('13. 공지사항', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.layout-leftpane', { timeout: 10000 });
    const noticeItem = page.locator('.custom-menu-item').filter({ hasText: '공지사항' }).first();
    await noticeItem.click();
    await page.waitForTimeout(800);
    await maskDynamicContent(page);
    await expect(page).toHaveScreenshot('13-notice.png', SHOT);
  });

  test('14. 고객 상세 - RightPane', async ({ page }) => {
    await goToView(page, 'customers-all');
    await clickFirstCustomer(page);
    await expect(page).toHaveScreenshot('14-customer-detail.png', SHOT);
  });

  test('15. LeftPane 메뉴', async ({ page }) => {
    await goToView(page, 'customers-all');
    await expect(page.locator('.layout-leftpane')).toHaveScreenshot('15-leftpane.png', SHOT_PRECISE);
  });

  test('16. Header 영역', async ({ page }) => {
    await goToView(page, 'customers-all');
    await expect(page.locator('.layout-header, header').first()).toHaveScreenshot('16-header.png', SHOT_PRECISE);
  });
});

// === 다크 모드 (17-19) ===
test.describe('Dark Mode', () => {
  async function enableDarkMode(page: Page) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await maskDynamicContent(page);
  }

  test('17. 전체 고객 (dark)', async ({ page }) => {
    await goToView(page, 'customers-all');
    await enableDarkMode(page);
    await expect(page).toHaveScreenshot('17-customers-all-dark.png', SHOT);
  });

  test('18. 전체 문서 (dark)', async ({ page }) => {
    await goToView(page, 'documents-library');
    await enableDarkMode(page);
    await expect(page).toHaveScreenshot('18-documents-library-dark.png', SHOT);
  });

  test('19. 전체 계약 (dark)', async ({ page }) => {
    await goToView(page, 'contracts-all');
    await enableDarkMode(page);
    await expect(page).toHaveScreenshot('19-contracts-all-dark.png', SHOT);
  });
});

// === 모달 (20-26) ===
test.describe('Modals', () => {
  test('20. 고객 정보 수정 모달', async ({ page }) => {
    await goToView(page, 'customers-all');
    await clickFirstCustomer(page);
    await page.locator('button').filter({ hasText: '정보 수정' }).first().click();
    await page.waitForTimeout(500);
    await maskDynamicContent(page);
    await expect(page).toHaveScreenshot('20-modal-customer-edit.png', SHOT);
  });

  test('21. 가족 관계 추가 모달', async ({ page }) => {
    await goToView(page, 'customers-all');
    await clickFirstCustomer(page);
    await page.locator('button').filter({ hasText: '가족 추가' }).first().click();
    await page.waitForTimeout(500);
    await maskDynamicContent(page);
    await expect(page).toHaveScreenshot('21-modal-family-relation.png', SHOT);
  });

  test('22. 지역별 고객 도움말', async ({ page }) => {
    await goToView(page, 'customers-regional');
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('22-modal-help-regional.png', SHOT);
  });

  test('23. 관계별 고객 도움말', async ({ page }) => {
    await goToView(page, 'customers-relationship');
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('23-modal-help-relationship.png', SHOT);
  });

  test('24. 전체 계약 도움말', async ({ page }) => {
    await goToView(page, 'contracts-all');
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('24-modal-help-contracts.png', SHOT);
  });

  test('25. 고객 계약·문서 등록 도움말', async ({ page }) => {
    await goToView(page, 'documents-register');
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('25-modal-help-doc-register.png', SHOT);
  });

  test('26. 문서 일괄등록 도움말', async ({ page }) => {
    await goToView(page, 'batch-document-upload');
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('26-modal-help-batch-upload.png', SHOT);
  });
});

// === 모달 다크 모드 (27-28) ===
test.describe('Modals Dark', () => {
  async function enableDarkMode(page: Page) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await maskDynamicContent(page);
  }

  test('27. 고객 정보 수정 모달 (dark)', async ({ page }) => {
    await goToView(page, 'customers-all');
    await enableDarkMode(page);
    await clickFirstCustomer(page);
    await page.locator('button').filter({ hasText: '정보 수정' }).first().click();
    await page.waitForTimeout(500);
    await maskDynamicContent(page);
    await expect(page).toHaveScreenshot('27-modal-customer-edit-dark.png', SHOT);
  });

  test('28. 지역별 고객 도움말 (dark)', async ({ page }) => {
    await goToView(page, 'customers-regional');
    await enableDarkMode(page);
    await openHelpModal(page);
    await expect(page).toHaveScreenshot('28-modal-help-regional-dark.png', SHOT);
  });
});

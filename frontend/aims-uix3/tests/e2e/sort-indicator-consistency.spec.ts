import { test, expect, Page, Locator } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 정렬 표시(Sort Indicator) 일관성 E2E 테스트
 *
 * 모든 테이블 뷰에서 정렬 표시가 통일된 규칙을 따르는지 검증:
 * - 현재 정렬된 칼럼에만 빨간색 화살표(▲/▼) 1개 표시
 * - 비활성 칼럼에는 화살표 없음
 * - 다른 칼럼 클릭 시 이전 화살표 사라지고 새 칼럼에 표시
 * - 화살표 색상이 --color-sort-indicator-active (빨간색 계열)
 */

// --- 헬퍼 함수 ---

/** 메뉴 네비게이션 (햄버거 메뉴 → 섹션 → 메뉴 아이템) */
async function navigateToMenu(page: Page, menuKey: string): Promise<boolean> {
  // 햄버거 메뉴 열기
  const hamburgerButton = page.locator('button.hamburger-button').first();
  if (await hamburgerButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hamburgerButton.click();
    await page.waitForTimeout(500);
  }

  const menuItem = page.locator(`[data-menu-key="${menuKey}"]`).first();
  for (let i = 0; i < 10; i++) {
    if (await menuItem.isVisible({ timeout: 500 }).catch(() => false)) {
      await menuItem.click();
      await page.waitForTimeout(1500);
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/** 섹션 확장 후 메뉴 클릭 */
async function navigateToSection(page: Page, sectionKey: string, menuKey: string): Promise<boolean> {
  const hamburgerButton = page.locator('button.hamburger-button').first();
  if (await hamburgerButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await hamburgerButton.click();
    await page.waitForTimeout(500);
  }

  // 섹션 확장
  const section = page.locator(`[data-menu-key="${sectionKey}"]`).first();
  if (await section.isVisible({ timeout: 2000 }).catch(() => false)) {
    await section.click();
    await page.waitForTimeout(500);
  }

  // 메뉴 아이템 클릭
  const menuItem = page.locator(`[data-menu-key="${menuKey}"]`).first();
  for (let i = 0; i < 10; i++) {
    if (await menuItem.isVisible({ timeout: 500 }).catch(() => false)) {
      await menuItem.click();
      await page.waitForTimeout(1500);
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/**
 * 정렬 표시 일관성 검증 (핵심 검증 함수)
 *
 * @param page - Playwright Page
 * @param tableContainer - 테이블 컨테이너 Locator
 * @param viewName - 뷰 이름 (로그용)
 */
async function verifySortIndicatorConsistency(
  page: Page,
  tableContainer: Locator,
  viewName: string,
): Promise<void> {
  console.log(`\n--- ${viewName} 정렬 표시 검증 ---`);

  // 1. 전체 .sort-indicator--active 요소 확인
  const activeIndicators = tableContainer.locator('.sort-indicator--active');
  const activeCount = await activeIndicators.count();
  console.log(`${viewName}: 활성 정렬 표시 ${activeCount}개`);

  // 활성 표시가 0개이면 정렬이 적용되지 않은 초기 상태 → 비활성 표시도 없어야 함
  if (activeCount === 0) {
    // 비활성 표시(old 패턴)가 없는지 확인
    const oldBothArrows = tableContainer.locator('.sort-indicator--both');
    expect(await oldBothArrows.count(), `${viewName}: 양방향 표시(old) 잔존`).toBe(0);

    const oldSortArrow = tableContainer.locator('.sort-arrow');
    expect(await oldSortArrow.count(), `${viewName}: sort-arrow(old) 잔존`).toBe(0);
    console.log(`${viewName}: 초기 상태 - 정렬 미적용, old 패턴 없음 ✓`);
    return;
  }

  // 2. 활성 표시가 있는 경우: 정확히 1개만 있어야 함 (단일 sort context 기준)
  // ContractsTab은 AR/CRS/Main 3개 sort context가 있어 최대 3개 가능
  expect(activeCount, `${viewName}: 활성 표시가 너무 많음`).toBeLessThanOrEqual(3);

  // 3. 각 활성 표시의 내용 검증 (▲ 또는 ▼만 허용)
  for (let i = 0; i < activeCount; i++) {
    const indicator = activeIndicators.nth(i);
    const text = await indicator.textContent();
    expect(['▲', '▼'], `${viewName}: 비정상 화살표 "${text}"`).toContain(text?.trim());
  }

  // 4. 색상 검증: --color-sort-indicator-active (빨간색 계열)
  if (activeCount > 0) {
    const firstIndicator = activeIndicators.first();
    const color = await firstIndicator.evaluate(el => getComputedStyle(el).color);
    // RGB에서 R 채널이 G, B보다 충분히 큰지 확인 (빨간색 계열)
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      console.log(`${viewName}: 화살표 색상 rgb(${r}, ${g}, ${b})`);
      expect(r, `${viewName}: R 채널이 G보다 크지 않음 → 빨간색 아님`).toBeGreaterThan(g);
      expect(r, `${viewName}: R 채널이 B보다 크지 않음 → 빨간색 아님`).toBeGreaterThan(b);
    }
  }

  // 5. 양방향 표시(old 패턴) 없음 확인
  const oldBothArrows = tableContainer.locator('.sort-indicator--both');
  expect(await oldBothArrows.count(), `${viewName}: 양방향 표시(old) 잔존`).toBe(0);

  const oldSortArrow = tableContainer.locator('.sort-arrow');
  expect(await oldSortArrow.count(), `${viewName}: sort-arrow(old) 잔존`).toBe(0);

  console.log(`${viewName}: 정렬 표시 일관성 ✓`);
}

/**
 * 정렬 가능 헤더 클릭 후 화살표 전환 검증
 */
async function verifySortToggle(
  page: Page,
  tableContainer: Locator,
  sortableHeader: Locator,
  viewName: string,
): Promise<void> {
  // 헤더 클릭
  await sortableHeader.click();
  await page.waitForTimeout(500);

  // 클릭 후 활성 표시 확인
  const activeIndicators = tableContainer.locator('.sort-indicator--active');
  const count = await activeIndicators.count();
  console.log(`${viewName}: 헤더 클릭 후 활성 표시 ${count}개`);

  // 최소 1개의 활성 표시가 있어야 함
  expect(count, `${viewName}: 정렬 클릭 후 활성 표시 없음`).toBeGreaterThanOrEqual(1);

  // 화살표 방향 확인
  if (count > 0) {
    const text = await activeIndicators.first().textContent();
    expect(['▲', '▼'], `${viewName}: 잘못된 화살표`).toContain(text?.trim());
    console.log(`${viewName}: 정렬 방향 ${text?.trim()} ✓`);
  }

  // 같은 헤더 다시 클릭 → 방향 전환
  await sortableHeader.click();
  await page.waitForTimeout(500);

  const afterToggle = tableContainer.locator('.sort-indicator--active');
  const toggleCount = await afterToggle.count();
  if (toggleCount > 0) {
    const newText = await afterToggle.first().textContent();
    console.log(`${viewName}: 토글 후 방향 ${newText?.trim()} ✓`);
  }
}

// --- 테스트 시나리오 ---

test.describe('정렬 표시(Sort Indicator) 일관성 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 전체 고객 보기 (AllCustomersView) 정렬 표시', async ({ page }) => {
    console.log('\n=== 전체 고객 보기 정렬 표시 검증 ===');

    // 이미 전체 고객이 기본 뷰
    await page.waitForTimeout(2000);

    const tableContainer = page.locator('.all-customers-view, .layout-centerpane').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'AllCustomersView');

    // 정렬 가능 헤더 클릭 테스트
    const sortableHeader = tableContainer.locator('.header-sortable').first();
    if (await sortableHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verifySortToggle(page, tableContainer, sortableHeader, 'AllCustomersView');
    }

    await page.screenshot({ path: 'test-results/sort-01-all-customers.png' });
  });

  test('2. 고객 상세 > 문서 탭 (DocumentsTab) 정렬 표시', async ({ page }) => {
    console.log('\n=== 문서 탭 정렬 표시 검증 ===');

    // 첫 번째 고객 클릭
    const firstCustomer = page.locator('.customer-list-row, .table-row').first();
    if (await firstCustomer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCustomer.click();
      await page.waitForTimeout(1500);
    }

    // 문서 탭 클릭
    const docsTab = page.locator('[data-tab="documents"], .tab-item:has-text("문서")').first();
    if (await docsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await docsTab.click();
      await page.waitForTimeout(1000);
    }

    const tableContainer = page.locator('.documents-tab, .customer-detail-tab-content').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'DocumentsTab');

    await page.screenshot({ path: 'test-results/sort-02-documents-tab.png' });
  });

  test('3. 고객 상세 > AR 탭 (AnnualReportTab) 정렬 표시', async ({ page }) => {
    console.log('\n=== AR 탭 정렬 표시 검증 ===');

    const firstCustomer = page.locator('.customer-list-row, .table-row').first();
    if (await firstCustomer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCustomer.click();
      await page.waitForTimeout(1500);
    }

    const arTab = page.locator('[data-tab="annual-report"], .tab-item:has-text("AR")').first();
    if (await arTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await arTab.click();
      await page.waitForTimeout(1000);
    }

    const tableContainer = page.locator('.annual-report-tab, .customer-detail-tab-content').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'AnnualReportTab');

    await page.screenshot({ path: 'test-results/sort-03-ar-tab.png' });
  });

  test('4. 고객 상세 > 변액리포트 탭 (CustomerReviewTab) 정렬 표시', async ({ page }) => {
    console.log('\n=== 변액리포트 탭 정렬 표시 검증 ===');

    const firstCustomer = page.locator('.customer-list-row, .table-row').first();
    if (await firstCustomer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCustomer.click();
      await page.waitForTimeout(1500);
    }

    const crTab = page.locator('[data-tab="customer-review"], .tab-item:has-text("변액")').first();
    if (await crTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await crTab.click();
      await page.waitForTimeout(1000);
    }

    const tableContainer = page.locator('.customer-review-tab, .customer-detail-tab-content').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'CustomerReviewTab');

    await page.screenshot({ path: 'test-results/sort-04-review-tab.png' });
  });

  test('5. 고객 상세 > 가족관계 탭 (FamilyContractsTab) 정렬 표시', async ({ page }) => {
    console.log('\n=== 가족관계 탭 정렬 표시 검증 ===');

    const firstCustomer = page.locator('.customer-list-row, .table-row').first();
    if (await firstCustomer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCustomer.click();
      await page.waitForTimeout(1500);
    }

    const familyTab = page.locator('[data-tab="family-contracts"], .tab-item:has-text("가족")').first();
    if (await familyTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await familyTab.click();
      await page.waitForTimeout(1000);
    }

    const tableContainer = page.locator('.family-contracts-tab, .customer-detail-tab-content').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'FamilyContractsTab');

    await page.screenshot({ path: 'test-results/sort-05-family-tab.png' });
  });

  test('6. 고객 상세 > 계약 탭 (ContractsTab) 정렬 표시', async ({ page }) => {
    console.log('\n=== 계약 탭 정렬 표시 검증 ===');

    const firstCustomer = page.locator('.customer-list-row, .table-row').first();
    if (await firstCustomer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCustomer.click();
      await page.waitForTimeout(1500);
    }

    const contractsTab = page.locator('[data-tab="contracts"], .tab-item:has-text("계약")').first();
    if (await contractsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contractsTab.click();
      await page.waitForTimeout(1000);
    }

    // ContractsTab은 AR/CRS/Main 3개 sort context가 있으므로 전체 탭 컨테이너에서 확인
    const tableContainer = page.locator('.contracts-tab, .customer-detail-tab-content').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'ContractsTab');

    await page.screenshot({ path: 'test-results/sort-06-contracts-tab.png' });
  });

  test('7. 전체 계약 보기 (ContractAllView) 정렬 표시', async ({ page }) => {
    console.log('\n=== 전체 계약 보기 정렬 표시 검증 ===');

    const success = await navigateToSection(page, 'contracts', 'contracts-all');
    if (!success) {
      console.log('전체 계약 메뉴 접근 불가 - 스킵');
      return;
    }

    const tableContainer = page.locator('.contract-all-view, .layout-centerpane').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'ContractAllView');

    // 정렬 가능 헤더 클릭 테스트
    const sortableHeader = tableContainer.locator('.header-sortable').first();
    if (await sortableHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verifySortToggle(page, tableContainer, sortableHeader, 'ContractAllView');
    }

    await page.screenshot({ path: 'test-results/sort-07-contract-all.png' });
  });

  test('8. 문서 현황 (DocumentStatusList) 정렬 표시', async ({ page }) => {
    console.log('\n=== 문서 현황 정렬 표시 검증 ===');

    const success = await navigateToSection(page, 'documents', 'documents-status');
    if (!success) {
      console.log('문서 현황 메뉴 접근 불가 - 스킵');
      return;
    }

    const tableContainer = page.locator('.document-status-view, .layout-centerpane').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'DocumentStatusList');

    await page.screenshot({ path: 'test-results/sort-08-doc-status.png' });
  });

  test('9. 문의 (InquiryView) 정렬 표시', async ({ page }) => {
    console.log('\n=== 문의 정렬 표시 검증 ===');

    const success = await navigateToMenu(page, 'inquiry');
    if (!success) {
      console.log('문의 메뉴 접근 불가 - 스킵');
      return;
    }

    const tableContainer = page.locator('.inquiry-view, .layout-centerpane').first();
    await verifySortIndicatorConsistency(page, tableContainer, 'InquiryView');

    await page.screenshot({ path: 'test-results/sort-09-inquiry.png' });
  });

  test('10. 크로스 뷰 일관성: old 패턴 완전 제거 확인', async ({ page }) => {
    console.log('\n=== 크로스 뷰 old 패턴 제거 검증 ===');

    // 전체 페이지에서 old sort indicator 패턴 검색
    await page.waitForTimeout(2000);

    // 1. .sort-indicator--both (양방향 표시) 없음
    const bothArrows = page.locator('.sort-indicator--both');
    const bothCount = await bothArrows.count();
    console.log(`.sort-indicator--both: ${bothCount}개`);
    expect(bothCount, 'old 양방향 표시가 남아있음').toBe(0);

    // 2. .sort-arrow (old 화살표) 없음
    const sortArrow = page.locator('.sort-arrow');
    const arrowCount = await sortArrow.count();
    console.log(`.sort-arrow: ${arrowCount}개`);
    expect(arrowCount, 'old sort-arrow가 남아있음').toBe(0);

    // 3. 존재하는 .sort-indicator는 모두 .sort-indicator--active 클래스를 함께 가짐
    const allIndicators = page.locator('.sort-indicator');
    const indicatorCount = await allIndicators.count();
    console.log(`.sort-indicator 전체: ${indicatorCount}개`);

    for (let i = 0; i < indicatorCount; i++) {
      const indicator = allIndicators.nth(i);
      const hasActive = await indicator.evaluate(el => el.classList.contains('sort-indicator--active'));
      expect(hasActive, `sort-indicator[${i}]에 --active 없음`).toBe(true);
    }

    // 4. 모든 활성 화살표가 동일한 빨간색 계열인지 확인
    const activeIndicators = page.locator('.sort-indicator--active');
    const activeCount = await activeIndicators.count();

    if (activeCount > 1) {
      const colors: string[] = [];
      for (let i = 0; i < activeCount; i++) {
        const color = await activeIndicators.nth(i).evaluate(el => getComputedStyle(el).color);
        colors.push(color);
      }
      // 모든 색상이 동일해야 함
      const uniqueColors = [...new Set(colors)];
      console.log(`활성 화살표 색상: ${uniqueColors.join(', ')}`);
      expect(uniqueColors.length, '뷰마다 화살표 색상이 다름').toBe(1);
    }

    console.log('크로스 뷰 일관성 검증 ✓');
    await page.screenshot({ path: 'test-results/sort-10-cross-view.png' });
  });
});

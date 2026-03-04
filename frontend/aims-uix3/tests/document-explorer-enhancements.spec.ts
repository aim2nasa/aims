import { test, expect } from '@playwright/test';

/**
 * 문서 탐색기 개선사항 검증 테스트
 *
 * 요구사항:
 * 1. 요약보기/전체텍스트 버튼이 각 문서에 표시
 * 2. 고객명 앞에 개인/법인 아이콘 표시 (법인=빌딩, 개인=사람)
 * 3. 문서 타입 표시 (JPG, PDF 등)
 * 4. 파일 크기 표시
 * 5. 컨텍스트 메뉴에 닫기 버튼
 */

async function navigateToExplorer(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});

  // 좌측 메뉴에서 "문서 탐색기" 클릭
  const explorerMenu = page.locator('text=문서 탐색기').first();
  await explorerMenu.click({ timeout: 10000 });
  await page.waitForTimeout(2000);

  // 초성 필터바 로드 대기
  await page.waitForSelector('.initial-filter-bar', { timeout: 15000 });
}

async function expandInitialAndWaitForDocs(page: import('@playwright/test').Page, initial?: string) {
  // 특정 초성 또는 문서가 있는 초성 클릭
  let btn;
  if (initial) {
    btn = page.locator(`.initial-filter-bar__initial:has-text("${initial}")`).first();
  } else {
    // 비활성이 아닌 (문서가 있는) 첫 번째 초성
    btn = page.locator('.initial-filter-bar__initial:not(.initial-filter-bar__initial--empty)').first();
  }
  await btn.click();
  await page.waitForTimeout(3000);

  // 고객 폴더 또는 문서 노드가 나올 때까지 대기
  await page.waitForSelector('.doc-explorer-tree__group-label, .doc-explorer-tree__doc-node', { timeout: 15000 });

  // 첫 번째 고객 폴더 클릭하여 펼치기
  const customerFolder = page.locator('.doc-explorer-tree__group-label').first();
  if (await customerFolder.isVisible().catch(() => false)) {
    await customerFolder.click();
    await page.waitForTimeout(2000);
  }

  // 문서 노드 대기
  await page.waitForSelector('.doc-explorer-tree__doc-actions', { timeout: 15000 });
}

test.describe('문서 탐색기 개선사항', () => {

  test('요구사항 1: 요약보기/전체텍스트 버튼이 문서에 표시되어야 함', async ({ page }) => {
    await navigateToExplorer(page);
    await expandInitialAndWaitForDocs(page);

    // 문서 노드에서 액션 버튼 영역 확인
    const actionBtns = page.locator('.doc-explorer-tree__doc-actions');
    const count = await actionBtns.count();
    expect(count).toBeGreaterThan(0);

    // 첫 번째 문서의 액션 버튼 2개 확인 (요약 + 전체텍스트)
    const firstDocActions = actionBtns.first();
    const buttons = firstDocActions.locator('.doc-explorer-tree__action-btn');
    await expect(buttons).toHaveCount(2);

    // 요약 버튼 title 확인
    await expect(buttons.nth(0)).toHaveAttribute('title', '요약 보기');
    // 전체텍스트 버튼 title 확인
    await expect(buttons.nth(1)).toHaveAttribute('title', '전체 텍스트 보기');
  });

  test('요구사항 1-1: 요약 버튼 클릭 시 모달이 열려야 함', async ({ page }) => {
    await navigateToExplorer(page);
    await expandInitialAndWaitForDocs(page);

    const summaryBtn = page.locator('.doc-explorer-tree__action-btn[title="요약 보기"]').first();
    await summaryBtn.click();

    // 모달이 표시되어야 함
    const modal = page.locator('.modal-backdrop');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('요구사항 1-2: 전체텍스트 버튼 클릭 시 모달이 열려야 함', async ({ page }) => {
    await navigateToExplorer(page);
    await expandInitialAndWaitForDocs(page);

    const fullTextBtn = page.locator('.doc-explorer-tree__action-btn[title="전체 텍스트 보기"]').first();
    await fullTextBtn.click();

    const modal = page.locator('.modal-backdrop');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('요구사항 2: 법인 고객(캐치업코리아)에 빌딩 아이콘이 표시되어야 함', async ({ page }) => {
    await navigateToExplorer(page);

    // ㅋ 초성 클릭
    const kBtn = page.locator('.initial-filter-bar__initial:has-text("ㅋ")').first();
    if (!await kBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await kBtn.click();
    await page.waitForTimeout(3000);

    // 캐치업코리아 고객 폴더가 있으면 클릭
    const customerFolder = page.locator('.doc-explorer-tree__group-label:has-text("캐치업코리아")');
    if (await customerFolder.isVisible({ timeout: 5000 }).catch(() => false)) {
      await customerFolder.click();
      await page.waitForTimeout(2000);
    }

    // 캐치업코리아 문서의 customer type icon 확인
    const corpDocs = page.locator('.doc-explorer-tree__doc-customer:has-text("캐치업코리아")');
    const corpDocCount = await corpDocs.count();
    expect(corpDocCount).toBeGreaterThan(0);

    // 법인 아이콘 SVG 확인
    const corpIcon = corpDocs.first().locator('.doc-explorer-tree__customer-type-icon svg');
    await expect(corpIcon).toBeVisible();

    // 빌딩 아이콘 path 확인
    const svgContent = await corpIcon.innerHTML();
    const isBuildingIcon = svgContent.includes('M6 5') || svgContent.includes('M3 21') || svgContent.includes('rect');
    expect(isBuildingIcon).toBeTruthy();
  });

  test('요구사항 3: 문서 타입(JPG, PDF 등)이 표시되어야 함', async ({ page }) => {
    await navigateToExplorer(page);
    await expandInitialAndWaitForDocs(page);

    const fileExts = page.locator('.doc-explorer-tree__doc-ext');
    const count = await fileExts.count();
    expect(count).toBeGreaterThan(0);

    const firstExt = await fileExts.first().textContent();
    expect(firstExt).toBeTruthy();
    const validExts = ['JPG', 'PDF', 'PNG', 'TXT', 'PPT', 'DOC', 'DOCX', 'XLS', 'XLSX', 'GIF', 'BMP', 'TIFF', 'HWP', 'CSV', '-'];
    const normalizedExt = firstExt!.trim().toUpperCase();
    expect(validExts.some(ext => normalizedExt.includes(ext) || normalizedExt === '-')).toBeTruthy();
  });

  test('요구사항 4: 파일 크기가 표시되어야 함', async ({ page }) => {
    await navigateToExplorer(page);
    await expandInitialAndWaitForDocs(page);

    const fileSizes = page.locator('.doc-explorer-tree__doc-size');
    const count = await fileSizes.count();
    expect(count).toBeGreaterThan(0);

    const firstSize = await fileSizes.first().textContent();
    expect(firstSize).toBeTruthy();
    const hasUnit = /\d.*\s*(B|KB|MB|GB)/i.test(firstSize!.trim());
    expect(hasUnit).toBeTruthy();
  });

  test('요구사항 5: 컨텍스트 메뉴에 닫기 버튼이 있어야 함', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 좌측 메뉴에서 "전체 문서 보기" 클릭
    const libraryMenu = page.locator('text=전체 문서 보기').first();
    await libraryMenu.click({ timeout: 10000 });
    await page.waitForTimeout(3000);

    // 문서 행이 로드될 때까지 대기 (status-item 클래스)
    const docRow = page.locator('.status-item[data-context-menu="document"]').first();
    await expect(docRow).toBeVisible({ timeout: 15000 });

    // 문서 행에 우클릭
    await docRow.click({ button: 'right' });
    await page.waitForTimeout(500);

    // 컨텍스트 메뉴가 표시되어야 함
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 3000 });

    // 닫기 버튼 확인
    const closeBtn = contextMenu.locator('.context-menu__close');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toContainText('닫기');

    // 닫기 버튼 클릭 시 메뉴가 닫혀야 함
    await closeBtn.click();
    await page.waitForTimeout(300);
    await expect(contextMenu).not.toBeVisible();
  });
});

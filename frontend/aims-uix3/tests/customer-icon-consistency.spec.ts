/**
 * 고객 유형 아이콘 색상 일관성 테스트
 * 기준: AllCustomersView의 개인(Blue #007aff) / 법인(Orange #ff9500)
 * 대상: CustomerRelationshipView, RegionalTreeView, QuickSearch
 */
import { test, expect } from '@playwright/test';

const AIMS_URL = 'https://aims.giize.com';
const EXPECTED_BLUE = 'rgb(0, 122, 255)';   // #007aff
const EXPECTED_ORANGE = 'rgb(255, 149, 0)'; // #ff9500

async function login(page: any) {
  await page.goto(AIMS_URL);
  await page.waitForTimeout(1000);
  if (page.url().includes('login')) {
    await page.click('button:has-text("카카오 로그인")');
    await page.waitForTimeout(500);
    if (page.url().includes('mode=pin')) {
      await page.locator('input[type="password"], input[type="tel"], input').first().pressSequentially('3007');
      await page.waitForTimeout(2000);
    }
  }
}

test.describe('고객 유형 아이콘 색상 일관성', () => {

  test('AC#1: 관계별 고객 보기 — 개인/법인 아이콘 색상', async ({ page }) => {
    await login(page);
    await page.click('text=관계별 고객 보기');
    await page.waitForTimeout(2000);

    const personalIcon = page.locator('.customer-icon--personal').first();
    await expect(personalIcon).toBeVisible({ timeout: 10000 });
    const personalColor = await personalIcon.evaluate((el: Element) => getComputedStyle(el).color);
    expect(personalColor).toBe(EXPECTED_BLUE);

    const corporateIcon = page.locator('.customer-icon--corporate').first();
    if (await corporateIcon.isVisible()) {
      const corporateColor = await corporateIcon.evaluate((el: Element) => getComputedStyle(el).color);
      expect(corporateColor).toBe(EXPECTED_ORANGE);
    }

    await page.screenshot({ path: 'test-results/ac1-relationship-icons.png' });
  });

  test('AC#2: 지역별 고객 보기 — 개인/법인 아이콘 색상', async ({ page }) => {
    await login(page);
    await page.click('text=지역별 고객 보기');
    await page.waitForTimeout(2000);

    // 트리 노드를 펼쳐서 고객 아이콘 노출
    const treeNode = page.locator('.tree-region-item, .tree-node').first();
    if (await treeNode.isVisible()) {
      await treeNode.click();
      await page.waitForTimeout(1000);
    }

    const personalIcon = page.locator('.customer-icon--personal').first();
    await expect(personalIcon).toBeVisible({ timeout: 10000 });
    const personalColor = await personalIcon.evaluate((el: Element) => getComputedStyle(el).color);
    expect(personalColor).toBe(EXPECTED_BLUE);

    const corporateIcon = page.locator('.customer-icon--corporate').first();
    if (await corporateIcon.isVisible()) {
      const corporateColor = await corporateIcon.evaluate((el: Element) => getComputedStyle(el).color);
      expect(corporateColor).toBe(EXPECTED_ORANGE);
    }

    await page.screenshot({ path: 'test-results/ac2-regional-icons.png' });
  });

  test('AC#3: 빠른 검색 — 개인/법인 아이콘 색상', async ({ page }) => {
    await login(page);

    // 빠른 검색 열기
    const searchBox = page.locator('input[placeholder*="고객 검색"], input[placeholder*="빠른 검색"]');
    await searchBox.click();
    await searchBox.fill('마리치');
    await page.waitForTimeout(1500);

    const corporateIcon = page.locator('.quick-search__customer-icon--corporate').first();
    if (await corporateIcon.isVisible()) {
      const corporateColor = await corporateIcon.evaluate((el: Element) => getComputedStyle(el).color);
      expect(corporateColor).toBe(EXPECTED_ORANGE);
    }

    // 개인 고객도 검색
    await searchBox.fill('윤미연');
    await page.waitForTimeout(1500);

    const personalIcon = page.locator('.quick-search__customer-icon--personal').first();
    if (await personalIcon.isVisible()) {
      const personalColor = await personalIcon.evaluate((el: Element) => getComputedStyle(el).color);
      expect(personalColor).toBe(EXPECTED_BLUE);
    }

    await page.screenshot({ path: 'test-results/ac3-quicksearch-icons.png' });
  });
});

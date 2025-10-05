import { test, expect } from '@playwright/test';

test.describe('검증 없이 모든 값 저장 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"], [class*="MenuItem"], button[class*="item"]').all();
    await menuItems[2].click();
    await page.waitForTimeout(1500);

    // 첫 번째 고객 클릭
    const customerItems = await page.locator('[class*="customer"], [class*="Customer"], tr, li').all();
    await customerItems[0].click();
    await page.waitForTimeout(1000);

    // 정보 수정 버튼 클릭
    await page.locator('button:has-text("정보 수정"), button:has-text("수정")').first().click();
    await page.waitForTimeout(1000);
  });

  test('잘못된 형식의 전화번호 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("휴대폰") input');
    await input.clear();
    await input.fill('123456789'); // 하이픈 없는 형식
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 잘못된 형식의 전화번호 저장 성공');
  });

  test('잘못된 형식의 이메일 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("이메일") input');
    await input.clear();
    await input.fill('invalid-email'); // @ 없는 이메일
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 잘못된 형식의 이메일 저장 성공');
  });

  test('임의의 문자열 전화번호 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("회사 전화") input');
    await input.clear();
    await input.fill('abcd1234'); // 문자+숫자
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 임의의 문자열 전화번호 저장 성공');
  });

  test('특수문자만 있는 이메일 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("이메일") input');
    await input.clear();
    await input.fill('@@##$$%%'); // 특수문자만
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 특수문자만 있는 이메일 저장 성공');
  });

  test('빈 문자열 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("휴대폰") input');
    await input.clear();
    await input.fill('   '); // 공백만
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 빈 문자열 저장 성공');
  });

  test('매우 긴 문자열 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("회사 전화") input');
    await input.clear();
    await input.fill('1234567890123456789012345678901234567890'); // 40자
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 매우 긴 문자열 저장 성공');
  });
});

import { test, expect } from '@playwright/test';

test.describe('모든 필드 저장 검증', () => {
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

  test('연락처: 휴대폰 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("휴대폰") input');
    await input.clear();
    await input.fill('010-9999-8888');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 휴대폰 저장 성공');
  });

  test('연락처: 집 전화 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("집 전화") input');
    await input.clear();
    await input.fill('02-1111-2222');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 집 전화 저장 성공');
  });

  test('연락처: 회사 전화 (031) 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("회사 전화") input');
    await input.clear();
    await input.fill('031-1123-1213');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 회사 전화 (031) 저장 성공');
  });

  test('연락처: 회사 전화 (042) 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("회사 전화") input');
    await input.clear();
    await input.fill('042-123-4567');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 회사 전화 (042) 저장 성공');
  });

  test('연락처: 이메일 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const input = page.locator('.form-row:has-text("이메일") input');
    await input.clear();
    await input.fill('test@example.com');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 이메일 저장 성공');
  });

  test('기본 정보: 생년월일 변경 후 저장', async ({ page }) => {
    // 기본 정보 탭은 기본으로 열려있음
    const input = page.locator('input[type="date"], .form-row:has-text("생년월일") input').first();
    await input.fill('1990-05-15');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 생년월일 저장 성공');
  });

  test('주소 정보: 우편번호 변경 후 저장', async ({ page }) => {
    await page.locator('button:has-text("주소")').click();
    await page.waitForTimeout(300);

    const input = page.locator('input[placeholder*="우편"], .form-row:has-text("우편번호") input').first();
    await input.clear();
    await input.fill('12345');
    await page.waitForTimeout(300);

    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();
    console.log('✅ 우편번호 저장 성공');
  });
});

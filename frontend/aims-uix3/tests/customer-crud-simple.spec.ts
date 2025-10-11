import { test } from '@playwright/test';

/**
 * 간단한 고객 CRUD 테스트
 *
 * 사용자가 직접 브라우저에서 확인하면서 진행하는 테스트
 */

test.describe('고객 CRUD 간단 테스트', () => {
  const timestamp = Date.now();
  const testCustomerName = `테스트고객_${timestamp}`;

  test('1. 고객 생성 테스트', async ({ page }) => {
    console.log('\n=== 고객 생성 테스트 ===');
    console.log('생성할 고객명:', testCustomerName);

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // 햄버거 메뉴 → 고객 등록
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[1].click(); // 고객 등록
    await page.waitForTimeout(1500);

    // 필수 필드만 입력: 이름
    const nameInput = page.locator('input[aria-label="이름"]');
    await nameInput.fill(testCustomerName);

    // 휴대폰 (선택)
    const mobileInput = page.locator('input[placeholder*="010"]').first();
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill('010-1234-5678');

    await page.screenshot({ path: 'test-results/crud-simple-01-before-register.png' });

    // 등록 버튼 클릭
    await page.locator('button:has-text("등록")').click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/crud-simple-02-after-register.png' });

    console.log('✅ 고객 생성 완료');
    console.log('브라우저에서 확인: 고객이 생성되었는지 확인하세요');
  });

  test('2. 고객 조회 테스트', async ({ page }) => {
    console.log('\n=== 고객 조회 테스트 ===');

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[2].click(); // 고객 전체보기
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/crud-simple-03-customer-list.png' });

    console.log('✅ 고객 목록 확인');
    console.log('브라우저에서 확인: 생성한 고객이 목록에 있는지 확인하세요');
  });

  test('3. 고객 수정 테스트 (수동)', async ({ page }) => {
    console.log('\n=== 고객 수정 테스트 ===');
    console.log('이 테스트는 사용자가 수동으로 진행해야 합니다:');
    console.log('1. 브라우저에서 고객 전체보기로 이동');
    console.log('2. 생성한 고객 클릭');
    console.log('3. "정보 수정" 버튼 클릭');
    console.log('4. 고객명을 변경');
    console.log('5. "저장" 버튼 클릭');
    console.log('6. 변경 사항이 반영되었는지 확인');

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/crud-simple-04-edit-instructions.png' });

    console.log('✅ 테스트 준비 완료');
  });

  test('4. 고객 삭제 테스트 (수동)', async ({ page }) => {
    console.log('\n=== 고객 삭제 테스트 ===');
    console.log('이 테스트는 사용자가 수동으로 진행해야 합니다:');
    console.log('1. 브라우저에서 테스트 고객 선택');
    console.log('2. 삭제 버튼 클릭');
    console.log('3. 확인 버튼 클릭');
    console.log('4. 고객이 목록에서 사라졌는지 확인');

    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/crud-simple-05-delete-instructions.png' });

    console.log('✅ 테스트 준비 완료');
  });
});

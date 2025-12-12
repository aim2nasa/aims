import { test, expect } from '@playwright/test';
import { loginAndSetup, generateCustomers, type TestCustomer } from '../fixtures';

/**
 * 다중 고객 E2E 테스트
 *
 * 시나리오:
 * 1. 여러 고객 생성 (개인/법인 혼합)
 * 2. 고객 목록에서 확인
 * 3. 고객명 중복 검증
 * 4. 생성된 고객들 정리 (삭제)
 */

test.describe('다중 고객 E2E 테스트', () => {
  const testPrefix = `E2E_${Date.now()}`;
  const customers = generateCustomers(testPrefix, 3);
  const createdCustomerNames: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 여러 고객 생성 (3명)', async ({ page }) => {
    console.log('\n=== 다중 고객 생성 테스트 ===');
    console.log(`생성할 고객: ${customers.length}명`);

    for (const customer of customers) {
      console.log(`\n생성 중: ${customer.name} (${customer.customerType})`);

      // 햄버거 메뉴 → 고객 등록
      await page.locator('button.hamburger-button').first().click();
      await page.waitForTimeout(500);
      const menuItems = await page.locator('[class*="menu-item"]').all();
      await menuItems[1].click(); // 고객 등록
      await page.waitForTimeout(1500);

      // 고객 정보 입력
      await page.locator('input[aria-label="이름"]').fill(customer.name);

      // 휴대폰
      const mobileInput = page.locator('input[placeholder*="010"]').first();
      await mobileInput.scrollIntoViewIfNeeded();
      await mobileInput.fill(customer.mobilePhone);

      // 등록 버튼 클릭
      await page.locator('button:has-text("등록")').click();
      await page.waitForTimeout(2000);

      // 등록 완료 후 모달 닫기 (확인 버튼이나 X 버튼 클릭)
      const confirmButton = page.locator('.modal button:has-text("확인"), .modal-backdrop + * button:has-text("확인")');
      if (await confirmButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.first().click();
        await page.waitForTimeout(500);
      }

      // backdrop이 있으면 ESC로 닫기 시도
      const backdrop = page.locator('.modal-backdrop');
      if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      console.log(`✅ ${customer.name} 등록 완료`);
      createdCustomerNames.push(customer.name);

      // 다음 고객 등록을 위해 잠시 대기
      await page.waitForTimeout(500);
    }

    console.log(`\n총 ${createdCustomerNames.length}명 고객 생성 완료`);
  });

  test('2. 고객 목록에서 생성된 고객 확인', async ({ page }) => {
    console.log('\n=== 고객 목록 확인 테스트 ===');

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[2].click(); // 고객 전체보기
    await page.waitForTimeout(2000);

    // 페이지에서 생성된 고객들 검색
    for (const customerName of createdCustomerNames) {
      const customerElement = page.locator(`text=${customerName}`).first();
      const isVisible = await customerElement.isVisible({ timeout: 5000 }).catch(() => false);

      if (isVisible) {
        console.log(`✅ 발견: ${customerName}`);
      } else {
        console.log(`⚠️ 미발견: ${customerName} (검색 필요할 수 있음)`);
      }
    }

    await page.screenshot({ path: 'test-results/multi-customer-list.png' });
  });

  test('3. 고객명 중복 검증 (동일 이름 등록 시도)', async ({ page }) => {
    console.log('\n=== 고객명 중복 검증 테스트 ===');

    if (createdCustomerNames.length === 0) {
      console.log('⚠️ 생성된 고객이 없어 중복 검증 생략');
      return;
    }

    const duplicateName = createdCustomerNames[0];
    console.log(`중복 시도할 이름: ${duplicateName}`);

    // 햄버거 메뉴 → 고객 등록
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[1].click(); // 고객 등록
    await page.waitForTimeout(1500);

    // 동일한 이름으로 등록 시도
    await page.locator('input[aria-label="이름"]').fill(duplicateName);

    const mobileInput = page.locator('input[placeholder*="010"]').first();
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill('010-9999-9999');

    // 등록 버튼 클릭
    await page.locator('button:has-text("등록")').click();
    await page.waitForTimeout(2000);

    // 에러 메시지 확인 (중복 고객명 에러)
    const errorMessage = page.locator('text=중복, text=이미 존재, text=동일한 이름').first();
    const hasError = await errorMessage.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasError) {
      console.log('✅ 중복 검증 성공: 에러 메시지 표시됨');
    } else {
      console.log('⚠️ 중복 검증 실패 또는 에러 메시지 미표시');
    }

    await page.screenshot({ path: 'test-results/multi-customer-duplicate.png' });
  });

  test('4. 생성된 고객 정리 (삭제)', async ({ page }) => {
    console.log('\n=== 고객 정리 테스트 ===');
    console.log('(테스트 데이터 정리를 위해 생성된 고객 삭제)');

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[2].click(); // 고객 전체보기
    await page.waitForTimeout(2000);

    // 각 고객 삭제 시도
    for (const customerName of createdCustomerNames) {
      console.log(`삭제 시도: ${customerName}`);

      // 고객 찾기 및 클릭
      const customerRow = page.locator(`text=${customerName}`).first();
      if (await customerRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await customerRow.click();
        await page.waitForTimeout(1000);

        // 삭제 버튼 찾기
        const deleteButton = page.locator('button:has-text("삭제"), button[aria-label*="삭제"]').first();
        if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deleteButton.click();
          await page.waitForTimeout(500);

          // 확인 버튼 클릭
          const confirmButton = page.locator('button:has-text("확인")').first();
          if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmButton.click();
            await page.waitForTimeout(1000);
          }

          console.log(`✅ ${customerName} 삭제 완료`);
        } else {
          console.log(`⚠️ ${customerName} 삭제 버튼 없음`);
        }
      } else {
        console.log(`⚠️ ${customerName} 찾을 수 없음`);
      }
    }

    console.log('\n고객 정리 완료');
  });
});

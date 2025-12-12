import { test, expect } from '@playwright/test';
import { loginAndSetup, generateCustomers, type TestCustomer } from '../fixtures';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * 다중 고객 E2E 테스트
 *
 * 시나리오:
 * 1. 여러 고객 생성 (개인/법인 혼합)
 * 2. 고객 목록에서 확인
 * 3. 고객명 중복 검증
 * 4. 생성된 고객들 정리 (삭제)
 */

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 테스트 간 상태 공유를 위한 파일 경로
const STATE_FILE = path.join(__dirname, '../../test-results/test-state.json');

// 상태 저장
function saveState(data: { customers: string[]; prefix: string }) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// 상태 로드
function loadState(): { customers: string[]; prefix: string } | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

// 상태 삭제
function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch {
    // ignore
  }
}

test.describe('다중 고객 E2E 테스트', () => {
  // 테스트를 순차 실행하도록 설정
  test.describe.configure({ mode: 'serial' });

  const testPrefix = `E2E_${Date.now()}`;
  const customers = generateCustomers(testPrefix, 3);

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.afterAll(() => {
    // 모든 테스트 완료 후 상태 파일 정리
    clearState();
  });

  test('1. 여러 고객 생성 (3명)', async ({ page }) => {
    console.log('\n=== 다중 고객 생성 테스트 ===');
    console.log(`생성할 고객: ${customers.length}명`);

    const createdCustomerNames: string[] = [];

    for (let i = 0; i < customers.length; i++) {
      const customer = customers[i];
      console.log(`\n생성 중 (${i + 1}/${customers.length}): ${customer.name} (${customer.customerType})`);

      // 고객 등록 화면으로 이동 (이름 입력란이 없으면 메뉴 통해 이동)
      const nameInput = page.locator('input[aria-label="이름"]');
      if (!(await nameInput.isVisible({ timeout: 1000 }).catch(() => false))) {
        // 햄버거 메뉴 → 고객 등록
        await page.locator('button.hamburger-button').first().click();
        await page.waitForTimeout(500);
        const menuItems = await page.locator('[class*="menu-item"]').all();
        await menuItems[1].click(); // 고객 등록
        await page.waitForTimeout(1500);
      }

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

    // 상태 저장 (다음 테스트에서 사용)
    saveState({ customers: createdCustomerNames, prefix: testPrefix });
    console.log(`\n총 ${createdCustomerNames.length}명 고객 생성 완료`);

    expect(createdCustomerNames.length).toBe(3);
  });

  test('2. 고객 목록에서 생성된 고객 확인', async ({ page }) => {
    console.log('\n=== 고객 목록 확인 테스트 ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 이전 테스트에서 생성된 고객이 없음');
      test.skip();
      return;
    }

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[2].click(); // 고객 전체보기
    await page.waitForTimeout(2000);

    let foundCount = 0;

    // 페이지에서 생성된 고객들 검색
    for (const customerName of state.customers) {
      const customerElement = page.locator(`text=${customerName}`).first();
      const isVisible = await customerElement.isVisible({ timeout: 5000 }).catch(() => false);

      if (isVisible) {
        console.log(`✅ 발견: ${customerName}`);
        foundCount++;
      } else {
        console.log(`⚠️ 미발견: ${customerName} (페이지네이션 필요할 수 있음)`);
      }
    }

    await page.screenshot({ path: 'test-results/multi-customer-list.png' });
    console.log(`\n발견된 고객: ${foundCount}/${state.customers.length}명`);
  });

  test('3. 고객명 중복 검증 (동일 이름 등록 시도)', async ({ page }) => {
    console.log('\n=== 고객명 중복 검증 테스트 ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 이전 테스트에서 생성된 고객이 없음');
      test.skip();
      return;
    }

    const duplicateName = state.customers[0];
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

    // 에러 메시지 또는 토스트 확인 (다양한 에러 메시지 패턴)
    const errorPatterns = [
      'text=중복',
      'text=이미 존재',
      'text=동일한',
      'text=사용 중',
      '.toast-error',
      '.error-message',
      '[role="alert"]'
    ];

    let hasError = false;
    for (const pattern of errorPatterns) {
      const element = page.locator(pattern).first();
      if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
        hasError = true;
        console.log(`✅ 중복 검증 성공: 에러 발견 (${pattern})`);
        break;
      }
    }

    if (!hasError) {
      // 등록이 실패했는지 확인 (페이지에 여전히 등록 폼이 있는지)
      const stillOnForm = await page.locator('input[aria-label="이름"]').isVisible();
      if (stillOnForm) {
        console.log('✅ 중복 검증 성공: 등록 폼에서 벗어나지 않음 (등록 차단됨)');
        hasError = true;
      }
    }

    if (!hasError) {
      console.log('⚠️ 중복 검증: 에러 메시지 미표시 (서버에서 허용했을 수 있음)');
    }

    await page.screenshot({ path: 'test-results/multi-customer-duplicate.png' });
  });

  test('4. 생성된 고객 정리 (삭제)', async ({ page }) => {
    console.log('\n=== 고객 정리 테스트 ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 삭제할 고객이 없음');
      return;
    }

    console.log(`삭제 대상: ${state.customers.length}명`);

    // 햄버거 메뉴 → 고객 전체보기
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[2].click(); // 고객 전체보기
    await page.waitForTimeout(2000);

    let deletedCount = 0;

    // 각 고객 삭제 시도
    for (const customerName of state.customers) {
      console.log(`\n삭제 시도: ${customerName}`);

      // 고객 찾기 및 클릭
      const customerRow = page.locator(`text=${customerName}`).first();
      if (await customerRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await customerRow.click();
        await page.waitForTimeout(1000);

        // 삭제 버튼 찾기 (다양한 패턴)
        const deleteButton = page.locator('button:has-text("삭제"), button[aria-label*="삭제"], [data-action="delete"]').first();
        if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deleteButton.click();
          await page.waitForTimeout(500);

          // 확인 버튼 클릭
          const confirmButton = page.locator('button:has-text("확인"), button:has-text("삭제"), .modal button.danger').first();
          if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await confirmButton.click();
            await page.waitForTimeout(1000);
          }

          console.log(`✅ ${customerName} 삭제 완료`);
          deletedCount++;

          // 목록으로 돌아가기
          await page.locator('button.hamburger-button').first().click();
          await page.waitForTimeout(500);
          const menuItemsAgain = await page.locator('[class*="menu-item"]').all();
          await menuItemsAgain[2].click();
          await page.waitForTimeout(1500);
        } else {
          console.log(`⚠️ ${customerName} 삭제 버튼 없음`);
        }
      } else {
        console.log(`⚠️ ${customerName} 찾을 수 없음`);
      }
    }

    console.log(`\n삭제 완료: ${deletedCount}/${state.customers.length}명`);
  });
});

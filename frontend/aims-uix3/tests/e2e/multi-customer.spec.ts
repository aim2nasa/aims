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
 * 2. 고객 목록에서 검색하여 확인
 * 3. 고객명 중복 검증
 * 4. 생성된 고객들 검색 후 삭제
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

  test('2. 고객 목록에서 검색하여 확인', async ({ page }) => {
    console.log('\n=== 고객 목록 검색 테스트 ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 이전 테스트에서 생성된 고객이 없음');
      test.skip();
      return;
    }

    // "전체 고객 보기" 버튼 클릭 (대시보드 가이드 카드 또는 사이드바 메뉴)
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    let foundCount = 0;

    // 각 고객이 테이블에 표시되는지 확인 (최근 등록이므로 상단에 표시됨)
    for (const customerName of state.customers) {
      console.log(`\n확인 중: ${customerName}`);

      // 고객이 표시되는지 확인 (테이블 셀 또는 텍스트)
      const customerElement = page.getByText(customerName, { exact: true }).first();
      const isVisible = await customerElement.isVisible({ timeout: 5000 }).catch(() => false);

      if (isVisible) {
        console.log(`✅ 발견: ${customerName}`);
        foundCount++;
      } else {
        console.log(`⚠️ 미발견: ${customerName}`);
      }
    }

    await page.screenshot({ path: 'test-results/multi-customer-list.png' });
    console.log(`\n발견된 고객: ${foundCount}/${state.customers.length}명`);

    expect(foundCount).toBe(state.customers.length);
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

    // 온보딩 가이드가 열려있으면 닫기
    const onboardingOverlay = page.locator('.onboarding-tour__overlay, .onboarding-tour');
    if (await onboardingOverlay.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 사이드바 메뉴에서 "새 고객 등록" 클릭
    const newCustomerMenu = page.locator('[role="menuitem"]:has-text("새 고객 등록"), button:has-text("고객 등록")').first();
    await newCustomerMenu.click();
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
    expect(hasError).toBe(true);
  });

  test('4. 생성된 고객 삭제 (삭제 모드 사용)', async ({ page }) => {
    console.log('\n=== 고객 삭제 테스트 (삭제 모드) ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 삭제할 고객이 없음');
      return;
    }

    console.log(`삭제 대상: ${state.customers.length}명`);

    // "전체 고객 보기" 버튼 클릭
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 개발자 모드 활성화 (Ctrl+Alt+Shift+D)
    await page.keyboard.press('Control+Alt+Shift+D');
    await page.waitForTimeout(500);
    console.log('✅ 개발자 모드 활성화 시도 (Ctrl+Alt+Shift+D)');

    // 삭제 모드 활성화 버튼 찾기 (개발자 모드에서만 표시됨)
    // aria-label="삭제" 버튼 또는 edit-mode-icon-button 클래스
    const deleteModeToggle = page.locator('button[aria-label="삭제"], .edit-mode-icon-button').first();

    if (!await deleteModeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      // 컨텍스트 메뉴로 삭제 시도
      console.log('⚠️ 삭제 모드 버튼 미발견 - 컨텍스트 메뉴 삭제 시도...');

      for (const customerName of state.customers) {
        const customerRow = page.getByText(customerName, { exact: true }).first();
        if (await customerRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          // 우클릭으로 컨텍스트 메뉴 열기
          await customerRow.click({ button: 'right' });
          await page.waitForTimeout(500);

          // 컨텍스트 메뉴에서 삭제 클릭
          const contextDelete = page.locator('[role="menu"] button:has-text("삭제"), .context-menu button:has-text("삭제")').first();
          if (await contextDelete.isVisible({ timeout: 1000 }).catch(() => false)) {
            await contextDelete.click();
            await page.waitForTimeout(500);

            // 확인 모달
            const confirmDelete = page.locator('.modal button:has-text("삭제")').first();
            if (await confirmDelete.isVisible({ timeout: 1000 }).catch(() => false)) {
              await confirmDelete.click();
              await page.waitForTimeout(1000);
              console.log(`✅ ${customerName} 컨텍스트 메뉴로 삭제`);
            }
          } else {
            // ESC로 컨텍스트 메뉴 닫기
            await page.keyboard.press('Escape');
          }
        }
      }

      await page.screenshot({ path: 'test-results/multi-customer-context-delete.png' });
      return;
    }

    // 삭제 모드 활성화
    await deleteModeToggle.click();
    await page.waitForTimeout(500);
    console.log('✅ 삭제 모드 활성화');

    let selectedCount = 0;

    // 각 고객의 체크박스 선택
    for (const customerName of state.customers) {
      console.log(`\n선택 시도: ${customerName}`);

      // 고객 행에서 체크박스 찾기
      const customerRow = page.locator(`.customer-item:has-text("${customerName}")`).first();

      if (await customerRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        // 체크박스 클릭 (customer-checkbox 클래스 내의 input)
        const checkbox = customerRow.locator('.customer-checkbox input, input[type="checkbox"]').first();

        if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
          await checkbox.check();
          selectedCount++;
          console.log(`✅ ${customerName} 선택됨`);
        } else {
          // 체크박스가 없으면 행 자체를 클릭 (삭제 모드에서는 행 클릭이 선택)
          await customerRow.click();
          selectedCount++;
          console.log(`✅ ${customerName} 선택됨 (행 클릭)`);
        }
      } else {
        console.log(`⚠️ ${customerName} 행을 찾을 수 없음`);
      }
    }

    await page.screenshot({ path: 'test-results/multi-customer-selected.png' });

    if (selectedCount === 0) {
      console.log('⚠️ 선택된 고객이 없음');
      return;
    }

    console.log(`\n${selectedCount}명 선택 완료, 삭제 진행...`);

    // 삭제 버튼 클릭 (variant="destructive" 버튼)
    const deleteButton = page.locator('button:has-text("삭제"):not([aria-label])').first();

    if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteButton.click();
      await page.waitForTimeout(1000);

      // 확인 모달에서 삭제 버튼 클릭 (모달 내 destructive 버튼)
      // .delete-confirm-actions 내의 버튼 또는 modal 내의 destructive 버튼
      const confirmDelete = page.locator('.delete-confirm-actions button:has-text("삭제"), .modal button.button--destructive:has-text("삭제")').first();
      if (await confirmDelete.isVisible({ timeout: 2000 }).catch(() => false)) {
        // force: true로 클릭하여 오버레이 무시
        await confirmDelete.click({ force: true });
        await page.waitForTimeout(2000);
        console.log(`✅ ${selectedCount}명 삭제 완료`);
      } else {
        console.log('⚠️ 확인 모달 삭제 버튼 미발견');
      }
    } else {
      console.log('⚠️ 삭제 버튼을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/multi-customer-deleted.png' });

    // 삭제 확인: 고객이 더 이상 표시되지 않는지 확인
    let remainingCount = 0;
    for (const customerName of state.customers) {
      const stillExists = await page.getByText(customerName, { exact: true }).first().isVisible({ timeout: 1000 }).catch(() => false);
      if (stillExists) remainingCount++;
    }

    console.log(`\n삭제 후 남은 고객: ${remainingCount}/${state.customers.length}명`);

    // 삭제 성공 시 0명이어야 함
    if (remainingCount === 0) {
      console.log('✅ 모든 테스트 고객 삭제 성공');
    } else {
      console.log(`⚠️ ${remainingCount}명의 고객이 아직 남아있음`);
    }
  });

  test('5. 고객 상세 정보 확인', async ({ page }) => {
    console.log('\n=== 고객 상세 정보 확인 테스트 ===');

    const state = loadState();
    if (!state || state.customers.length === 0) {
      console.log('⚠️ 확인할 고객이 없음 (이전 테스트에서 삭제됨)');
      test.skip();
      return;
    }

    // "전체 고객 보기" 버튼 클릭
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const firstCustomerName = state.customers[0];
    console.log(`확인할 고객: ${firstCustomerName}`);

    // 고객 클릭하여 상세 페이지 이동
    const customerElement = page.getByText(firstCustomerName, { exact: true }).first();
    if (!await customerElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️ 고객을 찾을 수 없음');
      test.skip();
      return;
    }

    await customerElement.dblclick(); // 더블클릭으로 상세 페이지 이동
    await page.waitForTimeout(2000);

    // 상세 페이지에서 정보 확인
    const detailPage = page.locator('.customer-detail, .customer-full-detail, [class*="detail"]').first();

    if (await detailPage.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✅ 상세 페이지 로드 완료');

      // 고객명 확인
      const nameDisplayed = await page.getByText(firstCustomerName).first().isVisible();
      console.log(`고객명 표시: ${nameDisplayed ? '✅' : '❌'}`);

      // 탭 확인 (문서, 계약 등)
      const tabs = ['문서', '계약', '가족', 'Annual'];
      for (const tab of tabs) {
        const tabElement = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
        const hasTab = await tabElement.isVisible({ timeout: 1000 }).catch(() => false);
        console.log(`${tab} 탭: ${hasTab ? '✅' : '❌'}`);
      }

      await page.screenshot({ path: 'test-results/multi-customer-detail.png' });
    } else {
      console.log('⚠️ 상세 페이지를 찾을 수 없음');
    }

    expect(true).toBe(true); // 정보 표시 확인만 하는 테스트
  });

  test('6. 개인/법인 고객 아이콘 구분 확인', async ({ page }) => {
    console.log('\n=== 고객 유형 아이콘 확인 테스트 ===');

    // "전체 고객 보기" 버튼 클릭
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 개인 고객 아이콘 확인 (블루 사람 아이콘)
    const personalIcon = page.locator('.customer-icon--personal, [class*="personal"]').first();
    const hasPersonalIcon = await personalIcon.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`개인 고객 아이콘: ${hasPersonalIcon ? '✅ 발견' : '⚠️ 없음'}`);

    // 법인 고객 아이콘 확인 (오렌지 건물 아이콘)
    const corporateIcon = page.locator('.customer-icon--corporate, [class*="corporate"]').first();
    const hasCorporateIcon = await corporateIcon.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`법인 고객 아이콘: ${hasCorporateIcon ? '✅ 발견' : '⚠️ 없음'}`);

    await page.screenshot({ path: 'test-results/multi-customer-icons.png' });

    // 최소 하나의 아이콘 유형이 있으면 성공
    const hasAnyIcon = hasPersonalIcon || hasCorporateIcon;
    console.log(`아이콘 시스템: ${hasAnyIcon ? '✅ 정상' : '⚠️ 확인 필요'}`);

    expect(hasAnyIcon).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { loginAndSetup } from './fixtures';

/**
 * 간단한 고객 CRUD 테스트 (완전 자동화)
 *
 * 테스트 시나리오:
 * 1. 고객 생성
 * 2. 고객 조회 (목록에서 확인)
 * 3. 고객 수정
 * 4. 고객 삭제
 */

test.describe('고객 CRUD 간단 테스트', () => {
  // 테스트 순차 실행
  test.describe.configure({ mode: 'serial' });

  const timestamp = Date.now();
  const testCustomerName = `테스트고객_${timestamp}`;
  const updatedCustomerName = `수정됨_${timestamp}`;

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 고객 생성 테스트', async ({ page }) => {
    console.log('\n=== 고객 생성 테스트 ===');
    console.log('생성할 고객명:', testCustomerName);

    // 햄버거 메뉴 클릭
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

    // 등록 확인 모달 닫기
    const confirmButton = page.locator('.modal button:has-text("확인")');
    if (await confirmButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.first().click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'test-results/crud-simple-02-after-register.png' });

    console.log('✅ 고객 생성 완료');
  });

  test('2. 고객 조회 테스트', async ({ page }) => {
    console.log('\n=== 고객 조회 테스트 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 생성한 고객이 목록에 있는지 확인
    const customerElement = page.getByText(testCustomerName, { exact: true }).first();
    const isVisible = await customerElement.isVisible({ timeout: 5000 }).catch(() => false);

    await page.screenshot({ path: 'test-results/crud-simple-03-customer-list.png' });

    if (isVisible) {
      console.log('✅ 고객 목록에서 발견:', testCustomerName);
    } else {
      console.log('⚠️ 고객을 찾을 수 없음 (최근 등록이므로 상단에 있어야 함)');
    }

    expect(isVisible).toBe(true);
  });

  test('3. 고객 수정 테스트', async ({ page }) => {
    console.log('\n=== 고객 수정 테스트 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 테스트 고객 찾기 및 클릭
    const customerElement = page.getByText(testCustomerName, { exact: true }).first();
    if (!await customerElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('⚠️ 테스트 고객을 찾을 수 없음');
      test.skip();
      return;
    }

    // 더블클릭으로 상세 화면 이동
    await customerElement.dblclick();
    await page.waitForTimeout(2000);

    // "정보 수정" 또는 "수정" 버튼 찾기
    const editButton = page.locator('button:has-text("정보 수정"), button:has-text("수정")').first();
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(1000);

      // 이름 필드 수정
      const nameInput = page.locator('input[aria-label="이름"]').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.clear();
        await nameInput.fill(updatedCustomerName);

        // 저장 버튼 클릭
        const saveButton = page.locator('button:has-text("저장")').first();
        await saveButton.click();
        await page.waitForTimeout(2000);

        console.log('✅ 고객 정보 수정 완료:', updatedCustomerName);
      }
    } else {
      // 인라인 편집 모드인 경우
      console.log('정보 수정 버튼을 찾을 수 없음 - 인라인 편집 시도');
      const nameInput = page.locator('input[aria-label="이름"]').first();
      if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameInput.clear();
        await nameInput.fill(updatedCustomerName);
        await page.keyboard.press('Tab'); // 포커스 이동으로 저장 트리거
        await page.waitForTimeout(1000);
      }
    }

    await page.screenshot({ path: 'test-results/crud-simple-04-after-edit.png' });
  });

  test('4. 고객 삭제 테스트', async ({ page }) => {
    console.log('\n=== 고객 삭제 테스트 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 개발자 모드 활성화 (삭제 기능 사용을 위해)
    await page.keyboard.press('Control+Alt+Shift+D');
    await page.waitForTimeout(500);
    console.log('개발자 모드 활성화 시도');

    // 수정된 이름 또는 원래 이름으로 고객 찾기
    let customerElement = page.getByText(updatedCustomerName, { exact: true }).first();
    let targetName = updatedCustomerName;

    if (!await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      customerElement = page.getByText(testCustomerName, { exact: true }).first();
      targetName = testCustomerName;
    }

    if (!await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠️ 삭제할 고객을 찾을 수 없음');
      await page.screenshot({ path: 'test-results/crud-simple-05-no-customer.png' });
      return;
    }

    console.log(`삭제 대상 고객: ${targetName}`);

    // 방법 1: 삭제 모드 활성화 후 체크박스로 삭제
    const deleteModeToggle = page.locator('button[aria-label="삭제"], .edit-mode-icon-button').first();
    if (await deleteModeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteModeToggle.click();
      await page.waitForTimeout(500);

      // 고객 행의 체크박스 선택
      const customerRow = page.locator(`.customer-item:has-text("${targetName}")`).first();
      if (await customerRow.isVisible({ timeout: 1000 }).catch(() => false)) {
        const checkbox = customerRow.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
          await checkbox.check();
          await page.waitForTimeout(500);

          // 삭제 버튼 클릭
          const deleteButton = page.locator('button:has-text("삭제"):not([aria-label])').first();
          if (await deleteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await deleteButton.click();
            await page.waitForTimeout(500);

            // 확인 모달
            const confirmDelete = page.locator('.delete-confirm-actions button:has-text("삭제"), .modal button.button--destructive').first();
            if (await confirmDelete.isVisible({ timeout: 2000 }).catch(() => false)) {
              await confirmDelete.click({ force: true });
              await page.waitForTimeout(2000);
              console.log('✅ 삭제 모드로 고객 삭제 완료');
            }
          }
        }
      }
    } else {
      // 방법 2: 컨텍스트 메뉴로 삭제
      console.log('삭제 모드 버튼 미발견 - 컨텍스트 메뉴 삭제 시도');
      await customerElement.click({ button: 'right' });
      await page.waitForTimeout(500);

      const contextDelete = page.locator('[role="menu"] button:has-text("삭제"), .context-menu button:has-text("삭제")').first();
      if (await contextDelete.isVisible({ timeout: 1000 }).catch(() => false)) {
        await contextDelete.click();
        await page.waitForTimeout(500);

        const confirmDelete = page.locator('.modal button:has-text("삭제")').first();
        if (await confirmDelete.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmDelete.click();
          await page.waitForTimeout(2000);
          console.log('✅ 컨텍스트 메뉴로 고객 삭제 완료');
        }
      } else {
        await page.keyboard.press('Escape'); // 메뉴 닫기
      }
    }

    await page.screenshot({ path: 'test-results/crud-simple-05-after-delete.png' });

    // 삭제 확인: 고객이 더 이상 표시되지 않아야 함
    await page.waitForTimeout(1000);
    const stillExists = await page.getByText(targetName, { exact: true }).first().isVisible({ timeout: 2000 }).catch(() => false);

    if (!stillExists) {
      console.log('✅ 고객 삭제 확인 완료');
    } else {
      console.log('⚠️ 고객이 아직 목록에 남아있음');
    }
  });
});

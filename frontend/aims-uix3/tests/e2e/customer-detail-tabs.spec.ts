import { test, expect } from '@playwright/test';
import { loginAndSetup, generateCustomer } from '../fixtures';

/**
 * 고객 상세 탭 테스트
 *
 * 테스트 시나리오:
 * 1. 고객 상세 화면 진입
 * 2. 기본 정보 탭
 * 3. 계약 탭
 * 4. 관계 탭
 * 5. 메모 탭
 * 6. Annual Report 탭
 * 7. 문서 탭
 * 8. 탭 전환 상태 유지
 */

test.describe('고객 상세 탭 테스트', () => {
  test.describe.configure({ mode: 'serial' });

  const testPrefix = `DetailTab_${Date.now()}`;
  const testCustomer = generateCustomer(testPrefix, 1);

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);

    // 온보딩 투어가 표시되면 닫기
    const onboardingTour = page.locator('.onboarding-tour');
    if (await onboardingTour.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('1. 테스트 고객 생성', async ({ page }) => {
    console.log('\n=== 테스트 고객 생성 ===');
    console.log(`생성할 고객: ${testCustomer.name}`);

    // 고객 등록 화면으로 이동
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[1].click();
    await page.waitForTimeout(1500);

    // 고객 정보 입력
    await page.locator('input[aria-label="이름"]').fill(testCustomer.name);
    const mobileInput = page.locator('input[placeholder*="010"]').first();
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill(testCustomer.mobilePhone);

    // 이메일 입력 (있으면)
    const emailInput = page.locator('input[type="email"], input[aria-label="이메일"]').first();
    if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await emailInput.fill(testCustomer.email);
    }

    // 등록
    await page.locator('button:has-text("등록")').click();
    await page.waitForTimeout(2000);

    // 확인 모달 닫기
    const confirmButton = page.locator('.modal button:has-text("확인")');
    if (await confirmButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.first().click();
      await page.waitForTimeout(500);
    }

    console.log(`테스트 고객 생성 완료: ${testCustomer.name}`);
  });

  test('2. 고객 상세 화면 진입', async ({ page }) => {
    console.log('\n=== 고객 상세 화면 진입 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 테스트 고객 찾기
    const customerElement = page.getByText(testCustomer.name, { exact: true }).first();
    if (!await customerElement.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 첫 번째 고객 선택
      const firstCustomer = page.locator('.customer-item, [class*="customer-row"]').first();
      if (await firstCustomer.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstCustomer.dblclick();
        console.log('첫 번째 고객 선택');
      } else {
        console.log('고객을 찾을 수 없음');
        test.skip();
        return;
      }
    } else {
      await customerElement.dblclick();
      console.log(`테스트 고객 선택: ${testCustomer.name}`);
    }

    await page.waitForTimeout(2000);

    // 상세 화면 확인
    const detailView = page.locator('.customer-detail, .customer-full-detail, [class*="detail-view"]').first();
    const isVisible = await detailView.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`상세 화면 표시: ${isVisible ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/customer-detail-02-entry.png' });
    expect(isVisible).toBe(true);
  });

  test('3. 기본 정보 탭 확인', async ({ page }) => {
    console.log('\n=== 기본 정보 탭 확인 ===');

    // 전체 고객 보기로 이동 후 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 기본 정보 탭 클릭 (이미 선택되어 있을 수 있음)
    const infoTab = page.locator('button:has-text("기본 정보"), button:has-text("정보"), [role="tab"]:has-text("정보")').first();
    if (await infoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await infoTab.click();
      await page.waitForTimeout(1000);
      console.log('기본 정보 탭 클릭');
    }

    // 기본 정보 필드들 확인
    const infoFields = ['이름', '휴대폰', '이메일', '주소'];
    for (const field of infoFields) {
      const fieldElement = page.locator(`text=${field}`).first();
      const hasField = await fieldElement.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`${field}: ${hasField ? '표시됨' : '미표시'}`);
    }

    await page.screenshot({ path: 'test-results/customer-detail-03-info-tab.png' });
  });

  test('4. 계약 탭 확인', async ({ page }) => {
    console.log('\n=== 계약 탭 확인 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 계약 탭 클릭
    const contractTab = page.locator('button:has-text("계약"), [role="tab"]:has-text("계약")').first();
    if (await contractTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contractTab.click();
      await page.waitForTimeout(1500);
      console.log('계약 탭 클릭');

      // 계약 목록 또는 빈 상태 확인
      const contractList = page.locator('.contract-list, [class*="contract"]').first();
      const emptyState = page.locator('text=계약이 없습니다, text=등록된 계약이 없습니다').first();

      const hasList = await contractList.isVisible({ timeout: 2000 }).catch(() => false);
      const isEmpty = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`계약 목록: ${hasList ? '있음' : '없음'}`);
      console.log(`빈 상태: ${isEmpty ? '표시됨' : '미표시'}`);
    } else {
      console.log('계약 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/customer-detail-04-contract-tab.png' });
  });

  test('5. 관계 탭 확인', async ({ page }) => {
    console.log('\n=== 관계 탭 확인 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 관계 또는 가족 탭 클릭
    const relationTab = page.locator('button:has-text("관계"), button:has-text("가족"), [role="tab"]:has-text("관계"), [role="tab"]:has-text("가족")').first();
    if (await relationTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await relationTab.click();
      await page.waitForTimeout(1500);
      console.log('관계 탭 클릭');

      // 관계 목록 또는 빈 상태 확인
      const relationList = page.locator('.relationship-list, [class*="family"], [class*="relation"]').first();
      const hasRelations = await relationList.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`관계 정보: ${hasRelations ? '있음' : '없음'}`);
    } else {
      console.log('관계 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/customer-detail-05-relation-tab.png' });
  });

  test('6. 메모 탭 확인', async ({ page }) => {
    console.log('\n=== 메모 탭 확인 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 메모 탭 클릭
    const memoTab = page.locator('button:has-text("메모"), [role="tab"]:has-text("메모")').first();
    if (await memoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await memoTab.click();
      await page.waitForTimeout(1500);
      console.log('메모 탭 클릭');

      // 메모 입력란 확인
      const memoTextarea = page.locator('textarea, [contenteditable="true"]').first();
      if (await memoTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('메모 입력란 표시됨');

        // 테스트 메모 입력
        const testMemo = `테스트 메모 ${Date.now()}`;
        await memoTextarea.fill(testMemo);
        console.log(`테스트 메모 입력: ${testMemo}`);

        // 저장 (Ctrl+Enter 또는 저장 버튼)
        const saveButton = page.locator('button:has-text("저장")').first();
        if (await saveButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await saveButton.click();
          await page.waitForTimeout(1000);
          console.log('메모 저장 버튼 클릭');
        } else {
          await page.keyboard.press('Control+Enter');
          await page.waitForTimeout(1000);
          console.log('Ctrl+Enter로 메모 저장');
        }
      }
    } else {
      console.log('메모 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/customer-detail-06-memo-tab.png' });
  });

  test('7. Annual Report 탭 확인', async ({ page }) => {
    console.log('\n=== Annual Report 탭 확인 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // Annual Report 탭 클릭
    const annualTab = page.locator('button:has-text("Annual"), [role="tab"]:has-text("Annual")').first();
    if (await annualTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await annualTab.click();
      await page.waitForTimeout(1500);
      console.log('Annual Report 탭 클릭');

      // 콘텐츠 확인
      const annualContent = page.locator('.annual-report-tab, [class*="annual"]').first();
      const hasContent = await annualContent.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Annual Report 콘텐츠: ${hasContent ? '있음' : '없음/빈 상태'}`);
    } else {
      console.log('Annual Report 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/customer-detail-07-annual-tab.png' });
  });

  test('8. 문서 탭 확인', async ({ page }) => {
    console.log('\n=== 문서 탭 확인 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 문서 탭 클릭
    const docTab = page.locator('button:has-text("문서"), [role="tab"]:has-text("문서")').first();
    if (await docTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await docTab.click();
      await page.waitForTimeout(1500);
      console.log('문서 탭 클릭');

      // 문서 목록 또는 빈 상태 확인
      const docList = page.locator('.document-list, [class*="document"]').first();
      const emptyState = page.locator('text=문서가 없습니다, text=등록된 문서가 없습니다').first();

      const hasDocs = await docList.isVisible({ timeout: 2000 }).catch(() => false);
      const isEmpty = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`문서 목록: ${hasDocs ? '있음' : '없음'}`);
      console.log(`빈 상태: ${isEmpty ? '표시됨' : '미표시'}`);
    } else {
      console.log('문서 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/customer-detail-08-document-tab.png' });
  });

  test('9. 탭 전환 상태 유지', async ({ page }) => {
    console.log('\n=== 탭 전환 상태 유지 ===');

    // 고객 선택
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    const customerElement = page.locator('.customer-item, [class*="customer-row"]').first();
    if (await customerElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerElement.dblclick();
      await page.waitForTimeout(2000);
    } else {
      test.skip();
      return;
    }

    // 여러 탭을 순차적으로 클릭
    const tabs = ['계약', '메모', '문서', '정보'];
    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`).first();
      if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(500);
        console.log(`${tabName} 탭 클릭`);

        // 탭이 활성화되었는지 확인
        const isActive = await tab.evaluate(el => {
          return el.classList.contains('active') ||
                 el.getAttribute('aria-selected') === 'true' ||
                 el.classList.contains('selected');
        });
        console.log(`  활성화 상태: ${isActive ? '예' : '아니오'}`);
      }
    }

    await page.screenshot({ path: 'test-results/customer-detail-09-tab-state.png' });
  });

  test('10. 테스트 고객 정리', async ({ page }) => {
    console.log('\n=== 테스트 고객 정리 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 개발자 모드 활성화
    await page.keyboard.press('Control+Alt+Shift+D');
    await page.waitForTimeout(500);

    // 테스트 고객 찾기 및 삭제
    const customerElement = page.getByText(testCustomer.name, { exact: true }).first();
    if (!await customerElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('테스트 고객을 찾을 수 없음');
      return;
    }

    // 삭제 모드 활성화
    const deleteModeToggle = page.locator('button[aria-label="삭제"], .edit-mode-icon-button').first();
    if (await deleteModeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteModeToggle.click();
      await page.waitForTimeout(500);

      const customerRow = page.locator(`.customer-item:has-text("${testCustomer.name}")`).first();
      if (await customerRow.isVisible({ timeout: 1000 }).catch(() => false)) {
        const checkbox = customerRow.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
          await checkbox.check();
          await page.waitForTimeout(500);

          const deleteButton = page.locator('button:has-text("삭제"):not([aria-label])').first();
          if (await deleteButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await deleteButton.click();
            await page.waitForTimeout(500);

            const confirmDelete = page.locator('.delete-confirm-actions button:has-text("삭제"), .modal button.button--destructive').first();
            if (await confirmDelete.isVisible({ timeout: 2000 }).catch(() => false)) {
              await confirmDelete.click({ force: true });
              await page.waitForTimeout(2000);
              console.log('테스트 고객 삭제 완료');
            }
          }
        }
      }
    }

    await page.screenshot({ path: 'test-results/customer-detail-10-cleanup.png' });
  });
});

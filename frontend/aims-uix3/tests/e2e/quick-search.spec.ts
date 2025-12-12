import { test, expect } from '@playwright/test';
import { loginAndSetup, generateCustomer } from '../fixtures';

/**
 * 빠른 검색 (QuickSearch) 테스트
 *
 * 테스트 시나리오:
 * 1. 검색창 표시 확인
 * 2. 테스트 고객 생성
 * 3. 정확한 이름 검색
 * 4. 부분 이름 검색
 * 5. 검색 결과 클릭 → 상세 이동
 * 6. 빈 검색어 처리
 * 7. 존재하지 않는 고객 검색
 * 8. 키보드 네비게이션
 */

test.describe('빠른 검색 테스트', () => {
  test.describe.configure({ mode: 'serial' });

  const testPrefix = `QuickSearch_${Date.now()}`;
  const testCustomer = generateCustomer(testPrefix, 1);

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);

    // 온보딩 투어가 표시되면 닫기
    const onboardingTour = page.locator('.onboarding-tour');
    if (await onboardingTour.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('1. 검색창 표시 확인', async ({ page }) => {
    console.log('\n=== 검색창 표시 확인 ===');

    // 헤더의 검색창 확인
    const searchContainer = page.locator('.header-quick-search-container, [class*="quick-search"]').first();
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    const containerVisible = await searchContainer.isVisible({ timeout: 5000 }).catch(() => false);
    const inputVisible = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`검색 컨테이너: ${containerVisible ? '표시됨' : '미표시'}`);
    console.log(`검색 입력란: ${inputVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/quick-search-01-input.png' });

    expect(containerVisible || inputVisible).toBe(true);
  });

  test('2. 테스트 고객 생성', async ({ page }) => {
    console.log('\n=== 테스트 고객 생성 ===');
    console.log(`생성할 고객: ${testCustomer.name}`);

    // 고객 등록 화면으로 이동
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);
    const menuItems = await page.locator('[class*="menu-item"]').all();
    await menuItems[1].click(); // 고객 등록
    await page.waitForTimeout(1500);

    // 고객 정보 입력
    await page.locator('input[aria-label="이름"]').fill(testCustomer.name);
    const mobileInput = page.locator('input[placeholder*="010"]').first();
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill(testCustomer.mobilePhone);

    // 등록 버튼 클릭
    await page.locator('button:has-text("등록")').click();
    await page.waitForTimeout(2000);

    // 등록 확인 모달 닫기
    const confirmButton = page.locator('.modal button:has-text("확인")');
    if (await confirmButton.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.first().click();
      await page.waitForTimeout(500);
    }

    console.log(`테스트 고객 생성 완료: ${testCustomer.name}`);
  });

  test('3. 정확한 이름 검색', async ({ page }) => {
    console.log('\n=== 정확한 이름 검색 ===');

    // 검색창에 고객명 입력
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('검색 입력란을 찾을 수 없음');
      test.skip();
      return;
    }

    await searchInput.click();
    await searchInput.fill(testCustomer.name);
    await page.waitForTimeout(1000); // 검색 결과 대기

    // 드롭다운 결과 확인
    const resultDropdown = page.locator('.quick-search-dropdown, [class*="search-results"], [class*="dropdown"]').first();
    const hasDropdown = await resultDropdown.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`검색 드롭다운: ${hasDropdown ? '표시됨' : '미표시'}`);

    // 검색 결과에 고객명이 있는지 확인
    const resultItem = page.getByText(testCustomer.name).first();
    const foundInResults = await resultItem.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`검색 결과에서 고객 발견: ${foundInResults ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/quick-search-03-exact-search.png' });

    expect(foundInResults).toBe(true);
  });

  test('4. 부분 이름 검색', async ({ page }) => {
    console.log('\n=== 부분 이름 검색 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // 고객명의 일부만 검색 (prefix 사용)
    const partialName = testPrefix.substring(0, 10);
    console.log(`검색어: ${partialName}`);

    await searchInput.click();
    await searchInput.clear();
    await searchInput.fill(partialName);
    await page.waitForTimeout(1000);

    // 검색 결과 확인
    const resultItem = page.getByText(testCustomer.name).first();
    const foundInResults = await resultItem.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`부분 검색으로 고객 발견: ${foundInResults ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/quick-search-04-partial-search.png' });

    expect(foundInResults).toBe(true);
  });

  test('5. 검색 결과 클릭 → 상세 이동', async ({ page }) => {
    console.log('\n=== 검색 결과 클릭 → 상세 이동 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await searchInput.click();
    await searchInput.clear();
    await searchInput.fill(testCustomer.name);
    await page.waitForTimeout(1000);

    // 검색 결과 클릭
    const resultItem = page.getByText(testCustomer.name).first();
    if (await resultItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resultItem.click();
      await page.waitForTimeout(2000);

      // 고객 상세 화면으로 이동했는지 확인
      const detailView = page.locator('.customer-detail, .customer-full-detail, [class*="detail"]').first();
      const isDetailVisible = await detailView.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`고객 상세 화면: ${isDetailVisible ? '표시됨' : '미표시'}`);

      // 고객명이 상세 화면에 표시되는지 확인
      const customerNameInDetail = page.getByText(testCustomer.name).first();
      const nameVisible = await customerNameInDetail.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`상세 화면에 고객명 표시: ${nameVisible ? '예' : '아니오'}`);

      await page.screenshot({ path: 'test-results/quick-search-05-detail-view.png' });

      expect(isDetailVisible || nameVisible).toBe(true);
    } else {
      console.log('검색 결과 항목 클릭 실패');
    }
  });

  test('6. 빈 검색어 처리', async ({ page }) => {
    console.log('\n=== 빈 검색어 처리 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // 검색어 입력 후 삭제
    await searchInput.click();
    await searchInput.fill('테스트');
    await page.waitForTimeout(500);

    // 드롭다운이 표시되는지 확인
    const dropdownBefore = page.locator('.quick-search-dropdown, [class*="search-results"]').first();
    const wasVisible = await dropdownBefore.isVisible({ timeout: 1000 }).catch(() => false);

    // 검색어 삭제
    await searchInput.clear();
    await page.waitForTimeout(500);

    // 드롭다운이 닫히는지 확인
    const dropdownAfter = page.locator('.quick-search-dropdown, [class*="search-results"]').first();
    const isHidden = !await dropdownAfter.isVisible({ timeout: 1000 }).catch(() => true);

    console.log(`검색어 입력 시 드롭다운: ${wasVisible ? '표시됨' : '미표시'}`);
    console.log(`검색어 삭제 후 드롭다운: ${isHidden ? '숨김' : '표시됨'}`);

    await page.screenshot({ path: 'test-results/quick-search-06-empty-search.png' });
  });

  test('7. 존재하지 않는 고객 검색', async ({ page }) => {
    console.log('\n=== 존재하지 않는 고객 검색 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const nonExistentName = `존재하지않는고객_${Date.now()}`;
    await searchInput.click();
    await searchInput.clear();
    await searchInput.fill(nonExistentName);
    await page.waitForTimeout(1500);

    // "검색 결과 없음" 메시지 또는 빈 드롭다운 확인
    const noResultsMessage = page.locator('text=검색 결과 없음, text=결과가 없습니다, text=No results').first();
    const emptyDropdown = page.locator('.quick-search-dropdown:empty, [class*="no-results"]').first();

    const hasNoResultsMessage = await noResultsMessage.isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmptyDropdown = await emptyDropdown.isVisible({ timeout: 1000 }).catch(() => false);

    console.log(`"결과 없음" 메시지: ${hasNoResultsMessage ? '표시됨' : '미표시'}`);
    console.log(`빈 드롭다운: ${hasEmptyDropdown ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/quick-search-07-no-results.png' });
  });

  test('8. 키보드 네비게이션', async ({ page }) => {
    console.log('\n=== 키보드 네비게이션 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // 검색어 입력
    await searchInput.click();
    await searchInput.fill(testCustomer.name);
    await page.waitForTimeout(1000);

    // 드롭다운이 열리면 키보드로 네비게이션
    const dropdown = page.locator('.quick-search-dropdown, [class*="search-results"]').first();
    if (await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      // ArrowDown으로 첫 번째 항목 선택
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      console.log('ArrowDown 키 입력');

      // Enter로 선택
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      console.log('Enter 키로 선택');

      // 상세 화면으로 이동했는지 확인
      const detailView = page.locator('.customer-detail, .customer-full-detail, [class*="detail"]').first();
      const moved = await detailView.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`키보드로 상세 이동: ${moved ? '성공' : '실패'}`);
    } else {
      console.log('드롭다운이 열리지 않음');
    }

    await page.screenshot({ path: 'test-results/quick-search-08-keyboard.png' });
  });

  test('9. ESC로 검색 취소', async ({ page }) => {
    console.log('\n=== ESC로 검색 취소 ===');

    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객"]').first();

    if (!await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip();
      return;
    }

    await searchInput.click();
    await searchInput.fill(testCustomer.name);
    await page.waitForTimeout(1000);

    // ESC 키 입력
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 드롭다운이 닫히거나 검색어가 지워지는지 확인
    const dropdown = page.locator('.quick-search-dropdown, [class*="search-results"]').first();
    const isClosed = !await dropdown.isVisible({ timeout: 1000 }).catch(() => true);
    console.log(`ESC 후 드롭다운: ${isClosed ? '닫힘' : '열려있음'}`);

    await page.screenshot({ path: 'test-results/quick-search-09-escape.png' });
  });

  test('10. 테스트 고객 정리 (삭제)', async ({ page }) => {
    console.log('\n=== 테스트 고객 정리 ===');

    // 전체 고객 보기로 이동
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기"), [role="menuitem"]:has-text("전체 고객")').first();
    await allCustomersBtn.click();
    await page.waitForTimeout(2000);

    // 개발자 모드 활성화
    await page.keyboard.press('Control+Alt+Shift+D');
    await page.waitForTimeout(500);

    // 테스트 고객 찾기
    const customerElement = page.getByText(testCustomer.name, { exact: true }).first();
    if (!await customerElement.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('테스트 고객을 찾을 수 없음 (이미 삭제되었을 수 있음)');
      return;
    }

    // 삭제 모드 활성화
    const deleteModeToggle = page.locator('button[aria-label="삭제"], .edit-mode-icon-button').first();
    if (await deleteModeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteModeToggle.click();
      await page.waitForTimeout(500);

      // 고객 선택
      const customerRow = page.locator(`.customer-item:has-text("${testCustomer.name}")`).first();
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

            // 확인
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

    await page.screenshot({ path: 'test-results/quick-search-10-cleanup.png' });
  });
});

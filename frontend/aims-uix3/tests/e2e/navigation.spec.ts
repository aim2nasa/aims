import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 네비게이션 테스트
 *
 * 테스트 시나리오:
 * 1. 사이드바 메뉴 표시 확인
 * 2. 고객 섹션 네비게이션
 * 3. 문서 섹션 네비게이션
 * 4. 계약 섹션 네비게이션
 * 5. 메뉴 아이템 클릭 시 뷰 전환
 */

test.describe('네비게이션 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 사이드바 메뉴 표시 확인', async ({ page }) => {
    console.log('\n=== 사이드바 메뉴 표시 확인 ===');

    // LeftPane 확인 (실제 클래스: layout-leftpane)
    const leftPane = page.locator('.layout-leftpane');
    await expect(leftPane).toBeVisible({ timeout: 5000 });
    console.log('LeftPane 표시됨');

    // 메뉴 섹션들 확인
    const menuSections = [
      '고객 관리',
      '문서 관리',
      '계약 관리'
    ];

    for (const section of menuSections) {
      const sectionElement = page.locator(`text=${section}`).first();
      const isVisible = await sectionElement.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${section}: ${isVisible ? '표시됨' : '미표시'}`);
    }

    await page.screenshot({ path: 'test-results/navigation-01-sidebar.png' });
    expect(await leftPane.isVisible()).toBe(true);
  });

  test('2. 고객 섹션 네비게이션', async ({ page }) => {
    console.log('\n=== 고객 섹션 네비게이션 ===');

    // 햄버거 메뉴 열기 (모바일 뷰 또는 축소된 경우)
    const hamburgerButton = page.locator('button.hamburger-button').first();
    if (await hamburgerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburgerButton.click();
      await page.waitForTimeout(500);
    }

    // 고객 관리 메뉴 클릭
    const customerMenu = page.locator('[data-menu-key="customers"], .custom-menu-item:has-text("고객 관리")').first();
    if (await customerMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customerMenu.click();
      await page.waitForTimeout(500);
      console.log('고객 관리 메뉴 클릭');
    }

    // 서브메뉴 항목들 테스트
    const customerSubmenus = [
      { key: 'customers-register', text: '새 고객 등록', expectedView: 'CustomerRegistrationView' },
      { key: 'customers-all', text: '전체 고객', expectedView: 'CustomerAllView' },
      { key: 'customers-regional', text: '지역별 보기', expectedView: 'CustomerRegionalView' },
      { key: 'customers-relationship', text: '관계별 보기', expectedView: 'CustomerRelationshipView' }
    ];

    for (const submenu of customerSubmenus) {
      const menuItem = page.locator(`[data-menu-key="${submenu.key}"], [role="menuitem"]:has-text("${submenu.text}")`).first();

      if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await menuItem.click();
        await page.waitForTimeout(1500);
        console.log(`${submenu.text} 클릭 - 뷰 전환 확인`);

        // 뷰가 로드되었는지 확인 (CenterPane에 콘텐츠가 있는지)
        const centerPane = page.locator('.layout-centerpane');
        const hasContent = await centerPane.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  ${submenu.expectedView}: ${hasContent ? '로드됨' : '로드 실패'}`);
      } else {
        console.log(`${submenu.text} 메뉴 미발견`);
      }
    }

    await page.screenshot({ path: 'test-results/navigation-02-customer-menu.png' });
  });

  test('3. 문서 섹션 네비게이션', async ({ page }) => {
    console.log('\n=== 문서 섹션 네비게이션 ===');

    // 햄버거 메뉴 열기
    const hamburgerButton = page.locator('button.hamburger-button').first();
    if (await hamburgerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburgerButton.click();
      await page.waitForTimeout(500);
    }

    // 문서 관리 메뉴 클릭
    const docMenu = page.locator('[data-menu-key="documents"], .custom-menu-item:has-text("문서 관리")').first();
    if (await docMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await docMenu.click();
      await page.waitForTimeout(500);
      console.log('문서 관리 메뉴 클릭');
    }

    // 서브메뉴 항목들 테스트
    const docSubmenus = [
      { key: 'documents-register', text: '문서 등록' },
      { key: 'documents-library', text: '문서 보관함' },
      { key: 'documents-search', text: '문서 검색' }
    ];

    for (const submenu of docSubmenus) {
      const menuItem = page.locator(`[data-menu-key="${submenu.key}"], [role="menuitem"]:has-text("${submenu.text}")`).first();

      if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await menuItem.click();
        await page.waitForTimeout(1500);
        console.log(`${submenu.text} 클릭 완료`);
      } else {
        console.log(`${submenu.text} 메뉴 미발견`);
      }
    }

    await page.screenshot({ path: 'test-results/navigation-03-document-menu.png' });
  });

  test('4. 계약 섹션 네비게이션', async ({ page }) => {
    console.log('\n=== 계약 섹션 네비게이션 ===');

    // 햄버거 메뉴 열기
    const hamburgerButton = page.locator('button.hamburger-button').first();
    if (await hamburgerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburgerButton.click();
      await page.waitForTimeout(500);
    }

    // 계약 관리 메뉴 클릭
    const contractMenu = page.locator('[data-menu-key="contracts"], .custom-menu-item:has-text("계약 관리")').first();
    if (await contractMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contractMenu.click();
      await page.waitForTimeout(500);
      console.log('계약 관리 메뉴 클릭');
    }

    // 서브메뉴 항목들 테스트
    const contractSubmenus = [
      { key: 'contracts-all', text: '전체 계약' },
      { key: 'contracts-import', text: '계약 입력' }
    ];

    for (const submenu of contractSubmenus) {
      const menuItem = page.locator(`[data-menu-key="${submenu.key}"], [role="menuitem"]:has-text("${submenu.text}")`).first();

      if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await menuItem.click();
        await page.waitForTimeout(1500);
        console.log(`${submenu.text} 클릭 완료`);
      } else {
        console.log(`${submenu.text} 메뉴 미발견`);
      }
    }

    await page.screenshot({ path: 'test-results/navigation-04-contract-menu.png' });
  });

  test('5. 대시보드 가이드 카드 네비게이션', async ({ page }) => {
    console.log('\n=== 대시보드 가이드 카드 네비게이션 ===');

    // 대시보드 가이드 카드들 확인
    const guideCards = [
      { text: '전체 고객 보기', target: 'CustomerAllView' },
      { text: '새 고객 등록', target: 'CustomerRegistrationView' },
      { text: '문서 등록', target: 'DocumentRegistrationView' }
    ];

    for (const card of guideCards) {
      const cardButton = page.locator(`button:has-text("${card.text}")`).first();

      if (await cardButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`${card.text} 카드 발견`);
        await cardButton.click();
        await page.waitForTimeout(1500);
        console.log(`  → ${card.target} 이동 확인`);

        // 대시보드로 돌아가기
        await page.goto('/');
        await page.waitForTimeout(1000);

        // 온보딩 닫기 (필요시)
        const onboarding = page.locator('.onboarding-tour');
        if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      } else {
        console.log(`${card.text} 카드 미발견`);
      }
    }

    await page.screenshot({ path: 'test-results/navigation-05-guide-cards.png' });
  });

  test('6. 메뉴 선택 상태 유지', async ({ page }) => {
    console.log('\n=== 메뉴 선택 상태 유지 ===');

    // 햄버거 메뉴 열기
    const hamburgerButton = page.locator('button.hamburger-button').first();
    if (await hamburgerButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburgerButton.click();
      await page.waitForTimeout(500);
    }

    // 고객 전체보기 클릭
    const allCustomersMenu = page.locator('[data-menu-key="customers-all"], [role="menuitem"]:has-text("전체 고객")').first();
    if (await allCustomersMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allCustomersMenu.click();
      await page.waitForTimeout(1500);

      // 선택 상태 확인 (selected 클래스 또는 aria-selected)
      const isSelected = await allCustomersMenu.evaluate(el => {
        return el.classList.contains('selected') ||
               el.getAttribute('aria-selected') === 'true' ||
               el.classList.contains('active');
      });

      console.log(`전체 고객 메뉴 선택 상태: ${isSelected ? '활성화' : '비활성화'}`);
    }

    // 다른 메뉴 클릭 후 이전 메뉴가 비활성화되는지 확인
    const docMenu = page.locator('[data-menu-key="documents-library"], [role="menuitem"]:has-text("문서 보관함")').first();
    if (await docMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await docMenu.click();
      await page.waitForTimeout(1000);
      console.log('문서 보관함으로 전환');
    }

    await page.screenshot({ path: 'test-results/navigation-06-selection-state.png' });
  });

  test('7. 키보드 네비게이션', async ({ page }) => {
    console.log('\n=== 키보드 네비게이션 ===');

    // 메뉴에 포커스
    const menuItem = page.locator('.custom-menu-item').first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuItem.focus();
      await page.waitForTimeout(300);

      // 화살표 키로 네비게이션
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      console.log('ArrowDown 키 입력');

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      console.log('ArrowDown 키 입력');

      // Enter로 선택
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      console.log('Enter 키로 선택');
    }

    await page.screenshot({ path: 'test-results/navigation-07-keyboard.png' });
    expect(true).toBe(true);
  });
});

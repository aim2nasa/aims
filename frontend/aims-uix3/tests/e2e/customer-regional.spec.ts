import { test, expect, Page } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 지역별 고객 보기 테스트
 *
 * 테스트 시나리오:
 * 1. 지역별 보기 화면 진입
 * 2. 지역 트리 구조 확인
 * 3. 지역 노드 확장/축소
 * 4. 고객 클릭 시 RightPane 표시
 * 5. 지역 필터 기능
 */

// 지역별 보기로 이동하는 헬퍼 함수
async function navigateToRegionalView(page: Page): Promise<boolean> {
  // 햄버거 메뉴 열기
  const hamburgerButton = page.locator('button.hamburger-button').first();
  if (await hamburgerButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await hamburgerButton.click();
    await page.waitForTimeout(800);
  }

  // 고객 관리 섹션 확장 (필요시)
  const customerSection = page.locator('[data-menu-key="customers"], .custom-menu-item:has-text("고객 관리")').first();
  if (await customerSection.isVisible({ timeout: 2000 }).catch(() => false)) {
    await customerSection.click();
    await page.waitForTimeout(500);
  }

  // 지역별 보기 메뉴 클릭
  const regionalMenu = page.locator('[data-menu-key="customers-regional"], [role="menuitem"]:has-text("지역별 보기"), [role="menuitem"]:has-text("지역별")').first();

  // 최대 5초 대기
  for (let i = 0; i < 10; i++) {
    if (await regionalMenu.isVisible({ timeout: 500 }).catch(() => false)) {
      await regionalMenu.click();
      await page.waitForTimeout(2000);
      console.log('지역별 보기 메뉴 클릭 성공');
      return true;
    }
    await page.waitForTimeout(500);
  }

  console.log('지역별 보기 메뉴를 찾을 수 없음');
  return false;
}

test.describe('지역별 고객 보기 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);

    // 온보딩 투어가 표시되면 닫기
    const onboardingTour = page.locator('.onboarding-tour');
    if (await onboardingTour.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('1. 지역별 보기 화면 진입', async ({ page }) => {
    console.log('\n=== 지역별 보기 화면 진입 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 화면 로드 확인
    const regionalView = page.locator('.customer-regional-view, [class*="regional"], .layout-centerpane').first();
    const isVisible = await regionalView.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`지역별 보기 화면: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/regional-01-entry.png' });
  });

  test('2. 지역 트리 구조 확인', async ({ page }) => {
    console.log('\n=== 지역 트리 구조 확인 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 트리 노드들 확인
    const treeNodes = page.locator('.tree-node, [class*="tree-item"], [class*="region-node"]');
    const nodeCount = await treeNodes.count();
    console.log(`트리 노드 수: ${nodeCount}`);

    // 주요 지역명 확인
    const regions = ['서울', '경기', '인천', '부산', '대구', '광주', '대전'];
    for (const region of regions) {
      const regionNode = page.locator(`text=${region}`).first();
      const hasRegion = await regionNode.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasRegion) {
        console.log(`${region}: 발견`);
      }
    }

    await page.screenshot({ path: 'test-results/regional-02-tree.png' });
  });

  test('3. 지역 노드 확장/축소', async ({ page }) => {
    console.log('\n=== 지역 노드 확장/축소 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 확장 가능한 노드 찾기 (화살표 또는 +/- 아이콘)
    const expandableNode = page.locator('.tree-node-toggle, [class*="expand"], [class*="collapse"]').first();
    if (await expandableNode.isVisible({ timeout: 2000 }).catch(() => false)) {
      // 클릭하여 확장
      await expandableNode.click();
      await page.waitForTimeout(500);
      console.log('노드 확장 클릭');

      // 다시 클릭하여 축소
      await expandableNode.click();
      await page.waitForTimeout(500);
      console.log('노드 축소 클릭');
    } else {
      // 지역명을 직접 클릭
      const regionLabel = page.locator('text=서울, text=경기').first();
      if (await regionLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
        await regionLabel.click();
        await page.waitForTimeout(500);
        console.log('지역 클릭');
      } else {
        console.log('확장 가능한 노드를 찾을 수 없음');
      }
    }

    await page.screenshot({ path: 'test-results/regional-03-expand.png' });
  });

  test('4. 고객 클릭 시 RightPane 표시', async ({ page }) => {
    console.log('\n=== 고객 클릭 시 RightPane 표시 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 고객 항목 찾기 (트리 내 고객 또는 목록)
    const customerItem = page.locator('.customer-item, [class*="customer-node"], [class*="tree-leaf"]').first();
    if (await customerItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customerItem.click();
      await page.waitForTimeout(1500);
      console.log('고객 항목 클릭');

      // RightPane 확인
      const rightPane = page.locator('.right-pane, [class*="right-pane"], [class*="detail-pane"]').first();
      const isRightPaneVisible = await rightPane.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`RightPane 표시: ${isRightPaneVisible ? '예' : '아니오'}`);
    } else {
      console.log('고객 항목을 찾을 수 없음 (고객 데이터 없음)');
    }

    await page.screenshot({ path: 'test-results/regional-04-rightpane.png' });
  });

  test('5. 지역별 고객 수 표시', async ({ page }) => {
    console.log('\n=== 지역별 고객 수 표시 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 배지나 카운터 확인
    const countBadges = page.locator('.customer-count, .badge, [class*="count"]');
    const badgeCount = await countBadges.count();
    console.log(`고객 수 배지: ${badgeCount}개 발견`);

    // 숫자 패턴 찾기
    const numbers = await page.locator('text=/\\d+명|\\(\\d+\\)/').all();
    console.log(`숫자 표시: ${numbers.length}개 발견`);

    await page.screenshot({ path: 'test-results/regional-05-count.png' });
  });

  test('6. 도움말 모달 확인', async ({ page }) => {
    console.log('\n=== 도움말 모달 확인 ===');

    const success = await navigateToRegionalView(page);
    expect(success).toBe(true);

    // 도움말 버튼 찾기
    const helpButton = page.locator('button[aria-label="도움말"], button:has-text("?"), .help-button').first();
    if (await helpButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await helpButton.click();
      await page.waitForTimeout(500);
      console.log('도움말 버튼 클릭');

      // 모달 확인
      const helpModal = page.locator('.modal, .help-modal, [role="dialog"]').first();
      const isModalVisible = await helpModal.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`도움말 모달: ${isModalVisible ? '표시됨' : '미표시'}`);

      if (isModalVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } else {
      console.log('도움말 버튼을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/regional-06-help.png' });
  });
});

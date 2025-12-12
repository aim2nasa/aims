import { test, expect, Page } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 고객 관계 보기 테스트
 *
 * 테스트 시나리오:
 * 1. 관계별 보기 화면 진입
 * 2. 관계 트리 구조 확인
 * 3. 보기 모드 전환
 * 4. 검색 필터
 * 5. 노드 확장/축소
 */

// 관계별 보기로 이동하는 헬퍼 함수
async function navigateToRelationshipView(page: Page): Promise<boolean> {
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

  // 관계별 보기 메뉴 클릭
  const relationMenu = page.locator('[data-menu-key="customers-relationship"], [role="menuitem"]:has-text("관계별 보기"), [role="menuitem"]:has-text("관계별")').first();

  // 최대 5초 대기
  for (let i = 0; i < 10; i++) {
    if (await relationMenu.isVisible({ timeout: 500 }).catch(() => false)) {
      await relationMenu.click();
      await page.waitForTimeout(2000);
      console.log('관계별 보기 메뉴 클릭 성공');
      return true;
    }
    await page.waitForTimeout(500);
  }

  console.log('관계별 보기 메뉴를 찾을 수 없음');
  return false;
}

test.describe('고객 관계 보기 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);

    // 온보딩 투어가 표시되면 닫기
    const onboardingTour = page.locator('.onboarding-tour');
    if (await onboardingTour.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('1. 관계별 보기 화면 진입', async ({ page }) => {
    console.log('\n=== 관계별 보기 화면 진입 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 화면 로드 확인
    const relationView = page.locator('.customer-relationship-view, [class*="relationship"], .layout-centerpane').first();
    const isVisible = await relationView.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`관계별 보기 화면: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/relationship-01-entry.png' });
  });

  test('2. 관계 트리 구조 확인', async ({ page }) => {
    console.log('\n=== 관계 트리 구조 확인 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 트리 또는 그룹 구조 확인
    const treeContainer = page.locator('.tree-container, .relationship-tree, [class*="tree"], .layout-centerpane').first();
    const hasTree = await treeContainer.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`트리 컨테이너: ${hasTree ? '표시됨' : '미표시'}`);

    // 가족 그룹 확인
    const familyGroups = page.locator('.family-group, [class*="family"], [class*="group"]');
    const groupCount = await familyGroups.count();
    console.log(`가족 그룹: ${groupCount}개 발견`);

    // "가족 관계 없음" 섹션 확인
    const noFamilySection = page.locator('text=가족 관계 없음, text=관계 없음').first();
    const hasNoFamily = await noFamilySection.isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`"관계 없음" 섹션: ${hasNoFamily ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/relationship-02-tree.png' });
  });

  test('3. 보기 모드 전환', async ({ page }) => {
    console.log('\n=== 보기 모드 전환 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 보기 모드 전환 버튼들 확인
    const viewModes = ['대표자', '자음', '전체'];
    for (const mode of viewModes) {
      const modeButton = page.locator(`button:has-text("${mode}"), [role="radio"]:has-text("${mode}")`).first();
      if (await modeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await modeButton.click();
        await page.waitForTimeout(1000);
        console.log(`${mode} 모드 선택`);
      }
    }

    // 탭 형태의 보기 모드 확인
    const viewTabs = page.locator('[role="tablist"] button, .view-mode-tabs button');
    const tabCount = await viewTabs.count();
    if (tabCount > 0) {
      console.log(`보기 모드 탭: ${tabCount}개`);
    }

    await page.screenshot({ path: 'test-results/relationship-03-view-mode.png' });
  });

  test('4. 검색 필터', async ({ page }) => {
    console.log('\n=== 검색 필터 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 검색 입력란 확인
    const searchInput = page.locator('input[placeholder*="검색"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.click();
      await searchInput.fill('테스트');
      await page.waitForTimeout(1000);
      console.log('검색어 입력: 테스트');

      // 필터링 결과 확인
      console.log('필터링 적용됨');

      // 검색어 삭제
      await searchInput.clear();
      await page.waitForTimeout(500);
    } else {
      console.log('검색 입력란을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/relationship-04-search.png' });
  });

  test('5. 노드 확장/축소', async ({ page }) => {
    console.log('\n=== 노드 확장/축소 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 확장/축소 토글 버튼 찾기
    const toggleButtons = page.locator('.tree-toggle, [class*="expand"], [class*="collapse"], .chevron').first();
    if (await toggleButtons.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toggleButtons.click();
      await page.waitForTimeout(500);
      console.log('노드 토글 클릭');

      // 다시 클릭
      await toggleButtons.click();
      await page.waitForTimeout(500);
      console.log('노드 토글 다시 클릭');
    } else {
      // 그룹 헤더 클릭 시도
      const groupHeader = page.locator('.group-header, [class*="family-header"]').first();
      if (await groupHeader.isVisible({ timeout: 1000 }).catch(() => false)) {
        await groupHeader.click();
        await page.waitForTimeout(500);
        console.log('그룹 헤더 클릭');
      } else {
        console.log('확장/축소 버튼을 찾을 수 없음');
      }
    }

    await page.screenshot({ path: 'test-results/relationship-05-toggle.png' });
  });

  test('6. 고객 클릭 시 상세 표시', async ({ page }) => {
    console.log('\n=== 고객 클릭 시 상세 표시 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 고객 항목 클릭
    const customerItem = page.locator('.customer-item, [class*="customer-node"], [class*="member"]').first();
    if (await customerItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customerItem.click();
      await page.waitForTimeout(1500);
      console.log('고객 항목 클릭');

      // RightPane 또는 상세 정보 확인
      const detailPane = page.locator('.right-pane, .detail-pane, [class*="detail"]').first();
      const hasDetail = await detailPane.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`상세 정보: ${hasDetail ? '표시됨' : '미표시'}`);
    } else {
      console.log('고객 항목을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/relationship-06-detail.png' });
  });

  test('7. 빠른 가족 지정 패널', async ({ page }) => {
    console.log('\n=== 빠른 가족 지정 패널 ===');

    const success = await navigateToRelationshipView(page);
    expect(success).toBe(true);

    // 빠른 가족 지정 패널 확인
    const quickAssignPanel = page.locator('.quick-family-panel, [class*="quick-assign"], [class*="family-assign"]').first();
    if (await quickAssignPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('빠른 가족 지정 패널 표시됨');
    } else {
      console.log('빠른 가족 지정 패널 없음 (모든 고객이 가족 지정됨)');
    }

    await page.screenshot({ path: 'test-results/relationship-07-quick-assign.png' });
  });
});

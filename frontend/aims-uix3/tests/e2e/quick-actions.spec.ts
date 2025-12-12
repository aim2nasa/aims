import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 빠른 작업 (Quick Actions) 테스트
 *
 * 테스트 시나리오:
 * 1. 빠른 작업 화면 진입 (대시보드)
 * 2. 통계 카드 확인
 * 3. 액션 카드 네비게이션
 * 4. 최근 활동 확인
 */

test.describe('빠른 작업 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 대시보드/빠른 작업 화면 확인', async ({ page }) => {
    console.log('\n=== 대시보드/빠른 작업 화면 확인 ===');

    // 홈으로 이동 (대시보드)
    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기 (필요시)
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 대시보드 또는 빠른 작업 화면 확인
    const dashboard = page.locator('.dashboard, .quick-actions, [class*="dashboard"]').first();
    const isVisible = await dashboard.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`대시보드 화면: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/quick-actions-01-dashboard.png' });
  });

  test('2. 통계 카드 확인', async ({ page }) => {
    console.log('\n=== 통계 카드 확인 ===');

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 통계 카드들 확인
    const statsCards = page.locator('.stats-card, .stat-card, [class*="statistics"]');
    const cardCount = await statsCards.count();
    console.log(`통계 카드: ${cardCount}개`);

    // 주요 통계 항목 확인
    const statsItems = ['고객', '문서', '계약'];
    for (const item of statsItems) {
      const statElement = page.locator(`text=${item}`).first();
      const hasStat = await statElement.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasStat) {
        console.log(`${item} 통계: 표시됨`);
      }
    }

    await page.screenshot({ path: 'test-results/quick-actions-02-stats.png' });
  });

  test('3. 가이드 카드 확인', async ({ page }) => {
    console.log('\n=== 가이드 카드 확인 ===');

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 가이드 카드들 확인
    const guideCards = page.locator('.guide-card, .action-card, [class*="guide"]');
    const cardCount = await guideCards.count();
    console.log(`가이드 카드: ${cardCount}개`);

    // 주요 액션 버튼들 확인
    const actionButtons = ['전체 고객 보기', '새 고객 등록', '문서 등록', '계약 입력'];
    for (const action of actionButtons) {
      const actionBtn = page.locator(`button:has-text("${action}")`).first();
      const hasAction = await actionBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasAction) {
        console.log(`${action} 버튼: 표시됨`);
      }
    }

    await page.screenshot({ path: 'test-results/quick-actions-03-guide-cards.png' });
  });

  test('4. 고객 등록 카드 네비게이션', async ({ page }) => {
    console.log('\n=== 고객 등록 카드 네비게이션 ===');

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 고객 등록 버튼 클릭
    const registerBtn = page.locator('button:has-text("새 고객 등록"), button:has-text("고객 등록")').first();
    if (await registerBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await registerBtn.click();
      await page.waitForTimeout(2000);
      console.log('고객 등록 버튼 클릭');

      // 고객 등록 화면 확인
      const registrationView = page.locator('.customer-registration, input[aria-label="이름"]').first();
      const isVisible = await registrationView.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`고객 등록 화면: ${isVisible ? '이동됨' : '이동 실패'}`);
    } else {
      console.log('고객 등록 버튼을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/quick-actions-04-customer-register.png' });
  });

  test('5. 전체 고객 보기 카드 네비게이션', async ({ page }) => {
    console.log('\n=== 전체 고객 보기 카드 네비게이션 ===');

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 전체 고객 보기 버튼 클릭
    const allCustomersBtn = page.locator('button:has-text("전체 고객 보기")').first();
    if (await allCustomersBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await allCustomersBtn.click();
      await page.waitForTimeout(2000);
      console.log('전체 고객 보기 버튼 클릭');

      // 고객 목록 화면 확인
      const allCustomersView = page.locator('.customer-all-view, .customer-list, [class*="all-customers"]').first();
      const isVisible = await allCustomersView.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`전체 고객 화면: ${isVisible ? '이동됨' : '이동 실패'}`);
    } else {
      console.log('전체 고객 보기 버튼을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/quick-actions-05-all-customers.png' });
  });

  test('6. 최근 고객 표시 확인', async ({ page }) => {
    console.log('\n=== 최근 고객 표시 확인 ===');

    await page.goto('/');
    await page.waitForTimeout(2000);

    // 온보딩 닫기
    const onboarding = page.locator('.onboarding-tour');
    if (await onboarding.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 최근 고객 섹션 확인
    const recentCustomers = page.locator('.recent-customers, [class*="recent"]').first();
    const hasRecent = await recentCustomers.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`최근 고객 섹션: ${hasRecent ? '표시됨' : '미표시'}`);

    if (hasRecent) {
      // 최근 고객 항목 수 확인
      const recentItems = page.locator('.recent-customer-item, [class*="recent"] .customer-item');
      const itemCount = await recentItems.count();
      console.log(`최근 고객 수: ${itemCount}명`);
    }

    await page.screenshot({ path: 'test-results/quick-actions-06-recent.png' });
  });
});

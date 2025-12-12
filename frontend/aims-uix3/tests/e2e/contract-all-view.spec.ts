import { test, expect, Page } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 전체 계약 보기 테스트
 *
 * 테스트 시나리오:
 * 1. 전체 계약 화면 진입
 * 2. 계약 목록 표시
 * 3. 검색 기능 (고객명, 증권번호)
 * 4. 정렬 기능
 * 5. 페이지네이션
 * 6. 계약 상세 보기
 */

// 전체 계약으로 이동하는 헬퍼 함수
async function navigateToContractView(page: Page): Promise<boolean> {
  // 햄버거 메뉴 열기
  const hamburgerButton = page.locator('button.hamburger-button').first();
  if (await hamburgerButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await hamburgerButton.click();
    await page.waitForTimeout(800);
  }

  // 계약 관리 섹션 확장
  const contractSection = page.locator('[data-menu-key="contracts"], .custom-menu-item:has-text("계약 관리")').first();
  if (await contractSection.isVisible({ timeout: 2000 }).catch(() => false)) {
    await contractSection.click();
    await page.waitForTimeout(500);
  }

  // 전체 계약 메뉴 클릭
  const allContractMenu = page.locator('[data-menu-key="contracts-all"], [role="menuitem"]:has-text("전체 계약")').first();

  // 최대 5초 대기
  for (let i = 0; i < 10; i++) {
    if (await allContractMenu.isVisible({ timeout: 500 }).catch(() => false)) {
      await allContractMenu.click();
      await page.waitForTimeout(2000);
      console.log('전체 계약 메뉴 클릭 성공');
      return true;
    }
    await page.waitForTimeout(500);
  }

  console.log('전체 계약 메뉴를 찾을 수 없음');
  return false;
}

test.describe('전체 계약 보기 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);

    // 온보딩 투어가 표시되면 닫기
    const onboardingTour = page.locator('.onboarding-tour');
    if (await onboardingTour.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('1. 전체 계약 화면 진입', async ({ page }) => {
    console.log('\n=== 전체 계약 화면 진입 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 화면 로드 확인
    const contractView = page.locator('.contract-all-view, [class*="contract-view"], .layout-centerpane').first();
    const isVisible = await contractView.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`전체 계약 화면: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/contract-01-entry.png' });
  });

  test('2. 계약 목록 표시', async ({ page }) => {
    console.log('\n=== 계약 목록 표시 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 테이블 또는 목록 확인
    const contractTable = page.locator('table, .contract-list, [class*="contract-table"]').first();
    const hasTable = await contractTable.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`계약 테이블: ${hasTable ? '표시됨' : '미표시'}`);

    // 계약 행 수 확인
    const contractRows = page.locator('tbody tr, .contract-item, [class*="contract-row"]');
    const rowCount = await contractRows.count();
    console.log(`계약 행 수: ${rowCount}`);

    // 빈 상태 확인
    if (rowCount === 0) {
      const emptyState = page.locator('text=계약이 없습니다, text=등록된 계약이 없습니다').first();
      const isEmpty = await emptyState.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`빈 상태 메시지: ${isEmpty ? '표시됨' : '미표시'}`);
    }

    await page.screenshot({ path: 'test-results/contract-02-list.png' });
  });

  test('3. 검색 기능 - 고객명', async ({ page }) => {
    console.log('\n=== 검색 기능 - 고객명 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 검색 입력란 찾기
    const searchInput = page.locator('input[placeholder*="검색"], input[placeholder*="고객명"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.click();
      await searchInput.fill('테스트');
      await page.waitForTimeout(1000);
      console.log('고객명 검색: 테스트');

      // 검색 결과 확인
      const results = page.locator('tbody tr, .contract-item');
      const resultCount = await results.count();
      console.log(`검색 결과: ${resultCount}건`);

      await searchInput.clear();
      await page.waitForTimeout(500);
    } else {
      console.log('검색 입력란을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/contract-03-search-name.png' });
  });

  test('4. 검색 기능 - 증권번호', async ({ page }) => {
    console.log('\n=== 검색 기능 - 증권번호 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 증권번호 검색 입력란
    const policyInput = page.locator('input[placeholder*="증권"], input[placeholder*="번호"]').first();
    if (await policyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await policyInput.click();
      await policyInput.fill('12345');
      await page.waitForTimeout(1000);
      console.log('증권번호 검색: 12345');

      await policyInput.clear();
      await page.waitForTimeout(500);
    } else {
      // 통합 검색 입력란에서 증권번호 검색
      const searchInput = page.locator('input[placeholder*="검색"]').first();
      if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchInput.fill('12345');
        await page.waitForTimeout(1000);
        console.log('통합 검색으로 증권번호 검색: 12345');
        await searchInput.clear();
      } else {
        console.log('검색 입력란을 찾을 수 없음');
      }
    }

    await page.screenshot({ path: 'test-results/contract-04-search-policy.png' });
  });

  test('5. 정렬 기능', async ({ page }) => {
    console.log('\n=== 정렬 기능 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 테이블 헤더 클릭으로 정렬
    const sortableHeaders = ['고객명', '상품명', '보험료', '계약일'];
    let sorted = false;
    for (const header of sortableHeaders) {
      const headerCell = page.locator(`th:has-text("${header}"), .table-header:has-text("${header}")`).first();
      if (await headerCell.isVisible({ timeout: 1000 }).catch(() => false)) {
        await headerCell.click();
        await page.waitForTimeout(500);
        console.log(`${header} 정렬 클릭`);
        sorted = true;
        break;
      }
    }
    if (!sorted) {
      console.log('정렬 가능한 헤더를 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/contract-05-sort.png' });
  });

  test('6. 페이지네이션', async ({ page }) => {
    console.log('\n=== 페이지네이션 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 페이지네이션 컨트롤 확인
    const pagination = page.locator('.pagination, [class*="pagination"], .page-controls');
    const hasPagination = await pagination.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`페이지네이션: ${hasPagination ? '표시됨' : '미표시'}`);

    if (hasPagination) {
      // 다음 페이지 버튼
      const nextButton = page.locator('button:has-text("다음"), button[aria-label="다음"], .pagination-next').first();
      if (await nextButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isEnabled = await nextButton.isEnabled();
        console.log(`다음 페이지 버튼: ${isEnabled ? '활성화' : '비활성화'}`);

        if (isEnabled) {
          await nextButton.click();
          await page.waitForTimeout(1000);
          console.log('다음 페이지 클릭');
        }
      }
    } else {
      console.log('페이지네이션이 없거나 데이터가 적음');
    }

    await page.screenshot({ path: 'test-results/contract-06-pagination.png' });
  });

  test('7. 계약 상세 보기', async ({ page }) => {
    console.log('\n=== 계약 상세 보기 ===');

    const success = await navigateToContractView(page);
    expect(success).toBe(true);

    // 첫 번째 계약 행 클릭
    const contractRow = page.locator('tbody tr, .contract-item').first();
    if (await contractRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contractRow.click();
      await page.waitForTimeout(1500);
      console.log('계약 행 클릭');

      // RightPane 또는 상세 모달 확인
      const detailPane = page.locator('.right-pane, .contract-detail, [class*="detail"]').first();
      const hasDetail = await detailPane.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`계약 상세: ${hasDetail ? '표시됨' : '미표시'}`);
    } else {
      console.log('계약 데이터가 없음');
    }

    await page.screenshot({ path: 'test-results/contract-07-detail.png' });
  });
});

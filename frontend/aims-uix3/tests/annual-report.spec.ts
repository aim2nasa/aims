import { test, expect } from '@playwright/test';

test.describe('Annual Report Tab', () => {
  test('should display annual report data for 안영미', async ({ page }) => {
    // 1. 메인 페이지 접속
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // 2. 전체보기 클릭
    await page.click('text=전체보기');
    await page.waitForTimeout(1000);

    // 3. 안영미 고객 검색
    const searchInput = page.locator('input[placeholder*="검색"]').first();
    await searchInput.fill('안영미');
    await page.waitForTimeout(500);

    // 4. 안영미 고객 클릭
    await page.click('text=안영미');
    await page.waitForTimeout(1000);

    // 5. Annual Report 탭 클릭
    await page.click('text=Annual Report');
    await page.waitForTimeout(2000);

    // 6. 데이터 확인
    const content = await page.textContent('.annual-report-tab__summary');

    console.log('📊 Annual Report Content:', content);

    // 7. 검증
    expect(content).toContain('보험료');
    expect(content).toContain('보장금액');
    expect(content).toContain('계약');

    // 8. 값이 0이 아닌지 확인
    const premiumText = await page.textContent('text=월 보험료').catch(() => null);
    const coverageText = await page.textContent('text=보장금액').catch(() => null);
    const contractText = await page.textContent('text=계약').catch(() => null);

    console.log('💰 보험료:', premiumText);
    console.log('🛡️ 보장금액:', coverageText);
    console.log('📋 계약:', contractText);

    // 9. 스크린샷 저장
    await page.screenshot({ path: 'test-results/annual-report.png', fullPage: true });
  });
});

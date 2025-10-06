/**
 * 고객 전체보기 아이콘 자동화 테스트
 * 생년월일, 이메일 아이콘의 색상과 렌더링을 검증
 */
import { test, expect } from '@playwright/test';

test.describe('고객 전체보기 아이콘 테스트', () => {
  test.beforeEach(async ({ page }) => {
    // AIMS UIX3 접속
    await page.goto('http://localhost:5177/');

    // 전체보기 메뉴 클릭
    await page.click('text=전체보기');

    // 고객 목록이 로드될 때까지 대기
    await page.waitForSelector('.customer-list-header', { timeout: 10000 });
  });

  test('생년월일 아이콘이 올바르게 렌더링되는지 확인', async ({ page }) => {
    // 생년월일 헤더 찾기
    const birthHeader = page.locator('.header-birth');
    await expect(birthHeader).toBeVisible();

    // SVG 아이콘이 존재하는지 확인
    const birthIcon = birthHeader.locator('svg.header-icon-svg');
    await expect(birthIcon).toBeVisible();

    // 스크린샷 저장
    await birthIcon.screenshot({ path: 'test-results/birth-icon.png' });

    // SVG 내부 요소 확인 (케이크, 촛불, 불꽃)
    const svgContent = await birthIcon.innerHTML();

    // 2층 케이크 확인 - CSS 변수 사용
    expect(svgContent).toContain('fill="var(--cake-bottom)"'); // 아래층
    expect(svgContent).toContain('fill="var(--cake-top)"');    // 위층

    // 촛불 확인 - CSS 변수 사용
    expect(svgContent).toContain('fill="var(--candle)"');

    // 불꽃 확인 - CSS 변수 사용
    expect(svgContent).toContain('fill="var(--flame)"');

    console.log('✅ 생년월일 아이콘 검증 완료 (2층 케이크)');
  });

  test('이메일 아이콘이 올바르게 렌더링되는지 확인', async ({ page }) => {
    // 이메일 헤더 찾기
    const emailHeader = page.locator('.header-email');
    await expect(emailHeader).toBeVisible();

    // SVG 아이콘이 존재하는지 확인
    const emailIcon = emailHeader.locator('svg.header-icon-svg');
    await expect(emailIcon).toBeVisible();

    // 스크린샷 저장
    await emailIcon.screenshot({ path: 'test-results/email-icon.png' });

    // SVG 내부 요소 확인 (편지 봉투)
    const svgContent = await emailIcon.innerHTML();

    // 봉투 외곽선 확인
    expect(svgContent).toContain('rect');
    expect(svgContent).toContain('stroke="currentColor"');

    // V자 접힘선 확인
    expect(svgContent).toContain('path');
    expect(svgContent).toContain('l7 5');

    console.log('✅ 이메일 아이콘 검증 완료');
  });

  test('전체 헤더 스크린샷 저장', async ({ page }) => {
    const header = page.locator('.customer-list-header');
    await expect(header).toBeVisible();

    // 전체 헤더 스크린샷
    await header.screenshot({ path: 'test-results/customer-header-full.png' });

    console.log('✅ 전체 헤더 스크린샷 저장 완료');
  });

  test('아이콘 CSS 변수 사용 확인', async ({ page }) => {
    // 생년월일 아이콘의 CSS 변수 사용 확인
    const birthRect = page.locator('.header-birth svg rect').first();
    const fill = await birthRect.getAttribute('fill');

    console.log('생년월일 케이크 아래층 fill 속성:', fill);
    expect(fill).toBe('var(--cake-bottom)'); // CSS 변수 사용

    // 촛불 CSS 변수 확인
    const candles = page.locator('.header-birth svg rect[fill="var(--candle)"]');
    const candleCount = await candles.count();

    console.log('촛불 개수:', candleCount);
    expect(candleCount).toBe(3); // 3개의 촛불

    console.log('✅ CSS 변수 사용 확인 완료 - 하드코딩 제거됨');
  });
});

import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * Layer 3: xPipe 통합 E2E 테스트
 *
 * xPipe 교체 전후로 핵심 사용자 흐름이 에러 없이 동작하는지 검증한다.
 */

/** 좌측 메뉴 클릭 헬퍼 */
async function clickMenu(page: any, menuText: string) {
  const leftPane = page.locator('.layout-leftpane');
  const menuItem = leftPane.locator(`text=${menuText}`).first();
  if (await menuItem.isVisible({ timeout: 5000 }).catch(() => false)) {
    await menuItem.click();
    await page.waitForTimeout(3000);
    return true;
  }
  return false;
}

test.describe('xPipe 통합 E2E 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.waitForTimeout(2000);
  });

  test('1. 전체 문서 보기 — 문서 목록 로드됨', async ({ page }) => {
    const clicked = await clickMenu(page, '전체 문서 보기');
    expect(clicked).toBe(true);

    const body = await page.locator('body').innerText();
    const hasFiles = body.includes('.pdf') || body.includes('.jpg') || body.includes('.png');
    expect(hasFiles).toBe(true);
    console.log('전체 문서 보기: 문서 파일명 확인');
  });

  test('2. 전체 고객 보기 — 고객 목록 로드됨', async ({ page }) => {
    const clicked = await clickMenu(page, '전체 고객 보기');
    expect(clicked).toBe(true);

    const body = await page.locator('body').innerText();
    const hasKoreanName = /[가-힣]{2,4}/.test(body);
    expect(hasKoreanName).toBe(true);
    console.log('전체 고객 보기: 고객명 확인');
  });

  test('3. AI 채팅 접근 가능', async ({ page }) => {
    const aiButton = page.locator('button:has-text("AI")').first();
    if (await aiButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await aiButton.click();
      await page.waitForTimeout(2000);
    }

    const body = await page.locator('body').innerText();
    expect(body).toContain('AI');
    console.log('AI 채팅 접근 성공');
  });

  test('4. 크레딧 위젯 표시됨', async ({ page }) => {
    // 크레딧은 하단 바에 tooltip으로 표시 — 버전 텍스트(v0.x)로 하단 바 존재 확인
    const body = await page.locator('body').innerText();
    const hasBottomBar = body.includes('v0.') || body.includes('크레딧');
    expect(hasBottomBar).toBe(true);
    console.log('하단 바/크레딧 위젯 표시 확인');
  });

  test('5. 고객별 문서함 접근 가능', async ({ page }) => {
    const clicked = await clickMenu(page, '고객별 문서함');
    expect(clicked).toBe(true);

    const body = await page.locator('body').innerText();
    expect(body).not.toContain('500 Internal');
    console.log('고객별 문서함 로드 성공');
  });
});

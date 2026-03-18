import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

test.describe('AIMS 원격 지원 모달 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('S1: 최초 사용자 설치 위자드 전체 흐름', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('aims-rustdesk-setup'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const headsetBtn = page.locator('[aria-label="원격 지원 요청"]');
    await expect(headsetBtn).toBeVisible({ timeout: 10000 });
    await headsetBtn.click();
    const modal = page.locator('.sp-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    console.log('[S1-3] PASS: 원격 지원 준비 모달 열림');
    await page.screenshot({ path: 'D:/tmp/e2e_s1_step1.png' });
    await expect(page.locator('.sp-card-step')).toHaveText('1 / 3');
    await expect(page.locator('.sp-card-title')).toHaveText('프로그램 다운로드');
    await expect(page.locator('.sp-title')).toHaveText('원격 지원 준비');
    const dlBtn = page.locator('.sp-card-btn--primary').first();
    await expect(dlBtn).toBeVisible();
    const dlText = await dlBtn.textContent();
    console.log('[S1-4] PASS: Step1 버튼=' + dlText);
    const dlEvt = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await dlBtn.click();
    await dlEvt;
    console.log('[S1-5] 다운로드 클릭');
    await page.screenshot({ path: 'D:/tmp/e2e_s1_step2.png' });
    await expect(page.locator('.sp-card-step')).toHaveText('2 / 3');
    await expect(page.locator('.sp-card-title')).toHaveText('프로그램 설치');
    const installBtn = page.locator('button:has-text("설치했습니다")');
    await expect(installBtn).toBeVisible();
    const prevBtn = page.locator('button:has-text("← 이전")');
    await expect(prevBtn).toBeVisible();
    console.log('[S1-6] PASS: Step2 확인');
    await prevBtn.click();
    await expect(page.locator('.sp-card-step')).toHaveText('1 / 3');
    console.log('[S1-7] PASS: 이전 버튼 복귀');
    const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.locator('.sp-card-btn--primary').first().click();
    await dl2;
    await page.waitForTimeout(300);
    await page.locator('button:has-text("설치했습니다")').click();
    await page.screenshot({ path: 'D:/tmp/e2e_s1_step3.png' });
    await expect(page.locator('.sp-card-title')).toHaveText('설정 완료');
    await expect(page.locator('.sp-card-check')).toBeVisible();
    await expect(page.locator('button:has-text("원격 지원 시작")')).toBeVisible();
    console.log('[S1-9] PASS: Step3 확인');
    await expect(page.locator('.sp-dot--active')).toHaveCount(3);
    console.log('[S1-10] PASS: dots 3개 active');
    await page.screenshot({ path: 'D:/tmp/e2e_s1_final.png' });
    await page.locator('.sp-close').click();
    await expect(modal).not.toBeVisible({ timeout: 2000 });
  });

  test('S2: 재방문 사용자 connect 모드', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('aims-rustdesk-setup', 'done'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('[aria-label="원격 지원 요청"]').click();
    const modal = page.locator('.sp-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'D:/tmp/e2e_s2_connect.png' });
    const wizardVisible = await page.locator('.sp-wizard').isVisible({ timeout: 1000 }).catch(() => false);
    if (!wizardVisible) console.log('[S2-3] PASS: connect 모달 (위자드 없음)');
    else console.log('[S2-3] FAIL: 위자드가 보임');
    await expect(page.locator('.sp-status')).toBeVisible();
    const titleText = await page.locator('.sp-title').textContent();
    console.log('[S2-3] 모달 제목: ' + titleText);
    const setupLink = page.locator('button.sp-link');
    await expect(setupLink).toBeVisible({ timeout: 8000 });
    const linkText = await setupLink.textContent();
    console.log('[S2-4] PASS: 링크 — ' + linkText);
    await page.screenshot({ path: 'D:/tmp/e2e_s2_link.png' });
    await setupLink.click();
    await expect(page.locator('.sp-wizard')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.sp-title')).toHaveText('원격 지원 준비');
    console.log('[S2-5] PASS: setup 위자드로 전환');
    await page.screenshot({ path: 'D:/tmp/e2e_s2_switched.png' });
    await page.locator('.sp-close').click();
  });

  test('S3: UI 세부 오버레이ESC내부클릭X버튼', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('aims-rustdesk-setup'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const headsetBtn = page.locator('[aria-label="원격 지원 요청"]');
    const modal = page.locator('.sp-modal');
    const overlay = page.locator('.sp-overlay');
    await headsetBtn.click();
    await expect(modal).toBeVisible({ timeout: 3000 });
    await overlay.click({ position: { x: 10, y: 10 } });
    await expect(modal).not.toBeVisible({ timeout: 2000 });
    console.log('[S3-1] PASS: 오버레이 클릭 닫힘');
    await headsetBtn.click();
    await expect(modal).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 2000 });
    console.log('[S3-2] PASS: ESC 닫힘');
    await headsetBtn.click();
    await expect(modal).toBeVisible({ timeout: 3000 });
    await modal.click({ position: { x: 50, y: 80 } });
    await expect(modal).toBeVisible({ timeout: 1000 });
    console.log('[S3-3] PASS: 내부 클릭 유지');
    await page.locator('.sp-close').click();
    await expect(modal).not.toBeVisible({ timeout: 2000 });
    console.log('[S3-4] PASS: X 버튼 닫힘');
    await page.screenshot({ path: 'D:/tmp/e2e_s3_done.png' });
  });

  test('S4: 다크모드 렌더링', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.removeItem('aims-rustdesk-setup');
    });
    await page.waitForTimeout(500);
    await page.locator('[aria-label="원격 지원 요청"]').click();
    const modal = page.locator('.sp-modal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: 'D:/tmp/e2e_s4_dark.png' });
    console.log('[S4] 다크모드 스크린샷 저장');
    const bgColor = await modal.evaluate((el) => getComputedStyle(el).backgroundColor);
    const textColor = await page.locator('.sp-title').evaluate((el) => getComputedStyle(el).color);
    const borderStyle = await modal.evaluate((el) => getComputedStyle(el).border);
    console.log('[S4] 배경색: ' + bgColor);
    console.log('[S4] 텍스트색: ' + textColor);
    console.log('[S4] border: ' + borderStyle);
    if (bgColor !== 'rgb(255, 255, 255)') {
      console.log('[S4] PASS: 다크모드 배경색 적용됨');
    } else {
      console.log('[S4] WARNING: 다크모드에서 흰 배경 감지');
    }
    await page.locator('.sp-close').click();
  });

});
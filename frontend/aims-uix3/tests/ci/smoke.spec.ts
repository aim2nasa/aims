import { test, expect } from '@playwright/test';

/**
 * CI Smoke 테스트 — 인증 불필요
 *
 * CI 환경에서 빌드된 프론트엔드가 정상 로드되는지 확인.
 * 로그인 페이지의 기본 접근성도 검사.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('CI Smoke (인증 불필요)', () => {
  test('로그인 페이지 로드', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 로그인 페이지가 표시되어야 함 (미인증 상태)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    // 페이지에 치명적 에러 없음 확인
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('정적 리소스 로드', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().includes('/api/')) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 정적 리소스 (JS, CSS, 폰트) 로드 실패 없어야 함
    expect(failedRequests).toHaveLength(0);
  });

  test('HTML lang 속성', async ({ page }) => {
    await page.goto('/');
    const lang = await page.getAttribute('html', 'lang');
    expect(lang).toBeTruthy();
  });

  test('viewport meta 태그', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewport).toContain('width=');
  });
});

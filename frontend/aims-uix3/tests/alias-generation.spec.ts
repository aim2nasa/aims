import { test, expect } from '@playwright/test';

/**
 * 별칭 생성 모드 E2E 테스트
 * - 버튼이 눈에 보이는지 (가시성)
 * - 클릭하면 별칭 모드에 진입하는지 (체크박스 표시)
 * - 모드 해제가 되는지
 *
 * 별칭 버튼은 "전체 문서 보기" (DocumentLibraryView)에 있음
 */
test.describe('별칭 생성 모드', () => {

  test.beforeEach(async ({ page }) => {
    // 메인 페이지 진입
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => {});

    // 사이드바에서 "전체 문서 보기" 메뉴 클릭
    const libraryMenu = page.locator('text=전체 문서 보기').first();
    await expect(libraryMenu).toBeVisible({ timeout: 15000 });
    await libraryMenu.click();

    // 전체 문서 보기 로드 대기 — library-unified-header가 나타나면 OK
    await page.waitForSelector('.library-unified-header', { timeout: 15000 });
    // 데이터 로드 대기
    await page.waitForTimeout(2000);
  });

  test('별칭 생성 버튼이 헤더에 보여야 한다', async ({ page }) => {
    // 별칭 생성 버튼 찾기 (aria-label 기반)
    const aliasButton = page.locator('button[aria-label="별칭 생성"]');

    // 1. 존재해야 한다
    await expect(aliasButton).toBeAttached({ timeout: 5000 });

    // 2. 눈에 보여야 한다
    await expect(aliasButton).toBeVisible({ timeout: 5000 });

    // 3. 최소 크기 검증 — 사용자가 클릭할 수 있는 크기여야 한다
    const box = await aliasButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });

  test('별칭 생성 버튼 클릭 시 별칭 모드 진입해야 한다', async ({ page }) => {
    // 별칭 생성 버튼 클릭
    const aliasButton = page.locator('button[aria-label="별칭 생성"]');
    await expect(aliasButton).toBeVisible({ timeout: 5000 });
    await aliasButton.click();
    await page.waitForTimeout(500);

    // 별칭 모드 진입 확인: "완료" 텍스트가 보여야 한다
    const doneButton = page.locator('button[aria-label="별칭 완료"]');
    await expect(doneButton).toBeVisible({ timeout: 5000 });

    // "0개 선택됨" 텍스트가 보여야 한다
    const selectedCount = page.locator('text=개 선택됨').first();
    await expect(selectedCount).toBeVisible({ timeout: 5000 });
  });

  test('별칭 모드에서 다시 클릭하면 모드 해제되어야 한다', async ({ page }) => {
    // 별칭 모드 진입
    const aliasButton = page.locator('button[aria-label="별칭 생성"]');
    await expect(aliasButton).toBeVisible({ timeout: 5000 });
    await aliasButton.click();
    await page.waitForTimeout(500);

    // 모드 해제
    const doneButton = page.locator('button[aria-label="별칭 완료"]');
    await expect(doneButton).toBeVisible({ timeout: 3000 });
    await doneButton.click();
    await page.waitForTimeout(500);

    // 별칭 생성 버튼이 다시 나타나야 한다
    await expect(aliasButton).toBeVisible({ timeout: 3000 });

    // "선택됨" 텍스트가 사라져야 한다
    const selectedCount = page.locator('text=개 선택됨');
    await expect(selectedCount).not.toBeVisible({ timeout: 3000 });
  });
});

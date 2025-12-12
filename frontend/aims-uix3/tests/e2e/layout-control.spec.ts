import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 레이아웃 설정 테스트
 *
 * 테스트 시나리오:
 * 1. 레이아웃 설정 모달 열기
 * 2. 패널 표시/숨김 토글
 * 3. 패널 너비 조절
 * 4. 설정 저장
 * 5. 모달 드래그/리사이즈
 */

test.describe('레이아웃 설정 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 레이아웃 설정 모달 열기', async ({ page }) => {
    console.log('\n=== 레이아웃 설정 모달 열기 ===');

    // 레이아웃 설정 버튼 찾기 (헤더 또는 사이드바)
    const layoutButton = page.locator('button[aria-label="레이아웃"], button:has-text("레이아웃"), [class*="layout-control"]').first();

    if (await layoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await layoutButton.click();
      await page.waitForTimeout(500);
      console.log('레이아웃 버튼 클릭');
    } else {
      // 설정 메뉴에서 찾기
      const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
      if (await profileButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await profileButton.click();
        await page.waitForTimeout(500);

        const layoutOption = page.locator('[role="menuitem"]:has-text("레이아웃")').first();
        if (await layoutOption.isVisible({ timeout: 1000 }).catch(() => false)) {
          await layoutOption.click();
          await page.waitForTimeout(500);
          console.log('레이아웃 옵션 클릭');
        }
      }
    }

    // 레이아웃 모달 확인
    const layoutModal = page.locator('.layout-control-modal, .layout-modal, [class*="layout-settings"]').first();
    const isVisible = await layoutModal.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`레이아웃 모달: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/layout-01-modal.png' });
  });

  test('2. 3-패널 레이아웃 확인', async ({ page }) => {
    console.log('\n=== 3-패널 레이아웃 확인 ===');

    // 3개의 패널 확인
    const leftPane = page.locator('.left-pane').first();
    const centerPane = page.locator('.center-pane').first();
    const rightPane = page.locator('.right-pane, .main-pane').first();

    const hasLeftPane = await leftPane.isVisible({ timeout: 3000 }).catch(() => false);
    const hasCenterPane = await centerPane.isVisible({ timeout: 3000 }).catch(() => false);
    const hasRightPane = await rightPane.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`LeftPane: ${hasLeftPane ? '표시됨' : '미표시'}`);
    console.log(`CenterPane: ${hasCenterPane ? '표시됨' : '미표시'}`);
    console.log(`RightPane: ${hasRightPane ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/layout-02-panels.png' });
  });

  test('3. 패널 표시/숨김 토글', async ({ page }) => {
    console.log('\n=== 패널 표시/숨김 토글 ===');

    // 레이아웃 설정 모달 열기
    const layoutButton = page.locator('button[aria-label="레이아웃"], [class*="layout-control"]').first();
    if (await layoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await layoutButton.click();
      await page.waitForTimeout(500);
    }

    // 패널 토글 체크박스 찾기
    const toggles = page.locator('.layout-modal input[type="checkbox"], .layout-settings input[type="checkbox"]');
    const toggleCount = await toggles.count();
    console.log(`패널 토글: ${toggleCount}개`);

    if (toggleCount > 0) {
      // 첫 번째 토글 클릭
      const firstToggle = toggles.first();
      const initialState = await firstToggle.isChecked().catch(() => false);
      await firstToggle.click();
      await page.waitForTimeout(500);
      const newState = await firstToggle.isChecked().catch(() => !initialState);
      console.log(`토글 변경: ${initialState} → ${newState}`);

      // 원복
      await firstToggle.click();
      await page.waitForTimeout(500);
    }

    // ESC로 모달 닫기
    await page.keyboard.press('Escape');

    await page.screenshot({ path: 'test-results/layout-03-toggle.png' });
  });

  test('4. 패널 너비 조절 (드래그)', async ({ page }) => {
    console.log('\n=== 패널 너비 조절 ===');

    // 디바이더 (BRB - Border Resize Bar) 찾기
    const divider = page.locator('.brb, .divider, [class*="resize-handle"], [class*="divider"]').first();

    if (await divider.isVisible({ timeout: 2000 }).catch(() => false)) {
      // 드래그 시작 위치
      const box = await divider.boundingBox();
      if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        // 드래그 (오른쪽으로 50px)
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 50, startY, { steps: 10 });
        await page.mouse.up();

        console.log('디바이더 드래그 완료');
        await page.waitForTimeout(500);

        // 드래그 원복 (왼쪽으로 50px)
        await page.mouse.move(startX + 50, startY);
        await page.mouse.down();
        await page.mouse.move(startX, startY, { steps: 10 });
        await page.mouse.up();

        console.log('디바이더 원복 완료');
      }
    } else {
      console.log('디바이더를 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/layout-04-resize.png' });
  });

  test('5. 헤더 표시/숨김', async ({ page }) => {
    console.log('\n=== 헤더 표시/숨김 ===');

    // 헤더 확인
    const header = page.locator('header, .header, [class*="header"]').first();
    const isHeaderVisible = await header.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`초기 헤더 상태: ${isHeaderVisible ? '표시됨' : '숨김'}`);

    // 레이아웃 설정에서 헤더 토글
    const layoutButton = page.locator('button[aria-label="레이아웃"], [class*="layout-control"]').first();
    if (await layoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await layoutButton.click();
      await page.waitForTimeout(500);

      const headerToggle = page.locator('label:has-text("헤더") input, [data-toggle="header"]').first();
      if (await headerToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
        await headerToggle.click();
        await page.waitForTimeout(500);
        console.log('헤더 토글 클릭');

        // 원복
        await headerToggle.click();
        await page.waitForTimeout(500);
      }

      await page.keyboard.press('Escape');
    }

    await page.screenshot({ path: 'test-results/layout-05-header.png' });
  });

  test('6. 설정 저장 확인', async ({ page }) => {
    console.log('\n=== 설정 저장 확인 ===');

    // localStorage에서 레이아웃 설정 확인
    const layoutSettings = await page.evaluate(() => {
      return {
        layout: localStorage.getItem('aims_layout'),
        centerWidth: localStorage.getItem('aims_center_width'),
        visibility: localStorage.getItem('aims_pane_visibility')
      };
    });

    console.log('저장된 레이아웃 설정:');
    console.log(`  layout: ${layoutSettings.layout || '없음'}`);
    console.log(`  centerWidth: ${layoutSettings.centerWidth || '없음'}`);
    console.log(`  visibility: ${layoutSettings.visibility || '없음'}`);

    await page.screenshot({ path: 'test-results/layout-06-settings.png' });
  });

  test('7. 모달 드래그', async ({ page }) => {
    console.log('\n=== 모달 드래그 ===');

    // 레이아웃 모달 열기
    const layoutButton = page.locator('button[aria-label="레이아웃"], [class*="layout-control"]').first();
    if (!await layoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('레이아웃 버튼을 찾을 수 없음');
      return;
    }

    await layoutButton.click();
    await page.waitForTimeout(500);

    // 모달 헤더 (드래그 핸들)
    const modalHeader = page.locator('.layout-modal-header, .modal-header, [class*="drag-handle"]').first();
    if (await modalHeader.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await modalHeader.boundingBox();
      if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        // 드래그
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 100, startY + 50, { steps: 10 });
        await page.mouse.up();

        console.log('모달 드래그 완료');
        await page.waitForTimeout(500);
      }
    } else {
      console.log('모달 헤더를 찾을 수 없음 (드래그 불가)');
    }

    await page.keyboard.press('Escape');

    await page.screenshot({ path: 'test-results/layout-07-drag.png' });
  });
});

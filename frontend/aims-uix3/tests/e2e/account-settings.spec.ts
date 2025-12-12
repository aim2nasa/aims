import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 계정 설정 테스트
 *
 * 테스트 시나리오:
 * 1. 계정 설정 모달 열기
 * 2. 프로필 탭
 * 3. 보안 탭
 * 4. 알림 탭
 * 5. 데이터 탭
 * 6. 모달 닫기
 */

test.describe('계정 설정 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 계정 설정 모달 열기', async ({ page }) => {
    console.log('\n=== 계정 설정 모달 열기 ===');

    // 헤더의 프로필 버튼 클릭
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"], [class*="avatar"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(1000);
      console.log('프로필 버튼 클릭');

      // 드롭다운 메뉴에서 설정 클릭
      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정"), button:has-text("계정 설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
        console.log('설정 메뉴 클릭');
      }
    } else {
      // 직접 설정 버튼 찾기
      const settingsButton = page.locator('button[aria-label="설정"], button:has-text("설정")').first();
      if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
        console.log('설정 버튼 클릭');
      }
    }

    // 설정 모달 또는 뷰 확인
    const settingsModal = page.locator('.account-settings-modal, .settings-modal, [class*="settings"]').first();
    const isVisible = await settingsModal.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`계정 설정 화면: ${isVisible ? '표시됨' : '미표시'}`);

    await page.screenshot({ path: 'test-results/account-settings-01-open.png' });
  });

  test('2. 프로필 탭', async ({ page }) => {
    console.log('\n=== 프로필 탭 ===');

    // 설정 열기
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(500);

      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정"), button:has-text("계정 설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
      }
    }

    // 프로필 탭 클릭
    const profileTab = page.locator('button:has-text("프로필"), [role="tab"]:has-text("프로필")').first();
    if (await profileTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await profileTab.click();
      await page.waitForTimeout(500);
      console.log('프로필 탭 클릭');

      // 프로필 정보 필드 확인
      const profileFields = ['이름', '이메일', '전화번호'];
      for (const field of profileFields) {
        const fieldElement = page.locator(`text=${field}, label:has-text("${field}")`).first();
        const hasField = await fieldElement.isVisible({ timeout: 1000 }).catch(() => false);
        if (hasField) {
          console.log(`${field}: 표시됨`);
        }
      }
    } else {
      console.log('프로필 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/account-settings-02-profile.png' });
  });

  test('3. 보안 탭', async ({ page }) => {
    console.log('\n=== 보안 탭 ===');

    // 설정 열기
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(500);

      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
      }
    }

    // 보안 탭 클릭
    const securityTab = page.locator('button:has-text("보안"), [role="tab"]:has-text("보안")').first();
    if (await securityTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await securityTab.click();
      await page.waitForTimeout(500);
      console.log('보안 탭 클릭');

      // 비밀번호 변경 폼 확인
      const passwordForm = page.locator('input[type="password"], text=비밀번호 변경').first();
      const hasPasswordForm = await passwordForm.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`비밀번호 변경: ${hasPasswordForm ? '표시됨' : '미표시'}`);
    } else {
      console.log('보안 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/account-settings-03-security.png' });
  });

  test('4. 알림 탭', async ({ page }) => {
    console.log('\n=== 알림 탭 ===');

    // 설정 열기
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(500);

      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
      }
    }

    // 알림 탭 클릭
    const notificationTab = page.locator('button:has-text("알림"), [role="tab"]:has-text("알림")').first();
    if (await notificationTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notificationTab.click();
      await page.waitForTimeout(500);
      console.log('알림 탭 클릭');

      // 토글 스위치 확인
      const toggleSwitches = page.locator('input[type="checkbox"], [role="switch"]');
      const switchCount = await toggleSwitches.count();
      console.log(`알림 토글: ${switchCount}개`);

      // 첫 번째 토글 클릭 테스트
      if (switchCount > 0) {
        const firstToggle = toggleSwitches.first();
        const initialState = await firstToggle.isChecked().catch(() => false);
        await firstToggle.click();
        await page.waitForTimeout(500);
        const newState = await firstToggle.isChecked().catch(() => !initialState);
        console.log(`토글 변경: ${initialState} → ${newState}`);

        // 원복
        await firstToggle.click();
        await page.waitForTimeout(500);
      }
    } else {
      console.log('알림 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/account-settings-04-notification.png' });
  });

  test('5. 데이터 탭', async ({ page }) => {
    console.log('\n=== 데이터 탭 ===');

    // 설정 열기
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(500);

      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
      }
    }

    // 데이터 탭 클릭
    const dataTab = page.locator('button:has-text("데이터"), [role="tab"]:has-text("데이터")').first();
    if (await dataTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dataTab.click();
      await page.waitForTimeout(500);
      console.log('데이터 탭 클릭');

      // 저장소 정보 확인
      const storageInfo = page.locator('text=저장소, text=Storage, text=용량').first();
      const hasStorageInfo = await storageInfo.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`저장소 정보: ${hasStorageInfo ? '표시됨' : '미표시'}`);

      // 내보내기 버튼 확인
      const exportButton = page.locator('button:has-text("내보내기"), button:has-text("Export")').first();
      const hasExport = await exportButton.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`내보내기 버튼: ${hasExport ? '표시됨' : '미표시'}`);

      // 계정 삭제 경고 확인
      const deleteWarning = page.locator('text=계정 삭제, text=Delete Account').first();
      const hasDeleteWarning = await deleteWarning.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`계정 삭제 옵션: ${hasDeleteWarning ? '표시됨' : '미표시'}`);
    } else {
      console.log('데이터 탭을 찾을 수 없음');
    }

    await page.screenshot({ path: 'test-results/account-settings-05-data.png' });
  });

  test('6. 모달 닫기', async ({ page }) => {
    console.log('\n=== 모달 닫기 ===');

    // 설정 열기
    const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await page.waitForTimeout(500);

      const settingsMenu = page.locator('[role="menuitem"]:has-text("설정")').first();
      if (await settingsMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsMenu.click();
        await page.waitForTimeout(1000);
      }
    }

    // 설정 모달 확인
    const settingsModal = page.locator('.account-settings-modal, .settings-modal, [class*="settings"]').first();
    if (!await settingsModal.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('설정 모달이 열리지 않음');
      return;
    }

    // 닫기 버튼 클릭
    const closeButton = page.locator('.settings-modal button:has-text("닫기"), [aria-label="닫기"], .close-button').first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
      console.log('닫기 버튼 클릭');
    } else {
      // ESC로 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      console.log('ESC로 닫기');
    }

    // 모달이 닫혔는지 확인
    const isClosed = !await settingsModal.isVisible({ timeout: 1000 }).catch(() => true);
    console.log(`모달 닫힘: ${isClosed ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/account-settings-06-close.png' });
  });
});

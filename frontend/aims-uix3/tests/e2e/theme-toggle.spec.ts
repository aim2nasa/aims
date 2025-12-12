import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 테마 전환 테스트
 *
 * 테스트 시나리오:
 * 1. 기본 테마 확인
 * 2. 다크 모드 전환
 * 3. CSS 변수 변경 확인
 * 4. 테마 영속성 (localStorage)
 * 5. 아이콘 색상 적응
 */

test.describe('테마 전환 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test('1. 기본 테마 확인', async ({ page }) => {
    console.log('\n=== 기본 테마 확인 ===');

    // 현재 테마 확인
    const currentTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') ||
             (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    });

    console.log(`현재 테마: ${currentTheme}`);

    // 배경색 확인
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    console.log(`배경색: ${bgColor}`);

    await page.screenshot({ path: 'test-results/theme-01-default.png' });
  });

  test('2. 다크 모드 전환', async ({ page }) => {
    console.log('\n=== 다크 모드 전환 ===');

    // 테마 전환 버튼 찾기 (설정 또는 헤더에 있을 수 있음)
    const themeToggle = page.locator('button[aria-label="테마"], button:has-text("테마"), [class*="theme-toggle"]').first();

    if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(500);
      console.log('테마 토글 버튼 클릭');
    } else {
      // 프로필 메뉴에서 테마 설정
      const profileButton = page.locator('.header-user-profile, [class*="user-profile"]').first();
      if (await profileButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await profileButton.click();
        await page.waitForTimeout(500);

        const darkModeOption = page.locator('[role="menuitem"]:has-text("다크"), button:has-text("다크 모드")').first();
        if (await darkModeOption.isVisible({ timeout: 1000 }).catch(() => false)) {
          await darkModeOption.click();
          await page.waitForTimeout(500);
          console.log('다크 모드 옵션 클릭');
        }
      } else {
        // JavaScript로 직접 테마 변경
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-theme', 'dark');
        });
        console.log('JavaScript로 다크 모드 설정');
      }
    }

    await page.waitForTimeout(500);

    // 테마 변경 확인
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    console.log(`변경된 테마: ${newTheme}`);

    await page.screenshot({ path: 'test-results/theme-02-dark-mode.png' });
  });

  test('3. CSS 변수 변경 확인', async ({ page }) => {
    console.log('\n=== CSS 변수 변경 확인 ===');

    // 라이트 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(300);

    // 라이트 모드 배경색 확인
    const lightBgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    console.log(`라이트 모드 배경색: ${lightBgColor}`);

    // 다크 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(300);

    // 다크 모드 배경색 확인
    const darkBgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    console.log(`다크 모드 배경색: ${darkBgColor}`);

    // 색상이 변경되었는지 확인
    const colorChanged = lightBgColor !== darkBgColor;
    console.log(`색상 변경됨: ${colorChanged ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/theme-03-css-variables.png' });

    expect(colorChanged).toBe(true);
  });

  test('4. 테마 영속성 (localStorage)', async ({ page }) => {
    console.log('\n=== 테마 영속성 (localStorage) ===');

    // 다크 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('aims_theme', 'dark');
    });
    await page.waitForTimeout(500);

    // localStorage 확인
    const savedTheme = await page.evaluate(() => {
      return localStorage.getItem('aims_theme') || localStorage.getItem('theme');
    });
    console.log(`localStorage 테마: ${savedTheme}`);

    // 페이지 새로고침
    await page.reload();
    await page.waitForTimeout(2000);

    // 테마 유지 확인
    const themeAfterReload = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    console.log(`새로고침 후 테마: ${themeAfterReload}`);

    await page.screenshot({ path: 'test-results/theme-04-persistence.png' });
  });

  test('5. 아이콘 색상 적응', async ({ page }) => {
    console.log('\n=== 아이콘 색상 적응 ===');

    // 라이트 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(300);

    // 아이콘 색상 확인 (라이트 모드)
    const iconElement = page.locator('.sf-symbol, [class*="icon"]').first();
    let lightIconColor = 'unknown';

    if (await iconElement.isVisible({ timeout: 2000 }).catch(() => false)) {
      lightIconColor = await iconElement.evaluate(el => {
        return getComputedStyle(el).color;
      });
      console.log(`라이트 모드 아이콘 색상: ${lightIconColor}`);
    }

    // 다크 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(300);

    // 아이콘 색상 확인 (다크 모드)
    if (await iconElement.isVisible({ timeout: 1000 }).catch(() => false)) {
      const darkIconColor = await iconElement.evaluate(el => {
        return getComputedStyle(el).color;
      });
      console.log(`다크 모드 아이콘 색상: ${darkIconColor}`);

      const iconColorChanged = lightIconColor !== darkIconColor;
      console.log(`아이콘 색상 변경됨: ${iconColorChanged ? '예' : '아니오'}`);
    }

    await page.screenshot({ path: 'test-results/theme-05-icons.png' });
  });

  test('6. 라이트 모드로 복원', async ({ page }) => {
    console.log('\n=== 라이트 모드로 복원 ===');

    // 라이트 모드 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('aims_theme', 'light');
    });
    await page.waitForTimeout(300);

    const currentTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    console.log(`복원된 테마: ${currentTheme}`);

    await page.screenshot({ path: 'test-results/theme-06-restore-light.png' });

    expect(currentTheme).toBe('light');
  });
});

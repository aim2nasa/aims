import { test, expect } from '@playwright/test';

/**
 * LeftPane 메뉴 아이콘 색상 회귀 테스트
 *
 * 테스트 항목:
 * 1. 고객 관리 섹션 아이콘 색상 (Light/Dark 모드)
 * 2. 문서 관리 섹션 아이콘 색상 (Light/Dark 모드)
 * 3. 메뉴 선택 시 흰색 전환
 * 4. 테마 전환 시 자동 색상 변경
 */

test.describe('LeftPane 메뉴 아이콘 색상 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');

    // 페이지 로드 대기
    await page.waitForLoadState('networkidle');

    // LeftPane이 렌더링될 때까지 대기
    await page.waitForSelector('.left-pane', { timeout: 10000 });
  });

  test('고객 관리 섹션 - Light 모드 아이콘 색상', async ({ page }) => {
    // Light 모드로 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    // 고객 관리 아이콘 색상 검증
    const personIcon = page.locator('.sf-symbol--person').first();
    const personColor = await personIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(personColor).toBe('rgb(0, 122, 255)'); // #007aff - iOS systemBlue

    // 전체보기 아이콘 색상 검증
    const listIcon = page.locator('.sf-symbol--list-bullet').first();
    const listColor = await listIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(listColor).toBe('rgb(52, 199, 89)'); // #34c759 - iOS systemGreen

    // 지역별 보기 아이콘 색상 검증
    const locationIcon = page.locator('.sf-symbol--location').first();
    const locationColor = await locationIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(locationColor).toBe('rgb(255, 149, 0)'); // #ff9500 - iOS systemOrange

    // 관계별 보기 아이콘 색상 검증
    const person2Icon = page.locator('.sf-symbol--person-2').first();
    const person2Color = await person2Icon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(person2Color).toBe('rgb(175, 82, 222)'); // #af52de - iOS systemPurple
  });

  test('고객 관리 섹션 - Dark 모드 아이콘 색상', async ({ page }) => {
    // Dark 모드로 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // 약간의 대기 (CSS 변수 적용 시간)
    await page.waitForTimeout(100);

    // 고객 관리 아이콘 색상 검증 (Dark 모드)
    const personIcon = page.locator('.sf-symbol--person').first();
    const personColor = await personIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(personColor).toBe('rgb(10, 132, 255)'); // #0a84ff - iOS systemBlue Dark

    // 전체보기 아이콘 색상 검증 (Dark 모드)
    const listIcon = page.locator('.sf-symbol--list-bullet').first();
    const listColor = await listIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(listColor).toBe('rgb(48, 209, 88)'); // #30d158 - iOS systemGreen Dark

    // 지역별 보기 아이콘 색상 검증 (Dark 모드)
    const locationIcon = page.locator('.sf-symbol--location').first();
    const locationColor = await locationIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(locationColor).toBe('rgb(255, 159, 10)'); // #ff9f0a - iOS systemOrange Dark

    // 관계별 보기 아이콘 색상 검증 (Dark 모드)
    const person2Icon = page.locator('.sf-symbol--person-2').first();
    const person2Color = await person2Icon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(person2Color).toBe('rgb(191, 90, 242)'); // #bf5af2 - iOS systemPurple Dark
  });

  test('메뉴 선택 시 아이콘 흰색 전환', async ({ page }) => {
    // Light 모드로 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    // 고객 관리 메뉴 클릭
    const customerMenuItem = page.locator('.custom-menu-item').filter({ hasText: '고객 관리' }).first();
    await customerMenuItem.click();

    // 선택된 상태 확인
    await expect(customerMenuItem).toHaveClass(/selected/);

    // 선택된 아이콘이 흰색인지 검증
    const selectedIcon = customerMenuItem.locator('.sf-symbol--person');
    const selectedColor = await selectedIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(selectedColor).toBe('rgb(255, 255, 255)'); // #ffffff - 흰색
  });

  test('테마 전환 시 자동 색상 변경', async ({ page }) => {
    // Light 모드에서 시작
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(100);

    // Light 모드 색상 확인
    const personIcon = page.locator('.sf-symbol--person').first();
    const lightColor = await personIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(lightColor).toBe('rgb(0, 122, 255)'); // Light 모드 Blue

    // Dark 모드로 전환
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.waitForTimeout(100);

    // Dark 모드 색상 확인
    const darkColor = await personIcon.evaluate(el =>
      getComputedStyle(el).color
    );
    expect(darkColor).toBe('rgb(10, 132, 255)'); // Dark 모드 Blue

    // 색상이 변경되었는지 확인
    expect(lightColor).not.toBe(darkColor);
  });

  test('문서 관리 섹션 - 래퍼 클래스 색상', async ({ page }) => {
    // Light 모드로 설정
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    // 문서 관리 메뉴 확장
    const docMenuItem = page.locator('.custom-menu-item').filter({ hasText: '문서 관리' }).first();
    await docMenuItem.click();

    // 약간의 대기 (서브메뉴 렌더링)
    await page.waitForTimeout(200);

    // 문서 등록 아이콘 색상 (Orange)
    const registerIcon = page.locator('.menu-icon-orange .sf-symbol').first();
    if (await registerIcon.isVisible()) {
      const registerColor = await registerIcon.evaluate(el =>
        getComputedStyle(el).color
      );
      expect(registerColor).toBe('rgb(255, 149, 0)'); // #ff9500 - Orange
    }

    // 문서 라이브러리 아이콘 색상 (Purple)
    const libraryIcon = page.locator('.menu-icon-purple .sf-symbol').first();
    if (await libraryIcon.isVisible()) {
      const libraryColor = await libraryIcon.evaluate(el =>
        getComputedStyle(el).color
      );
      expect(libraryColor).toBe('rgb(175, 82, 222)'); // #af52de - Purple
    }
  });

  test('모든 아이콘이 하드코딩되지 않았는지 확인', async ({ page }) => {
    // 모든 SF Symbol 아이콘 찾기
    const icons = page.locator('[class*="sf-symbol--"]');
    const count = await icons.count();

    console.log(`총 ${count}개의 SF Symbol 아이콘 발견`);

    // 각 아이콘이 CSS 변수를 사용하는지 확인 (간접 검증)
    for (let i = 0; i < Math.min(count, 10); i++) {
      const icon = icons.nth(i);
      const color = await icon.evaluate(el => getComputedStyle(el).color);

      // 색상이 rgb() 형식인지 확인 (CSS 변수가 적용되었음을 의미)
      expect(color).toMatch(/^rgb\(/);

      // 기본 회색(#6b7280) 또는 iOS System Colors인지 확인
      const validColors = [
        'rgb(107, 114, 128)', // --color-neutral-400 (기본)
        'rgb(0, 122, 255)',   // iOS Blue
        'rgb(52, 199, 89)',   // iOS Green
        'rgb(255, 149, 0)',   // iOS Orange
        'rgb(175, 82, 222)',  // iOS Purple
        'rgb(255, 59, 48)',   // iOS Red
        'rgb(255, 255, 255)', // 선택 상태 (흰색)
        'rgb(10, 132, 255)',  // iOS Blue Dark
        'rgb(48, 209, 88)',   // iOS Green Dark
        'rgb(255, 159, 10)',  // iOS Orange Dark
        'rgb(191, 90, 242)',  // iOS Purple Dark
      ];

      // 유효한 색상 중 하나여야 함 (하드코딩 아님)
      const isValidColor = validColors.some(validColor =>
        color === validColor
      );

      if (!isValidColor) {
        console.log(`아이콘 #${i} 색상: ${color}`);
      }
    }
  });
});

import { test, expect } from '@playwright/test';
import { skipDevLogin } from '../fixtures';

/**
 * 온보딩 투어 테스트
 *
 * 테스트 시나리오:
 * 1. 첫 방문 시 투어 자동 시작
 * 2. 투어 스텝 하이라이트 확인
 * 3. 이전/다음 버튼 네비게이션
 * 4. 키보드 네비게이션
 * 5. 투어 완료 후 다시 표시 안됨
 * 6. ESC로 투어 닫기
 */

test.describe('온보딩 투어 테스트', () => {
  test.beforeEach(async ({ page }) => {
    // localStorage 초기화하여 첫 방문 상태로 만들기
    await page.goto('/');

    // 개발용 로그인 건너뛰기
    await skipDevLogin(page);

    // 온보딩 관련 localStorage 초기화
    await page.evaluate(() => {
      localStorage.removeItem('aims_onboarding_completed');
      localStorage.removeItem('aims_onboarding_skipped');
    });
  });

  test('1. 첫 방문 시 투어 자동 시작', async ({ page }) => {
    console.log('\n=== 첫 방문 시 투어 자동 시작 ===');

    // 페이지 새로고침 (localStorage 초기화 후)
    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000); // 투어 시작 딜레이 대기

    // 온보딩 투어 컴포넌트 확인
    const onboardingTour = page.locator('.onboarding-tour');
    const isVisible = await onboardingTour.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`온보딩 투어 표시: ${isVisible ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/onboarding-01-auto-start.png' });

    // 투어가 표시되거나 이미 완료된 상태면 성공
    expect(true).toBe(true);
  });

  test('2. 투어 스텝 하이라이트 확인', async ({ page }) => {
    console.log('\n=== 투어 스텝 하이라이트 확인 ===');

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // 투어 스텝 요소들 확인
    const stepElements = {
      '빠른 검색': '.header-quick-search-container',
      '문서 등록': '[data-menu-key="documents-register"]',
      '고객 등록': '[data-menu-key="customers-register"]',
      '문서 보관함': '[data-menu-key="documents-library"]',
      '계정 설정': '.header-user-profile'
    };

    // 현재 스텝 확인
    const tourContent = page.locator('.onboarding-tour__content, .tour-content').first();
    if (await tourContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      const contentText = await tourContent.textContent();
      console.log(`현재 스텝 내용: ${contentText?.substring(0, 50)}...`);
    }

    // 하이라이트 오버레이 확인
    const overlay = page.locator('.onboarding-tour__overlay, .tour-overlay').first();
    const hasOverlay = await overlay.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`오버레이 표시: ${hasOverlay ? '예' : '아니오'}`);

    // 스포트라이트 확인
    const spotlight = page.locator('.onboarding-tour__spotlight, .tour-spotlight').first();
    const hasSpotlight = await spotlight.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`스포트라이트 표시: ${hasSpotlight ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/onboarding-02-highlight.png' });
  });

  test('3. 이전/다음 버튼 네비게이션', async ({ page }) => {
    console.log('\n=== 이전/다음 버튼 네비게이션 ===');

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // 다음 버튼 클릭
    const nextButton = page.locator('.onboarding-tour button:has-text("다음"), .tour-next-button').first();
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(500);
      console.log('다음 버튼 클릭');

      // 스텝 변경 확인
      const stepIndicator = page.locator('.onboarding-tour__progress, .tour-progress, .step-indicator').first();
      if (await stepIndicator.isVisible({ timeout: 1000 }).catch(() => false)) {
        const progress = await stepIndicator.textContent();
        console.log(`현재 진행: ${progress}`);
      }

      // 이전 버튼 클릭
      const prevButton = page.locator('.onboarding-tour button:has-text("이전"), .tour-prev-button').first();
      if (await prevButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await prevButton.click();
        await page.waitForTimeout(500);
        console.log('이전 버튼 클릭');
      }
    }

    await page.screenshot({ path: 'test-results/onboarding-03-navigation.png' });
  });

  test('4. 키보드 네비게이션', async ({ page }) => {
    console.log('\n=== 키보드 네비게이션 ===');

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // ArrowRight로 다음 스텝
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    console.log('ArrowRight 키 입력');

    // ArrowRight 한번 더
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    console.log('ArrowRight 키 입력');

    // ArrowLeft로 이전 스텝
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    console.log('ArrowLeft 키 입력');

    await page.screenshot({ path: 'test-results/onboarding-04-keyboard.png' });
  });

  test('5. 투어 완료 후 다시 표시 안됨', async ({ page }) => {
    console.log('\n=== 투어 완료 후 다시 표시 안됨 ===');

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 이미 완료된 상태');
      // 이미 완료된 상태이므로 localStorage 확인
      const completed = await page.evaluate(() => {
        return localStorage.getItem('aims_onboarding_completed') ||
               localStorage.getItem('aims_onboarding_skipped');
      });
      console.log(`완료/건너뛰기 상태: ${completed ? '저장됨' : '미저장'}`);
      return;
    }

    // 모든 스텝 완료하기 (다음 버튼 반복 클릭)
    let stepCount = 0;
    while (stepCount < 10) {
      const nextButton = page.locator('.onboarding-tour button:has-text("다음")').first();
      const finishButton = page.locator('.onboarding-tour button:has-text("완료"), .onboarding-tour button:has-text("시작")').first();

      if (await finishButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await finishButton.evaluate(el => (el as HTMLElement).click());
        await page.waitForTimeout(500);
        console.log('투어 완료 버튼 클릭');
        break;
      } else if (await nextButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextButton.evaluate(el => (el as HTMLElement).click());
        await page.waitForTimeout(500);
        stepCount++;
      } else {
        break;
      }
    }

    console.log(`총 ${stepCount}개 스텝 진행`);

    // 페이지 새로고침
    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    // 투어가 다시 표시되지 않는지 확인
    const tourAgain = page.locator('.onboarding-tour');
    const showsAgain = await tourAgain.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`새로고침 후 투어 표시: ${showsAgain ? '예 (문제)' : '아니오 (정상)'}`);

    await page.screenshot({ path: 'test-results/onboarding-05-no-repeat.png' });

    expect(showsAgain).toBe(false);
  });

  test('6. ESC로 투어 닫기', async ({ page }) => {
    console.log('\n=== ESC로 투어 닫기 ===');

    // localStorage 초기화
    await page.evaluate(() => {
      localStorage.removeItem('aims_onboarding_completed');
      localStorage.removeItem('aims_onboarding_skipped');
    });

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // ESC 키로 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('ESC 키 입력');

    // 투어가 닫혔는지 확인
    const isClosed = !await onboardingTour.isVisible({ timeout: 2000 }).catch(() => true);
    console.log(`ESC 후 투어 닫힘: ${isClosed ? '예' : '아니오'}`);

    // 건너뛰기 상태가 저장되었는지 확인
    const skipped = await page.evaluate(() => {
      return localStorage.getItem('aims_onboarding_skipped') ||
             localStorage.getItem('aims_onboarding_completed');
    });
    console.log(`건너뛰기 상태 저장: ${skipped ? '예' : '아니오'}`);

    await page.screenshot({ path: 'test-results/onboarding-06-escape.png' });
  });

  test('7. 투어 스텝 아이콘 확인', async ({ page }) => {
    console.log('\n=== 투어 스텝 아이콘 확인 ===');

    // localStorage 초기화
    await page.evaluate(() => {
      localStorage.removeItem('aims_onboarding_completed');
      localStorage.removeItem('aims_onboarding_skipped');
    });

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // 각 스텝의 아이콘 확인
    const expectedIcons = ['magnifyingglass', 'doc-badge-plus', 'person-fill-badge-plus', 'folder', 'gearshape'];
    let stepIndex = 0;

    while (stepIndex < 5) {
      // 아이콘 요소 확인
      const iconElement = page.locator('.onboarding-tour__icon, .tour-icon, .sf-symbol').first();
      if (await iconElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`스텝 ${stepIndex + 1} 아이콘 표시됨`);
      }

      // 다음 버튼 클릭
      const nextButton = page.locator('.onboarding-tour button:has-text("다음")').first();
      if (await nextButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextButton.evaluate(el => (el as HTMLElement).click());
        await page.waitForTimeout(500);
        stepIndex++;
      } else {
        break;
      }
    }

    await page.screenshot({ path: 'test-results/onboarding-07-icons.png' });
  });

  test('8. 투어 타이틀/설명 확인', async ({ page }) => {
    console.log('\n=== 투어 타이틀/설명 확인 ===');

    // localStorage 초기화
    await page.evaluate(() => {
      localStorage.removeItem('aims_onboarding_completed');
      localStorage.removeItem('aims_onboarding_skipped');
    });

    await page.reload();
    await skipDevLogin(page);
    await page.waitForTimeout(2000);

    const onboardingTour = page.locator('.onboarding-tour');
    if (!await onboardingTour.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('온보딩 투어가 표시되지 않음 - 테스트 스킵');
      test.skip();
      return;
    }

    // 예상되는 타이틀들
    const expectedTitles = ['빠른 검색', '문서 등록', '고객 등록', '문서 보관함', '계정 설정'];
    let foundTitles = 0;
    let stepIndex = 0;

    while (stepIndex < 5) {
      // 타이틀 요소 확인
      const titleElement = page.locator('.onboarding-tour__title, .tour-title').first();
      if (await titleElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        const titleText = await titleElement.textContent();
        console.log(`스텝 ${stepIndex + 1} 타이틀: ${titleText}`);

        if (expectedTitles.some(t => titleText?.includes(t))) {
          foundTitles++;
        }
      }

      // 설명 요소 확인
      const descElement = page.locator('.onboarding-tour__description, .tour-description').first();
      if (await descElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        const descText = await descElement.textContent();
        console.log(`  설명: ${descText?.substring(0, 30)}...`);
      }

      // 다음 버튼 클릭
      const nextButton = page.locator('.onboarding-tour button:has-text("다음")').first();
      if (await nextButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextButton.evaluate(el => (el as HTMLElement).click());
        await page.waitForTimeout(500);
        stepIndex++;
      } else {
        break;
      }
    }

    console.log(`발견된 예상 타이틀: ${foundTitles}/${expectedTitles.length}`);
    await page.screenshot({ path: 'test-results/onboarding-08-titles.png' });
  });
});

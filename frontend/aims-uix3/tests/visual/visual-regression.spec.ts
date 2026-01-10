import { test, expect } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * 시각적 회귀 테스트 (Visual Regression Testing)
 *
 * Playwright의 toHaveScreenshot()을 사용하여 UI 변경 감지
 * - 베이스라인 스크린샷과 현재 스크린샷 비교
 * - CSS 변경, 레이아웃 변경 자동 감지
 *
 * 최초 실행 시: --update-snapshots 플래그로 베이스라인 생성
 * npx playwright test tests/visual --update-snapshots
 */

test.describe('시각적 회귀 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.waitForLoadState('networkidle');
    // 애니메이션 완료 대기
    await page.waitForTimeout(1000);
  });

  test('1. 메인 대시보드 레이아웃', async ({ page }) => {
    // 동적 콘텐츠 마스킹 (날짜, 카운터 등)
    await page.evaluate(() => {
      // 날짜/시간 요소 숨기기
      document.querySelectorAll('[data-testid="date"], .date-display, .timestamp').forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });

    await expect(page).toHaveScreenshot('dashboard-main.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.01, // 1% 픽셀 차이 허용
      threshold: 0.2, // 픽셀별 색상 차이 허용치
    });
  });

  test('2. LeftPane 네비게이션 메뉴', async ({ page }) => {
    const leftPane = page.locator('.layout-leftpane');
    await expect(leftPane).toBeVisible();

    await expect(leftPane).toHaveScreenshot('leftpane-menu.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('3. 고객 목록 테이블', async ({ page }) => {
    // 고객 전체보기로 이동
    const customerMenu = page.locator('[data-menu-key="customers-all"], text=전체 고객').first();
    if (await customerMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customerMenu.click();
      await page.waitForTimeout(2000);
    }

    // 고객 목록 영역만 캡처
    const centerPane = page.locator('.layout-centerpane');
    await expect(centerPane).toBeVisible();

    // 동적 데이터 마스킹
    await page.evaluate(() => {
      // 생성일, 수정일 등 날짜 컬럼 마스킹
      document.querySelectorAll('td[data-column="createdAt"], td[data-column="updatedAt"]').forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });

    await expect(centerPane).toHaveScreenshot('customer-list.png', {
      maxDiffPixelRatio: 0.02, // 데이터 변경 고려하여 2% 허용
    });
  });

  test('4. 고객 등록 폼', async ({ page }) => {
    // 새 고객 등록으로 이동
    const registerMenu = page.locator('[data-menu-key="customers-register"], text=새 고객 등록').first();
    if (await registerMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerMenu.click();
      await page.waitForTimeout(2000);
    }

    const centerPane = page.locator('.layout-centerpane');
    await expect(centerPane).toBeVisible();

    await expect(centerPane).toHaveScreenshot('customer-registration-form.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('5. AI 어시스턴트 패널', async ({ page }) => {
    // AI 채팅 버튼 클릭
    const chatButton = page.locator('.header-chat-button, button[aria-label*="AI"]').first();
    if (await chatButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(2000);
    }

    // RightPane (AI 패널) 캡처
    const rightPane = page.locator('.layout-rightpane, .ai-assistant-panel');
    if (await rightPane.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(rightPane).toHaveScreenshot('ai-assistant-panel.png', {
        maxDiffPixelRatio: 0.01,
      });
    }
  });

  test('6. 문서 검색 뷰', async ({ page }) => {
    const searchMenu = page.locator('[data-menu-key="documents-search"], text=문서 검색').first();
    if (await searchMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchMenu.click();
      await page.waitForTimeout(2000);
    }

    const centerPane = page.locator('.layout-centerpane');
    await expect(centerPane).toBeVisible();

    await expect(centerPane).toHaveScreenshot('document-search-view.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('7. 계약 목록 테이블', async ({ page }) => {
    const contractMenu = page.locator('[data-menu-key="contracts-all"], text=전체 계약').first();
    if (await contractMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await contractMenu.click();
      await page.waitForTimeout(2000);
    }

    const centerPane = page.locator('.layout-centerpane');
    await expect(centerPane).toBeVisible();

    // 동적 데이터 마스킹
    await page.evaluate(() => {
      document.querySelectorAll('.contract-date, .premium-amount').forEach(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
    });

    await expect(centerPane).toHaveScreenshot('contract-list.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('8. 버튼 컴포넌트 스타일', async ({ page }) => {
    // 버튼들이 있는 페이지로 이동 (고객 등록)
    const registerMenu = page.locator('[data-menu-key="customers-register"], text=새 고객 등록').first();
    if (await registerMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerMenu.click();
      await page.waitForTimeout(2000);
    }

    // Primary 버튼 캡처
    const primaryButton = page.locator('button.btn-primary, button[data-variant="primary"]').first();
    if (await primaryButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(primaryButton).toHaveScreenshot('button-primary.png', {
        maxDiffPixelRatio: 0.01,
      });
    }

    // Secondary 버튼 캡처
    const secondaryButton = page.locator('button.btn-secondary, button[data-variant="secondary"]').first();
    if (await secondaryButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(secondaryButton).toHaveScreenshot('button-secondary.png', {
        maxDiffPixelRatio: 0.01,
      });
    }
  });

  test('9. 모달 다이얼로그', async ({ page }) => {
    // 모달을 트리거할 수 있는 액션 수행
    // 예: 고객 수정 버튼 클릭
    const customerMenu = page.locator('[data-menu-key="customers-all"], text=전체 고객').first();
    if (await customerMenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customerMenu.click();
      await page.waitForTimeout(2000);
    }

    // 첫 번째 고객의 수정 버튼 클릭
    const editButton = page.locator('button[aria-label*="수정"], button:has-text("수정")').first();
    if (await editButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(1000);

      // 모달 캡처
      const modal = page.locator('.modal, [role="dialog"]').first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(modal).toHaveScreenshot('modal-dialog.png', {
          maxDiffPixelRatio: 0.01,
        });

        // 모달 닫기
        await page.keyboard.press('Escape');
      }
    }
  });

  test('10. 반응형 레이아웃 (태블릿)', async ({ page }) => {
    // 태블릿 뷰포트로 변경
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('responsive-tablet.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('11. 반응형 레이아웃 (모바일)', async ({ page }) => {
    // 모바일 뷰포트로 변경
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot('responsive-mobile.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });
});

/**
 * 컴포넌트별 시각적 테스트
 */
test.describe('컴포넌트 시각적 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await page.waitForLoadState('networkidle');
  });

  test('Header 컴포넌트', async ({ page }) => {
    const header = page.locator('header, .app-header, .layout-header').first();
    if (await header.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(header).toHaveScreenshot('component-header.png', {
        maxDiffPixelRatio: 0.01,
      });
    }
  });

  test('Tooltip 컴포넌트', async ({ page }) => {
    // 툴팁이 있는 요소에 호버
    const tooltipTrigger = page.locator('[data-tooltip], [title]').first();
    if (await tooltipTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tooltipTrigger.hover();
      await page.waitForTimeout(500);

      // 툴팁이 표시되면 캡처
      const tooltip = page.locator('.tooltip, [role="tooltip"]').first();
      if (await tooltip.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(tooltip).toHaveScreenshot('component-tooltip.png', {
          maxDiffPixelRatio: 0.01,
        });
      }
    }
  });

  test('아이콘 색상 일관성', async ({ page }) => {
    // 사이드바 메뉴 아이콘들 캡처
    const menuIcons = page.locator('.custom-menu-item svg, .menu-icon');

    const iconCount = await menuIcons.count();
    console.log(`메뉴 아이콘 수: ${iconCount}개`);

    if (iconCount > 0) {
      // 첫 번째 몇 개 아이콘만 개별 캡처
      for (let i = 0; i < Math.min(iconCount, 5); i++) {
        const icon = menuIcons.nth(i);
        if (await icon.isVisible().catch(() => false)) {
          await expect(icon).toHaveScreenshot(`icon-menu-${i}.png`, {
            maxDiffPixelRatio: 0.01,
          });
        }
      }
    }
  });
});

/**
 * 다크 모드 시각적 테스트 (향후 구현 시)
 */
test.describe.skip('다크 모드 시각적 테스트', () => {
  test('대시보드 다크 모드', async ({ page }) => {
    await loginAndSetup(page);

    // 다크 모드 활성화 (구현 시)
    // await page.click('[data-testid="theme-toggle"]');
    // await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('dashboard-dark-mode.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.01,
    });
  });
});

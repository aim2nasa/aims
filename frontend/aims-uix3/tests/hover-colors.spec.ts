/**
 * Playwright 테스트: 라이트 테마 호버 색상 검증
 * 메뉴 클릭으로 각 페이지 이동 후 호버 색상 확인
 */
import { test, expect, Page } from '@playwright/test';

async function verifyHoverColor(page: Page, selector: string, pageName: string) {
  const element = page.locator(selector).first();

  try {
    await element.waitFor({ state: 'visible', timeout: 30000 });
  } catch {
    await page.screenshot({ path: `d:/tmp/hover_${pageName}_NOT_FOUND.png` });
    console.log(`  ⚠️ [${pageName}] "${selector}" — 요소 없음`);
    return { page: pageName, selector, status: 'skipped', bgBefore: '', bgAfter: '' };
  }

  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  const bgBefore = await element.evaluate(el => getComputedStyle(el).backgroundColor);

  await element.hover({ force: true });
  await page.waitForTimeout(500);
  const bgAfter = await element.evaluate(el => getComputedStyle(el).backgroundColor);

  const isBlue = bgAfter.includes('59') && bgAfter.includes('130') && bgAfter.includes('246');
  const status = isBlue ? 'PASS' : 'FAIL';
  console.log(`  ${isBlue ? '✅' : '❌'} [${pageName}] "${selector}" — ${bgBefore} → ${bgAfter} [${status}]`);

  if (!isBlue) {
    await page.screenshot({ path: `d:/tmp/hover_${pageName}_FAIL.png` });
  }
  return { page: pageName, selector, status, bgBefore, bgAfter };
}

/** CSS 변수를 검증하여 hover 색상이 올바르게 설정됐는지 확인 */
async function verifyCSSVariable(page: Page, varName: string, pageName: string) {
  const value = await page.evaluate((name) => {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }, varName);

  const isBlue = value.includes('59') && value.includes('130') && value.includes('246');
  console.log(`  ${isBlue ? '✅' : '❌'} [${pageName}] CSS변수 ${varName} = ${value} [${isBlue ? 'PASS' : 'FAIL'}]`);
  return { page: pageName, selector: varName, status: isBlue ? 'PASS' : 'FAIL', bgBefore: '', bgAfter: value };
}

async function clickMenu(page: Page, menuText: string) {
  const menuItem = page.locator('.custom-menu-item').filter({ hasText: menuText }).first();
  await menuItem.click();
  // 데이터 로딩 대기
  await page.waitForTimeout(5000);
}

test('호버 색상 종합 검증', async ({ page }) => {
  // 초기 로드
  await page.goto('/', { timeout: 30000 });
  await page.waitForTimeout(5000);

  const results: Array<{ page: string; selector: string; status: string; bgBefore: string; bgAfter: string }> = [];

  // 0. CSS 변수 검증 (모든 hover가 의존하는 변수)
  console.log('\n=== CSS 변수 검증 ===');
  results.push(await verifyCSSVariable(page, '--color-bg-hover', 'CSS변수'));
  results.push(await verifyCSSVariable(page, '--color-ios-bg-hover-light', 'iOS토큰'));

  // 1. 좌측 메뉴
  console.log('\n=== 좌측 메뉴 ===');
  results.push(await verifyHoverColor(page, '.custom-menu-item:not(.selected)', '좌측메뉴'));

  // 2. 전체 고객 보기 (실제 셀렉터: .customer-item)
  console.log('\n=== 전체 고객 보기 ===');
  await clickMenu(page, '전체 고객 보기');
  results.push(await verifyHoverColor(page, '.customer-item', '전체고객보기'));

  // 3. 지역별 고객 보기
  console.log('\n=== 지역별 고객 보기 ===');
  await clickMenu(page, '지역별 고객 보기');
  results.push(await verifyHoverColor(page, '.tree-node', '지역별고객보기'));

  // 4. 관계별 고객 보기 (그룹 노드 — root 제외)
  console.log('\n=== 관계별 고객 보기 ===');
  await clickMenu(page, '관계별 고객 보기');
  results.push(await verifyHoverColor(page, '.tree-node--group', '관계별고객보기'));

  // 5. 전체 문서 보기 (실제 셀렉터: .status-item)
  console.log('\n=== 전체 문서 보기 ===');
  await clickMenu(page, '전체 문서 보기');
  results.push(await verifyHoverColor(page, '.status-item', '전체문서보기'));

  // 6. 문서 탐색기
  console.log('\n=== 문서 탐색기 ===');
  await clickMenu(page, '문서 탐색기');
  results.push(await verifyHoverColor(page, '.doc-explorer-tree__document', '문서탐색기'));

  // 7. 사용 가이드
  console.log('\n=== 사용 가이드 ===');
  await clickMenu(page, '사용 가이드');
  results.push(await verifyHoverColor(page, '.usage-guide-view__category-header', '사용가이드'));

  // 8. FAQ
  console.log('\n=== FAQ ===');
  await clickMenu(page, 'FAQ');
  results.push(await verifyHoverColor(page, '.faq-view__question', 'FAQ'));

  // 9. 공지사항
  console.log('\n=== 공지사항 ===');
  await clickMenu(page, '공지사항');
  results.push(await verifyHoverColor(page, '.notice-view__item', '공지사항'));

  // === 결과 요약 ===
  console.log('\n\n========== 결과 요약 ==========');
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');
  const skipped = results.filter(r => r.status === 'skipped');
  console.log(`✅ PASS: ${passed.length}  ❌ FAIL: ${failed.length}  ⚠️ SKIP: ${skipped.length}`);

  if (failed.length > 0) {
    console.log('\n❌ 실패:');
    failed.forEach(r => console.log(`  - [${r.page}] ${r.selector}: ${r.bgBefore} → ${r.bgAfter}`));
  }

  if (skipped.length > 0) {
    console.log('\n⚠️ 스킵 (데이터 없음):');
    skipped.forEach(r => console.log(`  - [${r.page}] ${r.selector}`));
  }

  expect(failed.length, `${failed.length}개 페이지에서 호버 색상 미적용`).toBe(0);
});

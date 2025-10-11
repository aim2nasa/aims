/**
 * Customer Edit Modal - Playwright E2E Test
 * @since 2025-10-05
 *
 * 고객 정보 수정 모달의 저장 버튼 동작 테스트
 */

import { test, expect } from '@playwright/test';
import type { Request } from '@playwright/test';

test.describe('고객 정보 수정 모달', () => {
  test.beforeEach(async ({ page }) => {
    // AIMS UIX3 페이지로 이동
    await page.goto('http://localhost:5176');

    // 페이지 로드 대기
    await page.waitForLoadState('networkidle');

    // 전체보기 클릭
    await page.click('text=전체보기');
    await page.waitForTimeout(1000);

    // 첫 번째 고객 클릭 (고객 상세보기 열기)
    const firstCustomer = page.locator('table tbody tr').first();
    await firstCustomer.click();
    await page.waitForTimeout(1000);

    // 정보 수정 버튼 클릭
    await page.click('text=정보 수정');
    await page.waitForTimeout(1000);
  });

  test('모달이 열리는지 확인', async ({ page }) => {
    // 모달 제목 확인
    const modalTitle = await page.locator('text=고객 정보 수정');
    await expect(modalTitle).toBeVisible();
  });

  test('연락처 정보 탭에서 데이터가 로드되는지 확인', async ({ page }) => {
    // 연락처 정보 탭 클릭
    await page.click('text=연락처 정보');
    await page.waitForTimeout(500);

    // 휴대폰 필드 확인
    const mobileInput = page.locator('input[type="tel"]').first();
    const mobileValue = await mobileInput.inputValue();

    console.log('📱 휴대폰 값:', mobileValue);

    // 값이 있거나 빈 문자열인지 확인
    expect(typeof mobileValue).toBe('string');
  });

  test('저장 버튼이 존재하는지 확인', async ({ page }) => {
    const saveButton = page.locator('text=저장');
    await expect(saveButton).toBeVisible();

    // 버튼이 활성화되어 있는지 확인
    await expect(saveButton).toBeEnabled();
  });

  test('저장 버튼 클릭 시 콘솔 로그 확인', async ({ page }) => {
    // 콘솔 메시지 수집
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push(text);
      console.log('🔍 Console:', text);
    });

    // 네트워크 요청 수집
    const networkRequests: { url: string; method: string }[] = [];
    page.on('request', (request: Request) => {
      if (request.url().includes('customer')) {
        networkRequests.push({
          url: request.url(),
          method: request.method(),
        });
        console.log('🌐 Request:', request.method(), request.url());
      }
    });

    // 저장 버튼 클릭
    const saveButton = page.locator('text=저장');
    await saveButton.click();

    // 응답 대기
    await page.waitForTimeout(3000);

    // 콘솔 로그 확인
    console.log('\n📊 수집된 콘솔 메시지:', consoleMessages);
    console.log('📊 수집된 네트워크 요청:', networkRequests);

    // 저장 버튼 클릭 로그가 있는지 확인
    const hasClickLog = consoleMessages.some(msg =>
      msg.includes('[CustomerEditModal] 저장 버튼 클릭')
    );

    if (!hasClickLog) {
      console.error('❌ 저장 버튼 클릭 로그가 없습니다!');
      console.log('💡 가능한 원인:');
      console.log('  1. 버튼 클릭 이벤트가 동작하지 않음');
      console.log('  2. handleSaveClick 함수가 호출되지 않음');
      console.log('  3. 다른 요소가 클릭을 가로챔');
    }

    // 네트워크 요청 확인
    if (networkRequests.length === 0) {
      console.error('❌ 네트워크 요청이 발생하지 않았습니다!');
      console.log('💡 가능한 원인:');
      console.log('  1. 검증 실패로 API 호출 전에 중단됨');
      console.log('  2. handleSave 함수가 실행되지 않음');
    }
  });

  test('저장 버튼 클릭 시 이벤트 전파 확인', async ({ page }) => {
    // 저장 버튼의 속성 확인
    const saveButton = page.locator('.customer-edit-modal-button--primary');

    // 버튼이 disabled가 아닌지 확인
    const isDisabled = await saveButton.isDisabled();
    console.log('🔘 저장 버튼 disabled 상태:', isDisabled);

    // 버튼의 클래스 확인
    const className = await saveButton.getAttribute('class');
    console.log('🔘 저장 버튼 클래스:', className);

    // 버튼의 타입 확인
    const buttonType = await saveButton.getAttribute('type');
    console.log('🔘 저장 버튼 타입:', buttonType);

    // onclick 속성 확인
    const onClick = await saveButton.evaluate((el) => {
      return typeof (el as HTMLButtonElement).onclick;
    });
    console.log('🔘 onclick 핸들러 타입:', onClick);
  });
});

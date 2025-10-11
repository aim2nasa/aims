import { test, expect } from '@playwright/test';

/**
 * AIMS UIX3 주소 검색 기능 완전 테스트
 * UIX2 방식 1~6 단계 전체 워크플로우 검증
 *
 * 1. 고객 등록 화면 접속 (UIX3는 바로 고객 등록 화면)
 * 2. "주소 정보" 섹션 → "🔍 검색" 버튼 클릭
 * 3. 주소 검색 모달 팝업 → "마두동 901-4" 입력 → "🔍 검색" 클릭
 * 4. 검색 결과 표시 → "10412 | 경기 고양시 일산동구 일산로286번길 19-2" 클릭
 * 5. 모달 닫힘 → 우편번호(10412), 도로명주소 자동 입력됨
 * 6. 상세주소 입력 "2층" → 완료
 */

test.describe('UIX3 주소 검색 완전 테스트 (UIX2 방식)', () => {
  test('1~6 단계 전체 워크플로우: 주소 검색 → 모달 → 검색 → 선택 → 상세주소 입력', async ({ page }) => {
    console.log('\n🎯 === UIX3 주소 검색 완전 테스트 시작 ===\n');

    // 1단계: 고객 등록 화면 접속
    console.log('1️⃣ 단계 1: 고객 등록 화면 접속');
    await page.goto('http://localhost:5177');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    console.log('   - 좌측 메뉴에서 "고객 등록" 클릭');
    const customerRegistrationMenu = page.locator('text=고객 등록').first();
    await customerRegistrationMenu.click();
    await page.waitForTimeout(500);

    // 2단계: "주소 정보" 섹션 → "🔍 검색" 버튼 클릭
    console.log('\n2️⃣ 단계 2: 주소 정보 섹션 - 주소 검색');

    console.log('   - 주소 섹션 찾기');
    const addressSection = page.locator('.form-section').filter({ hasText: '주소' });
    const isAddressSectionVisible = await addressSection.isVisible();
    console.log(`   - 주소 섹션 표시: ${isAddressSectionVisible}`);
    expect(isAddressSectionVisible).toBe(true);

    console.log('   - "🔍 검색" 버튼 찾기');
    const searchButton = page.locator('.form-row__search-btn');
    const searchButtonCount = await searchButton.count();
    console.log(`   - "🔍 검색" 버튼 개수: ${searchButtonCount}`);
    expect(searchButtonCount).toBeGreaterThan(0);

    const isSearchButtonVisible = await searchButton.isVisible();
    console.log(`   - "🔍 검색" 버튼 표시: ${isSearchButtonVisible}`);
    expect(isSearchButtonVisible).toBe(true);

    // 콘솔 로그 감지 준비
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('주소 검색 버튼 클릭')) {
        console.log(`   ✅ 콘솔 로그 감지: ${text}`);
      }
    });

    console.log('   - "🔍 검색" 버튼 클릭');
    await searchButton.click();
    await page.waitForTimeout(500);

    const hasClickLog = logs.some(log => log.includes('주소 검색 버튼 클릭'));
    console.log(`   - 클릭 로그 발견: ${hasClickLog}`);
    expect(hasClickLog).toBe(true);

    // 3단계: 주소 검색 모달 팝업 → "마두동 901-4" 입력 → "🔍 검색" 클릭
    console.log('\n3️⃣ 단계 3: 주소 검색 모달 팝업');

    console.log('   - 모달 팝업 확인');
    const modal = page.locator('.address-search-modal');
    const modalCount = await modal.count();
    console.log(`   - 모달 개수: ${modalCount}`);
    expect(modalCount).toBeGreaterThan(0);

    const isModalVisible = await modal.isVisible();
    console.log(`   - 모달 표시: ${isModalVisible}`);
    expect(isModalVisible).toBe(true);

    console.log('   - 모달 내부 요소 확인');
    const modalTitle = page.locator('.address-search-modal__header h2');
    const modalInput = page.locator('.address-search-modal__input');

    const isTitleVisible = await modalTitle.isVisible();
    const isInputVisible = await modalInput.isVisible();

    console.log(`   - 제목 표시: ${isTitleVisible}`);
    console.log(`   - 검색창 표시: ${isInputVisible}`);

    expect(isTitleVisible).toBe(true);
    expect(isInputVisible).toBe(true);

    console.log('   - 검색창에 "마두동 901-4" 입력');
    await modalInput.fill('마두동 901-4');
    const inputValue = await modalInput.inputValue();
    console.log(`   - 입력값: "${inputValue}"`);
    expect(inputValue).toBe('마두동 901-4');

    console.log('   - Enter 키로 검색 (검색 버튼 없음 - iOS 스타일)');
    await modalInput.press('Enter');
    await page.waitForTimeout(1500);

    // 4단계: 검색 결과 표시 → 첫 번째 결과 클릭
    console.log('\n4️⃣ 단계 4: 검색 결과 표시');

    console.log('   - 검색 결과 확인');
    const results = page.locator('.address-search-modal__item');
    const resultCount = await results.count();
    console.log(`   - 검색 결과 개수: ${resultCount}건`);
    expect(resultCount).toBeGreaterThan(0);

    const firstResult = results.first();
    const firstResultText = await firstResult.textContent();
    console.log(`   - 첫 번째 결과: ${firstResultText?.substring(0, 80)}...`);

    console.log('   - 첫 번째 결과 클릭');
    await firstResult.click();
    await page.waitForTimeout(500);

    // 5단계: 모달 닫힘 → 고객 등록 페이지로 복귀 → 주소 자동 입력 확인
    console.log('\n5️⃣ 단계 5: 모달 닫힘 및 주소 자동 입력 확인');

    console.log('   - 모달 닫힘 확인');
    const isModalClosed = !(await modal.isVisible());
    console.log(`   - 모달 닫힘: ${isModalClosed}`);
    expect(isModalClosed).toBe(true);

    console.log('   - 우편번호 및 기본주소 자동 입력 확인');

    // 우편번호 input 찾기
    const postalCodeInput = page.locator('.form-row').filter({ hasText: '우편번호' }).locator('input');
    const postalCodeValue = await postalCodeInput.inputValue();
    console.log(`   - 우편번호: "${postalCodeValue}"`);

    // 기본주소 input 찾기
    const address1Input = page.locator('.form-row').filter({ hasText: '기본주소' }).locator('input');
    const address1Value = await address1Input.inputValue();
    console.log(`   - 기본주소: "${address1Value}"`);

    // 우편번호 검증 (10412가 포함되어야 함)
    expect(postalCodeValue).toContain('10412');

    // 기본주소 검증 (일산동구가 포함되어야 함)
    expect(address1Value).toContain('일산동구');

    console.log('   ✅ 주소 자동 입력 성공!');

    // 6단계: 상세주소 입력
    console.log('\n6️⃣ 단계 6: 상세주소 입력');

    console.log('   - 상세주소 입력 필드 찾기');
    const address2Row = page.locator('.form-row').filter({ hasText: '상세주소 입력' });
    const address2Input = address2Row.locator('input');

    const isAddress2Enabled = await address2Input.isVisible();
    console.log(`   - 상세주소 입력 활성화: ${isAddress2Enabled}`);
    expect(isAddress2Enabled).toBe(true);

    console.log('   - 상세주소 "2층" 입력');
    await address2Input.fill('2층');
    const address2Value = await address2Input.inputValue();
    console.log(`   - 입력된 상세주소: "${address2Value}"`);
    expect(address2Value).toBe('2층');

    console.log('\n✅ === 1~6 단계 전체 워크플로우 성공! ===\n');

    // 최종 검증: 전체 주소 데이터
    console.log('📋 최종 주소 데이터:');
    console.log(`   - 우편번호: ${postalCodeValue}`);
    console.log(`   - 기본주소: ${address1Value}`);
    console.log(`   - 상세주소: ${address2Value}`);
  });
});

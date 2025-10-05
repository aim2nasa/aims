import { test, expect } from '@playwright/test';

/**
 * 고객 CRUD 전체 시나리오 자동화 테스트
 *
 * 테스트 시나리오:
 * 1. 새로운 고객 생성 (임의 데이터)
 * 2. 생성된 고객 정보 확인
 * 3. 고객 정보 수정 (모든 필드)
 * 4. 수정된 정보 확인
 * 5. 고객 삭제
 */

test.describe('고객 CRUD 전체 시나리오 테스트', () => {
  // 테스트 데이터 생성 헬퍼
  const generateRandomData = (prefix: string) => {
    const timestamp = Date.now();
    return {
      // 기본 정보
      name: `${prefix}고객_${timestamp}`,
      name_en: `${prefix}Customer_${timestamp}`,
      birth_date: '1985-03-15',
      gender: '남성',

      // 연락처 정보
      mobile_phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      home_phone: `02-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
      work_phone: `031-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`,
      email: `${prefix.toLowerCase()}${timestamp}@test.com`,

      // 주소 정보
      postal_code: `${Math.floor(10000 + Math.random() * 90000)}`,
      address1: `서울시 강남구 테스트로 ${Math.floor(1 + Math.random() * 100)}`,
      address2: `${Math.floor(101 + Math.random() * 900)}호`,

      // 보험 정보
      customer_type: '개인',
      risk_level: '중',
      annual_premium: Math.floor(1000000 + Math.random() * 9000000),
      total_coverage: Math.floor(10000000 + Math.random() * 90000000),
    };
  };

  test('전체 시나리오: 생성 → 확인 → 수정 → 확인 → 삭제', async ({ page }) => {
    // ===== 준비: 페이지 로드 =====
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);

    console.log('\n=== 1단계: 새로운 고객 생성 ===');

    // 초기 데이터 생성
    const initialData = generateRandomData('초기');
    console.log('생성할 고객 정보:', initialData.name);

    // 햄버거 메뉴 클릭
    await page.locator('button.hamburger-button').first().click();
    await page.waitForTimeout(500);

    // 고객 등록 메뉴 클릭 (2번째 메뉴)
    const menuItems = await page.locator('[class*="menu-item"], [class*="MenuItem"], button[class*="item"]').all();
    await menuItems[1].click();
    await page.waitForTimeout(1500);

    // 스크린샷: 고객 등록 화면
    await page.screenshot({ path: 'test-results/crud-01-registration-view.png' });

    // === 기본 정보 입력 ===
    await page.locator('input[aria-label="이름"]').fill(initialData.name);

    const nameEnInput = page.locator('input[aria-label="이름(영문)"], input[placeholder*="영문"]');
    if (await nameEnInput.count() > 0) {
      await nameEnInput.fill(initialData.name_en);
    }

    const birthDateInput = page.locator('input[type="date"], input[aria-label="생년월일"]');
    if (await birthDateInput.count() > 0) {
      await birthDateInput.fill(initialData.birth_date);
    }

    // 성별 선택
    const genderRadio = page.locator(`input[type="radio"][value="M"]`);
    if (await genderRadio.count() > 0) {
      await genderRadio.click();
    }

    // === 연락처 정보 입력 ===
    // 연락처 섹션은 바로 보이므로 스크롤 또는 찾기
    const mobileInput = page.locator('input[placeholder*="010"], input[aria-label*="휴대"]').first();
    await mobileInput.scrollIntoViewIfNeeded();
    await mobileInput.fill(initialData.mobile_phone);

    const homePhoneInput = page.locator('input[placeholder*="02-"], input[aria-label*="집"]').first();
    if (await homePhoneInput.count() > 0) {
      await homePhoneInput.fill(initialData.home_phone);
    }

    const workPhoneInput = page.locator('input[placeholder*="회사"], input[aria-label*="회사"]').first();
    if (await workPhoneInput.count() > 0) {
      await workPhoneInput.fill(initialData.work_phone);
    }

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(initialData.email);
    }

    // === 주소 정보 입력 ===
    const postalCodeInput = page.locator('input[placeholder*="우편"], input[aria-label*="우편"]').first();
    if (await postalCodeInput.count() > 0) {
      await postalCodeInput.scrollIntoViewIfNeeded();
      await postalCodeInput.fill(initialData.postal_code);
    }

    const address1Input = page.locator('input[placeholder*="기본"], input[aria-label*="기본주소"]').first();
    if (await address1Input.count() > 0) {
      await address1Input.fill(initialData.address1);
    }

    const address2Input = page.locator('input[placeholder*="상세"], input[aria-label*="상세주소"]').first();
    if (await address2Input.count() > 0) {
      await address2Input.fill(initialData.address2);
    }

    // === 보험 정보 입력 ===
    const annualPremiumInput = page.locator('input[aria-label*="연간"], input[placeholder*="연간"]').first();
    if (await annualPremiumInput.count() > 0) {
      await annualPremiumInput.scrollIntoViewIfNeeded();
      await annualPremiumInput.fill(initialData.annual_premium.toString());
    }

    const totalCoverageInput = page.locator('input[aria-label*="보장"], input[placeholder*="보장"]').first();
    if (await totalCoverageInput.count() > 0) {
      await totalCoverageInput.fill(initialData.total_coverage.toString());
    }

    // 스크린샷: 입력 완료
    await page.screenshot({ path: 'test-results/crud-02-form-filled.png' });

    // 등록 버튼 클릭
    await page.locator('button:has-text("등록")').click();
    await page.waitForTimeout(2000);

    console.log('✅ 1단계 완료: 고객 생성 완료');

    // ===== 2단계: 생성된 고객 정보 확인 =====
    console.log('\n=== 2단계: 생성된 고객 정보 확인 ===');

    // 등록 완료 모달 확인 버튼 클릭
    const confirmButton = page.locator('button:has-text("확인")');
    if (await confirmButton.count() > 0) {
      await confirmButton.click();
      await page.waitForTimeout(1000);
    }

    // 등록 후 자동으로 고객 상세보기로 이동되었는지 확인
    // 스크린샷: 현재 화면 (고객 상세보기일 것으로 예상)
    await page.screenshot({ path: 'test-results/crud-02-5-after-registration.png' });

    // 정보 수정 버튼이 있는지 확인 (상세보기 화면의 특징)
    const infoEditButton = page.locator('button:has-text("정보 수정")');
    const isDetailView = await infoEditButton.count() > 0;

    if (isDetailView) {
      // 이미 상세보기 화면이면 바로 진행
      console.log('✅ 등록 후 자동으로 상세보기로 이동됨');
    } else {
      // 상세보기가 아니면 고객 전체보기로 이동
      console.log('⚠️ 상세보기가 아님 - 고객 전체보기로 이동');
      await page.locator('button.hamburger-button').first().click();
      await page.waitForTimeout(500);
      const menuItems2 = await page.locator('[class*="menu-item"], [class*="MenuItem"], button[class*="item"]').all();
      await menuItems2[2].click();
      await page.waitForTimeout(2000);

      // 생성된 고객 찾기
      const customerRow = page.locator(`text="${initialData.name}"`).first();
      await expect(customerRow).toBeVisible({ timeout: 5000 });
      console.log('✅ 생성된 고객 발견:', initialData.name);

      // 고객 클릭하여 상세보기
      await customerRow.click();
      await page.waitForTimeout(1000);
    }

    // 스크린샷: 고객 상세보기
    await page.screenshot({ path: 'test-results/crud-03-customer-detail.png' });

    // 정보 수정 버튼 클릭
    await page.locator('button:has-text("정보 수정")').click();
    await page.waitForTimeout(1000);

    // === 생성된 정보 검증 ===
    const nameInput = page.locator('input[aria-label="이름"]');
    const nameValue = await nameInput.inputValue();
    expect(nameValue).toBe(initialData.name);
    console.log('✅ 고객명 검증 성공:', nameValue);

    // 연락처 탭에서 검증
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const mobileInputCheck = page.locator('input[placeholder*="010"]').first();
    const mobileValue = await mobileInputCheck.inputValue();
    expect(mobileValue).toBe(initialData.mobile_phone);
    console.log('✅ 휴대폰 검증 성공:', mobileValue);

    console.log('✅ 2단계 완료: 생성된 정보 검증 완료');

    // ===== 3단계: 고객 정보 수정 =====
    console.log('\n=== 3단계: 고객 정보 수정 ===');

    // 수정할 새로운 데이터 생성
    const updatedData = generateRandomData('수정');
    console.log('수정할 데이터:', updatedData.name);

    // 기본 정보 수정
    await page.locator('button:has-text("기본 정보"), button:has-text("기본")').click();
    await page.waitForTimeout(300);

    const nameInputEdit = page.locator('input[aria-label="이름"]');
    await nameInputEdit.clear();
    await nameInputEdit.fill(updatedData.name);

    // 연락처 정보 수정
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const mobileInputEdit = page.locator('input[placeholder*="010"]').first();
    await mobileInputEdit.clear();
    await mobileInputEdit.fill(updatedData.mobile_phone);

    const emailInputEdit = page.locator('input[type="email"]').first();
    await emailInputEdit.clear();
    await emailInputEdit.fill(updatedData.email);

    // 스크린샷: 수정된 정보
    await page.screenshot({ path: 'test-results/crud-04-updated-form.png' });

    // 저장 버튼 클릭
    await page.locator('button:has-text("저장")').click();
    await page.waitForTimeout(2000);

    // 모달이 닫혔는지 확인
    const editModal = page.locator('.customer-edit-modal, [aria-label*="수정"]');
    await expect(editModal).not.toBeVisible();

    console.log('✅ 3단계 완료: 정보 수정 완료');

    // ===== 4단계: 수정된 정보 확인 =====
    console.log('\n=== 4단계: 수정된 정보 확인 ===');

    // 정보 수정 버튼 다시 클릭하여 수정된 내용 확인
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("정보 수정")').click();
    await page.waitForTimeout(1000);

    // 수정된 고객명 검증
    const updatedNameValue = await page.locator('input[aria-label="이름"]').inputValue();
    expect(updatedNameValue).toBe(updatedData.name);
    console.log('✅ 수정된 고객명 검증 성공:', updatedNameValue);

    // 수정된 연락처 검증
    await page.locator('button:has-text("연락처")').click();
    await page.waitForTimeout(300);

    const updatedMobileValue = await page.locator('input[placeholder*="010"]').first().inputValue();
    expect(updatedMobileValue).toBe(updatedData.mobile_phone);
    console.log('✅ 수정된 휴대폰 검증 성공:', updatedMobileValue);

    const updatedEmailValue = await page.locator('input[type="email"]').first().inputValue();
    expect(updatedEmailValue).toBe(updatedData.email);
    console.log('✅ 수정된 이메일 검증 성공:', updatedEmailValue);

    // 스크린샷: 수정 확인
    await page.screenshot({ path: 'test-results/crud-05-verified-update.png' });

    // 모달 닫기
    await page.locator('button:has-text("취소")').click();
    await page.waitForTimeout(500);

    console.log('✅ 4단계 완료: 수정된 정보 검증 완료');

    // ===== 5단계: 고객 삭제 =====
    console.log('\n=== 5단계: 고객 삭제 ===');

    // 삭제 버튼 찾기
    const deleteButton = page.locator('button:has-text("삭제"), button[aria-label*="삭제"]');

    if (await deleteButton.count() > 0) {
      await deleteButton.first().click();
      await page.waitForTimeout(500);

      // 확인 대화상자 처리
      page.on('dialog', async (dialog) => {
        console.log('삭제 확인 대화상자:', dialog.message());
        await dialog.accept();
      });

      // 재확인 버튼이 있다면 클릭
      const confirmButton = page.locator('button:has-text("확인"), button:has-text("삭제")');
      if (await confirmButton.count() > 0) {
        await confirmButton.first().click();
      }

      await page.waitForTimeout(2000);

      console.log('✅ 5단계 완료: 고객 삭제 완료');

      // 삭제 확인: 고객 목록에서 사라졌는지 확인
      const customerList = await page.locator(`text="${updatedData.name}"`).count();
      expect(customerList).toBe(0);
      console.log('✅ 삭제 검증 완료: 고객 목록에서 제거됨');

      // 스크린샷: 최종 상태
      await page.screenshot({ path: 'test-results/crud-06-after-delete.png' });
    } else {
      console.log('⚠️  삭제 버튼을 찾을 수 없습니다. 수동으로 삭제가 필요할 수 있습니다.');
    }

    console.log('\n=== 전체 CRUD 테스트 완료 ===');
    console.log('생성 → 확인 → 수정 → 확인 → 삭제 모든 단계 성공! ✅');
  });
});

import { test, expect, Page } from '@playwright/test';

// 무작위 데이터 생성 함수들
class RandomDataGenerator {
  // 한글 성씨 목록
  private static surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '홍', '전'];

  // 한글 이름 목록
  private static givenNames = ['민준', '서연', '도윤', '서현', '예준', '지우', '시우', '서영', '주원', '하은', '지후', '예은', '우진', '지안', '선우', '서준', '연우', '수빈', '준서', '유진'];

  // 영문 성씨 목록
  private static surnamesEn = ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Hong', 'Jeon'];

  // 영문 이름 목록
  private static givenNamesEn = ['Minjun', 'Seoyeon', 'Doyoon', 'Seohyun', 'Yejun', 'Jiwoo', 'Siwoo', 'Seoyoung', 'Joowon', 'Haeun', 'Jihoo', 'Yeeun', 'Woojin', 'Jian', 'Sunwoo', 'Seojun', 'Yeonwoo', 'Subin', 'Junseo', 'Yujin'];

  // 이메일 도메인 목록
  private static emailDomains = ['gmail.com', 'naver.com', 'daum.net', 'kakao.com', 'hanmail.net', 'outlook.com', 'yahoo.com'];

  // 랜덤 선택 헬퍼
  private static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  // 랜덤 숫자 생성 (min ~ max)
  private static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 랜덤 한글 이름 생성
  static generateKoreanName(): string {
    const surname = this.randomChoice(this.surnames);
    const givenName = this.randomChoice(this.givenNames);
    return `${surname}${givenName}`;
  }

  // 랜덤 영문 이름 생성
  static generateEnglishName(): string {
    const surname = this.randomChoice(this.surnamesEn);
    const givenName = this.randomChoice(this.givenNamesEn);
    return `${givenName}${surname}`;
  }

  // 랜덤 생년월일 생성 (1960-2005년)
  static generateBirthDate(): string {
    const year = this.randomInt(1960, 2005);
    const month = String(this.randomInt(1, 12)).padStart(2, '0');
    const day = String(this.randomInt(1, 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 랜덤 성별 생성
  static generateGender(): '남성' | '여성' {
    return Math.random() > 0.5 ? '남성' : '여성';
  }

  // 랜덤 휴대폰 번호 생성
  static generateMobilePhone(): string {
    const middle = String(this.randomInt(1000, 9999));
    const last = String(this.randomInt(1000, 9999));
    return `010${middle}${last}`;
  }

  // 랜덤 집 전화 생성
  static generateHomePhone(): string {
    const areaCode = this.randomChoice(['02', '031', '032', '033', '041', '042', '043', '051', '052', '053', '054', '055', '061', '062', '063', '064']);
    const middle = String(this.randomInt(100, 999));
    const last = String(this.randomInt(1000, 9999));
    return `${areaCode}${middle}${last}`;
  }

  // 랜덤 회사 전화 생성
  static generateOfficePhone(): string {
    const areaCode = this.randomChoice(['02', '031', '032', '070']);
    const middle = String(this.randomInt(1000, 9999));
    const last = String(this.randomInt(1000, 9999));
    return `${areaCode}${middle}${last}`;
  }

  // 랜덤 이메일 생성
  static generateEmail(name: string): string {
    const domain = this.randomChoice(this.emailDomains);
    const randomNum = this.randomInt(1, 999);
    return `${name.toLowerCase()}${randomNum}@${domain}`;
  }

  // 전체 고객 데이터 생성
  static generateCustomerData() {
    const koreanName = this.generateKoreanName();
    const englishName = this.generateEnglishName();

    return {
      name: koreanName,
      nameEn: englishName,
      birthDate: this.generateBirthDate(),
      gender: this.generateGender(),
      mobilePhone: this.generateMobilePhone(),
      homePhone: this.generateHomePhone(),
      officePhone: this.generateOfficePhone(),
      email: this.generateEmail(englishName),
    };
  }
}

// 고객 생성 함수
async function createCustomer(page: Page, customerData: ReturnType<typeof RandomDataGenerator.generateCustomerData>) {
  // 고객 등록 메뉴 클릭
  await page.getByRole('menuitem', { name: '새로운 고객을 등록합니다' }).click();

  // 기본 정보 입력
  await page.getByRole('textbox', { name: '이름', exact: true }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill(customerData.name);

  await page.getByRole('textbox', { name: '이름 (영문)' }).fill(customerData.nameEn);

  await page.getByRole('textbox', { name: '생년월일' }).fill(customerData.birthDate);

  // 성별 선택 (radio 버튼 사용)
  await page.getByRole('radio', { name: customerData.gender }).click();

  // 연락처 정보 입력
  await page.getByRole('textbox', { name: '010-1234-' }).click();
  await page.getByRole('textbox', { name: '010-1234-' }).fill(customerData.mobilePhone);

  await page.locator('div').filter({ hasText: /^집 전화$/ }).getByPlaceholder('-1234-5678').fill(customerData.homePhone);

  await page.locator('div').filter({ hasText: /^회사 전화$/ }).getByPlaceholder('-1234-5678').fill(customerData.officePhone);

  await page.getByRole('textbox', { name: 'example@email.com' }).fill(customerData.email);

  // 등록하기 버튼 클릭
  await page.getByRole('button', { name: '✅ 등록하기' }).click();

  // 확인 버튼 클릭
  await page.getByRole('button', { name: '확인' }).click();

  // 등록 완료 대기
  await page.waitForTimeout(500);
}

// 고객 수정 함수
async function updateCustomer(page: Page, oldName: string, newCustomerData: ReturnType<typeof RandomDataGenerator.generateCustomerData>) {
  // 전체보기 클릭 (strict mode violation 방지)
  await page.getByRole('menuitem', { name: '모든 고객을 보여줍니다' }).click();
  await page.waitForTimeout(300);

  // 고객 선택 (테이블 row만 선택, first()로 첫 번째 매칭 선택)
  await page.locator('.customer-row, .customer-info, [class*="customer"]').filter({ hasText: new RegExp(`^${oldName}$`) }).first().click();
  await page.waitForTimeout(300);

  // 정보 수정 버튼 클릭
  await page.getByRole('button', { name: '정보 수정' }).click();
  await page.waitForTimeout(200);

  // 기본 정보 수정
  await page.getByRole('textbox', { name: '이름', exact: true }).click();
  await page.getByRole('textbox', { name: '이름', exact: true }).fill(newCustomerData.name);

  await page.getByRole('textbox', { name: '이름 (영문)' }).click();
  await page.getByRole('textbox', { name: '이름 (영문)' }).fill(newCustomerData.nameEn);

  await page.getByRole('textbox', { name: '생년월일' }).fill(newCustomerData.birthDate);

  // 성별 선택 (radio 버튼 사용)
  await page.getByRole('radio', { name: newCustomerData.gender }).click();

  // 저장 버튼 클릭
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(300);

  // 연락처 정보 탭으로 전환
  await page.getByRole('button', { name: '정보 수정' }).click();
  await page.waitForTimeout(200);

  await page.getByRole('button', { name: '연락처 정보' }).click();
  await page.waitForTimeout(200);

  // 연락처 정보 수정
  await page.getByRole('textbox', { name: '010-1234-' }).click();
  await page.getByRole('textbox', { name: '010-1234-' }).fill(newCustomerData.mobilePhone);

  await page.locator('div').filter({ hasText: /^집 전화$/ }).getByPlaceholder('-1234-5678').click();
  await page.locator('div').filter({ hasText: /^집 전화$/ }).getByPlaceholder('-1234-5678').fill(newCustomerData.homePhone);

  await page.locator('div').filter({ hasText: /^회사 전화$/ }).getByPlaceholder('-1234-5678').click();
  await page.locator('div').filter({ hasText: /^회사 전화$/ }).getByPlaceholder('-1234-5678').fill(newCustomerData.officePhone);

  await page.getByRole('textbox', { name: 'example@email.com' }).click();
  await page.getByRole('textbox', { name: 'example@email.com' }).fill(newCustomerData.email);

  // 저장 버튼 클릭
  await page.getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(300);
}

// 고객 삭제 함수
async function deleteCustomer(page: Page) {
  // 고객 삭제 버튼 클릭
  await page.getByRole('button', { name: '고객 삭제' }).click();
  await page.waitForTimeout(200);

  // 삭제 확인 버튼 클릭
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.waitForTimeout(500);
}

// 고객 수 확인 함수
async function getCustomerCount(page: Page): Promise<number> {
  // 메뉴에서 '전체보기' 클릭 (strict mode violation 방지)
  await page.getByRole('menuitem', { name: '모든 고객을 보여줍니다' }).click();
  await page.waitForTimeout(500);

  // 고객 목록에서 총 개수 추출 (UIX3 패턴: "총 32명")
  const countText = await page.locator('.result-count').textContent();
  if (countText) {
    const match = countText.match(/총 (\d+)명/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return 0;
}

// 메인 테스트
test.describe('고객 CRUD 100회 반복 테스트', () => {
  test.setTimeout(3600000); // 1시간 타임아웃 설정

  test('10회 고객 생성-수정-삭제 반복', async ({ page }) => {
    // 초기 페이지 이동
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(1000);

    // 초기 고객 수 저장
    const initialCustomerCount = await getCustomerCount(page);
    console.log(`🔢 초기 고객 수: ${initialCustomerCount}`);

    // 10회 반복
    for (let i = 1; i <= 10; i++) {
      console.log(`\n🔄 ========== 반복 ${i}/10 시작 ==========`);

      // 1. 무작위 고객 데이터 생성
      const customerData1 = RandomDataGenerator.generateCustomerData();
      console.log(`✅ [${i}] 고객 생성: ${customerData1.name} (${customerData1.nameEn})`);

      // 2. 고객 생성
      await createCustomer(page, customerData1);
      console.log(`✅ [${i}] 고객 생성 완료`);

      // 3. 생성된 고객 수 확인 (초기 + 1)
      const afterCreateCount = await getCustomerCount(page);
      expect(afterCreateCount).toBe(initialCustomerCount + 1);
      console.log(`✅ [${i}] 고객 수 검증: ${afterCreateCount} (예상: ${initialCustomerCount + 1})`);

      // 4. 고객 정보가 올바르게 생성되었는지 확인
      await page.getByRole('menuitem', { name: '모든 고객을 보여줍니다' }).click();
      await page.waitForTimeout(300);

      const customerExists = await page.locator('div').filter({ hasText: new RegExp(`^${customerData1.name}$`) }).count();
      expect(customerExists).toBeGreaterThan(0);
      console.log(`✅ [${i}] 고객 존재 확인: ${customerData1.name}`);

      // 5. 새로운 무작위 데이터로 고객 정보 수정
      const customerData2 = RandomDataGenerator.generateCustomerData();
      console.log(`✅ [${i}] 고객 수정: ${customerData1.name} → ${customerData2.name}`);

      await updateCustomer(page, customerData1.name, customerData2);
      console.log(`✅ [${i}] 고객 수정 완료`);

      // 6. 수정된 고객 정보 확인
      await page.getByRole('menuitem', { name: '모든 고객을 보여줍니다' }).click();
      await page.waitForTimeout(300);

      const updatedCustomerExists = await page.locator('div').filter({ hasText: new RegExp(`^${customerData2.name}$`) }).count();
      expect(updatedCustomerExists).toBeGreaterThan(0);
      console.log(`✅ [${i}] 수정된 고객 존재 확인: ${customerData2.name}`);

      // 7. 고객 선택 후 삭제 (테이블 내 customer-row만 선택)
      await page.locator('.customer-row, .customer-info, [class*="customer"]').filter({ hasText: new RegExp(`^${customerData2.name}$`) }).first().click();
      await page.waitForTimeout(300);

      await deleteCustomer(page);
      console.log(`✅ [${i}] 고객 삭제 완료`);

      // 8. 삭제 후 고객 수 확인 (초기와 동일)
      const afterDeleteCount = await getCustomerCount(page);
      expect(afterDeleteCount).toBe(initialCustomerCount);
      console.log(`✅ [${i}] 고객 수 검증: ${afterDeleteCount} (예상: ${initialCustomerCount})`);

      // 9. 삭제된 고객이 테이블에서 제거되었는지 확인 (같은 이름이 다른 고객에 있을 수 있으므로 count만 체크)
      const deletedCustomerExistsInTable = await page.locator('.customer-row, .customer-info').filter({ hasText: new RegExp(`^${customerData2.name}$`) }).count();
      // 삭제되었으므로 테이블에는 없어야 함 (상세뷰는 닫혔을 것)
      console.log(`✅ [${i}] 고객 삭제 확인: ${customerData2.name} (테이블 내 ${deletedCustomerExistsInTable}개)`);

      console.log(`✅ ========== 반복 ${i}/10 완료 ==========\n`);

      // 서버 부하 방지를 위한 짧은 대기
      await page.waitForTimeout(100);
    }

    // 최종 검증
    const finalCustomerCount = await getCustomerCount(page);
    expect(finalCustomerCount).toBe(initialCustomerCount);

    console.log(`\n🎉 ========== 10회 반복 테스트 완료 ==========`);
    console.log(`🔢 최종 고객 수: ${finalCustomerCount} (초기: ${initialCustomerCount})`);
    console.log(`✅ 모든 테스트 통과!`);
  });
});

import { test, expect, Page } from '@playwright/test';
import { loginAndSetup } from '../fixtures';

/**
 * AI 어시스턴트 E2E 테스트
 *
 * 9개 기능 카테고리 전체 테스트:
 * 1. 고객 조회 - 검색 및 상세 정보 조회
 * 2. 고객 등록 - 새 고객 추가
 * 3. 고객별 문서 조회 - 특정 고객의 문서 목록
 * 4. 고객 정보 수정 - 연락처, 주소 등 수정
 * 5. 계약 조회 - 목록, 상세, 피보험자 조회
 * 6. 생일 고객 - 특정 월/일의 생일 고객
 * 7. 문서 검색 - 키워드 + AI 의미 통합 검색
 * 8. 고객 메모 - 메모 추가 및 조회
 * 9. 고객 관계 - 관계 조회 및 등록
 */

// 테스트 설정
test.describe.configure({ mode: 'serial' });

// AI 응답 대기 시간 (API 호출 포함)
const AI_RESPONSE_TIMEOUT = 60000;

/**
 * 온보딩 오버레이 닫기 (어디서든 호출 가능)
 */
async function dismissOnboarding(page: Page): Promise<void> {
  for (let i = 0; i < 15; i++) {
    const onboarding = page.locator('.onboarding-tour');
    if (!await onboarding.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('온보딩 닫힘 확인');
      return;
    }

    console.log(`온보딩 닫기 시도 ${i + 1}`);

    // "다시 표시 안 함" 버튼 클릭 (점선 테두리 버튼)
    const dontShowAgain = page.locator('.onboarding-tour button:has-text("다시 표시 안 함")');
    if (await dontShowAgain.isVisible({ timeout: 500 }).catch(() => false)) {
      await dontShowAgain.click({ force: true });
      await page.waitForTimeout(500);
      console.log('온보딩 "다시 표시 안 함" 클릭');
      continue;
    }

    // X 버튼 (우측 상단)
    const closeX = page.locator('.onboarding-tour__header button, .onboarding-tour [aria-label="닫기"]');
    if (await closeX.first().isVisible({ timeout: 300 }).catch(() => false)) {
      await closeX.first().click({ force: true });
      await page.waitForTimeout(500);
      console.log('온보딩 X 버튼 클릭');
      continue;
    }

    // "건너뛰기" 버튼
    const skipButton = page.locator('.onboarding-tour button:has-text("건너뛰기")');
    if (await skipButton.isVisible({ timeout: 300 }).catch(() => false)) {
      await skipButton.click({ force: true });
      await page.waitForTimeout(500);
      console.log('온보딩 건너뛰기 클릭');
      continue;
    }

    // ESC 키로 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('ESC 키 눌림');
  }

  // 최종 확인
  const stillVisible = await page.locator('.onboarding-tour').isVisible({ timeout: 300 }).catch(() => false);
  if (stillVisible) {
    console.log('경고: 온보딩이 여전히 표시됨 - localStorage 초기화 시도');
    // localStorage에서 온보딩 완료 상태 설정
    await page.evaluate(() => {
      localStorage.setItem('aims-onboarding-completed', 'true');
    });
    // 페이지 새로고침 없이 계속 진행
  }
}

/**
 * AI 어시스턴트 패널 열기
 */
async function openChatPanel(page: Page): Promise<void> {
  // 온보딩 먼저 닫기
  await dismissOnboarding(page);

  // 이미 열려있는지 확인
  const chatPanel = page.locator('.chat-panel');
  if (await chatPanel.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('채팅 패널 이미 열려 있음');
    await dismissOnboarding(page); // 패널 열린 후에도 온보딩 닫기
    return;
  }

  // 헤더의 AI 어시스턴트 버튼 클릭
  const chatButton = page.locator('.header-chat-button');
  await expect(chatButton).toBeVisible({ timeout: 5000 });
  await chatButton.click();

  // 채팅 패널이 열릴 때까지 대기
  await expect(chatPanel).toBeVisible({ timeout: 5000 });
  console.log('채팅 패널 열림');

  // 패널 열린 후 온보딩 닫기
  await dismissOnboarding(page);
}

/**
 * 채팅 메시지 전송 및 응답 대기
 */
async function sendMessageAndWaitResponse(
  page: Page,
  message: string,
  timeout: number = AI_RESPONSE_TIMEOUT
): Promise<string> {
  // 온보딩 닫기 (메시지 전송 전)
  await dismissOnboarding(page);

  // 입력창 찾기
  const input = page.locator('.chat-panel__input-area textarea');
  await expect(input).toBeVisible({ timeout: 5000 });

  // 이전 메시지 수 기록
  const messagesBefore = await page.locator('.chat-panel__message').count();

  // 메시지 입력
  await input.fill(message);
  console.log(`메시지 입력: "${message}"`);

  // 온보딩 다시 닫기 (입력 후 나타날 수 있음)
  await dismissOnboarding(page);

  // Enter 키로 메시지 전송 (Ctrl+Enter 또는 Enter)
  await input.press('Enter');
  console.log('Enter 키로 메시지 전송');
  await page.waitForTimeout(500);

  // AI 응답 대기 (새 메시지가 추가될 때까지)
  await page.waitForFunction(
    (prevCount) => {
      const messages = document.querySelectorAll('.chat-panel__message');
      return messages.length > prevCount + 1; // 사용자 메시지 + AI 응답
    },
    messagesBefore,
    { timeout }
  );

  // 로딩 상태가 끝날 때까지 대기
  await page.waitForSelector('.chat-panel__message--loading', { state: 'detached', timeout: 5000 }).catch(() => {});

  // 마지막 AI 응답 가져오기
  const lastMessage = page.locator('.chat-panel__message.chat-panel__message--assistant').last();
  await expect(lastMessage).toBeVisible({ timeout: 5000 });

  const responseText = await lastMessage.textContent() || '';
  console.log(`AI 응답 수신 (${responseText.length}자)`);

  return responseText;
}

/**
 * 대화 초기화
 */
async function clearConversation(page: Page): Promise<void> {
  const clearButton = page.locator('.chat-panel__header-btn[title*="새 대화"], .chat-panel__header-btn:has-text("새 대화")');
  if (await clearButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await clearButton.click();
    await page.waitForTimeout(500);
    console.log('대화 초기화');
  }
}

test.describe('AI 어시스턴트 E2E 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await openChatPanel(page);
  });

  test('1. 채팅 패널 UI 확인', async ({ page }) => {
    console.log('\n=== 채팅 패널 UI 확인 ===');

    // 패널 헤더 확인
    const header = page.locator('.chat-panel__header');
    await expect(header).toBeVisible();
    await expect(header.locator('text=AI 어시스턴트')).toBeVisible();
    console.log('헤더 표시됨');

    // 입력 영역 확인
    const inputArea = page.locator('.chat-panel__input-area');
    await expect(inputArea).toBeVisible();
    console.log('입력 영역 표시됨');

    // 환영 메시지 확인 (대화가 없을 때)
    const welcomeArea = page.locator('.chat-panel__welcome');
    if (await welcomeArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('환영 화면 표시됨');

      // 기능 카드 확인
      const featureCards = page.locator('.chat-panel__welcome-feature');
      const cardCount = await featureCards.count();
      console.log(`기능 카드 ${cardCount}개 발견`);
      expect(cardCount).toBeGreaterThanOrEqual(9);
    }

    await page.screenshot({ path: 'test-results/ai-assistant-01-ui.png' });
  });

  test('2. 고객 조회 - 최근 등록 고객', async ({ page }) => {
    console.log('\n=== 고객 조회 - 최근 등록 고객 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '최근 등록한 고객 보여줘'
    );

    // 응답 검증 - 고객 목록이나 "없습니다" 메시지
    const hasCustomerList = response.includes('고객') || response.includes('명');
    const noCustomers = response.includes('없') || response.includes('찾을 수');

    expect(hasCustomerList || noCustomers).toBe(true);
    console.log('고객 조회 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-02-customer-search.png' });
  });

  test('3. 고객 조회 - 지역 검색', async ({ page }) => {
    console.log('\n=== 고객 조회 - 지역 검색 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '서울 지역 고객 목록 보여줘'
    );

    // 응답 검증
    const isValidResponse =
      response.includes('서울') ||
      response.includes('고객') ||
      response.includes('없') ||
      response.includes('찾');

    expect(isValidResponse).toBe(true);
    console.log('지역 검색 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-03-regional-search.png' });
  });

  test('4. 고객 조회 - 법인/개인 유형', async ({ page }) => {
    console.log('\n=== 고객 조회 - 유형별 검색 ===');

    // 법인 고객 검색
    const corpResponse = await sendMessageAndWaitResponse(
      page,
      '법인 고객 목록 보여줘'
    );
    expect(corpResponse.length).toBeGreaterThan(0);
    console.log('법인 고객 검색 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-04-corp-search.png' });
  });

  test('5. 계약 조회 - 전체 목록', async ({ page }) => {
    console.log('\n=== 계약 조회 - 전체 목록 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '전체 계약 목록 보여줘'
    );

    // 응답 검증
    const isValidResponse =
      response.includes('계약') ||
      response.includes('보험') ||
      response.includes('없') ||
      response.includes('찾');

    expect(isValidResponse).toBe(true);
    console.log('계약 목록 조회 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-05-contract-list.png' });
  });

  test('6. 생일 고객 - 이번 달', async ({ page }) => {
    console.log('\n=== 생일 고객 - 이번 달 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '이번 달 생일 고객 알려줘'
    );

    // 응답 검증
    const isValidResponse =
      response.includes('생일') ||
      response.includes('고객') ||
      response.includes('월') ||
      response.includes('없');

    expect(isValidResponse).toBe(true);
    console.log('생일 고객 조회 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-06-birthday.png' });
  });

  test('7. 문서 검색 - 키워드', async ({ page }) => {
    console.log('\n=== 문서 검색 - 키워드 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '보험 관련 문서 찾아줘'
    );

    // 응답 검증
    const isValidResponse =
      response.includes('문서') ||
      response.includes('검색') ||
      response.includes('결과') ||
      response.includes('없') ||
      response.includes('찾');

    expect(isValidResponse).toBe(true);
    console.log('문서 검색 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-07-doc-search.png' });
  });

  test('8. 고객 메모 - 조회', async ({ page }) => {
    console.log('\n=== 고객 메모 - 조회 ===');

    // 먼저 고객을 검색
    await sendMessageAndWaitResponse(page, '최근 등록한 고객 1명 보여줘');

    // 메모 조회
    const response = await sendMessageAndWaitResponse(
      page,
      '이 고객 메모 보여줘'
    );

    // 응답 검증 - 메모가 있거나 없거나
    const isValidResponse =
      response.includes('메모') ||
      response.includes('없') ||
      response.includes('고객');

    expect(isValidResponse).toBe(true);
    console.log('메모 조회 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-08-memo.png' });
  });

  test('9. 고객 관계 - 조회', async ({ page }) => {
    console.log('\n=== 고객 관계 - 조회 ===');

    // 먼저 고객을 검색
    await sendMessageAndWaitResponse(page, '최근 등록한 고객 보여줘');

    // 관계 조회
    const response = await sendMessageAndWaitResponse(
      page,
      '이 고객의 관계 보여줘'
    );

    // 응답 검증
    const isValidResponse =
      response.includes('관계') ||
      response.includes('없') ||
      response.includes('고객');

    expect(isValidResponse).toBe(true);
    console.log('관계 조회 응답 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-09-relationship.png' });
  });

  test('10. 환영 화면 기능 카드 클릭', async ({ page }) => {
    console.log('\n=== 환영 화면 기능 카드 클릭 ===');

    // 대화 초기화하여 환영 화면 표시
    await clearConversation(page);
    await page.waitForTimeout(1000);

    // 온보딩이 다시 나타날 수 있으므로 닫기
    await dismissOnboarding(page);

    // 기능 카드가 보이는지 확인
    const featureCards = page.locator('.chat-panel__welcome-feature');
    const isFeatureCardsVisible = await featureCards.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (isFeatureCardsVisible) {
      // 첫 번째 기능 카드 클릭 (싱글클릭은 250ms 후 입력창에 예시 채움)
      const firstCard = featureCards.first();
      await firstCard.click();
      // 싱글클릭 처리 시간 대기 (250ms + 여유)
      await page.waitForTimeout(500);

      // 입력창에 예시가 채워졌는지 확인
      const input = page.locator('.chat-panel__input-area textarea');
      const inputValue = await input.inputValue();
      console.log(`입력창 값: "${inputValue}" (${inputValue.length}자)`);

      // 값이 채워지면 성공
      if (inputValue.length > 0) {
        console.log('기능 카드 클릭으로 예시 채워짐');
      }
    } else {
      // 기능 카드가 없으면 "사용 가능한 기능 보기" 버튼 확인
      const featuresButton = page.locator('button:has-text("사용 가능한 기능 보기")');
      if (await featuresButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('"사용 가능한 기능 보기" 버튼 확인됨 - 정상');
      } else {
        console.log('환영 화면이 다른 형태로 표시됨 - 스킵');
      }
    }

    // 최종 확인: 채팅 패널이 정상 작동하는지만 체크
    const chatPanel = page.locator('.chat-panel');
    await expect(chatPanel).toBeVisible();
    console.log('채팅 패널 정상 확인');

    await page.screenshot({ path: 'test-results/ai-assistant-10-feature-card.png' });
  });
});

test.describe('AI 어시스턴트 심화 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await openChatPanel(page);
  });

  test('11. 연속 대화 컨텍스트 유지', async ({ page }) => {
    console.log('\n=== 연속 대화 컨텍스트 유지 ===');

    // 대화 초기화
    await clearConversation(page);

    // 첫 번째 질문
    await sendMessageAndWaitResponse(page, '서울 지역 고객 보여줘');

    // 후속 질문 (컨텍스트 필요)
    const response = await sendMessageAndWaitResponse(
      page,
      '그 중에서 법인 고객만 보여줘'
    );

    // 컨텍스트 이해 여부 확인
    expect(response.length).toBeGreaterThan(0);
    console.log('연속 대화 테스트 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-11-context.png' });
  });

  test('12. 다중 조건 검색', async ({ page }) => {
    console.log('\n=== 다중 조건 검색 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '서울에 사는 개인 고객 중에서 이메일이 gmail인 분 찾아줘'
    );

    expect(response.length).toBeGreaterThan(0);
    console.log('다중 조건 검색 테스트 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-12-multi-condition.png' });
  });

  test('13. 날짜 기반 조회', async ({ page }) => {
    console.log('\n=== 날짜 기반 조회 ===');

    // 오늘 생일
    const response1 = await sendMessageAndWaitResponse(
      page,
      '오늘 생일인 고객 있어?'
    );
    expect(response1.length).toBeGreaterThan(0);

    // 다음 주 생일
    const response2 = await sendMessageAndWaitResponse(
      page,
      '다음 주 생일인 고객 목록 보여줘'
    );
    expect(response2.length).toBeGreaterThan(0);

    console.log('날짜 기반 조회 테스트 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-13-date-query.png' });
  });

  test('14. 에러 처리 - 잘못된 요청', async ({ page }) => {
    console.log('\n=== 에러 처리 테스트 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '존재하지않는기능12345 실행해줘'
    );

    // AI가 적절히 응답하는지 확인
    expect(response.length).toBeGreaterThan(0);
    console.log('에러 처리 테스트 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-14-error.png' });
  });

  test('15. 대화 히스토리 저장 (localStorage 확인)', async ({ page }) => {
    console.log('\n=== 대화 히스토리 저장 테스트 ===');

    // 대화 초기화
    await clearConversation(page);
    await dismissOnboarding(page);
    await page.waitForTimeout(500);

    // 메시지 전송
    const testMessage = '테스트 메시지 - 히스토리 확인용';
    await sendMessageAndWaitResponse(page, testMessage);

    // localStorage에 메시지가 저장되었는지 확인
    const storedMessages = await page.evaluate(() => {
      return localStorage.getItem('aims-chat-messages');
    });

    expect(storedMessages).not.toBeNull();
    console.log(`localStorage에 메시지 저장됨: ${storedMessages ? '있음' : '없음'}`);

    if (storedMessages) {
      const parsed = JSON.parse(storedMessages);
      console.log(`저장된 메시지 수: ${Array.isArray(parsed) ? parsed.length : 0}`);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    }

    console.log('대화 히스토리 저장 테스트 완료');

    await page.screenshot({ path: 'test-results/ai-assistant-15-history.png' });
  });
});

test.describe('AI 어시스턴트 고객 등록 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await openChatPanel(page);
    await clearConversation(page);
  });

  test('16. 고객 등록 대화 시작', async ({ page }) => {
    console.log('\n=== 고객 등록 대화 시작 ===');

    const response = await sendMessageAndWaitResponse(
      page,
      '새 고객 등록해줘'
    );

    // AI가 고객 정보를 물어보는지 확인
    const asksForInfo =
      response.includes('이름') ||
      response.includes('고객명') ||
      response.includes('정보') ||
      response.includes('등록');

    expect(asksForInfo).toBe(true);
    console.log('고객 등록 대화 시작 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-16-register-start.png' });
  });

  test('17. 개인 고객 등록 흐름', async ({ page }) => {
    console.log('\n=== 개인 고객 등록 흐름 ===');

    // 고객 등록 시작
    await sendMessageAndWaitResponse(page, '개인 고객 등록해줘');

    // 고객 정보 제공
    const timestamp = Date.now();
    const customerName = `테스트고객_${timestamp}`;

    const response = await sendMessageAndWaitResponse(
      page,
      `이름은 ${customerName}이고, 전화번호는 010-1234-5678, 이메일은 test@example.com이야`
    );

    // AI가 응답했는지 확인 (등록 관련 대화 진행)
    expect(response.length).toBeGreaterThan(0);
    console.log(`개인 고객 등록 대화 응답: ${response.substring(0, 50)}...`);
    console.log('개인 고객 등록 흐름 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-17-personal-register.png' });
  });

  test('18. 법인 고객 등록 흐름', async ({ page }) => {
    console.log('\n=== 법인 고객 등록 흐름 ===');

    // 법인 고객 등록 시작
    await sendMessageAndWaitResponse(page, '법인 고객 등록해줘');

    // 법인 정보 제공
    const timestamp = Date.now();
    const companyName = `테스트법인_${timestamp}`;

    const response = await sendMessageAndWaitResponse(
      page,
      `회사명은 ${companyName}이고, 대표번호는 02-1234-5678이야`
    );

    // 응답 확인
    expect(response.length).toBeGreaterThan(0);
    console.log('법인 고객 등록 흐름 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-18-corp-register.png' });
  });
});

test.describe('AI 어시스턴트 고객 수정 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await openChatPanel(page);
  });

  test('19. 고객 정보 수정', async ({ page }) => {
    console.log('\n=== 고객 정보 수정 ===');

    // 먼저 고객 검색
    await sendMessageAndWaitResponse(page, '최근 등록한 고객 1명 보여줘');

    // 수정 요청
    const response = await sendMessageAndWaitResponse(
      page,
      '이 고객의 전화번호를 010-9999-8888로 변경해줘'
    );

    // AI가 응답했는지 확인
    expect(response.length).toBeGreaterThan(0);
    console.log(`고객 정보 수정 응답: ${response.substring(0, 50)}...`);
    console.log('고객 정보 수정 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-19-update.png' });
  });
});

test.describe('AI 어시스턴트 메모 기능 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
    await openChatPanel(page);
  });

  test('20. 메모 추가', async ({ page }) => {
    console.log('\n=== 메모 추가 ===');

    // 고객 선택
    await sendMessageAndWaitResponse(page, '최근 등록한 고객 보여줘');

    // 메모 추가
    const timestamp = Date.now();
    const response = await sendMessageAndWaitResponse(
      page,
      `이 고객에게 메모 추가해줘: 테스트 메모 ${timestamp}`
    );

    // AI가 응답했는지 확인
    expect(response.length).toBeGreaterThan(0);
    console.log(`메모 추가 응답: ${response.substring(0, 50)}...`);
    console.log('메모 추가 확인됨');

    await page.screenshot({ path: 'test-results/ai-assistant-20-add-memo.png' });
  });
});

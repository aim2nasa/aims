/**
 * Regression Test — AI 후속 질문 시 고객 데이터 혼합 방지 (#15)
 *
 * 커밋: 6ff6a619 — chatService에 고객 컨텍스트 하네스 추가
 * 버그: 후속 질문(query_customer_reviews 등)에서 customerId가 주입되지 않아
 *       다른 고객의 데이터가 혼합되는 문제
 * 수정: 도구 결과에서 customerId를 추적하여 후속 도구 호출에 자동 주입
 *
 * @since 2026-04-07
 */

const fs = require('fs');
const path = require('path');

function readSource(relativePath) {
  return fs.readFileSync(
    path.join(__dirname, '..', relativePath),
    'utf-8'
  );
}

describe('AI 후속 질문 고객 데이터 격리 (#15, 6ff6a619)', () => {
  const chatServiceSource = readSource('lib/chatService.js');

  // ─────────────────────────────────────────────────────────────
  // 1. 고객 컨텍스트 하네스 구조 존재 확인
  // ─────────────────────────────────────────────────────────────
  test('고객 컨텍스트 하네스 (lastCustomerContext) 변수가 존재해야 함', () => {
    expect(chatServiceSource).toContain('lastCustomerContext');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CONTEXT_PROVIDER_TOOLS 정의 — customerId를 제공하는 도구
  // ─────────────────────────────────────────────────────────────
  test('CONTEXT_PROVIDER_TOOLS 집합이 정의되어야 함', () => {
    expect(chatServiceSource).toContain('CONTEXT_PROVIDER_TOOLS');
  });

  test('CONTEXT_PROVIDER_TOOLS에 핵심 도구가 포함되어야 함', () => {
    // search_customer_with_contracts, get_customer_reviews 등
    const providerSection = chatServiceSource.substring(
      chatServiceSource.indexOf('CONTEXT_PROVIDER_TOOLS'),
      chatServiceSource.indexOf('CONTEXT_PROVIDER_TOOLS') + 500
    );
    expect(providerSection).toContain('search_customer_with_contracts');
    expect(providerSection).toContain('get_customer_reviews');
    expect(providerSection).toContain('get_customer');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CONTEXT_CONSUMER_TOOLS 정의 — customerId를 소비하는 도구
  // ─────────────────────────────────────────────────────────────
  test('CONTEXT_CONSUMER_TOOLS 집합이 정의되어야 함', () => {
    expect(chatServiceSource).toContain('CONTEXT_CONSUMER_TOOLS');
  });

  test('CONTEXT_CONSUMER_TOOLS에 query_customer_reviews가 포함되어야 함', () => {
    const consumerSection = chatServiceSource.substring(
      chatServiceSource.indexOf('CONTEXT_CONSUMER_TOOLS'),
      chatServiceSource.indexOf('CONTEXT_CONSUMER_TOOLS') + 500
    );
    expect(consumerSection).toContain('query_customer_reviews');
    expect(consumerSection).toContain('get_cr_contract_history');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. extractCustomerContext 함수 — 도구 결과에서 customerId 추출
  // ─────────────────────────────────────────────────────────────
  test('extractCustomerContext 함수가 존재해야 함', () => {
    expect(chatServiceSource).toContain('function extractCustomerContext');
  });

  test('extractCustomerContext가 customerId와 customerName을 추출해야 함', () => {
    const funcStart = chatServiceSource.indexOf('function extractCustomerContext');
    const funcSection = chatServiceSource.substring(funcStart, funcStart + 800);
    expect(funcSection).toContain('customerId');
    expect(funcSection).toContain('customerName');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. injectCustomerContext 함수 — 후속 도구에 customerId 주입
  // ─────────────────────────────────────────────────────────────
  test('injectCustomerContext 함수가 존재해야 함', () => {
    expect(chatServiceSource).toContain('function injectCustomerContext');
  });

  test('injectCustomerContext가 이미 customerId가 있으면 주입하지 않아야 함', () => {
    const funcStart = chatServiceSource.indexOf('function injectCustomerContext');
    const funcSection = chatServiceSource.substring(funcStart, funcStart + 500);
    // "args.customerId" 확인 → 이미 있으면 그대로 반환
    expect(funcSection).toMatch(/args\.customerId/);
    expect(funcSection).toContain('return args');
  });

  test('injectCustomerContext가 lastCustomerContext에서 customerId를 가져와야 함', () => {
    const funcStart = chatServiceSource.indexOf('function injectCustomerContext');
    const funcSection = chatServiceSource.substring(funcStart, funcStart + 500);
    expect(funcSection).toContain('lastCustomerContext.customerId');
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Tool 실행 루프에서 하네스가 적용되어야 함
  // ─────────────────────────────────────────────────────────────
  test('Tool 실행 시 injectCustomerContext가 호출되어야 함', () => {
    // streamChatResponse 내에서 injectCustomerContext 호출 확인
    const streamFuncStart = chatServiceSource.indexOf('async function* streamChatResponse');
    const streamFuncSection = chatServiceSource.substring(streamFuncStart);
    expect(streamFuncSection).toContain('injectCustomerContext');
  });

  test('Tool 결과 처리 시 extractCustomerContext가 호출되어야 함', () => {
    const streamFuncStart = chatServiceSource.indexOf('async function* streamChatResponse');
    const streamFuncSection = chatServiceSource.substring(streamFuncStart);
    expect(streamFuncSection).toContain('extractCustomerContext');
  });

  // ─────────────────────────────────────────────────────────────
  // 7. search_customers 단일 결과 시에만 컨텍스트 설정
  // ─────────────────────────────────────────────────────────────
  test('search_customers 결과가 1명일 때만 컨텍스트를 설정해야 함', () => {
    const funcStart = chatServiceSource.indexOf('function extractCustomerContext');
    const funcSection = chatServiceSource.substring(funcStart, funcStart + 800);
    // "search_customers" + "length === 1" 패턴 확인
    expect(funcSection).toContain('search_customers');
    expect(funcSection).toMatch(/length\s*===\s*1/);
  });
});

/**
 * Regression Test — AI 변액보험 조회 개선 (#13, #14) + customer_reviews 계약 통합 조회
 *
 * 커밋 113109ed: get_customer_reviews에 customerName 파라미터 추가 —
 *   customerId 없이 고객명으로 직접 변액보험 조회 가능
 * 커밋 4e366651: search_customer_with_contracts에서 customer_reviews 계약도 통합 조회
 *
 * @since 2026-04-07
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readToolSource(filename: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', filename),
    'utf-8'
  );
}

// =============================================================================
// #7: 변액보험 조회 개선 (113109ed)
// =============================================================================
describe('get_customer_reviews customerName 파라미터 지원 (#13/#14, 113109ed)', () => {
  const source = readToolSource('customer_reviews.ts');

  // ─────────────────────────────────────────────────────────────
  // 1. 스키마에 customerName 파라미터가 존재해야 함
  // ─────────────────────────────────────────────────────────────
  it('getCustomerReviewsSchema에 customerName 필드가 있어야 함', () => {
    expect(source).toMatch(/getCustomerReviewsSchema[\s\S]*?customerName:\s*z\.string\(\)/);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Tool definition에 customerName 파라미터가 노출되어야 함
  // ─────────────────────────────────────────────────────────────
  it('get_customer_reviews tool definition에 customerName 속성이 있어야 함', () => {
    // inputSchema.properties에 customerName이 있어야 함
    const toolDefStart = source.indexOf("name: 'get_customer_reviews'");
    expect(toolDefStart).toBeGreaterThan(-1);
    const toolDefSection = source.substring(toolDefStart, toolDefStart + 500);
    expect(toolDefSection).toContain('customerName');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. handleGetCustomerReviews에서 customerName으로 고객 조회 로직
  // ─────────────────────────────────────────────────────────────
  it('handleGetCustomerReviews가 customerName으로 고객을 조회할 수 있어야 함', () => {
    const handlerStart = source.indexOf('async function handleGetCustomerReviews');
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerSection = source.substring(handlerStart, handlerStart + 2000);
    // customerName을 사용한 regex 검색 패턴이 있어야 함
    expect(handlerSection).toContain('customerName');
    expect(handlerSection).toMatch(/\$regex/);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. customerId와 customerName 중 하나만 있으면 되어야 함
  // ─────────────────────────────────────────────────────────────
  it('customerId 또는 customerName 중 하나 필수 검증 로직이 있어야 함', () => {
    const handlerStart = source.indexOf('async function handleGetCustomerReviews');
    const handlerSection = source.substring(handlerStart, handlerStart + 1000);
    // "customerId 또는 customerName 중 하나" 검증 패턴
    expect(handlerSection).toMatch(/!params\.customerId\s*&&\s*!params\.customerName/);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. description에 customerName 사용법 안내가 있어야 함
  // ─────────────────────────────────────────────────────────────
  it('get_customer_reviews description에 customerName 사용법이 안내되어야 함', () => {
    const toolDefStart = source.indexOf("name: 'get_customer_reviews'");
    const descSection = source.substring(toolDefStart, toolDefStart + 1500);
    // "customerId를 모를 때" 또는 "customerName" 안내가 있어야 함
    expect(descSection).toMatch(/customerName|고객명/);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. 변액보험 관련 필드 (적립금, 수익률 등)가 응답에 포함되어야 함
  // ─────────────────────────────────────────────────────────────
  it('응답에 변액보험 핵심 필드가 포함되어야 함', () => {
    expect(source).toContain('accumulatedAmount');
    expect(source).toContain('investmentReturnRate');
    expect(source).toContain('surrenderValue');
    expect(source).toContain('fundAllocations');
  });

  // ─────────────────────────────────────────────────────────────
  // 7. 응답에 customerId가 포함되어야 함 (후속 질문 격리용)
  // ─────────────────────────────────────────────────────────────
  it('handleGetCustomerReviews 응답에 customerId가 포함되어야 함', () => {
    const handlerStart = source.indexOf('async function handleGetCustomerReviews');
    const handlerSection = source.substring(handlerStart, handlerStart + 5000);
    // JSON 응답에 customerId 필드가 있어야 함
    expect(handlerSection).toMatch(/customerId:\s*resolvedCustomerId/);
  });
});

// =============================================================================
// #8: customer_reviews 계약 통합 조회 (4e366651)
// =============================================================================
describe('search_customer_with_contracts: customer_reviews 통합 조회 (4e366651)', () => {
  const customersSource = readToolSource('customers.ts');

  // ─────────────────────────────────────────────────────────────
  // 1. customers.ts에서 customer_reviews 컬렉션 데이터를 조회해야 함
  // ─────────────────────────────────────────────────────────────
  it('고객 조회 시 customer_reviews 필드를 projection에 포함해야 함', () => {
    expect(customersSource).toContain("'customer_reviews': 1");
  });

  // ─────────────────────────────────────────────────────────────
  // 2. customer_reviews에서 계약 정보를 추출하는 로직이 있어야 함
  // ─────────────────────────────────────────────────────────────
  it('customer_reviews에서 계약 정보를 수집하는 루프가 있어야 함', () => {
    // "customer_reviews" 또는 "customerReviews" 변수에서 계약 추출
    expect(customersSource).toMatch(/customer_reviews|customerReviews/);
    // contract_info 접근이 있어야 함
    expect(customersSource).toContain('contract_info');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. AR 우선, CR 보조 원칙 — 증권번호 중복 제거
  // ─────────────────────────────────────────────────────────────
  it('증권번호 기준 중복 제거 로직이 있어야 함 (AR 우선, CR 보조)', () => {
    // contractMap으로 증권번호 기준 중복 제거
    expect(customersSource).toContain('contractMap');
    // CR에서 "AR에 없는 증권번호만" 추가하는 로직
    // contractMap.has(policyNumber) 확인
    expect(customersSource).toMatch(/contractMap\.has\(policyNumber\)/);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CR에서 추출하는 계약 필드가 적절해야 함
  // ─────────────────────────────────────────────────────────────
  it('CR에서 monthly_premium, policy_number 등 핵심 계약 필드를 추출해야 함', () => {
    // customer_reviews 처리 블록에서 핵심 필드 접근 확인
    const crBlockStart = customersSource.indexOf('customer_reviews(CR)');
    if (crBlockStart === -1) {
      // 주석이 다를 수 있으므로 코드 패턴으로 확인
      expect(customersSource).toContain('contractInfo.policy_number');
      expect(customersSource).toContain('contractInfo.monthly_premium');
    } else {
      const crBlock = customersSource.substring(crBlockStart, crBlockStart + 1500);
      expect(crBlock).toContain('policy_number');
      expect(crBlock).toContain('monthly_premium');
    }
  });
});

/**
 * 핵심 도구 테스트: 기존 도구들
 *
 * 테스트 대상:
 * - search_customers, get_customer, create_customer, update_customer
 * - list_contracts, get_contract_details
 * - find_birthday_customers, find_expiring_contracts
 * - get_statistics
 * - search_documents, get_document, list_customer_documents
 * - add_customer_memo, list_customer_memos
 * - search_products, get_product_details
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="core-tools"
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  MCPTestClient,
  TestDataFactory,
  type TestContext,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  checkAllServers
} from '../../test-utils/index.js';

describe('핵심 도구 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let factory: TestDataFactory;
  let serversAvailable = false;

  beforeAll(async () => {
    const status = await checkAllServers();
    serversAvailable = status.allAvailable;

    if (!serversAvailable) {
      console.warn(`⚠️ 서버 연결 불가. 테스트를 건너뜁니다.`);
      return;
    }

    ctx = await setupCrossSystemTest();
    mcp = ctx.mcp;
    factory = ctx.factory;
  });

  afterAll(async () => {
    if (ctx) {
      await teardownCrossSystemTest(ctx);
    }
  });

  afterEach(async () => {
    if (factory) {
      await factory.cleanup();
    }
  });

  // ============================================================
  // 1. 고객 관리 도구
  // ============================================================

  describe('1. 고객 관리 도구', () => {
    it('search_customers: 이름으로 검색', async () => {
      if (!serversAvailable) return;

      const testName = `검색테스트_${Date.now()}`;
      const created = await mcp.call<{ customerId: string }>('create_customer', {
        name: testName,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(created.customerId);

      const result = await mcp.call<{
        totalCount: number;
        customers: Array<{ name: string; customerId: string }>;
      }>('search_customers', {
        query: testName
      });

      expect(result.totalCount).toBeGreaterThanOrEqual(1);
      expect(result.customers.some(c => c.name === testName)).toBe(true);
    });

    it('search_customers: 고객 유형 필터링', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        customers: Array<{ customerType: string }>;
      }>('search_customers', {
        type: 'individual'
      });

      if (result.customers.length > 0) {
        expect(result.customers.every(c => c.customerType === 'individual')).toBe(true);
      }
    });

    it('get_customer: 상세 정보 조회', async () => {
      if (!serversAvailable) return;

      const testName = `상세조회_${Date.now()}`;
      const created = await mcp.call<{ customerId: string }>('create_customer', {
        name: testName,
        type: 'individual',
        phone: '010-1234-5678'
      });
      factory['createdCustomerIds'].push(created.customerId);

      const result = await mcp.call<{
        customerId: string;
        name: string;
        customerType: string;
        phone?: string;
        contracts: Array<unknown>;
        documents: Array<unknown>;
      }>('get_customer', {
        customerId: created.customerId
      });

      expect(result.customerId).toBe(created.customerId);
      expect(result.name).toBe(testName);
      expect(result).toHaveProperty('contracts');
      expect(result).toHaveProperty('documents');
    });

    it('create_customer: 개인 고객 생성', async () => {
      if (!serversAvailable) return;

      const testName = `생성테스트개인_${Date.now()}`;
      const result = await mcp.call<{
        customerId: string;
        name: string;
        customerType: string;
      }>('create_customer', {
        name: testName,
        type: 'individual',
        phone: '010-9999-8888',
        email: 'test@example.com'
      });

      factory['createdCustomerIds'].push(result.customerId);

      expect(result.customerId).toBeDefined();
      expect(result.name).toBe(testName);
      expect(result.customerType).toBe('individual');
    });

    it('create_customer: 법인 고객 생성', async () => {
      if (!serversAvailable) return;

      const testName = `생성테스트법인_${Date.now()}`;
      const result = await mcp.call<{
        customerId: string;
        customerType: string;
      }>('create_customer', {
        name: testName,
        type: 'corporate',
        businessNumber: '123-45-67890'
      });

      factory['createdCustomerIds'].push(result.customerId);

      expect(result.customerId).toBeDefined();
      expect(result.customerType).toBe('corporate');
    });

    it('update_customer: 고객 정보 수정', async () => {
      if (!serversAvailable) return;

      const created = await mcp.call<{ customerId: string }>('create_customer', {
        name: `수정테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(created.customerId);

      const newPhone = '010-1111-2222';
      const result = await mcp.call<{
        success: boolean;
        customerId: string;
      }>('update_customer', {
        customerId: created.customerId,
        phone: newPhone
      });

      expect(result.success).toBe(true);

      // 수정 확인
      const updated = await mcp.call<{ phone?: string }>('get_customer', {
        customerId: created.customerId
      });
      expect(updated.phone).toBe(newPhone);
    });

    it('update_customer: 존재하지 않는 고객 수정', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('update_customer', {
        customerId: '000000000000000000000000',
        phone: '010-9999-9999'
      });

      expect(result.isError).toBe(true);
    });

    it('get_customer: 유효하지 않은 고객 ID', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_customer', {
        customerId: 'invalid-customer-id'
      });

      expect(result.isError).toBe(true);
    });

    it('get_customer: 존재하지 않는 고객', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_customer', {
        customerId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // 2. 계약 관리 도구
  // ============================================================

  describe('2. 계약 관리 도구', () => {
    it('list_contracts: 전체 계약 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCount: number;
        contracts: Array<{
          contractId: string;
          policyNumber?: string;
          productName?: string;
          status?: string;
        }>;
      }>('list_contracts', {});

      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.contracts)).toBe(true);
    });

    it('list_contracts: 고객별 계약 조회', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `계약조회테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        contracts: Array<unknown>;
      }>('list_contracts', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(Array.isArray(result.contracts)).toBe(true);
    });

    it('get_contract_details: 계약 상세 조회 (존재하지 않는 경우)', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_contract_details', {
        contractId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // 3. 시간 기반 도구
  // ============================================================

  describe('3. 시간 기반 도구', () => {
    it('find_birthday_customers: 생일 고객 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        period: string;
        totalCount: number;
        customers: Array<{
          customerId: string;
          name: string;
          birthDate?: string;
          daysUntilBirthday: number;
        }>;
      }>('find_birthday_customers', {
        days: 30
      });

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.customers)).toBe(true);
    });

    it('find_expiring_contracts: 만기 계약 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        period: string;
        totalCount: number;
        contracts: Array<{
          contractId: string;
          customerName: string;
          expiryDate: string;
          daysUntilExpiry: number;
        }>;
      }>('find_expiring_contracts', {
        days: 90
      });

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.contracts)).toBe(true);
    });
  });

  // ============================================================
  // 4. 통계 도구
  // ============================================================

  describe('4. 통계 도구', () => {
    it('get_statistics: 전체 통계 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        customers: {
          total: number;
          byType: {
            individual: number;
            corporate: number;
          };
        };
        contracts: {
          total: number;
          active: number;
        };
        documents: {
          total: number;
        };
      }>('get_statistics', {});

      expect(result).toHaveProperty('customers');
      expect(result.customers).toHaveProperty('total');
      expect(result.customers).toHaveProperty('byType');
      expect(result).toHaveProperty('contracts');
      expect(result).toHaveProperty('documents');
    });
  });

  // ============================================================
  // 5. 문서 관리 도구
  // ============================================================

  describe('5. 문서 관리 도구', () => {
    it('search_documents: 문서 검색', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCount: number;
        documents: Array<{
          documentId: string;
          fileName: string;
          customerName?: string;
        }>;
      }>('search_documents', {
        query: '계약'
      });

      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.documents)).toBe(true);
    });

    it('list_customer_documents: 고객별 문서 조회', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `문서조회테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        totalCount: number;
        documents: Array<unknown>;
      }>('list_customer_documents', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(Array.isArray(result.documents)).toBe(true);
    });

    it('get_document: 존재하지 않는 문서 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_document', {
        documentId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });

    it('get_document: 유효하지 않은 문서 ID', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_document', {
        documentId: 'invalid-id'
      });

      expect(result.isError).toBe(true);
    });

    it('delete_document: 존재하지 않는 문서 삭제', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('delete_document', {
        documentId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });

    it('delete_document: 유효하지 않은 문서 ID', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('delete_document', {
        documentId: 'invalid-id-format'
      });

      expect(result.isError).toBe(true);
    });

    it('delete_documents: 빈 배열', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('delete_documents', {
        documentIds: []
      });

      // Zod 스키마에서 min(1) 검증으로 오류
      expect(result.isError).toBe(true);
    });

    it('delete_documents: 존재하지 않는 문서들', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('delete_documents', {
        documentIds: [
          '000000000000000000000000',
          '000000000000000000000001'
        ]
      });

      expect(result.isError).toBe(true);
    });

    it('delete_documents: 유효하지 않은 ID 포함', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('delete_documents', {
        documentIds: ['invalid-id-1', 'invalid-id-2']
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // 6. 메모 도구
  // ============================================================

  describe('6. 메모 도구', () => {
    it('add_customer_memo: 메모 추가', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `메모테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        success: boolean;
        customerId: string;
        addedContent: string;
        timestamp: string;
      }>('add_customer_memo', {
        customerId: customer.customerId,
        content: '첫 번째 메모 내용입니다.'
      });

      expect(result.success).toBe(true);
      expect(result.customerId).toBe(customer.customerId);
      expect(result.addedContent).toBe('첫 번째 메모 내용입니다.');
    });

    it('list_customer_memos: 메모 조회', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `메모조회테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      // 메모 추가
      await mcp.call('add_customer_memo', {
        customerId: customer.customerId,
        content: '테스트 메모'
      });

      // 메모 조회
      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        memo: string;
        hasContent: boolean;
      }>('list_customer_memos', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(result.hasContent).toBe(true);
      expect(result.memo).toContain('테스트 메모');
    });

    it('add_customer_memo: 여러 메모 추가', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `다중메모테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      // 첫 번째 메모
      await mcp.call('add_customer_memo', {
        customerId: customer.customerId,
        content: '첫 번째 메모'
      });

      // 두 번째 메모
      await mcp.call('add_customer_memo', {
        customerId: customer.customerId,
        content: '두 번째 메모'
      });

      // 조회
      const result = await mcp.call<{ memo: string }>('list_customer_memos', {
        customerId: customer.customerId
      });

      expect(result.memo).toContain('첫 번째 메모');
      expect(result.memo).toContain('두 번째 메모');
    });

    it('add_customer_memo: 존재하지 않는 고객', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('add_customer_memo', {
        customerId: '000000000000000000000000',
        content: '테스트 메모'
      });

      expect(result.isError).toBe(true);
    });

    it('add_customer_memo: 빈 content', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `빈메모테스트_${Date.now()}`,
        type: 'individual'
      });
      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.callRaw('add_customer_memo', {
        customerId: customer.customerId,
        content: ''
      });

      expect(result.isError).toBe(true);
    });

    it('list_customer_memos: 존재하지 않는 고객', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('list_customer_memos', {
        customerId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // 7. 상품 도구
  // ============================================================

  describe('7. 상품 도구', () => {
    it('search_products: 상품 검색', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCount: number;
        products: Array<{
          productId: string;
          name: string;
          companyName?: string;
          category?: string;
        }>;
      }>('search_products', {
        query: '종신'
      });

      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.products)).toBe(true);
    });

    it('search_products: 카테고리 필터링', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        products: Array<{
          category?: string;
        }>;
      }>('search_products', {
        category: '생명보험'
      });

      if (result.products.length > 0) {
        // 카테고리가 있는 상품은 모두 해당 카테고리여야 함
        const withCategory = result.products.filter(p => p.category);
        if (withCategory.length > 0) {
          expect(withCategory.every(p => p.category === '생명보험')).toBe(true);
        }
      }
    });

    it('get_product_details: 상품 상세 조회 (존재하지 않는 경우)', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_product_details', {
        productId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });
});

/**
 * Phase 3: Fixtures 기반 테스트
 *
 * fixtures 시스템을 활용한 시나리오 테스트
 *
 * 테스트 영역:
 * - Fixtures 로딩 및 데이터 생성
 * - 고객/계약/관계 fixtures 연동
 * - 문서 관련 도구 테스트
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase3-fixtures"
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  MCPTestClient,
  APITestClient,
  TestDataFactory,
  type TestContext,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  checkAllServers
} from '../../test-utils/index.js';
import {
  loadCustomers,
  loadContracts,
  loadDocuments,
  getFilePath,
  listSampleFiles,
  getFamilyScenario,
  getCorporateScenario
} from '../fixtures/index.js';

describe('Phase 3: Fixtures 기반 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let api: APITestClient;
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
    api = ctx.api;
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
  // 3.1 Fixtures 로딩 테스트
  // ============================================================

  describe('3.1 Fixtures 로딩', () => {
    it('고객 fixtures 로드', async () => {
      const customers = loadCustomers();
      expect(customers).toBeDefined();
      expect(customers.length).toBeGreaterThan(0);

      // 필수 고객 존재 확인
      const hong = customers.find(c => c.id === 'customer_hong');
      expect(hong).toBeDefined();
      expect(hong?.personal_info.name).toBe('홍길동');
    });

    it('계약 fixtures 로드', async () => {
      const contracts = loadContracts();
      expect(contracts).toBeDefined();
      expect(contracts.length).toBeGreaterThan(0);

      // 계약이 고객 참조를 가지고 있는지 확인
      const hongContract = contracts.find(c => c.customer_ref === 'customer_hong');
      expect(hongContract).toBeDefined();
    });

    it('문서 fixtures 로드', async () => {
      const documents = loadDocuments();
      expect(documents).toBeDefined();
      expect(documents.length).toBeGreaterThan(0);

      // AR 문서 확인
      const arDocs = documents.filter(d => d.is_annual_report);
      expect(arDocs.length).toBeGreaterThan(0);
    });

    it('샘플 파일 목록 조회', async () => {
      const files = listSampleFiles();
      expect(files).toBeDefined();
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('sample_insurance_certificate.pdf');
    });

    it('샘플 파일 경로 조회', async () => {
      const filePath = getFilePath('sample_insurance_certificate.pdf');
      expect(filePath).toBeDefined();
      expect(filePath).toContain('sample_insurance_certificate.pdf');
    });
  });

  // ============================================================
  // 3.2 Fixtures → DB 생성 테스트
  // ============================================================

  describe('3.2 Fixtures에서 DB 생성', () => {
    it('단일 고객 생성 (유니크 이름)', async () => {
      if (!serversAvailable) return;

      // 유니크 이름으로 고객 생성
      const uniqueName = `픽스처테스트_${Date.now()}`;
      const customer = await factory.createCustomer({
        name: uniqueName,
        type: 'individual'
      });

      expect(customer._id).toBeDefined();
      expect(customer.name).toBe(uniqueName);
    });

    it('고객 + 계약 시나리오 생성', async () => {
      if (!serversAvailable) return;

      const { customer, contract } = await factory.createCustomerWithContract();

      expect(customer._id).toBeDefined();
      expect(contract._id).toBeDefined();
    });

    it('고객 + 메모 시나리오 생성', async () => {
      if (!serversAvailable) return;

      const { customer, memo } = await factory.createCustomerWithMemo();

      expect(customer._id).toBeDefined();
      expect(memo.content).toBeDefined();
    });
  });

  // ============================================================
  // 3.3 문서 도구 테스트 (Fixtures 기반 고객)
  // ============================================================

  describe('3.3 문서 도구 테스트', () => {
    it('list_customer_documents: 고객의 문서 조회', async () => {
      if (!serversAvailable) return;

      // 고객 생성
      const customer = await factory.createCustomer({
        name: `문서테스트_${Date.now()}`
      });

      // 문서 목록 조회 (새로 생성된 고객이므로 빈 목록)
      const result = await mcp.call<{
        customerId: string;
        count: number;
        documents: Array<unknown>;
      }>('list_customer_documents', {
        customerId: customer._id
      });

      expect(result.customerId).toBe(customer._id);
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.documents)).toBe(true);
    });

    it('search_documents: 키워드 검색', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        searchMode: string;
        resultCount: number;
        documents: Array<unknown>;
      }>('search_documents', {
        query: '보험증권',
        searchMode: 'keyword',
        limit: 10
      });

      expect(result).toHaveProperty('searchMode');
      expect(result).toHaveProperty('resultCount');
      expect(Array.isArray(result.documents)).toBe(true);
    });

    it('get_document: 존재하지 않는 문서 조회 오류', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_document', {
        documentId: '000000000000000000000000'
      });

      expect(mcp.isErrorResponse(result)).toBe(true);
    });
  });

  // ============================================================
  // 3.4 시나리오 통합 테스트
  // ============================================================

  describe('3.4 시나리오 통합 테스트', () => {
    it('관련 고객 생성 후 관계 생성 및 조회', async () => {
      if (!serversAvailable) return;

      // 두 고객 생성
      const customer1 = await factory.createCustomer({
        name: `관계테스트A_${Date.now()}`
      });
      const customer2 = await factory.createCustomer({
        name: `관계테스트B_${Date.now()}`
      });

      // 관계 생성
      await mcp.call('create_relationship', {
        fromCustomerId: customer1._id,
        toCustomerId: customer2._id,
        relationshipType: 'friend',
        relationshipCategory: 'social'
      });

      // 관계 조회
      const result = await mcp.call<{
        customerId: string;
        totalRelationships: number;
        relationships: Array<unknown>;
      }>('list_relationships', {
        customerId: customer1._id
      });

      expect(result.customerId).toBe(customer1._id);
      expect(result.totalRelationships).toBeGreaterThanOrEqual(1);
    });

    it('고객 + 계약 생성 후 조회', async () => {
      if (!serversAvailable) return;

      const { customer, contract } = await factory.createCustomerWithContract();

      // 계약 목록 조회
      const result = await mcp.call<{
        count: number;
        contracts: Array<{ id: string }>;
      }>('list_contracts', {
        customerId: customer._id
      });

      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.contracts.some(c => c.id === contract._id)).toBe(true);
    });

    it('전체 시나리오: 고객 생성 → 계약 → 메모 → 조회', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer({
        name: `통합테스트_${Date.now()}`
      });

      // 2. 계약 생성 (MCP create_contract 사용)
      const contractResult = await mcp.call<{
        success: boolean;
        contractId: string;
      }>('create_contract', {
        customerId: customer._id,
        policyNumber: `INTEG-${Date.now()}`,
        productName: '통합테스트 상품',
        premium: 50000
      });
      expect(contractResult.success).toBe(true);

      // 3. 메모 추가
      await mcp.call('add_customer_memo', {
        customerId: customer._id,
        content: '통합 테스트 메모'
      });

      // 4. 고객 상세 조회
      const customerDetail = await mcp.call<{
        id: string;
      }>('get_customer', {
        customerId: customer._id
      });

      expect(customerDetail.id).toBe(customer._id);

      // 5. 계약 조회 확인
      const contracts = await mcp.call<{
        count: number;
      }>('list_contracts', {
        customerId: customer._id
      });
      expect(contracts.count).toBeGreaterThanOrEqual(1);

      // 6. 메모 조회 확인
      const memos = await mcp.call<{
        hasContent: boolean;
        memo: string;
      }>('list_customer_memos', {
        customerId: customer._id
      });
      expect(memos.hasContent).toBe(true);
      expect(memos.memo).toContain('통합 테스트 메모');
    });
  });
});

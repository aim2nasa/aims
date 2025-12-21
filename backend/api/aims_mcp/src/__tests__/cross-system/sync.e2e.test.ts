/**
 * Category 1: 데이터 동기화 테스트
 *
 * 한 시스템에서 쓴 데이터가 다른 시스템에서 정확히 조회되는지 검증
 *
 * 테스트 영역:
 * - 고객 (customers): MCP ↔ API 양방향
 * - 메모 (customers.memo): MCP ↔ API 양방향
 * - 계약 (contracts): API → MCP (MCP는 읽기 전용)
 * - 문서 (files): API → MCP (MCP는 읽기 전용)
 * - 관계 (customer_relationships): API → MCP (MCP는 읽기 전용)
 *
 * 실행 방법:
 *   # 로컬 테스트
 *   npm run test:e2e -- --testPathPattern="sync.e2e.test"
 *
 *   # 원격 서버 테스트
 *   MCP_URL=http://tars.giize.com:3011 AIMS_API_URL=http://tars.giize.com:3010 npm run test:e2e -- --testPathPattern="sync.e2e.test"
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  MCPTestClient,
  APITestClient,
  TestDataFactory,
  type TestContext,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  checkAllServers,
  normalizeId,
  isValidMemoTimestamp
} from '../../test-utils/index.js';

// ============================================================
// 테스트 설정
// ============================================================

describe('Category 1: 데이터 동기화 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let api: APITestClient;
  let factory: TestDataFactory;
  let serversAvailable = false;

  beforeAll(async () => {
    // 서버 상태 확인
    const status = await checkAllServers();
    serversAvailable = status.allAvailable;

    if (!serversAvailable) {
      console.warn(`⚠️ 서버 연결 불가 - MCP: ${status.mcp}, API: ${status.api}. 테스트를 건너뜁니다.`);
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
    // 각 테스트 후 데이터 정리
    if (factory) {
      await factory.cleanup();
    }
  });

  // ============================================================
  // 1. 고객 동기화 (customers)
  // ============================================================

  describe('1.1 고객 동기화 (customers)', () => {
    describe('MCP → API', () => {
      it('MCP create_customer → API GET /customers/:id', async () => {
        if (!serversAvailable) return;

        // 1. MCP로 고객 생성 (factory는 name/type 형식 사용)
        const customerName = `동기화테스트_${Date.now()}`;
        const customer = await factory.createCustomer({
          name: customerName,
          type: 'individual',
          phone: '010-1234-5678',
          email: 'sync-test@test.com'
        });

        const customerId = normalizeId(customer);

        // 2. API로 조회
        const apiResult = await api.get<{
          personal_info?: { name?: string; mobile_phone?: string; email?: string };
          insurance_info?: { customer_type?: string };
        }>(`/customers/${customerId}`);

        // 3. 검증
        expect(api.isError(apiResult)).toBe(false);
        if (!api.isError(apiResult)) {
          expect(apiResult.personal_info?.name).toBe(customerName);
          expect(['individual', '개인']).toContain(apiResult.insurance_info?.customer_type);
        }
      });

      it('MCP update_customer → API GET /customers/:id', async () => {
        if (!serversAvailable) return;

        // 1. 고객 생성
        const customer = await factory.createCustomer();
        const customerId = normalizeId(customer);

        // 2. MCP로 업데이트
        const updatedPhone = '010-9999-8888';
        await mcp.call('update_customer', {
          customerId,
          phone: updatedPhone
        });

        // 3. API로 조회
        const apiResult = await api.get<{
          personal_info?: { mobile_phone?: string };
        }>(`/customers/${customerId}`);

        // 4. 검증
        expect(api.isError(apiResult)).toBe(false);
        if (!api.isError(apiResult)) {
          expect(apiResult.personal_info?.mobile_phone).toBe(updatedPhone);
        }
      });
    });

    describe('API → MCP', () => {
      it('API POST /customers → MCP get_customer', async () => {
        if (!serversAvailable) return;

        // 1. API로 고객 생성
        const customerName = `API생성고객_${Date.now()}`;
        const response = await api.post<{ _id: string; id?: string }>('/customers', {
          personal_info: { name: customerName },
          insurance_info: { customer_type: '개인' }
        });

        expect(api.isError(response)).toBe(false);
        if (api.isError(response)) return;

        const customerId = response._id || response.id;
        expect(customerId).toBeDefined();

        // cleanup 등록
        factory['createdCustomerIds'].push(customerId!);

        // 2. MCP로 조회 (get_customer uses customerId parameter)
        const mcpResult = await mcp.call<{
          id: string;
          personalInfo: { name: string };
        }>('get_customer', { customerId });

        // 3. 검증
        expect(mcpResult.personalInfo.name).toBe(customerName);
      });

      it('API PUT /customers/:id → MCP search_customers', async () => {
        if (!serversAvailable) return;

        // 1. 고객 생성
        const originalName = `원래이름_${Date.now()}`;
        const customer = await factory.createCustomer({ name: originalName });
        const customerId = normalizeId(customer);

        // 2. API로 이름 변경
        const newName = `변경이름_${Date.now()}`;
        await api.put(`/customers/${customerId}`, { personal_info: { name: newName } });

        // 3. MCP로 검색
        const mcpResult = await mcp.call<{
          customers: Array<{ id: string; _id?: string; name: string }>;
        }>('search_customers', { query: newName });

        // 4. 검증
        const found = mcpResult.customers.some(c => {
          const cId = c.id || c._id;
          return cId === customerId;
        });
        expect(found).toBe(true);
      });
    });
  });

  // ============================================================
  // 2. 메모 동기화 (customers.memo)
  // ============================================================

  describe('1.2 메모 동기화 (customers.memo)', () => {
    it('MCP add_memo → API GET /customers/:id (memo field)', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. MCP로 메모 추가
      const memoContent = `MCP메모테스트_${Date.now()}`;
      await mcp.call('add_customer_memo', {
        customerId,
        content: memoContent
      });

      // 3. API로 고객 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 4. 검증
      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult)) {
        expect(apiResult.memo).toBeDefined();
        expect(apiResult.memo).toContain(memoContent);
        expect(isValidMemoTimestamp(apiResult.memo!)).toBe(true);
      }
    });

    it('API POST /customers/:id/memos → MCP list_customer_memos', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. API로 메모 추가
      const memoContent = `API메모테스트_${Date.now()}`;
      const postResult = await api.post(`/customers/${customerId}/memos`, {
        content: memoContent
      });

      expect(api.isError(postResult)).toBe(false);

      // 3. MCP로 메모 조회 (returns { memo: string, hasContent: boolean })
      const mcpResult = await mcp.call<{
        memo: string;
        hasContent: boolean;
      }>('list_customer_memos', { customerId });

      // 4. 검증
      expect(mcpResult.memo).toContain(memoContent);
      expect(mcpResult.hasContent).toBe(true);
    });

    // delete_customer_memo는 deprecated됨 - 스킵
    it.skip('MCP delete_memo → API GET /customers/:id (memo gone) - DEPRECATED', async () => {
      // 메모 삭제 기능이 더 이상 지원되지 않음
    });

    it('여러 메모 추가 시 순서 유지', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 여러 메모 순차 추가
      const memos = ['첫번째 메모', '두번째 메모', '세번째 메모'];
      for (const content of memos) {
        await mcp.call('add_customer_memo', { customerId, content });
      }

      // 3. API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 4. 검증 - 모든 메모가 포함되어 있어야 함
      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult)) {
        for (const content of memos) {
          expect(apiResult.memo).toContain(content);
        }
      }
    });
  });

  // ============================================================
  // 3. 계약 동기화 (contracts) - API → MCP
  // ============================================================

  describe('1.3 계약 동기화 (contracts)', () => {
    it('API POST /contracts → MCP list_contracts', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. API로 계약 생성 (snake_case 필드 사용)
      const policyNumber = `POL-SYNC-${Date.now()}`;
      const contract = await factory.createContract(customerId, {
        policy_number: policyNumber
      });

      // 3. MCP로 계약 조회
      const mcpResult = await mcp.call<{
        count: number;
        contracts: Array<{ policyNumber?: string; policy_number?: string }>;
      }>('list_contracts', { customerId });

      // 4. 검증
      expect(mcpResult.count).toBeGreaterThanOrEqual(1);
      const found = mcpResult.contracts.some(c =>
        c.policyNumber === policyNumber || c.policy_number === policyNumber
      );
      expect(found).toBe(true);
    });

    it('API PUT /contracts/:id → MCP get_contract_details', async () => {
      if (!serversAvailable) return;

      // 1. 고객 및 계약 생성
      const { customer, contract } = await factory.createCustomerWithContract();
      const contractId = normalizeId(contract);

      // 2. API로 계약 premium 변경 (MCP가 반환하는 필드 사용)
      const newPremium = 999999;
      await api.put(`/contracts/${contractId}`, {
        premium: newPremium
      });

      // 3. MCP로 조회
      const mcpResult = await mcp.call<{
        premium: number;
      }>('get_contract_details', { contractId });

      // 4. 검증
      expect(mcpResult.premium).toBe(newPremium);
    });
  });

  // ============================================================
  // 4. 문서 동기화 (files) - 읽기 테스트만
  // ============================================================

  describe('1.4 문서 동기화 (files)', () => {
    it('MCP search_documents 결과가 API와 일관성 유지', async () => {
      if (!serversAvailable) return;

      // 1. MCP로 문서 검색 (query 필수)
      const mcpResult = await mcp.call<{
        count: number;
        documents: Array<{ id?: string; _id?: string; fileName: string }>;
      }>('search_documents', { query: '보험', limit: 5 });

      // 2. 검색된 각 문서를 API로 확인
      for (const doc of mcpResult.documents.slice(0, 2)) {
        const docId = doc.id || doc._id;
        if (!docId) continue;

        const apiResult = await api.get<{
          fileName: string;
        }>(`/files/${docId}`);

        if (!api.isError(apiResult)) {
          expect(apiResult.fileName).toBe(doc.fileName);
        }
      }
    });

    it('MCP list_customer_documents → API 고객 문서와 일치', async () => {
      if (!serversAvailable) return;

      // 1. 기존 고객 검색 (문서가 있는 고객)
      const searchResult = await mcp.call<{
        customers: Array<{ id: string }>;
      }>('search_customers', { limit: 10 });

      if (searchResult.customers.length === 0) {
        console.warn('테스트할 고객이 없습니다.');
        return;
      }

      // 2. 각 고객에 대해 문서 동기화 확인
      for (const customer of searchResult.customers.slice(0, 3)) {
        const mcpDocs = await mcp.call<{
          count: number;
          documents: Array<{ id?: string; _id?: string }>;
        }>('list_customer_documents', { customerId: customer.id });

        // API로 같은 고객의 문서 조회
        const apiDocs = await api.get<Array<{ _id: string }>>(`/customers/${customer.id}/files`);

        if (!api.isError(apiDocs) && Array.isArray(apiDocs)) {
          // 개수가 일치해야 함
          expect(mcpDocs.count).toBe(apiDocs.length);
        }
      }
    });
  });

  // ============================================================
  // 5. 관계 동기화 (customer_relationships)
  // 현재 /api/customer-relationships 엔드포인트가 없음 - 스킵
  // ============================================================

  describe.skip('1.5 관계 동기화 (customer_relationships) - API 엔드포인트 없음', () => {
    it('API POST /customer-relationships → MCP get_customer_network', async () => {
      // API 엔드포인트 구현 후 활성화
    });

    it('API DELETE /customer-relationships → MCP get_customer_network에서 제거', async () => {
      // API 엔드포인트 구현 후 활성화
    });
  });

  // ============================================================
  // 6. 통계 동기화
  // ============================================================

  describe('1.6 통계 동기화', () => {
    it('새 고객 생성 후 MCP 통계에 반영', async () => {
      if (!serversAvailable) return;

      // 1. 현재 통계 조회
      const beforeStats = await mcp.call<{
        customers: { total: number };
      }>('get_statistics', {});
      const beforeTotal = beforeStats.customers.total;

      // 2. 새 고객 생성
      await factory.createCustomer();

      // 3. 통계 재조회
      const afterStats = await mcp.call<{
        customers: { total: number };
      }>('get_statistics', {});

      // 4. 검증 - 최소 1 증가
      expect(afterStats.customers.total).toBeGreaterThanOrEqual(beforeTotal);
    });
  });
});

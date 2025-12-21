/**
 * Category 2: 데이터 무결성 테스트
 *
 * 필드 형식, 타입, 값 범위가 양 시스템에서 일관되게 처리되는지 검증
 *
 * 테스트 영역:
 * - ObjectId 형식 일관성
 * - 날짜/시간 형식 일관성
 * - 필드 매핑 일관성 (type, status 등)
 * - 한글/특수문자 처리
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="integrity.e2e.test"
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
  isValidObjectId,
  isValidMemoTimestamp
} from '../../test-utils/index.js';

describe('Category 2: 데이터 무결성 테스트', () => {
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
  // 2.1 ObjectId 형식 일관성
  // ============================================================

  describe('2.1 ObjectId 형식 일관성', () => {
    it('MCP가 반환한 ObjectId를 API에서 정상 인식', async () => {
      if (!serversAvailable) return;

      // 1. MCP로 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. ID 형식 검증
      expect(typeof customerId).toBe('string');
      expect(isValidObjectId(customerId)).toBe(true);

      // 3. API로 조회
      const apiResult = await api.get<{ _id: string; id?: string }>(`/customers/${customerId}`);

      // 4. 검증
      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult)) {
        const apiId = apiResult._id || apiResult.id;
        expect(apiId).toBe(customerId);
      }
    });

    it('API가 반환한 ObjectId를 MCP에서 정상 인식', async () => {
      if (!serversAvailable) return;

      // 1. API로 고객 생성
      const customerName = `API_ID테스트_${Date.now()}`;
      const response = await api.post<{ _id: string; id?: string }>('/customers', {
        personal_info: { name: customerName },
        insurance_info: { customer_type: '개인' }
      });

      expect(api.isError(response)).toBe(false);
      if (api.isError(response)) return;

      const customerId = response._id || response.id;
      expect(customerId).toBeDefined();
      expect(isValidObjectId(customerId!)).toBe(true);

      // cleanup 등록
      factory['createdCustomerIds'].push(customerId!);

      // 2. MCP로 조회
      const mcpResult = await mcp.call<{ id: string; _id?: string }>('get_customer', {
        customerId
      });

      // 3. 검증
      const mcpId = mcpResult.id || mcpResult._id;
      expect(mcpId).toBe(customerId);
    });

    it('잘못된 ObjectId 형식에 대한 일관된 에러 처리', async () => {
      if (!serversAvailable) return;

      // Note: 빈 문자열과 공백은 라우팅 edge case이므로 제외
      // '' → /api/customers/ (고객 목록 반환)
      // '   ' → URL 인코딩 문제
      const invalidIds = [
        'invalid-id',
        '123',
        'zzzzzzzzzzzzzzzzzzzzzzzz',
        'not-a-valid-objectid'
      ];

      for (const invalidId of invalidIds) {
        // MCP 에러
        try {
          await mcp.call('get_customer', { customerId: invalidId });
          expect.fail(`MCP should throw for invalid ID: ${invalidId}`);
        } catch (error) {
          expect(error).toBeDefined();
        }

        // API 에러 (400 Bad Request)
        const apiResult = await api.get(`/customers/${invalidId}`);
        expect(api.isError(apiResult)).toBe(true);
      }
    });
  });

  // ============================================================
  // 2.2 날짜/시간 형식 일관성
  // ============================================================

  describe('2.2 날짜/시간 형식 일관성', () => {
    it('메모 타임스탬프 형식 일관성 (YYYY.MM.DD HH:mm)', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성 및 메모 추가
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      await mcp.call('add_customer_memo', {
        customerId,
        content: '타임스탬프 테스트'
      });

      // 2. MCP로 메모 조회
      const mcpMemos = await mcp.call<{
        memo: string;
        memos: Array<{ timestamp?: string }>;
      }>('list_customer_memos', { customerId });

      // 3. API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 4. 타임스탬프 형식 검증
      expect(isValidMemoTimestamp(mcpMemos.memo)).toBe(true);

      if (!api.isError(apiResult) && apiResult.memo) {
        expect(isValidMemoTimestamp(apiResult.memo)).toBe(true);

        // 양쪽의 타임스탬프가 동일해야 함
        const mcpTimestamp = mcpMemos.memo.match(/\[\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}\]/)?.[0];
        const apiTimestamp = apiResult.memo.match(/\[\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}\]/)?.[0];
        expect(mcpTimestamp).toBe(apiTimestamp);
      }
    });

    it('계약 날짜 형식 일관성', async () => {
      if (!serversAvailable) return;

      // 1. 고객 및 계약 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      const contractDate = '2025-01-01';

      const contract = await factory.createContract(customerId, {
        contract_date: contractDate
      });
      const contractId = normalizeId(contract);

      // 2. MCP로 조회
      const mcpResult = await mcp.call<{
        contractDate?: string;
        contract_date?: string;
      }>('get_contract_details', { contractId });

      // 3. API로 조회
      const apiResult = await api.get<{
        contract_date?: string;
      }>(`/contracts/${contractId}`);

      // 4. 날짜 동등성 검증
      const mcpDate = mcpResult.contractDate || mcpResult.contract_date;
      if (!api.isError(apiResult) && mcpDate && apiResult.contract_date) {
        expect(new Date(mcpDate).getTime())
          .toBe(new Date(apiResult.contract_date).getTime());
      }
    });
  });

  // ============================================================
  // 2.3 필드 매핑 일관성
  // ============================================================

  describe('2.3 필드 매핑 일관성', () => {
    it('고객 status 필드 매핑', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. MCP로 조회 (returns { meta: { status } })
      const mcpResult = await mcp.call<{
        meta: { status: string };
      }>('get_customer', { customerId });

      // 3. API로 조회 (returns { meta: { status } })
      const apiResult = await api.get<{
        meta?: { status?: string };
      }>(`/customers/${customerId}`);

      // 4. 검증
      if (!api.isError(apiResult)) {
        expect(mcpResult.meta.status).toBe(apiResult.meta?.status);
      }
    });

    it('고객 type 필드 매핑 (individual ↔ 개인)', async () => {
      if (!serversAvailable) return;

      // 1. 개인 고객 생성
      const individual = await factory.createCustomer({ type: 'individual' });
      const individualId = normalizeId(individual);

      // 2. 법인 고객 생성
      const corporate = await factory.createCustomer({ type: 'corporate' });
      const corporateId = normalizeId(corporate);

      // 3. API로 조회 (returns { insurance_info: { customer_type } })
      const apiIndividual = await api.get<{
        insurance_info?: { customer_type?: string };
      }>(`/customers/${individualId}`);
      const apiCorporate = await api.get<{
        insurance_info?: { customer_type?: string };
      }>(`/customers/${corporateId}`);

      // 4. 검증 (한글 또는 영문 모두 허용)
      if (!api.isError(apiIndividual)) {
        expect(['individual', '개인']).toContain(apiIndividual.insurance_info?.customer_type);
      }
      if (!api.isError(apiCorporate)) {
        expect(['corporate', '법인']).toContain(apiCorporate.insurance_info?.customer_type);
      }
    });

    it('계약 status 필드 매핑', async () => {
      if (!serversAvailable) return;

      // 1. 고객 및 계약 생성
      const { customer, contract } = await factory.createCustomerWithContract();
      const contractId = normalizeId(contract);

      // 2. MCP로 조회
      const mcpResult = await mcp.call<{ status: string }>('get_contract_details', {
        contractId
      });

      // 3. API로 조회
      const apiResult = await api.get<{ status: string }>(`/contracts/${contractId}`);

      // 4. 검증
      if (!api.isError(apiResult)) {
        expect(mcpResult.status).toBe(apiResult.status);
      }
    });
  });

  // ============================================================
  // 2.4 한글/특수문자 처리
  // ============================================================

  describe('2.4 한글/특수문자 처리', () => {
    it('한글 고객명 동기화', async () => {
      if (!serversAvailable) return;

      const koreanNames = [
        `홍길동_${Date.now()}`,
        `김철수_${Date.now() + 1}`,
        `이ㄱㄴㄷ한글_${Date.now() + 2}`,
        `박 영희_${Date.now() + 3}` // 공백 포함
      ];

      for (const name of koreanNames) {
        const customer = await factory.createCustomer({ name });
        const customerId = normalizeId(customer);

        // API로 조회 (returns { personal_info: { name } })
        const apiResult = await api.get<{
          personal_info?: { name?: string };
        }>(`/customers/${customerId}`);

        if (!api.isError(apiResult)) {
          expect(apiResult.personal_info?.name).toBe(name);
        }
      }
    });

    it('메모 내 특수문자 유지', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      const specialContent = '메모: "따옴표" & <괄호> \'작은따옴표\'';
      await mcp.call('add_customer_memo', {
        customerId,
        content: specialContent
      });

      // API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      if (!api.isError(apiResult) && apiResult.memo) {
        expect(apiResult.memo).toContain('"따옴표"');
        expect(apiResult.memo).toContain('&');
        expect(apiResult.memo).toContain('<괄호>');
      }
    });

    it('줄바꿈 문자 유지', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      const multilineContent = '첫째 줄\n둘째 줄\n셋째 줄';
      await mcp.call('add_customer_memo', {
        customerId,
        content: multilineContent
      });

      // MCP로 조회
      const mcpResult = await mcp.call<{ memo: string }>('list_customer_memos', {
        customerId
      });

      // API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 줄바꿈이 유지되어야 함
      expect(mcpResult.memo).toContain('첫째 줄');
      expect(mcpResult.memo).toContain('둘째 줄');

      if (!api.isError(apiResult) && apiResult.memo) {
        expect(apiResult.memo).toContain('첫째 줄');
        expect(apiResult.memo).toContain('둘째 줄');
      }
    });
  });

  // ============================================================
  // 2.5 NULL/빈값 처리
  // ============================================================

  describe('2.5 NULL/빈값 처리', () => {
    it('선택적 필드가 없는 고객 동기화', async () => {
      if (!serversAvailable) return;

      // 최소 필드만으로 고객 생성
      const customer = await factory.createCustomer({
        name: `최소필드_${Date.now()}`
        // phone, email 등 미지정
      });
      const customerId = normalizeId(customer);

      // API로 조회 (returns { personal_info: { name, ... } })
      const apiResult = await api.get<{
        personal_info?: { name?: string; mobile_phone?: string; email?: string };
      }>(`/customers/${customerId}`);

      // 에러 없이 조회되어야 함
      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult)) {
        expect(apiResult.personal_info?.name).toBeDefined();
      }
    });

    it('메모가 없는 고객 조회', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 메모 없이 바로 조회
      const mcpResult = await mcp.call<{ memo: string }>('list_customer_memos', {
        customerId
      });

      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 빈 메모 또는 undefined
      expect(mcpResult.memo === '' || mcpResult.memo === undefined || mcpResult.memo === null).toBe(true);

      if (!api.isError(apiResult)) {
        expect(apiResult.memo === '' || apiResult.memo === undefined || apiResult.memo === null).toBe(true);
      }
    });
  });
});

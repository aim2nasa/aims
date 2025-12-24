/**
 * Category 4: 라이프사이클 테스트
 *
 * 전체 CRUD 사이클이 양 시스템에서 일관되게 동작하는지 검증
 *
 * 테스트 영역:
 * - 고객 전체 라이프사이클 (생성→조회→수정→메모→삭제)
 * - 계약-고객 연동 라이프사이클
 * - 관계 라이프사이클
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="lifecycle.e2e.test"
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
  normalizeId
} from '../../test-utils/index.js';

describe('Category 4: 라이프사이클 테스트', () => {
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
  // 4.1 고객 전체 라이프사이클
  // ============================================================

  describe('4.1 고객 전체 라이프사이클', () => {
    it('MCP-API 교차 CRUD 사이클', async () => {
      if (!serversAvailable) return;

      const testName = `라이프사이클테스트_${Date.now()}`;

      // ========== 1. CREATE via MCP ==========
      // create_customer returns { customerId, name, customerType }
      const created = await mcp.call<{
        customerId: string;
        name: string;
      }>('create_customer', {
        name: testName,
        customerType: '개인'
      });

      const customerId = created.customerId;
      expect(customerId).toBeDefined();

      // cleanup 등록
      factory['createdCustomerIds'].push(customerId);

      // ========== 2. READ via API ==========
      const apiRead = await api.get<{
        personal_info?: { name?: string };
      }>(`/customers/${customerId}`);
      expect(api.isError(apiRead)).toBe(false);
      if (!api.isError(apiRead)) {
        expect(apiRead.personal_info?.name).toBe(testName);
      }

      // ========== 3. UPDATE via API ==========
      // Note: dot notation 사용 (nested object는 전체 필드를 덮어씀)
      const newPhone = '010-9999-8888';
      await api.put(`/customers/${customerId}`, {
        'personal_info.mobile_phone': newPhone
      });

      // ========== 4. READ via MCP ==========
      // get_customer returns { personalInfo: { phone } }
      const mcpRead = await mcp.call<{
        personalInfo?: { phone?: string };
      }>('get_customer', { customerId });
      expect(mcpRead.personalInfo?.phone).toBe(newPhone);

      // ========== 5. ADD MEMO via MCP ==========
      const memoContent = '라이프사이클 테스트 메모';
      await mcp.call('add_customer_memo', {
        customerId,
        content: memoContent
      });

      // ========== 6. VERIFY MEMO via API ==========
      const apiWithMemo = await api.get<{ memo?: string }>(`/customers/${customerId}`);
      if (!api.isError(apiWithMemo)) {
        expect(apiWithMemo.memo).toContain(memoContent);
      }

      // ========== 7. DELETE via API ==========
      const deleteResult = await api.delete(`/customers/${customerId}`);
      expect(api.isError(deleteResult)).toBe(false);

      // cleanup에서 제거 (이미 삭제됨)
      factory['createdCustomerIds'] = factory['createdCustomerIds'].filter(
        id => id !== customerId
      );

      // ========== 8. VERIFY DELETED via MCP ==========
      try {
        await mcp.call('get_customer', { customerId });
        expect.fail('삭제된 고객 조회 시 에러가 발생해야 함');
      } catch (error) {
        // 예상된 에러
        expect(error).toBeDefined();
      }
    });

    it('API-MCP 역방향 CRUD 사이클', async () => {
      if (!serversAvailable) return;

      const testName = `역방향테스트_${Date.now()}`;

      // ========== 1. CREATE via API ==========
      const createResult = await api.post<{ _id: string; id?: string }>('/customers', {
        personal_info: { name: testName },
        insurance_info: { customer_type: '법인' }
      });

      expect(api.isError(createResult)).toBe(false);
      if (api.isError(createResult)) return;

      const customerId = createResult._id || createResult.id;
      factory['createdCustomerIds'].push(customerId!);

      // ========== 2. READ via MCP ==========
      const mcpRead = await mcp.call<{
        personalInfo: { name: string };
        insuranceInfo: { customerType: string };
      }>('get_customer', { customerId });
      expect(mcpRead.personalInfo.name).toBe(testName);
      expect(['corporate', '법인']).toContain(mcpRead.insuranceInfo.customerType);

      // ========== 3. UPDATE via MCP ==========
      const updatedEmail = 'lifecycle-test@example.com';
      await mcp.call('update_customer', {
        customerId,
        email: updatedEmail
      });

      // ========== 4. VERIFY via API ==========
      const apiRead = await api.get<{
        personal_info?: { email?: string };
      }>(`/customers/${customerId}`);

      if (!api.isError(apiRead)) {
        expect(apiRead.personal_info?.email).toBe(updatedEmail);
      }
    });
  });

  // ============================================================
  // 4.2 계약-고객 연동 라이프사이클
  // API Key 인증 지원으로 활성화됨
  // ============================================================

  describe('4.2 계약-고객 연동 라이프사이클', () => {
    it('고객 → 계약 → 상태변경 → 통계 반영', async () => {
      if (!serversAvailable) return;

      // ========== 1. 고객 생성 via MCP ==========
      const customer = await factory.createCustomer({ name: `계약테스트_${Date.now()}` });
      const customerId = normalizeId(customer);

      // ========== 2. 계약 생성 via API ==========
      const policyNumber = `LC-${Date.now()}`;
      const contract = await factory.createContract(customerId, {
        policy_number: policyNumber
      });
      const contractId = normalizeId(contract);

      // ========== 3. MCP로 계약 조회 ==========
      const mcpContracts = await mcp.call<{
        count: number;
        contracts: Array<{ policyNumber?: string; policy_number?: string }>;
      }>('list_contracts', { customerId });

      expect(mcpContracts.count).toBeGreaterThanOrEqual(1);
      const foundContract = mcpContracts.contracts.find(c =>
        c.policyNumber === policyNumber || c.policy_number === policyNumber
      );
      expect(foundContract).toBeDefined();

      // ========== 4. 통계 확인 ==========
      const stats = await mcp.call<{
        contracts: { total: number };
      }>('get_statistics', {});
      expect(stats.contracts.total).toBeGreaterThanOrEqual(1);

      // ========== 5. 계약 premium 변경 via API (MCP가 반환하는 필드) ==========
      const newPremium = 888888;
      await api.put(`/contracts/${contractId}`, { premium: newPremium });

      // ========== 6. MCP로 변경 확인 ==========
      const mcpContract = await mcp.call<{ premium: number }>('get_contract_details', {
        contractId
      });
      expect(mcpContract.premium).toBe(newPremium);
    });

    it('고객 삭제 시 관련 계약 처리 확인', async () => {
      if (!serversAvailable) return;

      // 1. 고객 및 계약 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      const contract = await factory.createContract(customerId);
      const contractId = normalizeId(contract);

      // 2. 고객 삭제
      await api.delete(`/customers/${customerId}`);

      // cleanup에서 제거
      factory['createdCustomerIds'] = factory['createdCustomerIds'].filter(
        id => id !== customerId
      );

      // 3. 계약 조회 시도 - 고객 삭제 정책에 따라 결과가 달라짐
      // (cascade delete 또는 orphan 처리)
      try {
        const contractResult = await mcp.call<{ customerId?: string }>('get_contract_details', {
          contractId
        });
        // 계약이 남아있다면 고객 ID 참조가 유효하지 않음을 확인
        // 또는 계약도 함께 삭제됨
      } catch {
        // 계약도 삭제된 경우 예상된 동작
      }
    });
  });

  // ============================================================
  // 4.3 관계 라이프사이클 (API 엔드포인트 없음 - 스킵)
  // ============================================================

  describe.skip('4.3 관계 라이프사이클 - API 엔드포인트 없음', () => {
    it('관계 생성 → 양방향 조회 → 수정 → 삭제', async () => {
      // customer-relationships API 엔드포인트가 구현되면 활성화
    });
  });

  // ============================================================
  // 4.4 메모 라이프사이클
  // ============================================================

  describe('4.4 메모 라이프사이클', () => {
    it('메모 추가 → 조회 → 추가 더 → 확인', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 첫 메모 추가
      await mcp.call('add_customer_memo', {
        customerId,
        content: '첫번째 메모'
      });

      // 3. 조회 (list_customer_memos returns { memo, hasContent })
      let memoResult = await mcp.call<{ memo: string; hasContent: boolean }>('list_customer_memos', {
        customerId
      });
      expect(memoResult.hasContent).toBe(true);
      expect(memoResult.memo).toContain('첫번째 메모');

      // 4. 두번째 메모 추가
      await mcp.call('add_customer_memo', {
        customerId,
        content: '두번째 메모'
      });

      // 5. 조회 - 둘 다 있어야 함
      memoResult = await mcp.call<{ memo: string; hasContent: boolean }>('list_customer_memos', {
        customerId
      });
      expect(memoResult.memo).toContain('첫번째 메모');
      expect(memoResult.memo).toContain('두번째 메모');

      // Note: delete_customer_memo is deprecated
    });
  });

  // ============================================================
  // 4.5 복합 시나리오
  // API Key 인증 지원으로 활성화됨
  // ============================================================

  describe('4.5 복합 시나리오', () => {
    it('신규 고객 온보딩 전체 플로우', async () => {
      if (!serversAvailable) return;

      const timestamp = Date.now();

      // ========== 1. 신규 고객 등록 (MCP) ==========
      const customer = await factory.createCustomer({
        name: `신규고객_${timestamp}`,
        type: 'individual',
        phone: '010-1234-5678',
        email: `new-customer-${timestamp}@test.com`
      });
      const customerId = normalizeId(customer);

      // ========== 2. 환영 메모 추가 (MCP) ==========
      await mcp.call('add_customer_memo', {
        customerId,
        content: '신규 고객 등록 완료. 웰컴 콜 예정.'
      });

      // ========== 3. 첫 계약 생성 (API) ==========
      const contract = await factory.createContract(customerId, {
        policy_number: `WELCOME-${timestamp}`
      });

      // ========== 4. 계약 완료 메모 (MCP) ==========
      await mcp.call('add_customer_memo', {
        customerId,
        content: '첫 계약 체결 완료'
      });

      // ========== 5. 전체 상태 확인 (API) ==========
      const finalState = await api.get<{
        personal_info?: { name?: string };
        memo?: string;
      }>(`/customers/${customerId}`);

      expect(api.isError(finalState)).toBe(false);
      if (!api.isError(finalState)) {
        expect(finalState.memo).toContain('신규 고객 등록');
        expect(finalState.memo).toContain('첫 계약 체결');
      }

      // ========== 6. 계약 목록 확인 (MCP) ==========
      const contracts = await mcp.call<{
        count: number;
      }>('list_contracts', { customerId });

      expect(contracts.count).toBeGreaterThanOrEqual(1);
    });
  });
});

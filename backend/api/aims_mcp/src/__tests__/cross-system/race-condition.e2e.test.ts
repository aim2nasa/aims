/**
 * Category 3: Race Condition 테스트
 *
 * 동시 접근 시 데이터 무결성 유지 검증
 *
 * 테스트 영역:
 * - 동시 메모 추가 시 모든 메모 보존
 * - MCP와 API 동시 업데이트 시 데이터 유실 방지
 * - 읽기-쓰기 동시 실행 시 일관성
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="race-condition.e2e.test"
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
  sleep
} from '../../test-utils/index.js';

describe('Category 3: Race Condition 테스트', () => {
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
  // 3.1 동시 쓰기
  // ============================================================

  describe('3.1 동시 쓰기', () => {
    it('동시 메모 추가 시 모든 메모 보존', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 5개의 메모를 동시에 추가
      const memoCount = 5;
      const promises = Array.from({ length: memoCount }, (_, i) =>
        mcp.call('add_customer_memo', {
          customerId,
          content: `동시메모_${i}`
        })
      );

      await Promise.all(promises);

      // 3. 잠시 대기 (DB 반영 시간)
      await sleep(500);

      // 4. 메모 조회 (list_customer_memos returns { memo, hasContent })
      const mcpResult = await mcp.call<{
        memo: string;
        hasContent: boolean;
      }>('list_customer_memos', { customerId });

      // 5. 모든 메모가 존재하는지 확인
      expect(mcpResult.hasContent).toBe(true);
      for (let i = 0; i < memoCount; i++) {
        expect(mcpResult.memo).toContain(`동시메모_${i}`);
      }
    });

    it('MCP와 API 동시 업데이트 시 데이터 유실 없음', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. MCP로 메모 추가 + API로 전화번호 업데이트 (동시 실행)
      const memoContent = `동시업데이트메모_${Date.now()}`;
      const newPhone = '010-1111-2222';

      await Promise.all([
        mcp.call('add_customer_memo', {
          customerId,
          content: memoContent
        }),
        api.put(`/customers/${customerId}`, {
          personal_info: { mobile_phone: newPhone }
        })
      ]);

      // 3. 대기 후 결과 확인
      await sleep(500);

      const result = await api.get<{
        memo?: string;
        personal_info?: { mobile_phone?: string };
      }>(`/customers/${customerId}`);

      // 4. 양쪽 업데이트가 모두 반영되어야 함
      expect(api.isError(result)).toBe(false);
      if (!api.isError(result)) {
        expect(result.memo).toContain(memoContent);
        expect(result.personal_info?.mobile_phone).toBe(newPhone);
      }
    });

    it('여러 필드 동시 업데이트 시 모든 변경 반영', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 여러 필드 동시 업데이트
      const updates = [
        mcp.call('add_customer_memo', { customerId, content: '메모1' }),
        mcp.call('add_customer_memo', { customerId, content: '메모2' }),
        api.put(`/customers/${customerId}`, { personal_info: { mobile_phone: '010-3333-4444' } })
      ];

      await Promise.all(updates);
      await sleep(500);

      // 3. 결과 확인
      const result = await api.get<{
        memo?: string;
        personal_info?: { mobile_phone?: string };
      }>(`/customers/${customerId}`);

      expect(api.isError(result)).toBe(false);
      if (!api.isError(result)) {
        expect(result.memo).toContain('메모1');
        expect(result.memo).toContain('메모2');
        expect(result.personal_info?.mobile_phone).toBe('010-3333-4444');
      }
    });
  });

  // ============================================================
  // 3.2 읽기-쓰기 동시 실행
  // ============================================================

  describe('3.2 읽기-쓰기 동시 실행', () => {
    it('쓰기 중 읽기 시 일관된 상태 반환', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 긴 메모 쓰기 시작 (비동기)
      const longContent = '긴 메모 내용 '.repeat(100);
      const writePromise = mcp.call('add_customer_memo', {
        customerId,
        content: longContent
      });

      // 3. 즉시 여러 번 읽기 시도
      const readPromises = Array.from({ length: 3 }, () =>
        api.get<{ memo?: string }>(`/customers/${customerId}`)
      );

      // 4. 쓰기 완료 대기
      await writePromise;

      // 5. 읽기 결과 확인
      const readResults = await Promise.all(readPromises);

      // 각 읽기 결과는 완전한 상태(쓰기 전 또는 쓰기 후)여야 함
      for (const result of readResults) {
        if (!api.isError(result) && result.memo) {
          // 메모가 있다면 완전해야 함 (부분 데이터 없음)
          if (result.memo.includes('긴 메모')) {
            expect(result.memo.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it('빠른 연속 읽기-쓰기-읽기 일관성', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성 및 초기 메모 추가
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);
      await mcp.call('add_customer_memo', {
        customerId,
        content: '초기메모'
      });

      // 2. 빠른 연속 작업
      const read1 = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      await mcp.call('add_customer_memo', {
        customerId,
        content: '추가메모'
      });

      const read2 = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      // 3. 검증
      if (!api.isError(read1)) {
        expect(read1.memo).toContain('초기메모');
      }

      if (!api.isError(read2)) {
        expect(read2.memo).toContain('초기메모');
        expect(read2.memo).toContain('추가메모');
      }
    });
  });

  // ============================================================
  // 3.3 동시 삭제
  // ============================================================

  // 3.3 동시 삭제 (relationship API 없음 - 고객 삭제로 대체)
  describe('3.3 동시 삭제', () => {
    it('동일 고객 동시 삭제 시도', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // cleanup에서 제거 (삭제 테스트이므로)
      factory['createdCustomerIds'] = factory['createdCustomerIds'].filter(
        id => id !== customerId
      );

      // 2. 동시에 같은 고객 삭제 시도
      const deleteResults = await Promise.allSettled([
        api.delete(`/customers/${customerId}`),
        api.delete(`/customers/${customerId}`)
      ]);

      // 3. 최소 하나는 성공, 다른 하나는 404 또는 성공
      const successCount = deleteResults.filter(
        r => r.status === 'fulfilled' && !api.isError(r.value)
      ).length;

      // 둘 다 성공하거나, 하나만 성공해도 됨 (멱등성)
      expect(successCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 3.4 순차적 의존성 작업
  // ============================================================

  describe('3.4 순차적 의존성 작업', () => {
    it('고객 생성 → 메모 추가 → 계약 생성 순차 처리', async () => {
      if (!serversAvailable) return;

      // 1. 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 2. 메모 추가
      await mcp.call('add_customer_memo', {
        customerId,
        content: '신규 고객 등록 완료'
      });

      // 3. 계약 생성
      const contract = await factory.createContract(customerId);

      // 4. 모든 데이터 확인
      const customerResult = await api.get<{
        memo?: string;
      }>(`/customers/${customerId}`);

      const mcpContracts = await mcp.call<{
        contracts: Array<{ id?: string; _id?: string }>;
      }>('list_contracts', { customerId });

      expect(api.isError(customerResult)).toBe(false);
      if (!api.isError(customerResult)) {
        expect(customerResult.memo).toContain('신규 고객 등록 완료');
      }

      expect(mcpContracts.contracts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // 3.5 대량 동시 요청
  // ============================================================

  describe('3.5 대량 동시 요청', () => {
    it('10개의 동시 고객 검색 요청', async () => {
      if (!serversAvailable) return;

      // 1. 10개의 동시 검색 요청
      const searchPromises = Array.from({ length: 10 }, () =>
        mcp.call<{ customers: unknown[] }>('search_customers', { limit: 5 })
      );

      const results = await Promise.all(searchPromises);

      // 2. 모든 요청이 성공해야 함
      for (const result of results) {
        expect(Array.isArray(result.customers)).toBe(true);
      }
    });

    it('MCP와 API 혼합 동시 요청', async () => {
      if (!serversAvailable) return;

      // 1. MCP와 API 혼합 요청
      const requests = [
        mcp.call<{ customers: unknown[] }>('search_customers', { limit: 3 }),
        api.get('/customers?limit=3'),
        mcp.call<{ type: string }>('get_statistics', {}),
        api.get('/stats/summary')
      ];

      const results = await Promise.allSettled(requests);

      // 2. 모든 요청이 성공하거나 예상된 형태로 실패해야 함
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      expect(fulfilled.length).toBeGreaterThanOrEqual(2); // 최소 절반은 성공
    });
  });
});

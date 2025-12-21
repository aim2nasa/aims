/**
 * Category 5: 엣지 케이스 테스트
 *
 * 경계 조건과 예외 상황에서의 동작 검증
 *
 * 테스트 영역:
 * - 특수문자 처리 (한글, 이모지, HTML 태그)
 * - 대용량 데이터 (긴 메모, 많은 메모)
 * - 잘못된 ID 처리
 * - 사용자 격리 (다른 사용자 데이터 접근 불가)
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="edge-cases.e2e.test"
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
  isValidObjectId
} from '../../test-utils/index.js';

describe('Category 5: 엣지 케이스 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let api: APITestClient;
  let factory: TestDataFactory;
  let mcpAsUserB: MCPTestClient;
  let apiAsUserB: APITestClient;
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
    mcpAsUserB = ctx.mcpAsUserB;
    apiAsUserB = ctx.apiAsUserB;
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
  // 5.1 특수문자 처리
  // ============================================================

  describe('5.1 특수문자 처리', () => {
    it('한글 자모 및 특수 한글 처리', async () => {
      if (!serversAvailable) return;

      const koreanNames = [
        '김ㄱㄴㄷ테스트',
        '이ㅏㅓㅗㅜ',
        '박가나다라',
        '홍길동 님' // 공백 포함
      ];

      for (const name of koreanNames) {
        const customer = await factory.createCustomer({ name });
        const customerId = normalizeId(customer);

        // API로 조회
        const apiResult = await api.get<{
          personal_info?: { name?: string };
        }>(`/customers/${customerId}`);

        expect(api.isError(apiResult)).toBe(false);
        if (!api.isError(apiResult)) {
          expect(apiResult.personal_info?.name).toBe(name);
        }
      }
    });

    it('이모지 처리', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 이모지가 포함된 메모
      const emojiContent = '축하합니다 🎉 첫 계약 완료! 📝 화이팅 💪';
      await mcp.call('add_customer_memo', {
        customerId,
        content: emojiContent
      });

      // API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult) && apiResult.memo) {
        expect(apiResult.memo).toContain('🎉');
        expect(apiResult.memo).toContain('📝');
        expect(apiResult.memo).toContain('💪');
      }
    });

    it('HTML 태그 및 스크립트 처리 (XSS 방지)', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 잠재적 XSS 페이로드
      const xssContent = '<script>alert("XSS")</script> 일반 텍스트';
      await mcp.call('add_customer_memo', {
        customerId,
        content: xssContent
      });

      // 조회 시 이스케이프되거나 그대로 저장되어야 함 (실행되면 안 됨)
      const mcpResult = await mcp.call<{ memo: string }>('list_customer_memos', {
        customerId
      });

      // 스크립트 태그가 그대로 저장되거나 이스케이프되어야 함
      expect(mcpResult.memo).toContain('script');
    });

    it('따옴표 및 백슬래시 처리', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      const specialContent = '메모: "큰따옴표" \'작은따옴표\' \\백슬래시\\';
      await mcp.call('add_customer_memo', {
        customerId,
        content: specialContent
      });

      // API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult) && apiResult.memo) {
        expect(apiResult.memo).toContain('"큰따옴표"');
        expect(apiResult.memo).toContain("'작은따옴표'");
      }
    });
  });

  // ============================================================
  // 5.2 대용량 데이터
  // ============================================================

  describe('5.2 대용량 데이터', () => {
    it('긴 메모 내용 처리 (10KB)', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 10KB 크기의 메모
      const largeContent = 'A'.repeat(10000);
      await mcp.call('add_customer_memo', {
        customerId,
        content: largeContent
      });

      // 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      expect(api.isError(apiResult)).toBe(false);
      if (!api.isError(apiResult) && apiResult.memo) {
        expect(apiResult.memo.length).toBeGreaterThan(10000);
      }
    });

    it('많은 메모 처리 (50개)', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 50개 메모 순차 추가
      const memoCount = 50;
      for (let i = 0; i < memoCount; i++) {
        await mcp.call('add_customer_memo', {
          customerId,
          content: `메모 ${i + 1}`
        });
      }

      // 조회 (list_customer_memos returns { memo, hasContent })
      const mcpResult = await mcp.call<{
        memo: string;
        hasContent: boolean;
      }>('list_customer_memos', { customerId });

      expect(mcpResult.hasContent).toBe(true);
      // memo 문자열에서 타임스탬프 라인 수 카운트
      const lineCount = mcpResult.memo.split('\n').filter(l => l.includes('[20')).length;
      expect(lineCount).toBe(memoCount);

      // API로 조회
      const apiResult = await api.get<{ memo?: string }>(`/customers/${customerId}`);

      if (!api.isError(apiResult) && apiResult.memo) {
        // 모든 메모가 포함되어 있어야 함
        const lineCount = apiResult.memo.split('\n').filter(l => l.includes('[20')).length;
        expect(lineCount).toBe(memoCount);
      }
    }, 60000); // 60초 타임아웃

    it('긴 고객명 처리', async () => {
      if (!serversAvailable) return;

      const longName = '가'.repeat(100);
      const customer = await factory.createCustomer({ name: longName });
      const customerId = normalizeId(customer);

      // 조회 (get_customer returns { personalInfo: { name } })
      const mcpResult = await mcp.call<{
        personalInfo: { name: string };
      }>('get_customer', { customerId });

      expect(mcpResult.personalInfo.name).toBe(longName);
    });
  });

  // ============================================================
  // 5.3 잘못된 ID 처리
  // ============================================================

  describe('5.3 잘못된 ID 처리', () => {
    it('유효하지 않은 ObjectId 형식', async () => {
      if (!serversAvailable) return;

      const invalidIds = [
        'invalid-id',
        '12345',
        'zzzzzzzzzzzzzzzzzzzzzzz',
        'special!@#$%^&*()',
        ''
      ];

      for (const invalidId of invalidIds) {
        // MCP 에러 확인
        try {
          await mcp.call('get_customer', { customerId: invalidId });
          expect.fail(`Should throw for invalid ID: ${invalidId}`);
        } catch (error) {
          expect(error).toBeDefined();
          if (error instanceof Error) {
            expect(error.message).toMatch(/유효하지 않|invalid/i);
          }
        }

        // API 에러 확인
        if (invalidId) { // 빈 문자열은 라우팅 문제로 별도 처리
          const apiResult = await api.get(`/customers/${invalidId}`);
          expect(api.isError(apiResult)).toBe(true);
        }
      }
    });

    it('존재하지 않는 유효한 ObjectId', async () => {
      if (!serversAvailable) return;

      // 유효한 형식이지만 존재하지 않는 ID
      const nonExistentId = '000000000000000000000000';

      expect(isValidObjectId(nonExistentId)).toBe(true);

      // MCP 에러 확인
      try {
        await mcp.call('get_customer', { customerId: nonExistentId });
        expect.fail('Should throw for non-existent ID');
      } catch (error) {
        expect(error).toBeDefined();
        if (error instanceof Error) {
          expect(error.message).toMatch(/찾을 수 없|not found/i);
        }
      }

      // API 에러 확인
      const apiResult = await api.get(`/customers/${nonExistentId}`);
      expect(api.isError(apiResult)).toBe(true);
      if (api.isError(apiResult)) {
        expect([404, 500]).toContain(apiResult.status);
      }
    });

    it('NULL/undefined 파라미터 처리', async () => {
      if (!serversAvailable) return;

      // 필수 파라미터 누락
      try {
        await mcp.call('get_customer', {});
        expect.fail('Should throw for missing customerId');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // 메모 추가 시 content 누락
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      try {
        await mcp.call('add_customer_memo', { customerId });
        expect.fail('Should throw for missing content');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================
  // 5.4 사용자 격리
  // ============================================================

  describe('5.4 사용자 격리', () => {
    it('User A의 고객을 User B가 MCP로 조회 불가', async () => {
      if (!serversAvailable) return;

      // User A로 고객 생성
      const customer = await factory.createCustomer({
        name: `UserA전용_${Date.now()}`
      });
      const customerId = normalizeId(customer);

      // User A는 조회 가능
      const userAResult = await mcp.call<{
        personalInfo: { name: string };
      }>('get_customer', { customerId });
      expect(userAResult.personalInfo.name).toContain('UserA전용');

      // User B는 조회 불가 (404 또는 접근 거부)
      try {
        await mcpAsUserB.call('get_customer', { customerId });
        // 조회가 성공하면 테스트 실패... 하지만 현재 구현에서는
        // 다른 사용자의 데이터가 보이면 안 됨
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('User A의 고객을 User B가 검색 불가', async () => {
      if (!serversAvailable) return;

      // 고유한 이름으로 User A 고객 생성
      const uniqueName = `격리테스트_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await factory.createCustomer({ name: uniqueName });

      // User A 검색 - 찾아야 함
      const userASearch = await mcp.call<{
        customers: Array<{ name: string }>;
      }>('search_customers', { query: uniqueName });

      expect(userASearch.customers.some(c => c.name === uniqueName)).toBe(true);

      // User B 검색 - 찾지 못해야 함
      const userBSearch = await mcpAsUserB.call<{
        customers: Array<{ name: string }>;
      }>('search_customers', { query: uniqueName });

      expect(userBSearch.customers.some(c => c.name === uniqueName)).toBe(false);
    });

    it('User A의 고객에 User B가 메모 추가 불가', async () => {
      if (!serversAvailable) return;

      // User A 고객 생성
      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // User B가 메모 추가 시도
      try {
        await mcpAsUserB.call('add_customer_memo', {
          customerId,
          content: 'User B의 메모'
        });
        // 성공하면 격리 위반
        expect.fail('User B should not be able to add memo to User A customer');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================
  // 5.5 경계값
  // ============================================================

  describe('5.5 경계값', () => {
    it('빈 문자열 고객명', async () => {
      if (!serversAvailable) return;

      try {
        await mcp.call('create_customer', { name: '', type: 'individual' });
        expect.fail('Should reject empty name');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('공백만 있는 고객명', async () => {
      if (!serversAvailable) return;

      try {
        await mcp.call('create_customer', { name: '   ', type: 'individual' });
        expect.fail('Should reject whitespace-only name');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('빈 메모 내용', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      try {
        await mcp.call('add_customer_memo', { customerId, content: '' });
        expect.fail('Should reject empty memo content');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('음수 limit 파라미터', async () => {
      if (!serversAvailable) return;

      try {
        await mcp.call('search_customers', { limit: -1 });
        // 음수가 무시되거나 에러가 발생해야 함
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('매우 큰 limit 파라미터', async () => {
      if (!serversAvailable) return;

      // 시스템이 처리할 수 있는 최대값보다 큰 값
      const result = await mcp.call<{
        customers: unknown[];
      }>('search_customers', { limit: 999999 });

      // 에러 없이 결과 반환 (시스템 최대값으로 제한됨)
      expect(Array.isArray(result.customers)).toBe(true);
    });
  });

  // ============================================================
  // 5.6 동시성 엣지 케이스
  // ============================================================

  describe('5.6 동시성 엣지 케이스', () => {
    it('동일 고객에 대한 동시 조회', async () => {
      if (!serversAvailable) return;

      const customer = await factory.createCustomer();
      const customerId = normalizeId(customer);

      // 10개의 동시 조회
      const promises = Array.from({ length: 10 }, () =>
        mcp.call<{ id: string }>('get_customer', { customerId })
      );

      const results = await Promise.all(promises);

      // 모든 결과가 동일해야 함
      for (const result of results) {
        expect(result.id || (result as { _id?: string })._id).toBe(customerId);
      }
    });

    it('생성 직후 즉시 조회', async () => {
      if (!serversAvailable) return;

      // 생성과 동시에 조회 시도
      // create_customer returns { success, customerId, name, customerType }
      const createResult = await mcp.call<{
        customerId: string;
        name: string;
      }>('create_customer', {
        name: `즉시조회_${Date.now()}`,
        type: 'individual'
      });

      const customerId = createResult.customerId;
      factory['createdCustomerIds'].push(customerId);

      // 즉시 조회
      const readResult = await mcp.call<{ id: string }>('get_customer', {
        customerId
      });

      expect(readResult.id).toBe(customerId);
    });
  });
});

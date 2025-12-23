/**
 * Phase 3 도구 테스트: 인사이트 도구
 *
 * 테스트 대상:
 * - analyze_customer_value: 고객 가치 점수 분석
 * - find_coverage_gaps: 보장 공백 분석
 * - suggest_next_action: 다음 영업 액션 추천
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase3-insights"
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

describe('Phase 3: 인사이트 도구 테스트', () => {
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
  // 3.1 고객 가치 분석
  // ============================================================

  describe('3.1 고객 가치 분석', () => {
    it('analyze_customer_value: 단일 고객 분석', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `가치분석테스트_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        score: number;
        grade: string;
        breakdown: {
          contractScore: number;
          premiumScore: number;
          relationshipScore: number;
          tenureScore: number;
        };
        recommendations: string[];
      }>('analyze_customer_value', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(typeof result.score).toBe('number');
      expect(['S', 'A', 'B', 'C', 'D']).toContain(result.grade);
      expect(result.breakdown).toHaveProperty('contractScore');
      expect(result.breakdown).toHaveProperty('premiumScore');
      expect(result.breakdown).toHaveProperty('relationshipScore');
      expect(result.breakdown).toHaveProperty('tenureScore');
    });

    it('analyze_customer_value: 전체 고객 랭킹', async () => {
      if (!serversAvailable) return;

      // 여러 고객 생성
      const customers = [];
      for (let i = 0; i < 3; i++) {
        const c = await mcp.call<{ customerId: string }>('create_customer', {
          name: `랭킹테스트${i}_${Date.now()}`,
          type: 'individual'
        });
        customers.push(c.customerId);
        factory['createdCustomerIds'].push(c.customerId);
      }

      // 전체 랭킹 조회
      const result = await mcp.call<{
        totalCustomers: number;
        rankings: Array<{
          customerId: string;
          customerName: string;
          score: number;
          grade: string;
        }>;
      }>('analyze_customer_value', {
        limit: 10
      });

      expect(result.totalCustomers).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(result.rankings)).toBe(true);
      // 점수 내림차순 정렬 확인
      for (let i = 1; i < result.rankings.length; i++) {
        expect(result.rankings[i - 1].score).toBeGreaterThanOrEqual(result.rankings[i].score);
      }
    });

    it('analyze_customer_value: 존재하지 않는 고객', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('analyze_customer_value', {
        customerId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });

  // ============================================================
  // 3.2 보장 공백 분석
  // ============================================================

  describe('3.2 보장 공백 분석', () => {
    it('find_coverage_gaps: 보장 공백 분석', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `보장분석테스트_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        currentCoverage: {
          categories: string[];
          totalContracts: number;
          totalPremium: number;
        };
        gaps: Array<{
          category: string;
          importance: string;
          reason: string;
        }>;
        recommendations: string[];
      }>('find_coverage_gaps', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(result.currentCoverage).toHaveProperty('categories');
      expect(result.currentCoverage).toHaveProperty('totalContracts');
      expect(Array.isArray(result.gaps)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('find_coverage_gaps: 전체 고객 분석', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalAnalyzed: number;
        customersWithGaps: Array<{
          customerId: string;
          customerName: string;
          gapCount: number;
          topGaps: string[];
        }>;
      }>('find_coverage_gaps', {
        limit: 5
      });

      expect(result).toHaveProperty('totalAnalyzed');
      expect(Array.isArray(result.customersWithGaps)).toBe(true);
    });
  });

  // ============================================================
  // 3.3 다음 액션 추천
  // ============================================================

  describe('3.3 다음 액션 추천', () => {
    it('suggest_next_action: 단일 고객 액션 추천', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `액션추천테스트_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        suggestedActions: Array<{
          actionType: string;
          priority: string;
          priorityScore: number;
          description: string;
          dueDate?: string;
        }>;
        summary: string;
      }>('suggest_next_action', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(Array.isArray(result.suggestedActions)).toBe(true);
      expect(result).toHaveProperty('summary');
    });

    it('suggest_next_action: 전체 고객 우선순위 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCustomers: number;
        actionsByPriority: {
          high: Array<{ customerName: string; actionType: string }>;
          medium: Array<{ customerName: string; actionType: string }>;
          low: Array<{ customerName: string; actionType: string }>;
        };
      }>('suggest_next_action', {
        limit: 10
      });

      expect(result).toHaveProperty('totalCustomers');
      expect(result.actionsByPriority).toHaveProperty('high');
      expect(result.actionsByPriority).toHaveProperty('medium');
    });

    it('suggest_next_action: 액션 타입 필터링', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCustomers: number;
        actionsByPriority: {
          high: Array<{ actionType: string }>;
        };
      }>('suggest_next_action', {
        actionType: '계약만기',
        limit: 5
      });

      // 계약만기 타입만 있어야 함
      const allActions = [
        ...result.actionsByPriority.high
      ];
      if (allActions.length > 0) {
        expect(allActions.every(a => a.actionType === '계약만기')).toBe(true);
      }
    });
  });
});

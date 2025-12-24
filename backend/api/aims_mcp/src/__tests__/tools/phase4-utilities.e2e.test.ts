/**
 * Phase 4 도구 테스트: 유틸리티 도구
 *
 * 테스트 대상:
 * - get_storage_info: 저장소 사용량 조회
 * - check_customer_name: 고객명 중복 검사
 * - list_notices: 공지사항 조회
 * - list_faqs: FAQ 조회
 * - list_usage_guides: 사용 가이드 조회
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase4-utilities"
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

describe('Phase 4: 유틸리티 도구 테스트', () => {
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
  // 4.1 저장소 정보
  // ============================================================

  describe('4.1 저장소 정보', () => {
    it('get_storage_info: 사용량 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        tier: string;
        tierName: string;
        quota: {
          bytes: number;
          formatted: string;
        };
        used: {
          bytes: number;
          formatted: string;
        };
        remaining: {
          bytes: number;
          formatted: string;
        };
        usagePercent: number;
        fileCount: number;
      }>('get_storage_info', {});

      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('tierName');
      expect(result.quota).toHaveProperty('bytes');
      expect(result.quota).toHaveProperty('formatted');
      expect(result.used).toHaveProperty('bytes');
      expect(result).toHaveProperty('fileCount');
      expect(result.remaining).toHaveProperty('bytes');
      expect(typeof result.usagePercent).toBe('number');
      expect(result.usagePercent).toBeGreaterThanOrEqual(0);
      expect(result.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  // ============================================================
  // 4.2 고객명 중복 검사
  // ============================================================

  describe('4.2 고객명 중복 검사', () => {
    it('check_customer_name: 사용 가능한 이름', async () => {
      if (!serversAvailable) return;

      const uniqueName = `유니크테스트_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const result = await mcp.call<{
        name: string;
        exists: boolean;
        message: string;
      }>('check_customer_name', {
        name: uniqueName
      });

      expect(result.name).toBe(uniqueName);
      expect(result.exists).toBe(false);  // exists=false means available
      expect(result.message).toContain('사용 가능');
    });

    it('check_customer_name: 이미 존재하는 이름', async () => {
      if (!serversAvailable) return;

      // 고객 생성
      const testName = `중복테스트_${Date.now()}`;
      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: testName,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      // 같은 이름으로 중복 검사
      const result = await mcp.call<{
        name: string;
        exists: boolean;
        message: string;
        existingCustomer?: {
          customerId: string;
          customerType: string;
        } | null;
      }>('check_customer_name', {
        name: testName
      });

      expect(result.name).toBe(testName);
      expect(result.exists).toBe(true);  // exists=true means already exists
      expect(result.message).toContain('이미 존재');
    });

    it('check_customer_name: 대소문자 무시 검사', async () => {
      if (!serversAvailable) return;

      const testName = `CaseTest_${Date.now()}`;
      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: testName,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      // 다른 대소문자로 검사
      const result = await mcp.call<{
        exists: boolean;
      }>('check_customer_name', {
        name: testName.toLowerCase()
      });

      // 대소문자를 구분하지 않으면 exists=true
      expect(result.exists).toBe(true);
    });

    it('check_customer_name: 빈 이름 오류', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('check_customer_name', {
        name: ''
      });

      expect(mcp.isErrorResponse(result)).toBe(true);
    });
  });

  // ============================================================
  // 4.3 공지사항
  // ============================================================

  describe('4.3 공지사항', () => {
    it('list_notices: 전체 공지 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCount: number;
        notices: Array<{
          id: string;
          title: string;
          category: string;
          createdAt: string;
        }>;
      }>('list_notices', {});

      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.notices)).toBe(true);
    });

    it('list_notices: 카테고리 필터링', async () => {
      if (!serversAvailable) return;

      // 유효한 카테고리: 'system', 'product', 'policy', 'event'
      const result = await mcp.call<{
        notices: Array<{
          category: string;
        }>;
      }>('list_notices', {
        category: 'system'
      });

      // system 카테고리만 있어야 함 (데이터가 있을 경우)
      if (result.notices.length > 0) {
        expect(result.notices.every(n => n.category === 'system')).toBe(true);
      }
    });

    it('list_notices: 개수 제한', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        notices: Array<unknown>;
      }>('list_notices', {
        limit: 3
      });

      expect(result.notices.length).toBeLessThanOrEqual(3);
    });
  });

  // ============================================================
  // 4.4 FAQ
  // ============================================================

  describe('4.4 FAQ', () => {
    it('list_faqs: 전체 FAQ 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        count: number;
        totalCount: number;
        byCategory: Array<{
          category: string;
          categoryLabel: string;
          count: number;
          faqs: Array<{
            id: string;
            question: string;
            answer: string;
          }>;
        }>;
      }>('list_faqs', {});

      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('totalCount');
      expect(Array.isArray(result.byCategory)).toBe(true);
    });

    it('list_faqs: 키워드 검색', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        byCategory: Array<{
          faqs: Array<{
            question: string;
            answer: string;
          }>;
        }>;
      }>('list_faqs', {
        search: '문서'
      });

      // 검색어가 질문 또는 답변에 포함되어야 함 (데이터가 있을 경우)
      const allFaqs = result.byCategory.flatMap(c => c.faqs);
      if (allFaqs.length > 0) {
        const hasMatch = allFaqs.some(
          f => f.question.includes('문서') || f.answer.includes('문서')
        );
        expect(hasMatch).toBe(true);
      }
    });

    it('list_faqs: 카테고리 필터링', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        byCategory: Array<{
          category: string;
        }>;
      }>('list_faqs', {
        category: 'general'
      });

      // general 카테고리만 있어야 함
      if (result.byCategory.length > 0) {
        expect(result.byCategory.every(c => c.category === 'general')).toBe(true);
      }
    });
  });

  // ============================================================
  // 4.5 사용 가이드
  // ============================================================

  describe('4.5 사용 가이드', () => {
    it('list_usage_guides: 전체 가이드 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        count: number;
        guides: Array<{
          categoryId: string;
          categoryTitle: string;
          itemCount: number;
          items: Array<{
            id: string;
            title: string;
            description: string;
          }>;
        }>;
      }>('list_usage_guides', {});

      expect(result).toHaveProperty('count');
      expect(Array.isArray(result.guides)).toBe(true);
    });

    it('list_usage_guides: 카테고리 필터링', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        guides: Array<{
          categoryId: string;
        }>;
      }>('list_usage_guides', {
        category: 'customer'
      });

      // customer 카테고리만 있어야 함
      if (result.guides.length > 0) {
        expect(result.guides.every(g => g.categoryId === 'customer')).toBe(true);
      }
    });

    it('list_usage_guides: 키워드 검색', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        guides: Array<{
          items: Array<{
            title: string;
            description: string;
          }>;
        }>;
      }>('list_usage_guides', {
        search: '등록'
      });

      const allItems = result.guides.flatMap(g => g.items);
      if (allItems.length > 0) {
        const hasMatch = allItems.some(
          item => item.title.includes('등록') || item.description.includes('등록')
        );
        expect(hasMatch).toBe(true);
      }
    });
  });
});

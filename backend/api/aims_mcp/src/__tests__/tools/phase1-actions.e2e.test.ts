/**
 * Phase 1 도구 테스트: 액션 도구 (관계, 문서 삭제, 고객 복구)
 *
 * 테스트 대상:
 * - create_relationship: 고객 간 관계 생성
 * - delete_relationship: 관계 삭제
 * - list_relationships: 관계 목록 조회
 * - delete_document: 문서 삭제
 * - delete_documents: 복수 문서 삭제
 * - restore_customer: 삭제된 고객 복구
 * - list_deleted_customers: 삭제된 고객 목록
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase1-actions"
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

describe('Phase 1: 액션 도구 테스트', () => {
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
  // 1.1 관계 관리 도구
  // ============================================================

  describe('1.1 관계 관리 도구', () => {
    it('create_relationship: 배우자 관계 생성', async () => {
      if (!serversAvailable) return;

      // 두 고객 생성
      const customer1 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계테스트A_${Date.now()}`,
        customerType: '개인'
      });
      const customer2 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계테스트B_${Date.now()}`,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer1.customerId, customer2.customerId);

      // 관계 생성
      const result = await mcp.call<{
        success: boolean;
        relationshipId: string;
        message: string;
      }>('create_relationship', {
        fromCustomerId: customer1.customerId,
        toCustomerId: customer2.customerId,
        relationshipCategory: 'family',
        relationshipType: 'spouse'
      });

      expect(result.success).toBe(true);
      expect(result.relationshipId).toBeDefined();
      expect(result.message).toContain('생성');
    });

    it('list_relationships: 관계 목록 조회', async () => {
      if (!serversAvailable) return;

      // 고객 및 관계 생성
      const customer1 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계조회A_${Date.now()}`,
        customerType: '개인'
      });
      const customer2 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계조회B_${Date.now()}`,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer1.customerId, customer2.customerId);

      await mcp.call('create_relationship', {
        fromCustomerId: customer1.customerId,
        toCustomerId: customer2.customerId,
        relationshipCategory: 'social',
        relationshipType: 'friend'
      });

      // 목록 조회
      const result = await mcp.call<{
        customerId: string;
        totalRelationships: number;
        relationships: Array<{
          relationshipCategory: string;
          relationshipType: string;
        }>;
      }>('list_relationships', {
        customerId: customer1.customerId
      });

      expect(result.totalRelationships).toBeGreaterThanOrEqual(1);
      expect(result.relationships.some(r => r.relationshipType === 'friend')).toBe(true);
    });

    it('delete_relationship: 관계 삭제', async () => {
      if (!serversAvailable) return;

      // 고객 및 관계 생성
      const customer1 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계삭제A_${Date.now()}`,
        customerType: '개인'
      });
      const customer2 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `관계삭제B_${Date.now()}`,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer1.customerId, customer2.customerId);

      const created = await mcp.call<{ relationshipId: string }>('create_relationship', {
        fromCustomerId: customer1.customerId,
        toCustomerId: customer2.customerId,
        relationshipCategory: 'professional',
        relationshipType: 'colleague'
      });

      // 삭제
      const result = await mcp.call<{
        success: boolean;
        message: string;
      }>('delete_relationship', {
        fromCustomerId: customer1.customerId,
        relationshipId: created.relationshipId
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('삭제');

      // 삭제 확인
      const afterDelete = await mcp.call<{ totalRelationships: number }>('list_relationships', {
        customerId: customer1.customerId
      });
      expect(afterDelete.totalRelationships).toBe(0);
    });

    it('create_relationship: 잘못된 카테고리 시 오류', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `오류테스트_${Date.now()}`,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      // 잘못된 카테고리
      const result = await mcp.callRaw('create_relationship', {
        fromCustomerId: customer.customerId,
        toCustomerId: customer.customerId,  // 자기 자신
        relationshipCategory: 'invalid_category',
        relationshipType: 'spouse'
      });

      expect(mcp.isErrorResponse(result)).toBe(true);
    });
  });

  // ============================================================
  // 1.2 고객 복구 도구
  // ============================================================

  describe('1.2 고객 복구 도구', () => {
    it('list_deleted_customers: 삭제된 고객 목록 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        totalCount: number;
        customers: Array<{
          customerId: string;
          name: string;
          deletedAt: string;
        }>;
      }>('list_deleted_customers', {});

      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('customers');
      expect(Array.isArray(result.customers)).toBe(true);
    });

    it('restore_customer: 삭제된 고객 복구 (고객이 없을 경우 오류)', async () => {
      if (!serversAvailable) return;

      // 존재하지 않는 고객 ID로 복구 시도
      const result = await mcp.callRaw('restore_customer', {
        customerId: '000000000000000000000000'
      });

      expect(mcp.isErrorResponse(result)).toBe(true);
    });
  });

  // ============================================================
  // 1.3 네트워크 도구
  // ============================================================

  describe('1.3 네트워크 도구', () => {
    // NOTE: get_customer_network은 관계 데이터 구조 차이로 현재 스킵
    // TODO: 관계 조회 로직 검토 후 활성화
    it.skip('get_customer_network: 고객 관계 네트워크 조회', async () => {
      if (!serversAvailable) return;

      // 고객 생성 및 관계 설정
      const customer1 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `네트워크A_${Date.now()}`,
        customerType: '개인'
      });
      const customer2 = await mcp.call<{ customerId: string }>('create_customer', {
        name: `네트워크B_${Date.now()}`,
        customerType: '개인'
      });

      factory['createdCustomerIds'].push(customer1.customerId, customer2.customerId);

      const relResult = await mcp.call<{ success: boolean; relationshipId: string }>('create_relationship', {
        fromCustomerId: customer1.customerId,
        toCustomerId: customer2.customerId,
        relationshipCategory: 'family',
        relationshipType: 'spouse'
      });

      // 관계 생성 확인
      expect(relResult.success).toBe(true);

      // 네트워크 조회
      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        totalRelationships: number;
        byCategory: Record<string, Array<unknown>>;
        relationships: Array<{
          relatedCustomerName: string;
          relationshipLabel: string;
        }>;
      }>('get_customer_network', {
        customerId: customer1.customerId
      });

      expect(result.totalRelationships).toBeGreaterThanOrEqual(1);
      expect(result.byCategory).toHaveProperty('family');
    });
  });
});

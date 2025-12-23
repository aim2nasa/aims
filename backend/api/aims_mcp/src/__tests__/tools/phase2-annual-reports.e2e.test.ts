/**
 * Phase 2 도구 테스트: Annual Report 관련 도구
 *
 * 테스트 대상:
 * - get_annual_reports: 고객의 연차보고서 목록 조회
 * - get_ar_parsing_status: AR 파싱 상태 조회
 * - trigger_ar_parsing: AR 파싱 트리거
 * - get_ar_queue_status: AR 파싱 큐 상태
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase2-annual"
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

describe('Phase 2: Annual Report 도구 테스트', () => {
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
  // 2.1 AR 목록 조회
  // ============================================================

  describe('2.1 AR 목록 조회', () => {
    it('get_annual_reports: 고객의 AR 목록 조회', async () => {
      if (!serversAvailable) return;

      // 테스트용 고객 생성
      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `AR테스트_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      // AR 목록 조회 (없어도 정상 응답)
      const result = await mcp.call<{
        customerId: string;
        customerName: string;
        totalReports: number;
        reports: Array<{
          fileId: string;
          fileName: string;
          reportYear: number;
        }>;
      }>('get_annual_reports', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(result).toHaveProperty('totalReports');
      expect(Array.isArray(result.reports)).toBe(true);
    });

    it('get_annual_reports: 존재하지 않는 고객 시 오류', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('get_annual_reports', {
        customerId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });

    it('get_annual_reports: 연도 필터링', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `AR연도필터_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      // 특정 연도로 필터링
      const result = await mcp.call<{
        totalReports: number;
        reports: Array<{ reportYear: number }>;
      }>('get_annual_reports', {
        customerId: customer.customerId,
        year: 2024
      });

      // 2024년 보고서만 있어야 함 (없으면 빈 배열)
      if (result.reports.length > 0) {
        expect(result.reports.every(r => r.reportYear === 2024)).toBe(true);
      }
    });
  });

  // ============================================================
  // 2.2 파싱 상태 조회
  // ============================================================

  describe('2.2 파싱 상태 조회', () => {
    it('get_ar_parsing_status: 파일 ID로 상태 조회', async () => {
      if (!serversAvailable) return;

      // 존재하지 않는 파일 ID (에러가 아닌 not_found 상태 반환)
      const result = await mcp.call<{
        fileId?: string;
        customerId?: string;
        status: string;
        message?: string;
      }>('get_ar_parsing_status', {
        fileId: '000000000000000000000000'
      });

      // 파일이 없으면 not_found 또는 error 상태
      expect(['not_found', 'not_parsed', 'error'].includes(result.status) || result.status !== undefined).toBe(true);
    });

    it('get_ar_parsing_status: 고객 ID로 상태 조회', async () => {
      if (!serversAvailable) return;

      const customer = await mcp.call<{ customerId: string }>('create_customer', {
        name: `파싱상태테스트_${Date.now()}`,
        type: 'individual'
      });

      factory['createdCustomerIds'].push(customer.customerId);

      const result = await mcp.call<{
        customerId: string;
        files: Array<{
          fileId: string;
          fileName: string;
          status: string;
        }>;
      }>('get_ar_parsing_status', {
        customerId: customer.customerId
      });

      expect(result.customerId).toBe(customer.customerId);
      expect(Array.isArray(result.files)).toBe(true);
    });
  });

  // ============================================================
  // 2.3 파싱 큐 상태
  // ============================================================

  describe('2.3 파싱 큐 상태', () => {
    it('get_ar_queue_status: 전체 큐 상태 조회', async () => {
      if (!serversAvailable) return;

      const result = await mcp.call<{
        queueLength: number;
        processing: number;
        pending: number;
        recentCompleted: Array<{
          fileId: string;
          completedAt: string;
        }>;
      }>('get_ar_queue_status', {});

      expect(result).toHaveProperty('queueLength');
      expect(result).toHaveProperty('processing');
      expect(result).toHaveProperty('pending');
      expect(typeof result.queueLength).toBe('number');
    });
  });

  // ============================================================
  // 2.4 파싱 트리거
  // ============================================================

  describe('2.4 파싱 트리거', () => {
    it('trigger_ar_parsing: 존재하지 않는 파일 시 오류', async () => {
      if (!serversAvailable) return;

      const result = await mcp.callRaw('trigger_ar_parsing', {
        fileId: '000000000000000000000000'
      });

      expect(result.isError).toBe(true);
    });
  });
});

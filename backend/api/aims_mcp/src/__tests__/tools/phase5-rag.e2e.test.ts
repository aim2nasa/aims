/**
 * Phase 5 도구 테스트: RAG 검색 도구
 *
 * 테스트 대상:
 * - search_documents_semantic: 시맨틱 문서 검색
 * - get_search_analytics: 검색 품질 통계
 * - get_failed_queries: 실패한 검색 쿼리 분석
 * - submit_search_feedback: 검색 피드백 제출
 *
 * 주의: 이 테스트들은 aims_rag_api 서비스가 실행 중이어야 합니다.
 *
 * 실행 방법:
 *   npm run test:e2e -- --testPathPattern="phase5-rag"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MCPTestClient,
  type TestContext,
  setupCrossSystemTest,
  teardownCrossSystemTest,
  checkAllServers
} from '../../test-utils/index.js';

// RAG API 가용성 체크
async function checkRagApiAvailable(): Promise<boolean> {
  try {
    const ragApiUrl = process.env.RAG_API_URL || 'http://localhost:8003';
    const response = await fetch(`${ragApiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Phase 5: RAG 검색 도구 테스트', () => {
  let ctx: TestContext;
  let mcp: MCPTestClient;
  let serversAvailable = false;
  let ragApiAvailable = false;

  beforeAll(async () => {
    const status = await checkAllServers();
    serversAvailable = status.allAvailable;

    if (!serversAvailable) {
      console.warn(`⚠️ MCP/API 서버 연결 불가. 테스트를 건너뜁니다.`);
      return;
    }

    // RAG API 가용성 체크
    ragApiAvailable = await checkRagApiAvailable();
    if (!ragApiAvailable) {
      console.warn(`⚠️ RAG API(aims_rag_api) 연결 불가. Phase 5 테스트를 건너뜁니다.`);
      return;
    }

    ctx = await setupCrossSystemTest();
    mcp = ctx.mcp;
  });

  afterAll(async () => {
    if (ctx) {
      await teardownCrossSystemTest(ctx);
    }
  });

  // ============================================================
  // 5.1 시맨틱 문서 검색
  // ============================================================

  describe('5.1 시맨틱 문서 검색', () => {
    it('search_documents_semantic: 기본 검색', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        totalResults: number;
        searchTime?: number;
        results: Array<{
          fileId: string;
          fileName: string;
          relevanceScore: number;
          summary: string;
          tags: string[];
          customerName?: string;
        }>;
      }>('search_documents_semantic', {
        query: '보험 계약'
      });

      expect(result.query).toBe('보험 계약');
      expect(result.mode).toBe('semantic');
      expect(typeof result.totalResults).toBe('number');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('search_documents_semantic: 키워드 모드', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        query: string;
        mode: string;
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '계약서',
        mode: 'keyword'
      });

      expect(result.mode).toBe('keyword');
    });

    it('search_documents_semantic: 결과 수 제한', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        results: Array<unknown>;
      }>('search_documents_semantic', {
        query: '보험',
        limit: 3
      });

      expect(result.results.length).toBeLessThanOrEqual(3);
    });

    it('search_documents_semantic: 빈 쿼리 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('search_documents_semantic', {
        query: ''
      });

      expect(result.isError).toBe(true);
    });

    it('search_documents_semantic: 특수 문자 쿼리', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 특수 문자가 포함된 쿼리도 처리 가능해야 함
      const result = await mcp.call<{
        query: string;
        totalResults: number;
      }>('search_documents_semantic', {
        query: '보험료 (월납)'
      });

      expect(result.query).toBe('보험료 (월납)');
      expect(typeof result.totalResults).toBe('number');
    });

    it('search_documents_semantic: 긴 쿼리 처리', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const longQuery = '이 고객의 자동차 보험 계약에서 대인배상 및 대물배상 한도액과 자기차량손해 가입 여부를 확인하고 싶습니다';

      const result = await mcp.call<{
        query: string;
        totalResults: number;
      }>('search_documents_semantic', {
        query: longQuery
      });

      expect(result.query).toBe(longQuery);
    });
  });

  // ============================================================
  // 5.2 검색 통계
  // ============================================================

  describe('5.2 검색 통계', () => {
    it('get_search_analytics: 기본 통계 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
        totalSearches: number;
        successRate: string;
        avgResponseTime: string;
        queryTypeDistribution: Record<string, number>;
        rerankImpact: Record<string, unknown>;
        topQueries: string[];
      }>('get_search_analytics', {});

      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('totalSearches');
      expect(result).toHaveProperty('successRate');
      expect(result).toHaveProperty('avgResponseTime');
      expect(typeof result.totalSearches).toBe('number');
    });

    it('get_search_analytics: 기간 지정', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
      }>('get_search_analytics', {
        days: 7
      });

      expect(result.period).toBe('최근 7일');
    });

    it('get_search_analytics: 최대 기간', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        period: string;
      }>('get_search_analytics', {
        days: 90
      });

      expect(result.period).toBe('최근 90일');
    });
  });

  // ============================================================
  // 5.3 실패한 검색 쿼리
  // ============================================================

  describe('5.3 실패한 검색 쿼리', () => {
    it('get_failed_queries: 기본 조회', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        totalFailedQueries: number;
        queries: Array<{
          query: string;
          failCount: number;
          lastFailedAt: string;
          reason: string;
        }>;
        suggestion: string;
      }>('get_failed_queries', {});

      expect(result).toHaveProperty('totalFailedQueries');
      expect(Array.isArray(result.queries)).toBe(true);
      expect(result).toHaveProperty('suggestion');
    });

    it('get_failed_queries: 개수 제한', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        queries: Array<unknown>;
      }>('get_failed_queries', {
        limit: 5
      });

      expect(result.queries.length).toBeLessThanOrEqual(5);
    });
  });

  // ============================================================
  // 5.4 검색 피드백
  // ============================================================

  describe('5.4 검색 피드백', () => {
    it('submit_search_feedback: 피드백 제출', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      // 먼저 검색을 수행하여 queryId를 얻어야 하지만,
      // 현재 API가 queryId를 반환하지 않으므로 가상 ID로 테스트
      const result = await mcp.call<{
        success: boolean;
        queryId: string;
        rating: number;
        message: string;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-123',
        rating: 4,
        comment: '검색 결과가 유용했습니다'
      });

      expect(result.success).toBe(true);
      expect(result.rating).toBe(4);
      expect(result.message).toContain('피드백');
    });

    it('submit_search_feedback: 최소 평점', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        rating: number;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-456',
        rating: 1
      });

      expect(result.rating).toBe(1);
    });

    it('submit_search_feedback: 최대 평점', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.call<{
        rating: number;
      }>('submit_search_feedback', {
        queryId: 'test-query-id-789',
        rating: 5,
        comment: '완벽한 검색 결과!'
      });

      expect(result.rating).toBe(5);
    });

    it('submit_search_feedback: 범위 초과 평점 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('submit_search_feedback', {
        queryId: 'test-query-id',
        rating: 6  // 범위 초과
      });

      expect(result.isError).toBe(true);
    });

    it('submit_search_feedback: queryId 누락 오류', async () => {
      if (!serversAvailable || !ragApiAvailable) return;

      const result = await mcp.callRaw('submit_search_feedback', {
        rating: 3
      });

      expect(result.isError).toBe(true);
    });
  });
});
